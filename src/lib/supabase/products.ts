import { cache } from "react";
import { unstable_cache } from "next/cache";
import { BOOL_YES, optionValueRank } from "@/lib/constants";
import { collectSnippetIds, resolveSnippets, type LongDescriptionBlock } from "@/lib/longDescription/types";
import { supabaseAdmin, isMissingTable, isMissingColumn, byIdOrSlug } from "./client";
import { imageGroupKey } from "./imageGroups";
import { productHref } from "@/lib/utils";
import {
  CompareVariant,
  ProductAccessoryLink,
  ProductDetail,
  ProductDetails,
  ProductDetailVariant,
  Specification,
  VariantMedia,
  VariationImage,
  AccessoryComboPhotos,
} from "./types";

// Nested select: product → variants → images (M:N via variant_images) + options.
// ponytail: we do NOT read the legacy photos/photos_compressed arrays here — they are empty in all
// 4387 variants (verified), yet they were pulled into every product page request.
const VARIANT_SELECT =
  "id, name, sku, price, discounted_price, in_stock, visible, sort_order, variant_images ( sort_order, images ( url, url_compressed ) ), variant_options ( options ( name, value ) )";

// Detail pages additionally need each variant's specs (variant_specs → specs).
const VARIANT_SELECT_WITH_SPECS =
  `${VARIANT_SELECT}, variant_specs ( value, legacy_num, specs ( name ) )`;

// A CARD needs far less than a detail page: no name/sku/in_stock, and at most 2 photos of one
// variant per "look". Deliberately NOT VARIANT_SELECT — that one feeds the detail page, which does
// need every photo of every variant. See fetchCatalogBase in catalog.ts, which is the same shape for
// the catalog grid; measured by scripts/measure-card-payload.mjs (992KB → 52KB on the home page).
const CARD_VARIANT_SELECT =
  "id, price, discounted_price, visible, sort_order, variant_images ( sort_order, images ( url, url_compressed ) ), variant_options ( options ( name, value ) )";

// Optional add-on products offered on the detail page (product_accessories → products).
const ACCESSORY_SELECT =
  `product_accessories!product_id ( id, sort_order, max_qty, accessory:accessory_product_id ( id, slug, model, min_price, combo_axis, variants ( ${VARIANT_SELECT_WITH_SPECS} ) ) )`;

// Bed photo sets per accessory-upgrade combination (see src/lib/accessoryCombo.ts). Fetched
// separately (not nested in the product select) so an un-migrated DB degrades to "no combo
// photos" instead of breaking every product page — same guard rationale as listSnippets.
async function fetchComboPhotos(productId: string): Promise<PackedCombo[]> {
  const { data, error } = await supabaseAdmin()
    .from("accessory_combo_photos")
    .select("image_group_key, combo_key, accessory_combo_images ( sort_order, images ( url, url_compressed ) )")
    .eq("product_id", productId);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  type Row = {
    image_group_key: string;
    combo_key: string;
    accessory_combo_images: { sort_order: number | null; images: ImageRow | null }[] | null;
  };
  return ((data || []) as unknown as Row[]).map((c) => {
    const rows = (c.accessory_combo_images || [])
      .filter((r) => r.images)
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const images = rows.map((r) => r.images!.url);
    const imagesCompressed = rows.map((r) => r.images!.url_compressed || r.images!.url);
    return {
      imageGroupKey: c.image_group_key,
      comboKey: c.combo_key,
      images,
      imagesCompressed: imagesCompressed.every((url, i) => url === compressedUrl(images[i])) ? null : imagesCompressed,
    };
  });
}

type OptionRow = { name: string | null; value: string | null };
type ImageRow = { url: string; url_compressed: string | null };
type VariantRow = {
  id: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  discounted_price: number | null;
  in_stock: boolean | null;
  visible: boolean | null;
  sort_order: number | null;
  variant_images: { sort_order: number | null; images: ImageRow | null }[] | null;
  variant_options: { options: OptionRow | null }[] | null;
  variant_specs?: { value: string | null; legacy_num: number | null; specs: { name: string | null } | null }[] | null;
};

