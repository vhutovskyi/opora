// Image gallery: one-photo-per-slide slider on mobile, a 2-per-row square grid on desktop
"use client";

import { TABLES_CATALOG } from "@/lib/importer/tablesData";
import ImageSlider, { GalleryImage } from "./ImageSlider";

interface ProductGalleryProps {
  images: string[];
  // images-per-row for the desktop grid, e.g. [1,2] = full-width then two half-width.
  // Leftover images beyond the pattern fall back to 2-per-row. [] / undefined = default.
  layout?: number[];
  catalog: string;
  onImageClick: (index: number) => void;
}

// Split image indices into rows per the layout pattern; remaining images render 2-per-row.
function layoutRows(count: number, layout: number[]): number[][] {
  const rows: number[][] = [];
  let i = 0;
  for (const n of layout) {
    if (i >= count) break;
    rows.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
    i += n;
  }
  while (i < count) {
    rows.push(Array.from({ length: Math.min(2, count - i) }, (_, k) => i + k));
    i += 2;
  }
  return rows;
}

export default function ProductGallery({ images, layout = [], catalog, onImageClick }: ProductGalleryProps) {
  // Tables have a single angle with lots of empty background around the tabletop — same smaller
  // cap as before. Other single-photo products (e.g. a non-folding chair) fill the frame better,
  // so those keep the larger size.
  const isTable = catalog === TABLES_CATALOG;
  const singleImageClassName = isTable
    ? "w-full max-w-[min(34rem,62vh)] mx-auto"
    : "w-full max-w-[min(48rem,80vh)] mx-auto";
  const singleImageSizes = isTable ? "(max-width: 1024px) 100vw, 34rem" : "(max-width: 1024px) 100vw, 48rem";

  return (
    <>
      {/* MOBILE: one-photo-per-slide slider with dots */}
      <ImageSlider images={images} onImageClick={onImageClick} className="lg:hidden" />

      {/* DESKTOP: rows per the configured layout (photos per row); 2 per row by default.
          A product with ONE photo (e.g. a non-extending table — a single angle) would otherwise
          stretch it across the whole column: ~850px on a 14", i.e. a half-screen square. So this
          case alone is capped by both viewport width and height — it stops growing on wider monitors. */}
      <div className="hidden lg:flex flex-col gap-4">
        {layoutRows(images.length, layout).map((row, r) => (
          <div
            key={`r-${r}`}
            className={`grid items-start gap-4 ${images.length === 1 ? singleImageClassName : ""}`}
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((idx) => (
              <GalleryImage
                key={`d-${idx}`}
                src={images[idx]}
                alt={`Фото товару ${idx + 1}`}
                sizes={
                  images.length === 1
                    ? singleImageSizes
                    : row.length === 1
                      ? "(max-width: 1024px) 100vw, 66vw"
                      : "(max-width: 1024px) 100vw, 50vw"
                }
                priority={idx === 0}
                onClick={() => onImageClick(idx)}
                wrapperClassName="overflow-hidden relative cursor-pointer group"
                className="object-contain object-center transition-transform duration-500 group-hover:scale-105"
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
