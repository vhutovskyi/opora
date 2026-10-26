// The swipeable one-photo-per-slide slider with dots — the product page's mobile gallery,
// also used for every column of the /compare page.
"use client";

import { UIEvent, useEffect, useState } from "react";
import Image from "@/components/ui/OptimizedImage";
import { cfImageUrl } from "@/lib/utils";

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

export function GalleryImage({ src, alt, priority, sizes, className, onClick, wrapperClassName }: GalleryImageProps) {
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

interface ImageSliderProps {
  images: string[];
  onImageClick: (index: number) => void;
  // Extra classes on the outer wrapper (e.g. lg:hidden on the product page).
  className?: string;
  sizes?: string;
  // Only the product page's hero photo is worth preloading.
  priority?: boolean;
  altPrefix?: string;
}

export default function ImageSlider({
  images,
  onImageClick,
  className = "",
  sizes = "100vw",
  priority = true,
  altPrefix = "Фото товару",
}: ImageSliderProps) {
  const [activeSlide, setActiveSlide] = useState(0);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el || !el.offsetWidth) return;
    setActiveSlide(Math.round(el.scrollLeft / el.offsetWidth));
  };

  return (
    <div className={`relative ${className}`}>
      {/* overscroll-x-contain: inside the horizontally scrolling /compare table a swipe past the last
          photo must not start scrolling the table. */}
      <div
        onScroll={handleScroll}
        className="flex items-start overflow-x-auto overscroll-x-contain snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none"
      >
        {images.map((img, idx) => (
          // key by position (idx), not src — the component stays mounted across variant
          // changes, so the crossfade between old and new photo runs without flicker.
          <GalleryImage
            key={`m-${idx}`}
            src={img}
            alt={`${altPrefix} ${idx + 1}`}
            sizes={sizes}
            priority={priority && idx === 0}
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
  );
}
