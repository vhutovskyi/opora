"use client";

import { useEffect, useRef, useState } from "react";
import ProductCard from "../ui/ProductCard";
import { SliderArrowLeftIcon, SliderArrowRightIcon } from "../ui/Icons";
import { CatalogProductDetails } from "@/lib";

const STORAGE_KEY = "opora-recently-viewed";
const MAX_ITEMS = 12;

type RecentlyViewedProps = {
  // The current product (on a product page) — we write it into the history but don't show it in the section itself.
  // Without this prop (e.g. on the home page) the section only shows the history and writes nothing.
  current?: CatalogProductDetails;
};

export default function RecentlyViewed({ current }: RecentlyViewedProps) {
  const [items, setItems] = useState<CatalogProductDetails[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // We store only public product data (id, name, price, photo) — no personal data whatsoever.
  useEffect(() => {
    let stored: CatalogProductDetails[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = [];
    }

    const withoutCurrent = current ? stored.filter((p) => p.id !== current.id) : stored;

    // Show the previously viewed products (without the current one)
    setItems(withoutCurrent);

    // If there is a current product — we add it to the front of the list, dedup by id, cap the number
    if (current) {
      const updated = [current, ...withoutCurrent].slice(0, MAX_ITEMS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore write errors (private mode / storage full)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const scroll = (direction: "left" | "right") => {
    scrollContainerRef.current?.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  if (items.length === 0) return null;

  return (
    <section className="py-6 overflow-hidden">
      <div className="max-w-400 mx-auto px-4 md:px-8">

        {/* The section header */}
        <div className="flex justify-between items-center mb-8 md:mb-10">
          <h2 className="text-2xl md:text-3xl font-medium text-opora-brown">
            Ви раніше переглядали
          </h2>

          {items.length > 1 && (
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
          )}
        </div>

        {/* The container with the cards */}
        <div
          ref={scrollContainerRef}
          className="flex pl-4 pr-4 gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-pl-4 hide-scrollbar pb-4 pt-2"
        >
          {items.map((product, index) => (
            <div
              key={product.id}
              className="shrink-0 w-65 md:w-75 lg:w-[320px] snap-start"
            >
              <ProductCard product={product} initialIndex={index} />
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
