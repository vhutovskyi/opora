import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./client";
import { imageGroupKey } from "./imageGroups";
import { isStorefrontVisible, priceRange, variantPricing, visibleSorted } from "./variantRules";
import { productHref, productRef } from "@/lib/utils";
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
type VariantRow = {
  id: string;
  price: number | null;
  discounted_price: number | null;
  visible: boolean | null;
  sort_order: number | null;
  variant_images: { sort_order: number | null; images: ImageRow | null }[] | null;
  variant_options: { options: OptionRow | null }[] | null;
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
// priceLo/priceHi: the true effective-price (sale-aware) min/max across the product's VISIBLE variants
// (not just min_price) — bounds and the price filter need the real range, or an expensive colour/size
// never shows up (see computeBounds). `price` is priceLo: the "від" price, what price_asc/desc sort by.
type BaseProduct = CatalogProductDetails & { createdAt: string; allOptionNames: string[]; priceLo: number; priceHi: number };

const isAllCategory = (types: string[]) => types.length === 0 || types.includes("Всі") || types.includes("All");

// ponytail: the worker gets the bare minimum for a card — one variant per group of "identical photos"
// (imageGroupKey: size/lamels don't change the look) × at most 2 URLs (the main one + hover),
// compressed. It used to be 7.1MB and 3071 variants on EVERY request (the cache didn't fit the 2MB limit and was
// disabled) → Cloudflare 1102. Now it is ~800 variants / 0.48MB (measured 27.07.2026, the "Всі"
// catalog — the biggest entry), so the query is cached again. Adding a field means measuring again.
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
      const allOptionNames = new Set<string>();
      const seenLooks = new Set<string>();
      const variations: VariationImage[] = [];
      // Same visibility + order as the product page (variantRules.ts): hidden variants never become
      // swatches or count towards the price range, and the first card variation is the page default.
      const ordered = visibleSorted(product.variants);
      for (const variation of ordered) {
        const linked = (variation.variant_options || []).map((vo) => vo.options).filter(Boolean) as OptionRow[];
        const names = linked.map((o) => o.name || "").filter(Boolean);
        for (const name of names) allOptionNames.add(name);
        const look = imageGroupKey(names);
        if (seenLooks.has(look)) continue;
        seenLooks.add(look);
        const { price, discountedPrice } = variantPricing(variation);
        variations.push({
          id: variation.id,
          allHexes: linked.map((o) => ({ hex: o.value || "", name: o.name || "" })),
          images: (variation.variant_images || [])
            .filter((r) => r.images)
            .map((r) => r.images!.url_compressed || r.images!.url),
          price: String(price),
          discountedPrice: discountedPrice != null ? String(discountedPrice) : undefined,
        });
      }
      const { lo, hi } = priceRange(ordered, product.min_price);
      return {
        id: product.id,
        slug: product.slug,
        name: product.model || "Без назви",
        href: productHref(product),
        price: lo,
        priceLo: lo,
        priceHi: hi,
        createdAt: product.created_at || "",
        catalog: product.catalog,
        variations,
        allOptionNames: [...allOptionNames],
      };
    })
    .filter((p) => p.variations.length > 0);
}

// ponytail: previously every catalog request pulled all the variant_specs (40k rows) for the sake of
// the spec filter. Now it is a separate cached index of the filterable specs only
// (currently there are 0 of them → 0 rows), and it is read only when the filter is actually applied.
type SpecIndexRow = { value: string | null; specs: { name: string | null } | null; variants: { product_id: string } | null };

async function fetchSpecFilterIndex(): Promise<Record<string, Record<string, string[]>>> {
  const { data } = await supabaseAdmin()
    .from("variant_specs")
    .select("value, specs!inner ( name ), variants!inner ( product_id )")
    .eq("specs.filterable", true);

  const index: Record<string, Record<string, string[]>> = {};
  for (const row of (data || []) as unknown as SpecIndexRow[]) {
    const name = row.specs?.name;
    const productId = row.variants?.product_id;
    if (!name || !productId) continue;
    const byName = (index[productId] ||= {});
    const values = (byName[name] ||= []);
    const value = String(row.value || "");
    if (!values.includes(value)) values.push(value);
  }
  return index;
}

