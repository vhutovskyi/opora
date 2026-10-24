import { BOOL_YES, optionValueRank } from "@/lib/constants";
import { supabaseAdmin } from "./client";
import { productHref } from "@/lib/utils";

export type SearchResult = {
  id: string;
  name: string;
  price: number;
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

  const [byText, byOption, bySpec] = await Promise.all([
    // Full-text over the GIN index; config must be the same 'simple' as in the column.
    db
      .from("products")
      .select("id")
      .eq("visible", true)
      .textSearch("search_tsv", tsq, { config: "simple" })
      .limit(50),
    // options.name is "Колір оббивки: Чорний", and for colours value is a hex,
    // so the readable text of an option lives precisely in name.
    db
      .from("variants")
      .select("product_id, variant_options!inner ( options!inner ( name ) )")
      .ilike("variant_options.options.name", pat)
      .limit(300),
    db
      .from("variants")
      .select("product_id, variant_specs!inner ( value )")
      .ilike("variant_specs.value", pat)
      .limit(300),
  ]);

  // We don't swallow an error from the main (full-text) query: otherwise a missing search_tsv column
  // or a broken tsquery would look like "nothing found" instead of a breakage.
  if (byText.error) throw byText.error;

  // Matches in the name/description come first, then the options and specs.
  const ids = new Set<string>((byText.data ?? []).map((r) => r.id as string));
  for (const r of [...(byOption.data ?? []), ...(bySpec.data ?? [])]) {
    if (ids.size >= LIMIT) break;
    if (r.product_id) ids.add(r.product_id as string);
  }
  const top = [...ids].slice(0, LIMIT);
  if (!top.length) return [];

  const { data, error } = await db
    .from("products")
    .select(
      `id, slug, model, min_price, catalog,
       variants ( sort_order, variant_images ( images ( url_compressed, url ) ), variant_options ( options ( value ) ) )`
    )
    .in("id", top)
    .eq("visible", true)
    .eq("variants.visible", true)
    .order("sort_order", { referencedTable: "variants", ascending: true })
    // The first few variants — so they can be sorted the same way as a catalog card.
    .limit(6, { referencedTable: "variants" })
    .order("sort_order", { referencedTable: "variants.variant_images" })
    .limit(1, { referencedTable: "variants.variant_images" });
  if (error) throw error;

  type SearchVariantRow = {
    sort_order: number | null;
    variant_images: { images: { url_compressed: string | null; url: string } | null }[] | null;
    variant_options: { options: { value: string | null } | null }[] | null;
  };
  type Row = {
    id: string;
    slug: string | null;
    model: string | null;
    min_price: number | null;
    catalog: string | null;
    variants: SearchVariantRow[] | null;
  };
  const byId = new Map((data as unknown as Row[]).map((p) => [p.id, p]));

  // The same order as in the catalog: "Так" checkboxes to the end, priority values to the front.
  const boolYes = (v: SearchVariantRow) =>
    (v.variant_options || []).some((vo) => vo.options?.value === BOOL_YES) ? 1 : 0;
  const rank = (v: SearchVariantRow) =>
    Math.min(0, ...(v.variant_options || []).map((vo) => optionValueRank(vo.options?.value || "")));

  return top
    .map((id) => byId.get(id))
    .filter((p): p is Row => !!p)
    .map((p) => {
      const first = (p.variants || [])
        .slice()
        .sort((a, b) => boolYes(a) - boolYes(b) || rank(a) - rank(b) || (a.sort_order || 0) - (b.sort_order || 0))[0];
      const img = first?.variant_images?.[0]?.images;
      return {
        id: p.id,
        name: p.model || "Без назви",
        price: Number(p.min_price || 0),
        href: productHref(p),
        image: img?.url_compressed || img?.url || "",
        catalog: p.catalog || "",
      };
    });
}
