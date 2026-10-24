// Shimmer placeholder matching ProductCard's layout, shown while the catalog
// re-fetches after a filter/sort change.
export default function ProductCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-full animate-pulse">
      {/* Image */}
      <div className="aspect-square w-full mb-4 bg-opora-brown/10 rounded-sm" />

      <div className="flex flex-col">
        {/* Color swatches row */}
        <div className="flex items-center gap-3 mb-3 h-6">
          <span className="w-6 h-6 rounded-full bg-opora-brown/10" />
          <span className="w-6 h-6 rounded-full bg-opora-brown/10" />
          <span className="w-6 h-6 rounded-full bg-opora-brown/10" />
        </div>

        {/* Title */}
        <div className="h-6 md:h-7 w-3/4 bg-opora-brown/10 rounded mb-2" />
        {/* Price */}
        <div className="h-5 md:h-6 w-1/3 bg-opora-brown/10 rounded" />
      </div>
    </div>
  );
}
