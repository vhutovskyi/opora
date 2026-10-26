import { unstable_cache } from "next/cache";
import { BOOL_YES, optionValueRank } from "@/lib/constants";
import { supabaseAdmin } from "./client";
import { imageGroupKey } from "./imageGroups";
import { productHref, productRef, splitFilterValues } from "@/lib/utils";
import { resolveSubRefs, type SubcategoryOptionRow } from "./subcategoryTree";
import {
  CatalogProductDetails,
  FilterOption,
  FilterParamsWithArrays,
  OptionFilterGroup,
  SpecFilterGroup,
  VariationImage,
} from "./types";

type OptionRow = { name: string | null; value: string | null };
type ImageRow = { url: string; url_compressed: string | null };
type SortableVariantRow = {
  id: string;
  price: number | null;
  discounted_price: number | null;
  visible: boolean | null;
  sort_order: number | null;
  variant_options: { options: OptionRow | null }[] | null;
};
type VariantRow = SortableVariantRow & {
  variant_images: { sort_order: number | null; images: ImageRow | null }[] | null;
};
type CatalogRow = {
  id: string;
  slug: string | null;
  model: string | null;
  min_price: number | null;
  created_at: string | null;
  catalog: string | null;
  variants: VariantRow[] | null;
};
// priceLo/priceHi: true min/max across ALL of the product's variants (not just min_price) —
// the unfiltered slider bounds need the real range, or an expensive colour/size never shows up (see computeBounds).
type BaseProduct = CatalogProductDetails & { createdAt: string; priceLo: number; priceHi: number };

const isAllCategory = (types: string[]) => types.length === 0 || types.includes("Всі") || types.includes("All");

// The price filter, the slider bounds and the filtered price sort all use the MAIN price (variants.price),
// never discounted_price — a deliberate business rule: a sale doesn't move a product into a cheaper range.
// The card still shows the sale price (priceFields), so a "від 10 000" card may read 9 000 ₴ in red.
const priceFields = (price: number, discounted: number) => ({
  price: String(price),
  discountedPrice: discounted > 0 && discounted < price ? String(discounted) : undefined,
});

const linkedOptions = (v: SortableVariantRow) =>
  (v.variant_options || []).map((vo) => vo.options).filter(Boolean) as OptionRow[];

// Storefront-visible variants in page order — the same order products.ts uses, so the first variant of
// each look is the page default. Hidden variants (visible=false) used to leak into the cards as swatches.
// Checkbox options ("Так") — to the end, as on the product page: the card shows the unticked checkboxes.
// Priority values ("Щит" and so on) — to the front. A sum, not a minimum — so that priority on one axis
// doesn't drown out priority on another (see products.ts).
// ponytail: sort keys computed once per variant, not inside the comparator (see visibleSorted in products.ts).
function orderVariants<T extends SortableVariantRow>(rows: T[] | null): T[] {
  return (rows || [])
    .filter((v) => v.visible !== false)
    .map((v) => {
      const linked = linkedOptions(v);
      return {
        v,
        bool: linked.some((o) => o.value === BOOL_YES) ? 1 : 0,
        rank: linked.reduce((sum, o) => sum + optionValueRank(o.value || ""), 0),
        order: v.sort_order || 0,
      };
    })
    .sort((a, b) => a.bool - b.bool || a.rank - b.rank || a.order - b.order)
    .map((d) => d.v);
}

