import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./client";
import { priceRange, variantPricing, visibleSorted, type PricedVariant, type StorefrontVariant } from "./variantRules";
import { productHref } from "@/lib/utils";

export type SearchResult = {
  id: string;
  name: string;
  // Exactly what the catalog card shows with no filter: the DEFAULT variant's regular price, and its
  // sale price when it has one (then rendered as struck-through price + red sale, PriceLabel).
  price: number;
  discountedPrice: number | null;
  href: string;
  image: string;
  catalog: string;
};

const LIMIT = 5;

// Query normalization → one ILIKE pattern: lower case, trimming, the PostgREST/LIKE special
// characters removed, the words joined with % — "стіл біл" finds "Стіл білий дубовий".
// Word order matters here; for the name/catalog/description that is already handled by tsQuery below,
// while the options and specs stay on ILIKE (their text lives in other tables).
export function likePattern(raw: string) {
  const words = raw.toLowerCase().replace(/[%_,()\\*]/g, " ").split(/\s+/).filter(Boolean);
  return words.length ? `%${words.join("%")}%` : "";
}

// A query against products.search_tsv (see supabase/search_tsvector.sql): the words joined with AND,
// each with a :* prefix — this compensates for the missing Ukrainian stemmer in Postgres
// ("стол:*" finds столи/стола/столом). Word order no longer matters.
// We keep only letters and digits: tsquery's special characters (&, |, !, :, brackets) would otherwise
// break to_tsquery with a syntax error.
export function tsQuery(raw: string) {
  const words = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(Boolean);
  return words.map((w) => `${w}:*`).join(" & ");
}

export async function searchProducts(query: string): Promise<SearchResult[]> {
  const pat = likePattern(query);
  const tsq = tsQuery(query);
  if (pat.length < 4) return []; // %xx% — at least 2 characters

  const db = supabaseAdmin();

  // Visibility as in the catalog (fetchCatalogBase + variantRules.ts): a visible product with at least
  // one visible variant, and an option/spec counts only when a VISIBLE variant carries it. It is applied
  // inside each query, not after: the option/spec queries used to ignore visibility altogether, so a
  // hidden product (or a visible one matched only through a hidden variant) could take one of the
  // LIMIT slots and then render nothing — getSearchCard drops it, leaving the list short.
  // All three select PRODUCTS through an inner join on variants (one variant per product is enough
  // to prove the match), so `limit` counts products. The option/spec queries used to return variant
  // rows capped at 300 — a single 320-variant bed could fill the cap on its own ("горіх" matches 60
  // visible products by option, the capped rows held 14). (`variants.visible` is NOT NULL, so eq true
  // is the same rule as isStorefrontVisible.)
  const visibleProducts = (select: string) =>
    db
      .from("products")
      .select(select)
      .eq("visible", true)
      .eq("variants.visible", true)
      .limit(1, { referencedTable: "variants" })
      .limit(LIMIT);

  const [byText, byOption, bySpec] = await Promise.all([
    // Full-text over the GIN index; config must be the same 'simple' as in the column.
    visibleProducts("id, variants!inner ( id )").textSearch("search_tsv", tsq, { config: "simple" }),
    // options.name is "Колір оббивки: Чорний", and for colours value is a hex,
    // so the readable text of an option lives precisely in name.
    visibleProducts("id, variants!inner ( variant_options!inner ( options!inner ( name ) ) )")
      .ilike("variants.variant_options.options.name", pat)
      .limit(1, { referencedTable: "variants.variant_options" }),
    visibleProducts("id, variants!inner ( variant_specs!inner ( value ) )")
      .ilike("variants.variant_specs.value", pat)
      .limit(1, { referencedTable: "variants.variant_specs" }),
  ]);

  // We don't swallow an error from the main (full-text) query: otherwise a missing search_tsv column
  // or a broken tsquery would look like "nothing found" instead of a breakage.
  if (byText.error) throw byText.error;

  // Matches in the name/description come first, then the options and specs.
  const rows = (r: { data: unknown }) => (r.data ?? []) as { id: string }[];
  const ids = new Set<string>(rows(byText).map((r) => r.id));
  for (const r of [...rows(byOption), ...rows(bySpec)]) {
    if (ids.size >= LIMIT) break;
    ids.add(r.id);
  }
  const top = [...ids].slice(0, LIMIT);
  if (!top.length) return [];

  // One small cached card per product, fetched in parallel — see getSearchCard.
  const cards = await Promise.all(top.map((id) => getSearchCard(id)));
  return cards.filter((c): c is SearchResult => !!c);
}

type SearchVariantRow = StorefrontVariant & PricedVariant & { id: string };

// The search result for ONE product: its default variant's photo and its "від" price, picked by the
// same rules as the catalog card and the product page (variantRules.ts). Those rules need ALL
// visible variants — the first few by sort_order could all be "Так" checkboxes or miss the cheapest
// one — and a bed has 320 of them: reading every variant on every keystroke was 1600 rows / 438KB
// for "ліжко" (5 such beds), ~650ms per search. So it is cached per PRODUCT (like getCompareVariant
// per variant): the query text is unbounded, the product set is not, and one product shows up in
// many queries. ~300 bytes per entry; tagged "catalog", which every price / visibility / photo edit purges.
const getSearchCard = unstable_cache(
  async (productId: string): Promise<SearchResult | null> => {
    const db = supabaseAdmin();
    // Sort keys + prices, but no photos: the photo of the one chosen variant comes in a second,
    // targeted query instead of one photo row per variant.
    const { data, error } = await db
      .from("products")
      .select(
        `id, slug, model, min_price, catalog,
         variants ( id, price, discounted_price, visible, sort_order, variant_options ( options ( value ) ) )`
      )
      .eq("id", productId)
      .eq("visible", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const p = data as unknown as {
      id: string;
      slug: string | null;
      model: string | null;
      min_price: number | null;
      catalog: string | null;
      variants: SearchVariantRow[] | null;
    };
    const visible = visibleSorted(p.variants);
    const first = visible[0];
    // No visible variant → not on the storefront (the catalog drops such a product the same way).
    if (!first) return null;

    const { data: img, error: imgError } = await db
      .from("variant_images")
      .select("images ( url, url_compressed )")
      .eq("variant_id", first.id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (imgError) throw imgError;
    const row = img as unknown as { images: { url: string; url_compressed: string | null } | null } | null;
    const image = row?.images?.url_compressed || row?.images?.url || "";

    // The default variant's own price, like the catalog card (ProductCard: activeVariation.price,
    // falling back to the product's "від" price only when the variant carries none) — so the price
    // belongs to the photo next to it. It used to be the cheapest variant across the product, which
    // disagreed with the card on 18 of 82 products (Стіл Edgar: 7600 on the card, 4700 here).
    const { price, discountedPrice } = variantPricing(first);
    return {
      id: p.id,
      name: p.model || "Без назви",
      price: price || priceRange(visible, p.min_price).lo,
      discountedPrice: price ? discountedPrice : null,
      href: productHref(p),
      image,
      catalog: p.catalog || "",
    };
  },
  ["search-card-v2"],
  { revalidate: 3600, tags: ["catalog"] }
);
