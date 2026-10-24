"use client";

import { useRef } from "react";
import ProductCard from "../ui/ProductCard";
import { SliderArrowLeftIcon, SliderArrowRightIcon } from "../ui/Icons";
import { CatalogProductDetails, ProductDetails } from "@/lib"; // Path to your types
import { productHref } from "@/lib/utils";

type TopProductsProps = {
  products: ProductDetails[];
}

export default function TopProducts({ products }: TopProductsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320; 
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (!products || products.length === 0) return null;

  return (
    <section className="py-12 md:py-20 px-4 md:px-8 bg-opora-white overflow-hidden">
      <div className="mx-auto px-0">
        
        {/* The section header */}
        <div className="flex justify-between items-center mb-5 md:mb-7">
          <h2 className="text-2xl md:text-3xl font-medium text-opora-brown">
            Найпопулярніші товари
          </h2>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => scroll("left")}
              aria-label="Попередні товари"
              className="p-2 hover:opacity-70 transition-opacity text-opora-brown"
            >
              <SliderArrowLeftIcon className="w-6 h-6" />
            </button>
            <button 
              onClick={() => scroll("right")}
              aria-label="Наступні товари"
              className="p-2 hover:opacity-70 transition-opacity text-opora-brown"
            >
              <SliderArrowRightIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* The container with the cards */}
        <div 
          ref={scrollContainerRef}
          className="flex px-2  gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-pl-4 hide-scrollbar pb-4 pt-2"
        >
          {products.map((product, index) => {
            // We assemble a single object
            const productDetails: CatalogProductDetails = {
              id: product.id,
              name: product.name,
              price: product.price || 0,
              slug: product.slug,
              href: productHref(product),
              variations: product.variations,
              allOptionNames: [],
              catalog: product.catalog,
            };

            return (
              <div 
                key={product.id} 
                className="shrink-0 w-65  md:w-75 lg:w-[320px] snap-start"
              >
                {/* We pass a single `product` prop */}
                <ProductCard product={productDetails} initialIndex={index} />
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}