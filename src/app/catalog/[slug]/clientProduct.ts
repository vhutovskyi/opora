// What exactly the product page sends to the browser. The server keeps the full ProductDetail (needed
// for the metadata and JSON-LD), while the client component gets a "thin" version: variants without photos
// and specs. A bed has 1000 variants — that was 1.5MB of HTML on every page open.

import { imageGroupKey } from "@/lib/supabase/imageGroups";
import type { CatalogProductDetails, ProductDetail, ProductDetailVariant, VariantMedia } from "@/lib";
import { hexColor } from "./components/types";
import type { Product } from "./components/types";

export const variantMedia = (v: ProductDetailVariant): VariantMedia => ({
  images: v.images,
  imagesCompressed: v.imagesCompressed,
  specifications: v.specifications,
});

// Accessory variants stay full: there are ~280 of them per bed (~180KB), and the accessory modal
// then works without any extra requests.
export function toClientProduct(detail: ProductDetail): Product {
  return {
    ...detail,
    variants: detail.variants.map(({ images, imagesCompressed, specifications, ...summary }) => summary),
  };
}

// The card for "Ви раніше переглядали" (written to localStorage, a 5MB quota): the same
// dedup as in the catalog — one variant per group of identical photos × 2 photos.
export function toCardVariations(detail: ProductDetail): CatalogProductDetails["variations"] {
  const seenLooks = new Set<string>();
  const variations: CatalogProductDetails["variations"] = [];
  for (const v of detail.variants) {
    const look = imageGroupKey(v.options.map((o) => o.name));
    if (seenLooks.has(look)) continue;
    seenLooks.add(look);
    variations.push({
      id: v.id,
      allHexes: v.options.map((o) => ({ hex: hexColor(o.value), name: o.name })),
      images: v.images.slice(0, 2),
      imagesCompressed: v.imagesCompressed.slice(0, 2),
    });
  }
  return variations;
}
