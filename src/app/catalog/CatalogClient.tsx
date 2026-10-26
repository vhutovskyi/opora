"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import OptimizedImage from "@/components/ui/OptimizedImage";
import Drawer from "@/components/layout/Drawer";
import FilterContent, { DynamicFilters, FilterContentRef } from "@/components/blocks/FilterContent";
import SortContent from "@/components/blocks/SortContent";
import ProductCard from "@/components/ui/ProductCard";
import ProductCardSkeleton from "@/components/ui/ProductCardSkeleton";
import { FiltersIcon, SortingIcon } from "@/components/ui/Icons";
import { CatalogProductDetails } from "@/lib";
import { trackEvent } from "@/lib/analytics/umami";
import { splitFilterValues } from "@/lib/utils";
import type { SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";

type CatalogClientProps = {
  initialProducts: CatalogProductDetails[],
  // the id of the last product of the first batch; null — there are no more products.
  initialNextCursor: string | null,
  filterOptions: DynamicFilters,
  categories: string[],
  subcategoryOptions: SubcategoryOptionRow[],
  // The price range of the current selection — the placeholders of the "Ціна" fields. null = no products.
  priceBounds: { min: number; max: number } | null,
  // The catalog banner from the "Банери" table (R2). While there is none — the mock below.
  heroImage?: string | null,
}

// A mock image for the catalog banner (a fallback while the DB has no photo of its own).
const MOCK_CATALOG_HERO = "/images/catalog-hero.jpg";

export default function CatalogClient({ initialProducts, initialNextCursor, filterOptions, categories, subcategoryOptions, priceBounds, heroImage }: CatalogClientProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sidebarFilterRef = useRef<FilterContentRef>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [products, setProducts] = useState(initialProducts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLElement>(null);

  // The filter/sorting changed → the server returned a new first batch: we start the list from scratch.
  // Reset DURING render (React's "adjusting state when a prop changes"), not in an effect: the effect ran
  // one render late, so the first render after navigation paired the NEW filters (searchParams) with the
  // OLD products — the cards mounted with the previous selection's data and kept its photo.
  const [batch, setBatch] = useState(initialProducts);
  if (batch !== initialProducts) {
    setBatch(initialProducts);
    setProducts(initialProducts);
    setNextCursor(initialNextCursor);
  }

  // Loading more on scroll: a sentinel below the grid + rootMargin, so the batch arrives before the end of the list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || isLoadingMore || isPending) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setIsLoadingMore(true);
        try {
          const query = new URLSearchParams(searchParams.toString());
          query.set("cursor", nextCursor);
          const res = await fetch(`/api/catalog?${query}`);
          if (!res.ok) throw new Error(`catalog ${res.status}`);
          const page: { products: CatalogProductDetails[]; nextCursor: string | null } = await res.json();
          setProducts((prev) => [...prev, ...page.products]);
          setNextCursor(page.nextCursor);
        } catch (error) {
          // ponytail: on an error we simply stop loading more (otherwise the sentinel stays visible
          // and the effect restarts in a loop). Need a retry/button — we'll add one if this really happens.
          console.error("Не вдалося довантажити каталог:", error);
          setNextCursor(null);
        } finally {
          setIsLoadingMore(false);
        }
      },
      { rootMargin: "800px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, isLoadingMore, isPending, searchParams]);

  const selectedColors = useMemo(() => {
    const colors: string[] = [];
    searchParams.forEach((val, key) => {
      if (key.startsWith("optFilter_") && val) colors.push(...splitFilterValues(key.slice(10), val));
    });
    return colors;
  }, [searchParams]);

  // So the card shows a variation actually within the applied price range, not always its cheapest one.
  const priceMin = searchParams.get("priceMin");
  const priceMax = searchParams.get("priceMax");

  const navigate = (queryString: string) => {
    // A new selection is shorter than the current one — otherwise the user is left dangling at the bottom of what is now a different list.
    // We keep scroll: false in router.push: we scroll ourselves, to the grid, not to the banner.
    gridRef.current?.scrollIntoView({ block: "start" });
    startTransition(() => {
      router.push(`${pathname}?${queryString}`, { scroll: false });
    });
  };

  const handleFilterApply = (queryString: string) => {
    trackEvent("Фільтр каталогу", { query: queryString });
    navigate(queryString);
  };

  const handleSortApply = (queryString: string) => {
    trackEvent("Сортування каталогу", { query: queryString });
    navigate(queryString);
  };

  return (
    <main className="min-h-screen bg-opora-white pb-24">

      <section className="relative w-full h-[50svh] md:h-[60svh] bg-opora-softBeige overflow-hidden pt-24">
        <OptimizedImage
          src={heroImage || MOCK_CATALOG_HERO}
          alt=""
          fill
          sizes="100vw"
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-md">
            Каталог
          </h1>
          <p className="text-white max-w-md drop-shadow-md font-light">
            Мінімалістичні рішення, що стають головним акцентом вашого інтер'єру.
          </p>
        </div>
      </section>

      {/* Filter/Sort toolbar — mobile only */}
      <div className="lg:hidden w-full bg-opora-white border-b border-opora-brown/10 py-6">
        <div className="max-w-7xl mx-auto flex justify-center gap-16 md:gap-32 text-opora-brown">
          <button
            onClick={() => setIsFilterOpen(true)}
            className="flex items-center gap-3 font-medium hover:opacity-70 transition-opacity text-lg"
          >
            Фільтр <FiltersIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsSortOpen(true)}
            className="flex items-center gap-3 font-medium hover:opacity-70 transition-opacity text-lg"
          >
            Сортування <SortingIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content: desktop sidebar + product grid */}
      <div className="max-w-350 mx-auto px-4 lg:px-0 mt-12 lg:flex lg:gap-12 lg:items-start">

        {/* Desktop sidebar — hidden on mobile */}
        <aside
          className="hidden lg:flex flex-col w-72 shrink-0 sticky transition-[top] duration-300 ease-in-out"
          style={{
            top: 'var(--header-offset, 2rem)',
            height: 'calc(100vh - var(--header-offset, 2rem) - 1rem)',
          }}
        >
          <div className="flex flex-col h-full">

            <div className="flex flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto pl-4 space-y-8 pb-4">
                <div className="pb-8 border-b border-opora-brown/10">
                  <SortContent onClose={() => {}} onApply={handleSortApply} />
                </div>
                <div>
                  <h3 className="font-bold text-xl mb-6 text-opora-brown text-center">Фільтри</h3>
                  <FilterContent
                    key={searchParams.get("type")}
                    ref={sidebarFilterRef}
                    inline
                    hideApplyButton
                    onClose={() => {}}
                    filters={filterOptions}
                    categories={categories}
                    subcategoryOptions={subcategoryOptions}
                    priceBounds={priceBounds}
                    onApply={handleFilterApply}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-opora-brown/10 bg-opora-white">
              <button
                onClick={() => sidebarFilterRef.current?.applyFilters()}
                className="w-full py-4 bg-opora-brown text-white text-lg font-medium hover:opacity-90 transition-opacity"
              >
                Показати товари
              </button>
            </div>

          </div>
        </aside>

        {/* Product grid */}
        <section ref={gridRef} className="flex-1 min-w-0" style={{ scrollMarginTop: "var(--header-offset, 2rem)" }}>
          {isPending ? (
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-y-8 md:gap-y-16 gap-x-3 md:gap-x-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center text-opora-brown/80 py-20">
              <p className="text-xl">За вашим запитом товарів не знайдено.</p>
              <p className="mt-2 font-light">Спробуйте змінити параметри фільтру.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 items-start gap-y-8 md:gap-y-16 gap-x-3 md:gap-x-8">
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selectedColors={selectedColors}
                    priceMin={priceMin ? Number(priceMin) : undefined}
                    priceMax={priceMax ? Number(priceMax) : undefined}
                    initialIndex={index}
                  />
                ))}
              </div>
              {isLoadingMore && (
                <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 items-start gap-y-8 md:gap-y-16 gap-x-3 md:gap-x-8 mt-16">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              )}
              <div ref={sentinelRef} aria-hidden className="h-px" />
            </>
          )}
        </section>

      </div>

      {/* Mobile: filter opens from the left, sort from the right */}
      <Drawer isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} position="left" label="Фільтри">
        <FilterContent key={searchParams.get("type")} onClose={() => setIsFilterOpen(false)} filters={filterOptions} categories={categories} subcategoryOptions={subcategoryOptions} priceBounds={priceBounds} onApply={handleFilterApply} />
      </Drawer>

      <Drawer isOpen={isSortOpen} onClose={() => setIsSortOpen(false)} position="right" label="Сортування">
        <SortContent onClose={() => setIsSortOpen(false)} onApply={handleSortApply} />
      </Drawer>

    </main>
  );
}
