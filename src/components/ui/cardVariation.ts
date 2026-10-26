import type { VariationImage } from "@/lib/supabase/types";

// A swatch the visitor hovered/clicked on a ProductCard, remembered together with the data and the
// filters it was picked from (the `variations` array identity marks one server response).
export type CardPick = { id: string; variations: VariationImage[]; filterKey: string };

// Which variation the card shows (photo, price, link). DERIVED from the current props on every render:
// it used to be a state object set once at mount, so when a new filter's data reached a card that stayed
// mounted (same product id), the swatches already showed the new colours while the photo kept the
// previous selection's variation until the visitor hovered a swatch.
// Order: the visitor's pick — only while it belongs to THESE variations under THESE filters — then the
// first variation matching the filters, then the first swatch, then the first variation.
export function activeCardVariation({
  variations,
  source,
  filterKey,
  pick,
  matches,
  firstSwatch,
}: {
  variations: VariationImage[]; // in the card's display order
  source: VariationImage[]; // product.variations as received — compared by identity with pick.variations
  filterKey: string;
  pick: CardPick | null;
  matches: (variation: VariationImage) => boolean;
  firstSwatch?: VariationImage;
}): VariationImage | undefined {
  const picked =
    pick && pick.variations === source && pick.filterKey === filterKey
      ? variations.find((v) => v.id === pick.id)
      : undefined;
  return picked ?? variations.find(matches) ?? firstSwatch ?? variations[0];
}

type SwatchColor = { hex: string; name: string };

// Leg axes («Ніжки», «Колір ніжок») — any word starting with «ніж»: the stem changes with the case
// («ніжки» / «ніжок»), so «ніжк» would miss «Колір ніжок». The «З білими ніжками» checkbox matches too,
// harmlessly — its Так/Ні values never reach a swatch (only hex values do).
const isLegsAxis = (axis: string) => axis.toLowerCase().split(/\s+/).some((word) => word.startsWith("ніж"));

// A split swatch is drawn hexes[0] (top-left half) → hexes[1] (bottom-right half), and the DB returns a
// variant's options in no particular order — the same «Стільниця + Ніжки» pair came out either way round
// across 30 products, so one filter's colour jumped between the halves from card to card.
// Fixed order: the legs always last, i.e. the bottom half — legs are at the bottom of the furniture, and the
// product page's BuyBox draws its colour · legs swatches the same way; the rest by axis name, then by value.
export function orderSwatchColors<T extends SwatchColor>(colors: T[]): T[] {
  const axis = (c: SwatchColor) => c.name.split(":")[0].trim();
  return [...colors].sort(
    (a, b) =>
      Number(isLegsAxis(axis(a))) - Number(isLegsAxis(axis(b))) ||
      axis(a).localeCompare(axis(b), "uk") ||
      a.name.localeCompare(b.name, "uk")
  );
}