// ponytail: the worker gets the bare minimum for a card — one variant per group of "identical photos"
// (imageGroupKey: size/lamels don't change the look) × at most 2 URLs (the main one + hover),
// compressed. It used to be 7.1MB and 3071 variants on EVERY request (the cache didn't fit the 2MB limit and was
// disabled) → Cloudflare 1102. Now it is ~2300 variations / 1.15MB (measured 26.10.2026, the "Всі"
// catalog — the biggest entry), so the query is cached again. Adding a field means measuring again —
// per-variant filter data lives in the separate variant index for that reason (fetchVariantFilterIndex).
// We don't read the legacy photos[] arrays here: variants without variant_images don't have them either.
async function fetchCatalogBase(catalogs: string[], subs: string[]): Promise<BaseProduct[]> {
  // We filter the subcatalog only within the selected catalogs (on "Всі" it plays no role).
  // sub is the id of a tree node, not a name: with arbitrary nesting one and the same name
  // can repeat in different branches, so matching by name would pick the wrong subcategory.
  const filterBySub = catalogs.length > 0 && subs.length > 0;
  let query = supabaseAdmin()
    .from("products")
    .select(
      `id, slug, model, min_price, created_at, catalog,
       ${filterBySub ? "product_subcategories!inner ( subcategory_option_id )," : ""}
       variants ( id, price, discounted_price, visible, sort_order, variant_images ( sort_order, images ( url, url_compressed ) ), variant_options ( options ( name, value ) ) )`
    )
    .eq("visible", true)
    // The photos-per-variant limit is counted by Postgres, not by the worker.
    .order("sort_order", { referencedTable: "variants.variant_images" })
    .limit(2, { referencedTable: "variants.variant_images" });
  if (catalogs.length > 0) query = query.in("catalog", catalogs);
  // A product matches if AT LEAST ONE of its subcategories matches (it can have any number of them).
  if (filterBySub) query = query.in("product_subcategories.subcategory_option_id", subs);

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as CatalogRow[])
    .map((product) => {
      const seenLooks = new Set<string>();
      const variations: VariationImage[] = [];
      const ordered = orderVariants(product.variants);
      for (const variation of ordered) {
        const linked = linkedOptions(variation);
        const look = imageGroupKey(linked.map((o) => o.name || "").filter(Boolean));
        if (seenLooks.has(look)) continue;
        seenLooks.add(look);
        variations.push({
          id: variation.id,
          allHexes: linked.map((o) => ({ hex: o.value || "", name: o.name || "" })),
          images: (variation.variant_images || [])
            .filter((r) => r.images)
            .map((r) => r.images!.url_compressed || r.images!.url),
          ...priceFields(Number(variation.price || 0), Number(variation.discounted_price || 0)),
        });
      }
      const variantPrices = ordered.map((v) => Number(v.price || 0)).filter((p) => p > 0);
      return {
        id: product.id,
        slug: product.slug,
        name: product.model || "Без назви",
        href: productHref(product),
        price: Number(product.min_price || 0),
        priceLo: variantPrices.length > 0 ? Math.min(...variantPrices) : 0,
        priceHi: variantPrices.length > 0 ? Math.max(...variantPrices) : 0,
        createdAt: product.created_at || "",
        catalog: product.catalog,
        variations,
      };
    })
    .filter((p) => p.variations.length > 0);
}

// ponytail: previously every catalog request pulled all the variant_specs (40k rows) for the sake of
// the spec filter. Now it is a separate cached index of the filterable specs only
// (currently there are 0 of them → 0 rows), and it is read only when the filter is actually applied.
// Keyed by VARIANT, not product: specs are per-variant, and a product-level union let one variant
// satisfy one spec group and another variant the next (see matchingVariants).
type SpecIndexRow = { value: string | null; variant_id: string | null; specs: { name: string | null } | null };

async function fetchSpecFilterIndex(): Promise<Record<string, Record<string, string[]>>> {
  const { data } = await supabaseAdmin()
    .from("variant_specs")
    .select("value, variant_id, specs!inner ( name )")
    .eq("specs.filterable", true);

  const index: Record<string, Record<string, string[]>> = {};
  for (const row of (data || []) as unknown as SpecIndexRow[]) {
    const name = row.specs?.name;
    const variantId = row.variant_id;
    if (!name || !variantId) continue;
    const byName = (index[variantId] ||= {});
    const values = (byName[name] ||= []);
    const value = String(row.value || "");
    if (!values.includes(value)) values.push(value);
  }
  return index;
}

