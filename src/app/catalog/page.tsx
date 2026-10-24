import type { Metadata } from "next";
import { Suspense } from "react";
import CatalogClient from "./CatalogClient";
import {
  CATALOG_PAGE_SIZE,
  getCatalogAndBounds,
  getCatalogHeroImage,
  getCatalogs,
  getFilterOptions,
  getSubcategoryOptions,
  paginateCatalog,
  parseCatalogParams,
} from "@/lib";

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог мінімалістичних крісел та меблів OPORA. Оберіть колір і розмір під свій інтер'єр.",
  alternates: { canonical: "/catalog" },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  const params = await searchParams;

  const filterParams = await parseCatalogParams(params);

  const [catalogAndBounds, filterOptions, catalogHeroImage, categories, subcategoryOptions] = await Promise.all([
    getCatalogAndBounds(filterParams),
    getFilterOptions(),
    getCatalogHeroImage(),
    getCatalogs(),
    getSubcategoryOptions(),
  ]);
  const { products: allProducts, bounds: priceBounds } = catalogAndBounds;

  // Only the first batch goes into the HTML — the client loads the rest from /api/catalog on scroll.
  const { products, nextCursor } = paginateCatalog(allProducts, null, CATALOG_PAGE_SIZE);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-opora-white flex items-center justify-center text-opora-brown font-medium">
          Завантаження каталогу...
        </div>
      }
    >
      <CatalogClient initialProducts={products} initialNextCursor={nextCursor} filterOptions={filterOptions} categories={categories} subcategoryOptions={subcategoryOptions} priceBounds={priceBounds} heroImage={catalogHeroImage} />
    </Suspense>
  );
}