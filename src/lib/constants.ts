// A checkbox option = an ordinary option axis with two values: "Так" / "Ні" (e.g. "З білими ніжками").
// The option type is stored nowhere — like the colour (a hex in options.value), it is read from the VALUE.
// ponytail: a convention instead of an options.kind column — add the column if there are ever more types.
export const BOOL_YES = "Так";
export const BOOL_NO = "Ні";

// Option values that come first: both in the selector (the chip order) and in the variant sorting
// (the first variant = the default one on the product page). The rest keep their sort_order.
// ponytail: a list instead of an options.sort_order column — add the column if the order has to be editable in the admin panel.
export const OPTION_VALUE_ORDER = ["Щит", "Стандарт"];

// From the list — to the front (in list order), everything else — 0 (a stable sort keeps the original order).
export const optionValueRank = (value: string) => {
  const i = OPTION_VALUE_ORDER.indexOf(value);
  return i < 0 ? 0 : i - OPTION_VALUE_ORDER.length;
};

// Temporary mock images for products without photos.
// The picsum.photos host is allowed in next.config.ts (images.remotePatterns).
export const MOCK_PRODUCT_IMAGES = [
  "https://picsum.photos/id/237/800/1000",
  "https://picsum.photos/id/237/800/1000",
  "https://picsum.photos/id/237/800/1000",
  "https://picsum.photos/id/237/800/1000",
] as const;

// The size of a product "batch" in the catalog (infinite scroll, loading more on scroll).
export const CATALOG_PAGE_SIZE = 15;