// ponytail: every visible variant's options + price, for matching filters on ONE variant. The base keeps
// one variant per look, so it can't answer "is there a white 160 cm bed" — and checking each filter against
// the product's union of options/prices made AND behave like OR (a white 90 + a black 160 matched
// "Білий AND 160"). Kept out of the base on purpose: inside it the base would be ~1.7MB+ (2MB limit), here
// it is its own ~0.75MB entry (measured 26.10.2026, 8976 variants), read only when a filter is applied.
// Tuples + per-product interned strings keep it that small. Adding a field means measuring again.
// [variant id, index into looks, price, discounted_price, indices into names]
type IndexedVariant = [string, number, number, number, number[]];
// looks are imageGroupKey strings, not positions in the base's variations: the two cache entries
// revalidate independently, so a position could point at another product version's look.
type VariantIndexEntry = { names: string[]; looks: string[]; variants: IndexedVariant[] };

async function fetchVariantFilterIndex(): Promise<Record<string, VariantIndexEntry>> {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("id, variants ( id, price, discounted_price, visible, sort_order, variant_options ( options ( name, value ) ) )")
    .eq("visible", true);
  if (error) throw error;

  const intern = (list: string[], at: Map<string, number>, key: string) => {
    let i = at.get(key);
    if (i === undefined) at.set(key, (i = list.push(key) - 1));
    return i;
  };
  const index: Record<string, VariantIndexEntry> = {};
  for (const product of (data || []) as unknown as { id: string; variants: SortableVariantRow[] | null }[]) {
    const entry: VariantIndexEntry = { names: [], looks: [], variants: [] };
    const nameAt = new Map<string, number>();
    const lookAt = new Map<string, number>();
    for (const v of orderVariants(product.variants)) {
      const names = linkedOptions(v).map((o) => o.name || "").filter(Boolean);
      entry.variants.push([
        v.id,
        intern(entry.looks, lookAt, imageGroupKey(names)),
        Number(v.price || 0),
        Number(v.discounted_price || 0),
        names.map((n) => intern(entry.names, nameAt, n)),
      ]);
    }
    index[product.id] = entry;
  }
  return index;
}

async function fetchFilterOptions() {
  const [{ data: configRows }, { data: products }, { data: filterableSpecs }] = await Promise.all([
    supabaseAdmin().from("option_filters").select("name, categories, sort_order").order("sort_order"),
    supabaseAdmin()
      .from("products")
      .select("catalog, variants ( variant_options ( options ( name, value, sort_order ) ) )")
      .eq("visible", true),
    supabaseAdmin().from("specs").select("name").eq("filterable", true),
  ]);

  // groupName → { categories, sort_order }
  const groupCategories = new Map<string, { categories: string[]; sortOrder: number }>();
  for (const row of (configRows || []) as { name: string | null; categories: string[] | null; sort_order: number | null }[]) {
    const groupName = (row.name || "").trim();
    if (groupName) groupCategories.set(groupName, { categories: (row.categories || []).map((c) => c.trim()).filter(Boolean), sortOrder: row.sort_order || 0 });
  }

  // The full option name → { hex, sort_order, the product categories using it }.
  const optionInfo = new Map<string, { hex: string; sortOrder: number; cats: Set<string> }>();
  for (const product of (products || []) as unknown as {
    catalog: string | null;
    variants: { variant_options: { options: OptionRow & { sort_order: number | null } | null }[] | null }[] | null;
  }[]) {
    const cat = (product.catalog || "").trim();
    if (!cat) continue;
    for (const v of product.variants || []) {
      for (const vo of v.variant_options || []) {
        const name = (vo.options?.name || "").trim();
        if (!name || !name.includes(":")) continue;
        let info = optionInfo.get(name);
        if (!info) {
          info = { hex: (vo.options?.value || "").trim(), sortOrder: vo.options?.sort_order || 0, cats: new Set() };
          optionInfo.set(name, info);
        }
        info.cats.add(cat);
      }
    }
  }

  const valuesByGroup = new Map<string, FilterOption[]>();
  for (const [name, info] of optionInfo) {
    const groupName = name.split(":")[0].trim();
    if (!groupCategories.has(groupName)) continue;
    if (!valuesByGroup.has(groupName)) valuesByGroup.set(groupName, []);
    valuesByGroup.get(groupName)!.push({ label: name, hex: info.hex, categories: [...info.cats], sortOrder: info.sortOrder });
  }

  const optionFilters: OptionFilterGroup[] = [...groupCategories]
    .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0) || a[0].localeCompare(b[0]))
    .map(([groupName, { categories, sortOrder }]) => ({
      groupName,
      categories,
      values: (valuesByGroup.get(groupName) || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.label.localeCompare(b.label)),
    }))
    .filter((g) => g.values.length > 0);

  // Filter specs — only Фільтрується = true, with unique values.
  let specFilters: SpecFilterGroup[] = [];
  const specNames = ((filterableSpecs || []) as { name: string | null }[]).map((s) => s.name).filter(Boolean) as string[];
  if (specNames.length > 0) {
    const { data: allProdSpecs } = await supabaseAdmin()
      .from("variant_specs")
      .select("value, specs ( name, filterable )");
    const valuesByName = new Map<string, Set<string>>();
    for (const ps of (allProdSpecs || []) as unknown as { value: string | null; specs: { name: string | null; filterable: boolean | null } | null }[]) {
      if (!ps.specs?.filterable || !ps.specs.name) continue;
      const value = String(ps.value || "").trim();
      if (!value) continue;
      if (!valuesByName.has(ps.specs.name)) valuesByName.set(ps.specs.name, new Set());
      valuesByName.get(ps.specs.name)!.add(value);
    }
    specFilters = specNames
      .map((name) => ({ specName: name, values: [...(valuesByName.get(name) || [])].sort() }))
      .filter((g) => g.values.length > 0);
  }

  return { optionFilters, specFilters };
}

