"use client";

import { useState, useRef, UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { YellowStarIcon, GrayStarIcon, SliderArrowLeftIcon, SliderArrowRightIcon } from "../ui/Icons";
import { Comment } from "@/lib";

type ReviewsProps = {
  variation?: string;
}

const formatDate = (isoString?: string) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const TRUNCATE_AT = 250;
// Below this count every card fits on one row on desktop — a scroller with nothing to scroll to is just clutter.
const SCROLL_THRESHOLD = 4;

const pluralReviews = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "відгуків";
  if (mod10 === 1) return "відгук";
  if (mod10 >= 2 && mod10 <= 4) return "відгуки";
  return "відгуків";
};

function ReviewCard({ comment }: { comment: Comment }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = () => { setModalOpen(true); requestAnimationFrame(() => setModalVisible(true)); };
  const closeModal = () => { setModalVisible(false); setTimeout(() => setModalOpen(false), 250); };
  const isLong = (comment.text?.length ?? 0) > TRUNCATE_AT;
  const preview = isLong ? comment.text.slice(0, TRUNCATE_AT).trimEnd() : comment.text;

  const Header = () => (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-opora-brown/10 text-opora-brown font-semibold text-sm shrink-0">
          {comment.authorName.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div>
          <h4 className="font-semibold text-opora-brown text-base leading-tight">{comment.authorName}</h4>
          <span className="text-xs text-opora-brown/85 mt-0.5 block">{formatDate(comment.createdAt)}</span>
        </div>
      </div>
      <div className="flex space-x-0.5 shrink-0 mt-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          star <= comment.rating
            ? <YellowStarIcon key={star} className="w-4 h-4" />
            : <GrayStarIcon key={star} className="w-4 h-4" />
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* The card */}
      <div className="h-full rounded-2xl bg-opora-white border border-opora-brown/10 shadow-sm hover:shadow-md transition-shadow duration-300 p-6 flex flex-col gap-4">
        <Header />
        <p className="text-opora-brown/85 text-sm leading-relaxed">
          {preview}
          {isLong && (
            <>
              …{' '}
              <button
                onClick={openModal}
                className="text-opora-brown font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Більше
              </button>
            </>
          )}
        </p>
      </div>

      {/* The modal window */}
      {modalOpen && (
        <div
          className={`fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-250 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeModal}
        >
          <div
            className={`relative w-full max-w-lg bg-opora-white rounded-2xl p-8 shadow-2xl transition-all duration-250 ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close — above the content, not on top of the stars */}
            <button
              onClick={closeModal}
              aria-label="Закрити"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="#333" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="flex flex-col gap-5 pr-8">
              <Header />
              <p className="text-opora-brown/85 text-sm leading-relaxed">{comment.text}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

async function fetchComments(variation?: string): Promise<Comment[]> {
  const url = variation
    ? `/api/comments?variation=${encodeURIComponent(variation)}`
    : '/api/comments';
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не вдалося завантажити відгуки");
  return response.json();
}

export default function Reviews({ variation }: ReviewsProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mobileSliderRef = useRef<HTMLDivElement>(null);

  // React Query caches per variation — switching variants back and forth is instant.
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", variation ?? null],
    queryFn: () => fetchComments(variation),
  });

  const handleMobileScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el.offsetWidth) return;
    setActiveSlide(Math.round(el.scrollLeft / el.offsetWidth));
  };

  // Smooth scrolling logic for the arrows — works both on desktop and on mobile.
  // We scroll the visible container: the desktop one by a card's width, the mobile one by a whole slide.
  const scroll = (direction: "left" | "right") => {
    const sign = direction === "left" ? -1 : 1;
    const desktop = scrollContainerRef.current;
    if (desktop) {
      desktop.scrollBy({ left: sign * 320, behavior: "smooth" });
    }
    const mobile = mobileSliderRef.current;
    if (mobile) {
      mobile.scrollBy({ left: sign * mobile.offsetWidth, behavior: "smooth" });
    }
  };

  if (isLoading) {
    return <div className="py-12 md:py-16 px-4 md:px-8 bg-opora-softBeige animate-pulse h-75 w-full" />;
  }

  // If there are no reviews, we don't render the section at all
  if (comments.length === 0) return null;

  const avgRating = comments.reduce((sum, c) => sum + c.rating, 0) / comments.length;
  // Desktop-only: with few reviews everything fits on one row, so a horizontal scroller (and its arrows) has nothing to do.
  const canScroll = comments.length > SCROLL_THRESHOLD;

  return (
    <section className="pt-12 pb-16 md:pt-16 md:pb-20 bg-opora-softBeige border-y border-opora-brown/10 overflow-hidden">
      <div className="max-w-400 mx-auto px-4 md:px-8">
        {/* The header */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-8 md:mb-10">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl md:text-3xl font-medium text-opora-brown">Відгуки</h2>
            <span className="flex items-center gap-1.5 text-sm text-opora-brown/85">
              <YellowStarIcon className="w-4 h-4" />
              <span className="font-medium text-opora-brown">{avgRating.toFixed(1)}</span>
              · {comments.length} {pluralReviews(comments.length)}
            </span>
          </div>
          {canScroll && (
            <div className="flex space-x-2">
              <button onClick={() => scroll("left")} aria-label="Попередні відгуки" className="p-2 hover:opacity-70 transition-opacity text-opora-brown">
                <SliderArrowLeftIcon className="w-6 h-6" />
              </button>
              <button onClick={() => scroll("right")} aria-label="Наступні відгуки" className="p-2 hover:opacity-70 transition-opacity text-opora-brown">
                <SliderArrowRightIcon className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* MOBILE: a one-review slider with dots */}
        <div className="relative md:hidden">
          <div
            ref={mobileSliderRef}
            onScroll={handleMobileScroll}
            className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none pb-4"
          >
            {comments.map((comment) => (
              <div key={comment.id} className="w-full shrink-0 snap-center">
                <ReviewCard comment={comment} />
              </div>
            ))}
          </div>
          {comments.length > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {comments.map((_, idx) => (
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

        {/* DESKTOP: wraps when everything fits, scrolls with arrows once there's enough to browse */}
        <div
          ref={scrollContainerRef}
          className={`hidden md:flex gap-8 pb-4 ${canScroll ? "overflow-x-auto snap-x snap-mandatory hide-scrollbar" : "flex-wrap"}`}
        >
          {comments.map((comment) => (
            <div key={comment.id} className={`shrink-0 w-[320px] ${canScroll ? "snap-start" : ""}`}>
              <ReviewCard comment={comment} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}