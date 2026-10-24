// Image gallery: one-photo-per-slide slider on mobile, a 2-per-row square grid on desktop
"use client";

import { UIEvent, useEffect, useRef, useState } from "react";
import Image from "@/components/ui/OptimizedImage";
import { TABLES_CATALOG } from "@/lib/importer/tablesData";
import { cfImageUrl } from "@/lib/utils";

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

// One photo, swapping its src when the variant changes.
// The new photo is loaded and decoded in the background first and only then put into the DOM —
// one swap moment instead of two (a two-layer crossfade first showed a white frame on the
// remounted old photo, then faded the new one in). Skeleton shows on the first load only.
interface GalleryImageProps {
  src: string;
  alt: string;
  priority: boolean;
  sizes: string;
  className: string;
  onClick: () => void;
  wrapperClassName: string;
}

function GalleryImage({ src, alt, priority, sizes, className, onClick, wrapperClassName }: GalleryImageProps) {
  // The src actually in the DOM: changes only once the new photo is ready to paint.
  const [shown, setShown] = useState(src);
  // Wider than tall: the cell takes the photo's natural ratio instead of a square — no beige bars.
  const [wideRatio, setWideRatio] = useState<string | null>(null);
  const [everLoaded, setEverLoaded] = useState(false);

  useEffect(() => {
    if (src === shown) return;
    let alive = true;
    const swap = () => alive && setShown(src);
    // Warm exactly the URL OptimizedImage will request; the transform may fail
    // (quota/localhost) and fall back to the original, so warm that one too.
    const pre = new window.Image();
    pre.src = cfImageUrl(src);
    pre.decode().then(swap, () => {
      const raw = new window.Image();
      raw.src = src;
      raw.decode().then(swap, swap);
    });
    return () => {
      alive = false;
    };
  }, [src, shown]);

  const measure = (node: HTMLImageElement) => {
    setWideRatio(node.naturalWidth > node.naturalHeight ? `${node.naturalWidth} / ${node.naturalHeight}` : null);
    setEverLoaded(true);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Відкрити фото на весь екран (${alt})`}
      className={`${wrapperClassName} self-start block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${wideRatio ? "" : "aspect-square bg-opora-softBeige"}`}
      style={wideRatio ? { aspectRatio: wideRatio } : undefined}
    >
      {/* Skeleton on the very first load only, while the cell is still empty */}
      {!everLoaded && (
        <div aria-hidden="true" className="absolute inset-0 z-0 bg-opora-softBeige animate-pulse" />
      )}

      {/* No key: the element stays the same, only the already-decoded src is swapped */}
      <Image
        src={shown}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // If the photo is already cached, img.complete === true right at mount.
        ref={(node) => {
          if (node?.complete) measure(node);
        }}
        onLoad={(e) => measure(e.currentTarget)}
        className={`${className} z-10`}
      />
    </button>
  );
}

export default function ProductGallery({ images, layout = [], catalog, onImageClick }: ProductGalleryProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  // Tables have a single angle with lots of empty background around the tabletop — same smaller
  // cap as before. Other single-photo products (e.g. a non-folding chair) fill the frame better,
  // so those keep the larger size.
  const isTable = catalog === TABLES_CATALOG;
  const singleImageClassName = isTable
    ? "w-full max-w-[min(34rem,62vh)] mx-auto"
    : "w-full max-w-[min(48rem,80vh)] mx-auto";
  const singleImageSizes = isTable ? "(max-width: 1024px) 100vw, 34rem" : "(max-width: 1024px) 100vw, 48rem";

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el || !el.offsetWidth) return;
    setActiveSlide(Math.round(el.scrollLeft / el.offsetWidth));
  };

  return (
    <>
      {/* MOBILE: one-photo-per-slide slider with dots */}
      <div className="relative lg:hidden">
        <div
          ref={sliderRef}
          onScroll={handleScroll}
          className="flex items-start overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none"
        >
          {images.map((img, idx) => (
            // key by position (idx), not src — the component stays mounted across variant
            // changes, so the crossfade between old and new photo runs without flicker.
            <GalleryImage
              key={`m-${idx}`}
              src={img}
              alt={`Фото товару ${idx + 1}`}
              sizes="100vw"
              priority={idx === 0}
              onClick={() => onImageClick(idx)}
              wrapperClassName="w-full shrink-0 snap-center overflow-hidden relative cursor-pointer"
              className="object-contain object-center"
            />
          ))}
        </div>

        {images.length > 1 && (
          // z-30: photos in GalleryImage sit at z-20 and would otherwise cover the dots
          <div className="absolute bottom-4 left-0 right-0 z-30 flex justify-center gap-2 pointer-events-none">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${
                  activeSlide === idx ? 'w-5 bg-opora-brown' : 'w-2 bg-opora-brown/30'
                }`}
              />
            ))}
          </div>
        )}
      </div>

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
