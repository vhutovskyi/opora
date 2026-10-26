"use client";

import { UIEvent, WheelEvent, useEffect, useRef, useState } from "react";

// Everything FullscreenGallery needs from its parent: open/slide state, the slider ref, keyboard
// (←/→/Esc), wheel → horizontal scroll and the body scroll lock. Shared by the product page and /compare.
export function useFullscreenGallery(imageCount: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  // Mount the gallery only after the first open (then keep it for the closing animation).
  const [mounted, setMounted] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Reliable scroll sync for the fullscreen gallery
  useEffect(() => {
    if (isOpen && sliderRef.current) {
      // Give the browser a moment to render the DOM before scrolling
      requestAnimationFrame(() => {
        if (sliderRef.current) {
          sliderRef.current.scrollLeft = sliderRef.current.offsetWidth * activeSlide;
        }
      });
    }
  }, [isOpen, activeSlide]);

  const scrollToImage = (index: number) => {
    setActiveSlide(index);
    sliderRef.current?.scrollTo({ left: sliderRef.current.offsetWidth * index, behavior: "smooth" });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowRight" && activeSlide < imageCount - 1) {
        scrollToImage(activeSlide + 1);
      } else if (e.key === "ArrowLeft" && activeSlide > 0) {
        scrollToImage(activeSlide - 1);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, activeSlide, imageCount]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    // Cleanup on unmount (in case the user navigates to another page)
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!e.currentTarget) return;
    setActiveSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.offsetWidth));
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const slider = sliderRef.current;
    if (!slider) return;
    // If the user swipes horizontally (e.g. on a trackpad) the browser
    // handles it natively, so we do nothing.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // Turn vertical mouse-wheel movement into horizontal scrolling
    slider.scrollLeft += e.deltaY;
  };

  const open = (index: number) => {
    setActiveSlide(index);
    setMounted(true);
    setIsOpen(true);
  };

  return {
    mounted,
    open,
    // Spread straight onto <FullscreenGallery images={…} {...galleryProps} />.
    galleryProps: {
      isOpen,
      activeSlide,
      sliderRef,
      onClose: () => setIsOpen(false),
      onScroll,
      onWheel,
      onThumbClick: scrollToImage,
    },
  };
}
