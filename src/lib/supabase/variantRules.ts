import { BOOL_YES, optionValueRank } from "@/lib/constants";

// The ONE definition of which variants the storefront shows, in what order, and what they cost.
// The catalog grid (fetchCatalogBase), the product page (fetchProductDetail), card strips
// (getMultipleProductsWithVariations) and search all go through here — they used to carry their own
// copies, which drifted: the catalog never selected `visible` (cards showed swatches of hidden
// variants), filtered prices on `price` while cards/BuyBox charge the sale price, and search ranked
// option priority by min instead of sum, so its thumbnail was not the page's default variant.

// `visible` is REQUIRED (not optional) on purpose: a select string that forgets the column then
// fails to type-check instead of silently treating every variant as visible.
export type StorefrontVariant = {
  visible: boolean | null;
  sort_order: number | null;
  // Only the value decides the order, so search can skip the (long) option names.
  variant_options: { options: { value: string | null } | null }[] | null;
};

export type PricedVariant = { price: number | null; discounted_price: number | null };

export const isStorefrontVisible = (v: Pick<StorefrontVariant, "visible">) => v.visible !== false;

// Checkbox options ("З білими ніжками" and the like) are UNTICKED by default: variants with the value "Так"
// are sorted after the rest, and only then by sort_order. The first variant of the list is the default on the
// product page (and it is its photos that go as a prop), so it is always "Ні".
const hasBoolYes = (v: Pick<StorefrontVariant, "variant_options">) =>
  (v.variant_options || []).some((vo) => vo.options?.value === BOOL_YES) ? 1 : 0;

// Priority option values (OPTION_VALUE_ORDER, e.g. "Щит") — to the front, but AFTER the checkboxes,
// so the default variant keeps its checkboxes unticked. A sum (not a minimum) over all of the variant's axes —
// so that priority on one axis (Матеріал: Щит) doesn't "drown out" priority on another (Фурнітура: Стандарт).
const valueRank = (v: Pick<StorefrontVariant, "variant_options">) =>
  (v.variant_options || []).reduce((sum, vo) => sum + optionValueRank(vo.options?.value || ""), 0);

// Storefront-visible variants only, in sort order. Hidden ones (visible=false, a manual admin
// curation flag) stay in the DB but never reach the client.
// ponytail: the sort keys are computed ONCE per variant, not inside the comparator. A bed has ~1000
// variants → ~10k comparisons, and each one re-scanned the options of both sides (hasBoolYes +
// valueRank), i.e. ~160k optionValueRank calls per cache miss. Now it is ~2k.
export const visibleSorted = <T extends StorefrontVariant>(rows: T[] | null): T[] =>
  (rows || [])
    .filter(isStorefrontVisible)
    .map((v) => ({ v, bool: hasBoolYes(v), rank: valueRank(v), order: v.sort_order || 0 }))
    .sort((a, b) => a.bool - b.bool || a.rank - b.rank || a.order - b.order)
    .map((d) => d.v);

// A sale price counts only when it is set and actually lower than the regular one.
// `effective` is what the customer pays — the BuyBox and the cart charge it, so every price
// comparison on the storefront (filter, bounds, sorting, "від" prices) uses it too.
export function variantPricing(v: PricedVariant) {
  const price = Number(v.price || 0);
  const discounted = Number(v.discounted_price || 0);
  const discountedPrice = discounted > 0 && discounted < price ? discounted : null;
  return { price, discountedPrice, effective: discountedPrice ?? price };
}

// The real effective-price range over the variants given (pass them through visibleSorted first).
// `fallback` (products.min_price) only when no variant carries a price: that column is written by the
// importers from ALL variants, hidden ones included, and knows nothing about sales — so it is
// not trusted as "the" price, only as a last resort.
export function priceRange(rows: PricedVariant[], fallback: number | null): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of rows) {
    const { effective } = variantPricing(v);
    if (effective <= 0) continue;
    if (effective < lo) lo = effective;
    if (effective > hi) hi = effective;
  }
  if (lo === Infinity) {
    const p = Number(fallback || 0);
    return { lo: p, hi: p };
  }
  return { lo, hi };
}