function variantSpecifications(v: VariantRow) {
  return (v.variant_specs || [])
    .slice()
    .sort((a, b) => (a.legacy_num || 0) - (b.legacy_num || 0))
    .map((ps) => ({ name: ps.specs?.name || "Невідомо", value: String(ps.value || "") }));
}
// What CARD_VARIANT_SELECT actually returns — a subset of VariantRow, so the same helpers work on it.
type CardVariantRow = Pick<
  VariantRow,
  "id" | "price" | "discounted_price" | "visible" | "sort_order" | "variant_images" | "variant_options"
>;

type ProductRow = {
  id: string;
  slug: string | null;
  model: string | null;
  seo_title: string | null;
  seo_description: string | null;
  min_price: number | null;
  catalog: string | null;
  description: string | null;
  long_description: LongDescriptionBlock[] | null;
  gallery_layout?: string | null;
  assembly_video_url: string | null;
  assembly_pdf_url: string | null;
  visible: boolean | null;
  variants: VariantRow[] | null;
  product_accessories?:
    | {
        id: string;
        sort_order: number | null;
        max_qty: number | null;
        accessory: {
          id: string;
          slug: string | null;
          model: string | null;
          min_price: number | null;
          combo_axis: string | null;
          variants: VariantRow[] | null;
        } | null;
      }[]
    | null;
};

function variantOptions(v: Pick<VariantRow, "variant_options">): OptionRow[] {
  // Sort by name so option slots line up by index across every variant (the product page
  // groups options positionally): e.g. "Колір: …" always before "Матеріал: …".
  return ((v.variant_options || []).map((vo) => vo.options).filter(Boolean) as OptionRow[]).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "uk")
  );
}

// Originals + compressed ones from the images table (M:N through variant_images), in sort_order.
function variantImages(v: VariantRow) {
  const rows = (v.variant_images || [])
    .filter((r) => r.images)
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return {
    images: rows.map((r) => r.images!.url),
    imagesCompressed: rows.map((r) => r.images!.url_compressed || r.images!.url),
  };
}

// ponytail: only the original photos + an index of the spec set go into the cache. A bed has 1000
// variants, and the entry came to 2.09MB — over the Next cache's 2MB per-entry limit, i.e. the page
// was NOT cached at all and every request pulled 3MB from Supabase (hence Cloudflare 1102).
// Two lossless reductions (verified against live data):
//  1) the compressed URL in all 24245 images rows WITHOUT exception = the original with /images/ →
//     /images-compressed/ + .webp, so we keep it in the cache only when the rule didn't match;
//  2) the spec sets repeat (1000 bed variants → 7 sets) — we cache one of each.
// That brought it to ~1.2MB. We unpack after the cache, so the client types don't change.
const compressedUrl = (url: string) => `${url.replace("/images/", "/images-compressed/")}.webp`;

type SpecPool = { sets: Specification[][]; id: (specs: Specification[]) => number };
const specPool = (): SpecPool => {
  const sets: Specification[][] = [];
  const seen = new Map<string, number>();
  return {
    sets,
    id: (specs) => {
      // ponytail: a join beats JSON.stringify here (1000 calls per bed on a cache miss). The
      // separators are control chars, which no spec name/value in the catalogue contains — a
      // plain delimiter like ":" could let two different spec sets collide onto one cached set.
      const key = specs.map((s) => `${s.name}\u0000${s.value}`).join("\u0001");
      let i = seen.get(key);
      if (i === undefined) {
        i = sets.push(specs) - 1;
        seen.set(key, i);
      }
      return i;
    },
  };
};

type PackedVariant = Omit<ProductDetailVariant, "imagesCompressed" | "specifications"> & {
  imagesCompressed: string[] | null; // null = derived from images by the compressedUrl rule
  specs: number; // the index in PackedDetail.specSets
};
type PackedAccessory = Omit<ProductAccessoryLink, "product"> & {
  product: Omit<ProductAccessoryLink["product"], "variants"> & { variants: PackedVariant[] };
};
// The same trick as for the variants: Дует Плюс has 1000 combo photo sets (not "a few dozen",
// as was assumed here at first) — 1.99MB, because of which the entry didn't fit into 2MB and the page wasn't cached.
type PackedCombo = Omit<AccessoryComboPhotos, "imagesCompressed"> & { imagesCompressed: string[] | null };
type PackedDetail = Omit<ProductDetail, "variants" | "accessories" | "accessoryComboPhotos"> & {
  specSets: Specification[][];
  variants: PackedVariant[];
  accessories: PackedAccessory[];
  accessoryComboPhotos: PackedCombo[];
};

