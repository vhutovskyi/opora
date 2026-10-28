// A price with an optional sale, styled like the catalog card (ProductCard): the regular price
// struck through, the sale price in red. Stacked, so it stays narrow in tight rows (search results
// at 375px share the row with a photo and the product name).
export default function PriceLabel({ price, discountedPrice }: { price: number; discountedPrice?: number | null }) {
  const onSale = !!discountedPrice && discountedPrice < price;
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      {onSale && <span className="text-xs text-opora-brown/40 line-through">{price.toLocaleString("uk-UA")} ₴</span>}
      <span className={`text-sm font-medium${onSale ? " text-red-600" : ""}`}>
        {(onSale ? discountedPrice : price).toLocaleString("uk-UA")} ₴
      </span>
    </span>
  );
}