// Ordered catalog names for the storefront filter (Каталоги table).
async function fetchCatalogs(): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("catalogs")
    .select("name, sort_order")
    .order("sort_order")
    .order("name");
  return ((data || []) as { name: string | null }[]).map((c) => c.name || "").filter(Boolean);
}

export const getCatalogs = unstable_cache(fetchCatalogs, ["catalog-list"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// All the subcategories (a tree of arbitrary depth) — the pages build a tree out of them
// via buildSubcategoryTrees. Previously only the roots were returned (parent is null).
async function fetchSubcategoryOptions(): Promise<SubcategoryOptionRow[]> {
  const { data } = await supabaseAdmin()
    .from("subcategory_options")
    .select("id, catalog, parent_id, name, sort_order, slug, is_group")
    .order("catalog")
    .order("sort_order")
    .order("name");
  return (data || []) as SubcategoryOptionRow[];
}

// The cache key is new — the old data shape (without id/parent_id/sort_order/slug/is_group) must not be served to the new code.
export const getSubcategoryOptions = unstable_cache(fetchSubcategoryOptions, ["catalog-subcategory-options-v4"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// Addresses only, for the sitemap — without fetchCatalogBase's heavy payload (photos, variants, options).
// Returns the canonical segment (the slug when one is set), so the sitemap holds the same address
// the site's own links lead to, rather than a parallel uuid version.
async function fetchProductRefs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("products").select("id, slug").eq("visible", true).order("id");
  if (error) throw error;
  return (data || []).map((p) => productRef(p as { id: string; slug: string | null }));
}

// The cache key was changed together with the data shape — otherwise the old entry would serve bare uuids.
export const getProductRefs = unstable_cache(fetchProductRefs, ["catalog-product-refs"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// The cache is keyed on (catalog, subcatalog) — not on every filter combination: the options/specs
// and the sorting are computed in memory over the cached base, without a new DB request.
const getCatalogBase = unstable_cache(fetchCatalogBase, ["catalog-base"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// New key: the old entry was keyed by product id, which the per-variant lookup would misread.
const getSpecFilterIndex = unstable_cache(fetchSpecFilterIndex, ["catalog-spec-index-by-variant"], {
  revalidate: 3600,
  tags: ["catalog"],
});

const getVariantFilterIndex = unstable_cache(fetchVariantFilterIndex, ["catalog-variant-index"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// The product's variants matching EVERY option group (OR inside a group) and every spec group —
// all on the same variant. A product matches if at least one of its variants does.
function matchingVariants(
  entry: VariantIndexEntry,
  optionGroups: string[][],
  specGroups: [string, string[]][],
  specIndex: Record<string, Record<string, string[]>>
): IndexedVariant[] {
  const groups = optionGroups.map((names) => new Set(names.map((n) => entry.names.indexOf(n)).filter((i) => i >= 0)));
  if (groups.some((g) => g.size === 0)) return [];
  return entry.variants.filter(
    ([id, , , , options]) =>
      groups.every((g) => options.some((i) => g.has(i))) &&
      specGroups.every(([specName, selected]) => selected.some((s) => (specIndex[id]?.[specName] || []).includes(s)))
  );
}

// The main price — see priceFields for why the sale price never takes part in filtering.
const variantPrice = (v: IndexedVariant) => v[2];

// The card for a filtered product: only the looks that have a matching variant (other colours used to
// stay on the card as swatches), each represented by its FIRST matching variant — its id and price, so the
// card links to and prices the variant that matched (the 160 cm bed, not the look's default 90 cm one).
// null when no look survives — the base and the index can be out of step for a minute after an edit.
function narrowProduct(product: BaseProduct, entry: VariantIndexEntry, matches: IndexedVariant[]): BaseProduct | null {
  const firstByLook = new Map<string, IndexedVariant>();
  for (const v of matches) {
    const look = entry.looks[v[1]];
    if (!firstByLook.has(look)) firstByLook.set(look, v);
  }
  const variations: VariationImage[] = [];
  for (const variation of product.variations) {
    const v = firstByLook.get(imageGroupKey(variation.allHexes.map((h) => h.name).filter(Boolean)));
    if (v) variations.push({ ...variation, id: v[0], ...priceFields(v[2], v[3]) });
  }
  if (variations.length === 0) return null;
  const prices = matches.map(variantPrice).filter((p) => p > 0);
  return {
    ...product,
    variations,
    // What price_asc/price_desc sort by: the cheapest variant that actually matched.
    price: prices.length > 0 ? Math.min(...prices) : product.price,
    priceLo: prices.length > 0 ? Math.min(...prices) : 0,
    priceHi: prices.length > 0 ? Math.max(...prices) : 0,
  };
}

function sortCatalog(catalog: BaseProduct[], sort: string): BaseProduct[] {
  const sorted = [...catalog];
  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "newest":
      sorted.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      break;
  }
  return sorted;
}

// Bounds use priceLo/priceHi — the true range of the variants still in play (all of them unfiltered,
// the matching ones after option/spec filters) — using products.min_price made an expensive
// colour/size invisible to the slider.
function computeBounds(catalog: BaseProduct[]): { min: number; max: number } | null {
  if (catalog.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of catalog) {
    if (p.priceLo < min) min = p.priceLo;
    if (p.priceHi > max) max = p.priceHi;
  }
  return { min: Math.floor(min), max: Math.ceil(max) };
}

export async function getFilteredCatalog(params: FilterParamsWithArrays): Promise<CatalogProductDetails[]> {
  return (await getCatalogAndBounds(params)).products;
}

// Both the filtered, sorted catalog AND the price bounds for its filter range (the catalog page needs both;
// api/catalog and the feed only the list — bounds cost one pass over the already filtered array).
// Every filter — options, specs AND the price range — must hold for one and the same variant.
export async function getCatalogAndBounds(
  params: FilterParamsWithArrays
): Promise<{ products: CatalogProductDetails[]; bounds: { min: number; max: number } | null }> {
  const { type, sub = [], sort = "default", optionFilters = {}, specFilters = {}, priceMin, priceMax } = params;
  const catalogNames = isAllCategory(type) ? [] : [...type].sort();
  const optionGroups = Object.values(optionFilters).filter((v) => v.length > 0);
  const specGroups = Object.entries(specFilters).filter(([, v]) => v.length > 0);
  const hasPrice = priceMin != null || priceMax != null;

  const base = await getCatalogBase(catalogNames, catalogNames.length > 0 ? [...sub].sort() : []);
  let prePrice = base;
  let catalog = base;
  if (optionGroups.length > 0 || specGroups.length > 0 || hasPrice) {
    const [index, specIndex] = await Promise.all([
      getVariantFilterIndex(),
      specGroups.length > 0 ? getSpecFilterIndex() : Promise.resolve({}),
    ]);
    const inPrice = (v: IndexedVariant) => {
      const p = variantPrice(v);
      return p > 0 && (priceMin == null || p >= priceMin) && (priceMax == null || p <= priceMax);
    };
    prePrice = [];
    catalog = [];
    for (const product of base) {
      const entry = index[product.id];
      if (!entry) continue;
      const matches = matchingVariants(entry, optionGroups, specGroups, specIndex);
      const narrowed = matches.length > 0 ? narrowProduct(product, entry, matches) : null;
      if (!narrowed) continue;
      // Bounds WITHOUT the price filter, so the slider shows what's available for the selected options/specs.
      prePrice.push(narrowed);
      if (!hasPrice) catalog.push(narrowed);
      else {
        const inRange = matches.filter(inPrice);
        const priced = inRange.length > 0 ? narrowProduct(product, entry, inRange) : null;
        if (priced) catalog.push(priced);
      }
    }
  }

  const products = sortCatalog(catalog, sort).map(({ createdAt, priceLo, priceHi, ...rest }) => rest);
  return { products, bounds: computeBounds(prePrice) };
}

// The catalog query parameters → FilterParamsWithArrays. Shared by the page and api/catalog,
// so the first batch (SSR) and the following ones (fetch) are filtered identically.
// Async, because ?sub= also accepts slugs: translating them into ids needs the (cached) subcategory tree.
export async function parseCatalogParams(
  raw: Record<string, string | string[] | undefined>
): Promise<FilterParamsWithArrays> {
  const optionFilters: Record<string, string[]> = {};
  const specFilters: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    if (key.startsWith("optFilter_")) optionFilters[key.slice(10)] = splitFilterValues(key.slice(10), value);
    else if (key.startsWith("specFilter_")) specFilters[key.slice(11)] = splitFilterValues(key.slice(11), value);
  }
  const num = (v: string | string[] | undefined) => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const subRefs = raw.sub ? (raw.sub as string).split(",") : [];
  return {
    type: raw.type ? (raw.type as string).split(",") : ["Всі"],
    sub: subRefs.length > 0 ? resolveSubRefs(subRefs, await getSubcategoryOptions()) : [],
    sort: (raw.sort as string) || "default",
    optionFilters,
    specFilters,
    priceMin: num(raw.priceMin),
    priceMax: num(raw.priceMax),
  };
}

// ponytail: the cursor = the id of the batch's last product, a slice over the already sorted in-memory array
// (getFilteredCatalog filters the cached base rather than querying) — keyset queries to the DB aren't needed here.
// The cursor isn't in the list (the filter changed under the client) → we serve from the start instead of empty.
export function paginateCatalog(
  products: CatalogProductDetails[],
  cursor: string | null | undefined,
  limit: number
): { products: CatalogProductDetails[]; nextCursor: string | null } {
  const at = cursor ? products.findIndex((p) => p.id === cursor) : -1;
  const start = at < 0 ? 0 : at + 1;
  const page = products.slice(start, start + limit);
  const end = start + page.length;
  return { products: page, nextCursor: end < products.length ? page[page.length - 1].id : null };
}

export const getFilterOptions = unstable_cache(fetchFilterOptions, ["catalog-filter-options"], {
  revalidate: 3600,
  tags: ["catalog"],
});