function toDetailVariant(v: VariantRow, specs: SpecPool): PackedVariant {
  const { images, imagesCompressed } = variantImages(v);
  const derivable = imagesCompressed.every((url, i) => url === compressedUrl(images[i]));
  const price = Number(v.price || 0);
  const discounted = Number(v.discounted_price || 0);
  return {
    id: v.id,
    name: v.name || "",
    sku: v.sku || "",
    price,
    discountedPrice: discounted > 0 && discounted < price ? discounted : null,
    inStock: !!v.in_stock,
    images,
    imagesCompressed: derivable ? null : imagesCompressed,
    options: variantOptions(v).map((o) => ({ name: o.name || "", value: o.value || "" })),
    specs: specs.id(variantSpecifications(v)),
  };
}

function unpackDetail({ specSets, variants, accessories, accessoryComboPhotos, ...rest }: PackedDetail): ProductDetail {
  const unpackVariant = ({ specs, imagesCompressed, ...v }: PackedVariant): ProductDetailVariant => ({
    ...v,
    imagesCompressed: imagesCompressed ?? v.images.map(compressedUrl),
    specifications: specSets[specs],
  });
  return {
    ...rest,
    variants: variants.map(unpackVariant),
    accessories: accessories.map((a) => ({
      ...a,
      product: { ...a.product, variants: a.product.variants.map(unpackVariant) },
    })),
    accessoryComboPhotos: accessoryComboPhotos.map((c) => ({
      ...c,
      imagesCompressed: c.imagesCompressed ?? c.images.map(compressedUrl),
    })),
  };
}

// One card variation. Only the compressed URLs go into `images` — ProductCard reads
// `imagesCompressed ?? images`, so the second array would just double the payload (same trick as
// fetchCatalogBase). Postgres already capped variant_images at 2, the slice is belt-and-braces.
function toCardVariation(v: CardVariantRow): VariationImage {
  const price = Number(v.price || 0);
  const discounted = Number(v.discounted_price || 0);
  return {
    id: v.id,
    allHexes: variantOptions(v).map((o) => ({ hex: o.value || "", name: o.name || "" })),
    images: (v.variant_images || [])
      .filter((r) => r.images)
      .map((r) => r.images!.url_compressed || r.images!.url)
      .slice(0, 2),
    price: String(price),
    discountedPrice: discounted > 0 && discounted < price ? String(discounted) : undefined,
  };
}

// "1,2" → [1,2] (images-per-row for the desktop gallery grid). Ignores junk / out-of-range values.
function parseGalleryLayout(raw: string | null | undefined): number[] {
  return (raw || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 4);
}

// Checkbox options ("З білими ніжками" and the like) are UNTICKED by default: variants with the value "Так"
// are sorted after the rest, and only then by sort_order. The first variant of the list is the default on the
// product page (and it is its photos that go as a prop), so it is always "Ні".
// Structurally typed, not VariantRow: the card select (CARD_VARIANT_SELECT) fetches fewer columns,
// and these three only ever look at the options / order anyway.
type SortableVariant = {
  visible: boolean | null;
  sort_order: number | null;
  variant_options: { options: OptionRow | null }[] | null;
};

const hasBoolYes = (v: Pick<SortableVariant, "variant_options">) =>
  (v.variant_options || []).some((vo) => vo.options?.value === BOOL_YES) ? 1 : 0;

// Priority option values (OPTION_VALUE_ORDER, e.g. "Щит") — to the front, but AFTER the checkboxes,
// so the default variant keeps its checkboxes unticked. A sum (not a minimum) over all of the variant's axes —
// so that priority on one axis (Матеріал: Щит) doesn't "drown out" priority on another (Фурнітура: Стандарт).
const valueRank = (v: Pick<SortableVariant, "variant_options">) =>
  (v.variant_options || []).reduce((sum, vo) => sum + optionValueRank(vo.options?.value || ""), 0);