async function fetchFilterOptions() {
  const [{ data: configRows }, { data: products }, { data: filterableSpecs }] = await Promise.all([
    supabaseAdmin().from("option_filters").select("name, categories, sort_order").order("sort_order"),
    supabaseAdmin()
      .from("products")
      .select("catalog, variants ( visible, variant_options ( options ( name, value, sort_order ) ) )")
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
    variants: { visible: boolean | null; variant_options: { options: OptionRow & { sort_order: number | null } | null }[] | null }[] | null;
  }[]) {
    const cat = (product.catalog || "").trim();
    if (!cat) continue;
    // A value that only hidden variants carry would be a filter option matching nothing.
    for (const v of (product.variants || []).filter(isStorefrontVisible)) {
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

const getSpecFilterIndex = unstable_cache(fetchSpecFilterIndex, ["catalog-spec-index"], {
  revalidate: 3600,
  tags: ["catalog"],
});

// ponytail: apply option + spec filters (before price range), shared by both getFilteredCatalog and getCatalogAndBounds.
// Extracted to avoid duplicating the filter pass when both the sorted catalog AND price bounds are needed.
async function filterCatalogBeforePrice(base: BaseProduct[], optionFilters: Record<string, string[]>, specFilters: Record<string, string[]>): Promise<BaseProduct[]> {
  const specGroups = Object.entries(specFilters).filter(([, v]) => v.length > 0);
  let catalog = base;

  // Options: AND between groups, OR inside a group.
  const optionGroups = Object.values(optionFilters).filter((v) => v.length > 0);
  if (optionGroups.length > 0) {
    catalog = catalog.filter((p) => optionGroups.every((names) => names.some((n) => p.allOptionNames.includes(n))));
  }

  // Specs: a product matches if AT LEAST ONE of its variants matches.
  if (specGroups.length > 0) {
    const specIndex = await getSpecFilterIndex();
    catalog = catalog.filter((p) =>
      specGroups.every(([specName, selected]) => selected.some((s) => (specIndex[p.id]?.[specName] || []).includes(s)))
    );
  }

  return catalog;
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

// Bounds and the filter below both use priceLo/priceHi (the true per-product effective-price range) — using
// products.min_price for both made an expensive colour/size invisible to the slider AND the filter;
// using the priciest variant for bounds alone made the slider's max unreachable by a min_price-only filter;
// using the regular price hid a discounted variant from a range only its sale price falls in.
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
  const { type, sub = [], sort = "default", optionFilters = {}, specFilters = {}, priceMin, priceMax } = params;
  const catalogNames = isAllCategory(type) ? [] : [...type].sort();

  const base = await getCatalogBase(catalogNames, catalogNames.length > 0 ? [...sub].sort() : []);
  let catalog = await filterCatalogBeforePrice(base, optionFilters, specFilters);

  // Range overlap: a product matches if ANY of its visible variants' effective prices could fall in
  // [priceMin, priceMax], not just its cheapest one.
  if (priceMin != null) catalog = catalog.filter((p) => p.priceHi >= priceMin);
  if (priceMax != null) catalog = catalog.filter((p) => p.priceLo <= priceMax);

  const sorted = sortCatalog(catalog, sort);
  return sorted.map(({ createdAt, priceLo, priceHi, ...rest }) => rest);
}

// Both the filtered, sorted catalog AND the price bounds for its filter range.
// Used by the catalog page, which needs both together. Computes the pre-price-filter list once
// and derives both results from it, rather than running the filter pass twice.
export async function getCatalogAndBounds(
  params: FilterParamsWithArrays
): Promise<{ products: CatalogProductDetails[]; bounds: { min: number; max: number } | null }> {
  const { type, sub = [], sort = "default", optionFilters = {}, specFilters = {}, priceMin, priceMax } = params;
  const catalogNames = isAllCategory(type) ? [] : [...type].sort();

  const base = await getCatalogBase(catalogNames, catalogNames.length > 0 ? [...sub].sort() : []);
  // Compute bounds WITHOUT price filters (so the range shows what's available for the selected options/specs).
  const prePrice = await filterCatalogBeforePrice(base, optionFilters, specFilters);
  const bounds = computeBounds(prePrice);

  // Then apply price filters and sorting for the final product list (same range-overlap rule as getFilteredCatalog).
  let catalog = prePrice;
  if (priceMin != null) catalog = catalog.filter((p) => p.priceHi >= priceMin);
  if (priceMax != null) catalog = catalog.filter((p) => p.priceLo <= priceMax);
  const sorted = sortCatalog(catalog, sort);
  const products = sorted.map(({ createdAt, priceLo, priceHi, ...rest }) => rest);

  return { products, bounds };
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
    if (key.startsWith("optFilter_")) optionFilters[key.slice(10)] = value.split(",");
    else if (key.startsWith("specFilter_")) specFilters[key.slice(11)] = value.split(",");
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
