"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon } from "../ui/Icons";
import type { CategoryBanner } from "@/lib";

// The classes have to be literals in the code, otherwise Tailwind strips them (purge).
const SPAN: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

type CategoriesProps = {
  // Category tiles from the "Банери" table (managed in the admin panel).
  categories?: CategoryBanner[];
};

export default function Categories({ categories = [] }: CategoriesProps) {
  if (categories.length === 0) return null;

  return (
    <section className="w-full bg-opora-menu py-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-1 px-4 md:px-8">
        {categories.map((category, idx) => (
          <Link
            key={`${category.title}-${idx}`}
            href={`/catalog?type=${encodeURIComponent(category.title)}`}
            className={`group relative w-full h-87.5 md:h-100 overflow-hidden bg-opora-beige block ${SPAN[category.colSpan] || SPAN[1]}`}
          >
            {/* Background Image */}
            {category.image && (
              <Image
                src={category.image}
                alt={category.title}
                fill
                sizes="(max-width: 768px) 100vw, 25vw"
                className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />
            )}

            {/* Gradient Overlay for text readability */}
            <div className="absolute inset-0 bg-linear-to-b from-black/30 via-transparent to-black/10" />

            {/* Category Title */}
            <h3 className="absolute top-6 left-6 text-2xl md:text-3xl text-white font-medium tracking-wide">
              {category.title}
            </h3>

            {/* Arrow Button */}
            <div className="absolute bottom-6 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center text-opora-brown shadow-md group-hover:bg-opora-brown group-hover:text-white transition-colors duration-300">
              <ArrowRightIcon className="w-6 h-6" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
