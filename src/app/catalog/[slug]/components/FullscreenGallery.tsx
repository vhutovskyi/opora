"use client";

import { RefObject, UIEvent, WheelEvent, useEffect, useRef } from "react";
import Image from "@/components/ui/OptimizedImage";

interface FullscreenGalleryProps {
  images: string[];
  isOpen: boolean;
  activeSlide: number;
  sliderRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
  onThumbClick: (index: number) => void;
}

export default function FullscreenGallery({
  images,
  isOpen,
  activeSlide,
  sliderRef,
  onClose,
  onScroll,
  onWheel,
  onThumbClick,
}: FullscreenGalleryProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // On open we move the focus to the close button (Escape/arrows are already listened to in the parent).
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Галерея фото товару"
      inert={!isOpen}
      className={`fixed inset-0 z-100 bg-white flex flex-col h-dvh transition-all duration-500 ease-in-out transform ${
        isOpen
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-8 pointer-events-none"
      }`}
    >
      {/* The close button */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 z-50">
        <button
          ref={closeRef}
          onClick={onClose}
          className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2"
          aria-label="Закрити галерею"
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M1 13L13 1" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* The main image with swipe */}
      <div
        ref={sliderRef}
        onScroll={onScroll}
        onWheel={onWheel}
        className="flex-1 overflow-x-auto flex snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none pt-16 md:pt-0"
      >
        {images.map((img, idx) => (
          <div key={idx} className="relative w-full shrink-0 snap-center h-full">
            <Image
              src={img}
              alt={`Фото товару ${idx + 1}`}
              fill
              sizes="100vw"
              className="object-contain p-4 md:p-12"
            />
          </div>
        ))}
      </div>

      {/* The thumbnail row */}
      <div className="h-24 md:h-32 shrink-0 flex items-center justify-center gap-2 md:gap-4 px-4 overflow-x-auto pb-4 md:pb-8">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => onThumbClick(idx)}
            className={`relative w-16 h-16 md:w-20 md:h-20 shrink-0 border-2 transition-all overflow-hidden ${
              activeSlide === idx ? 'border-opora-brown scale-105' : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Image src={img} alt={`Мініатюра ${idx + 1}`} fill sizes="80px" className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