// Storefront-visible variants only, in sort order. Hidden ones (visible=false, e.g. beds config
// variations not curated for the selector) stay in the DB but never reach the client.
// ponytail: the sort keys are computed ONCE per variant, not inside the comparator. A bed has ~1000
// variants → ~10k comparisons, and each one re-scanned the options of both sides (hasBoolYes +
// valueRank), i.e. ~160k optionValueRank calls per cache miss. Now it is ~2k. Same order as before.
const visibleSorted = <T extends SortableVariant>(rows: T[] | null): T[] =>
  (rows || [])
    .filter((v) => v.visible !== false)
    .map((v) => ({ v, bool: hasBoolYes(v), rank: valueRank(v), order: v.sort_order || 0 }))
    .sort((a, b) => a.bool - b.bool || a.rank - b.rank || a.order - b.order)
    .map((d) => d.v);

// Cards only (top products / "buy with" strips), so it fetches card-shaped data: 2 photos per variant
// counted by Postgres, then ONE variant per "look" (imageGroupKey — size/lamels don't change the
// photo). It used to hand every visible variant with all of its photos to ProductCard, which renders
// exactly 2 of the active variation: 674 variations / 1850 photos / 992KB for the 5 pinned products,
// serialized into the home page HTML on every render. Now 74 / 140 / 52KB, with no swatch lost —
// re-measure with scripts/measure-card-payload.mjs if this select grows.
export async function getMultipleProductsWithVariations(productIds: string[]): Promise<ProductDetails[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select(`id, slug, model, min_price, catalog, variants ( ${CARD_VARIANT_SELECT} )`)
    .in("id", productIds)
    .eq("visible", true)
    // The photos-per-variant limit is counted by Postgres, not by the worker (as in fetchCatalogBase).
    .order("sort_order", { referencedTable: "variants.variant_images" })
    .limit(2, { referencedTable: "variants.variant_images" });
  if (error) throw error;

  type CardProductRow = Pick<ProductRow, "id" | "slug" | "model" | "min_price" | "catalog"> & {
    variants: CardVariantRow[] | null;
  };
  // We keep the order in which productIds were passed (e.g. the top products).
  const byId = new Map((data as unknown as CardProductRow[]).map((p) => [p.id, p]));
  return productIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((product) => {
      // visibleSorted first, so the variant that wins each group is the page default (checkboxes
      // unticked, priority materials first) — the same order the catalog card shows.
      const seenLooks = new Set<string>();
      const variations: VariationImage[] = [];
      for (const v of visibleSorted(product!.variants)) {
        const look = imageGroupKey(variantOptions(v).map((o) => o.name || "").filter(Boolean));
        if (seenLooks.has(look)) continue;
        seenLooks.add(look);
        variations.push(toCardVariation(v));
      }
      return {
        id: product!.id,
        slug: product!.slug,
        name: product!.model || "Без назви",
        href: productHref(product!),
        price: Number(product!.min_price || 0),
        variations,
        catalog: product!.catalog,
      };
    });
}

export async function getTopProducts(): Promise<ProductDetails[]> {
  // Degrade to [] on any failure (missing config / DB down) so the home page still renders,
  // same defensive posture as the banner services.
  try {
    const { data, error } = await supabaseAdmin()
      .from("top_products")
      .select("product_id, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const ids = (data || []).map((r) => r.product_id).filter(Boolean) as string[];
    return await getMultipleProductsWithVariations(ids);
  } catch (error) {
    console.error("getTopProducts error:", error);
    return [];
  }
}

// Inlines the content of shared blocks in place of the references to them. Done before caching, so
// the storefront and the client see ready-made blocks; editing a shared block purges the cache
// through bump("catalog"). Nested snippets are not expanded (the admin panel doesn't offer them either).
async function resolveProductSnippets(raw: unknown): Promise<LongDescriptionBlock[]> {
  const blocks = Array.isArray(raw) ? (raw as LongDescriptionBlock[]) : [];
  const ids = [...new Set(collectSnippetIds(blocks))];
  if (!ids.length) return blocks;
  const { data, error } = await supabaseAdmin()
    .from("long_description_snippets")
    .select("id, blocks")
    .in("id", ids);
  if (error) console.error("resolveProductSnippets error:", error.message);
  const byId = new Map(
    (data ?? []).map((s) => [
      s.id as string,
      (Array.isArray(s.blocks) ? s.blocks : []) as LongDescriptionBlock[],
    ])
  );
  return resolveSnippets(blocks, byId);
}

// The route parameter is a uuid or a slug (product_slug.sql). Both are live, so old links to
// /catalog/<uuid> don't break after a product is given an address. We resolve it to the canonical
// uuid FIRST, so the heavy detail entry below is stored and tagged ONCE per product instead of once
// per URL spelling — otherwise bumpProduct(id) would purge the uuid copy and leave the slug copy stale.
// Tiny row, so this extra lookup costs nothing next to the payload it de-duplicates.
const resolveProductId = unstable_cache(
  async (idOrSlug: string): Promise<string | null> => {
    // byIdOrSlug returns null when the param matches neither regex — load-bearing, it keeps
    // ilike from seeing a "%" wildcard and returning an arbitrary product.
    const q = byIdOrSlug(supabaseAdmin().from("products").select("id, visible"), idOrSlug);
    if (!q) return null;
    const { data, error } = await q.maybeSingle();
    if (isMissingColumn(error)) return null; // product_slug.sql hasn't been applied yet
    if (error) throw error;
    return data?.visible ? (data.id as string) : null;
  },
  ["product-id-by-ref"],
  { revalidate: 3600, tags: ["catalog"] }
);

// Cross-request cache (survives across visitors). Tagged per product, so saving ONE product no
// longer cold-starts every other product's page — the miss path here is the most CPU-expensive
// thing in the app (a bed has ~1000 variants). See bumpProduct in admin/actions/_shared.ts.
// A fresh wrapper per id is how the tag is made dynamic — unstable_cache takes tags statically.
const fetchProductDetail = (productId: string) =>
  unstable_cache(
    async (): Promise<PackedDetail | null> => {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select(
      `id, slug, model, catalog, description, long_description, seo_title, seo_description, assembly_video_url, assembly_pdf_url, min_price, visible, gallery_layout,
       variants ( ${VARIANT_SELECT_WITH_SPECS} ), ${ACCESSORY_SELECT}`
    )
    .eq("id", productId)
    .maybeSingle();
  if (isMissingColumn(error)) return null; // product_slug.sql hasn't been applied yet
  if (error) throw error;
  if (!data || !data.visible) return null;

  const p = data as unknown as ProductRow;
  const specs = specPool();
  // Two independent round trips — fired together rather than one after the other, so a cache miss
  // costs one latency hop instead of two. productId is the uuid here (resolveProductId ran first).
  const [longDescription, accessoryComboPhotos] = await Promise.all([
    resolveProductSnippets(p.long_description),
    fetchComboPhotos(productId),
  ]);

  const variants = visibleSorted(p.variants).map((v) => toDetailVariant(v, specs));

  const accessories: PackedAccessory[] = (p.product_accessories || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .filter((a) => a.accessory)
    .map((a) => ({
      id: a.id,
      product: {
        id: a.accessory!.id,
        slug: a.accessory!.slug,
        model: a.accessory!.model || "",
        minPrice: Number(a.accessory!.min_price || 0),
        comboAxis: a.accessory!.combo_axis,
        variants: visibleSorted(a.accessory!.variants).map((v) => toDetailVariant(v, specs)),
      },
      maxQty: Math.max(1, a.max_qty || 1),
    }));

  return {
    specSets: specs.sets,
    id: p.id,
    slug: p.slug,
    seoTitle: p.seo_title || "",
    seoDescription: p.seo_description || "",
    name: p.model || "",
    model: p.model || "",
    catalog: p.catalog || "",
    description: p.description || "",
    longDescription,
    assemblyVideoUrl: p.assembly_video_url || "",
    assemblyPdfUrl: p.assembly_pdf_url || "",
    minPrice: Number(p.min_price || 0),
    galleryLayout: parseGalleryLayout(p.gallery_layout),
    variants,
    accessories,
    accessoryComboPhotos,
  };
    },
    ["product-detail", productId],
    { revalidate: 3600, tags: ["product", `product-${productId}`] }
  )();

// The photos + specs of ONE variant. The product page pulls them when an option is picked
// (`api/products/variant/[variantId]`), so as not to send the media of all 1000 bed variants
// to the browser. The entries are tiny (~1.4KB), so caching here is almost free.
//
// Its OWN tag, deliberately not "product": these entries are cheap to rebuild (one single-variant
// query), unlike the product-detail entry that bumpProduct exists to protect. So every path that
// touches photos or specs can purge variant media wholesale without cold-starting ~4000 heavy
// product pages. It used to be tagged "product", which no targeted purge path ever touched —
// an uploaded photo stayed invisible here for the full hour of the TTL.
export const VARIANT_MEDIA_TAG = "variant-media";
export const getVariantMedia = unstable_cache(
  async (variantId: string): Promise<VariantMedia | null> => {
    const { data, error } = await supabaseAdmin()
      .from("variants")
      .select("variant_images ( sort_order, images ( url, url_compressed ) ), variant_specs ( value, legacy_num, specs ( name ) )")
      .eq("id", variantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const v = data as unknown as VariantRow;
    return { ...variantImages(v), specifications: variantSpecifications(v) };
  },
  ["variant-media"],
  { revalidate: 3600, tags: [VARIANT_MEDIA_TAG] }
);

// One column of the /compare page. Cached per VARIANT, not per list: the list comes from a public
// URL, so per-list keys would be unbounded, while the same variant shows up in many lists.
// Tagged "catalog" (name/price/visibility) + variant media (photos/specs) — both purged by bump/bumpProduct.
const getCompareVariant = unstable_cache(
  async (variantId: string): Promise<CompareVariant | null> => {
    const { data, error } = await supabaseAdmin()
      .from("variants")
      .select(`${VARIANT_SELECT_WITH_SPECS}, product:product_id ( id, slug, model, catalog, visible )`)
      .eq("id", variantId)
      .maybeSingle();
    if (isMissingColumn(error)) return null; // product_slug.sql hasn't been applied yet
    if (error) throw error;
    type Row = VariantRow & {
      product: { id: string; slug: string | null; model: string | null; catalog: string | null; visible: boolean | null } | null;
    };
    const row = data as unknown as Row | null;
    // A hidden variant or product is not on the storefront — an old shared link must not resurrect it.
    if (!row?.product?.visible || row.visible === false) return null;

    const pool = specPool();
    const { specs, imagesCompressed, ...variant } = toDetailVariant(row, pool);
    return {
      ...variant,
      imagesCompressed: imagesCompressed ?? variant.images.map(compressedUrl),
      specifications: pool.sets[specs],
      productId: row.product.id,
      slug: row.product.slug,
      model: row.product.model || "Без назви",
      catalog: row.product.catalog || "",
    };
  },
  ["compare-variant"],
  { revalidate: 3600, tags: ["catalog", VARIANT_MEDIA_TAG] }
);

// The variants of a comparison, in the given order. The ids come straight from the URL (parseCompareIds
// has already capped and validated them); anything missing or hidden is skipped. Comparing makes sense
// within one catalog only, and the URL can be hand-edited — so the first variant's catalog wins.
export async function getCompareVariants(variantIds: string[]): Promise<CompareVariant[]> {
  const found = (await Promise.all(variantIds.map((id) => getCompareVariant(id)))).filter(
    (v): v is CompareVariant => !!v
  );
  const catalog = found[0]?.catalog;
  return found.filter((v) => v.catalog === catalog);
}

// cache() wraps it so generateMetadata + the page share one call within a request.
export const getProductById = cache(async (idOrSlug: string): Promise<ProductDetail | null> => {
  const productId = await resolveProductId(idOrSlug);
  if (!productId) return null;
  const packed = await fetchProductDetail(productId);
  return packed && unpackDetail(packed);
});

// Markdown info per option axis ("Матеріал", "Відстань між ламелями" …), set in
// admin/filters. Site-wide (not per-product), so cached independently of getProductById —
// keyed as a Record for O(1) lookup by group.key in BuyBox.
export const getOptionGroupInfo = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const { data, error } = await supabaseAdmin().from("option_group_info").select("key, info");
    if (error) {
      if (isMissingTable(error)) return {};
      throw error;
    }
    const rows = (data || []) as { key: string; info: string | null }[];
    return Object.fromEntries(rows.filter((r) => r.info?.trim()).map((r) => [r.key, r.info as string]));
  },
  ["option-group-info"],
  { revalidate: 3600, tags: ["catalog"] }
);
