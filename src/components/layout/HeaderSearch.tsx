"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, CloseIcon } from "../ui/Icons";
import PriceLabel from "../ui/PriceLabel";
import type { SearchResult } from "@/lib/supabase/search";

const DEBOUNCE_MS = 350;

export default function HeaderSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // We don't search on every character — only once the user has stopped.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Esc closes it. We do NOT block the page scroll — the overlay is fixed, so the site scrolls under it.
  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) throw new Error("search failed");
      return (await res.json()) as SearchResult[];
    },
    enabled: isOpen && debounced.length >= 2,
    staleTime: 60_000,
  });

  const hasQuery = debounced.length >= 2;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Пошук"
        className="hover:opacity-70 transition-opacity p-2"
      >
        <SearchIcon className="w-6 h-6" />
      </button>

      {/* The overlay is always in the DOM — that way the animation works both on open and on close.
          We do NOT put the opacity on the wrapper: inside an ancestor with opacity < 1 the browser
          regroups backdrop-filter, and the blur switched on and off in jumps. So the blur is
          animated directly (backdrop-filter is animatable), and the background — through a colour transition.
          The portal into body is mandatory: the button lives in <header>, which in its hidden state
          has -translate-y-full — a transform makes the header the containing block for fixed elements,
          and the overlay slid up together with it (the field got cut off). */}
      {mounted && createPortal(
        <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`} aria-hidden={!isOpen}>
        <button
          aria-label="Закрити пошук"
          onClick={() => setIsOpen(false)}
          style={{
            backdropFilter: `blur(${isOpen ? 4 : 0}px)`,
            WebkitBackdropFilter: `blur(${isOpen ? 4 : 0}px)`,
            transition: "background-color 300ms ease-out, backdrop-filter 300ms ease-out",
          }}
          className={`absolute inset-0 w-full h-full cursor-default
            ${isOpen ? "bg-opora-brown/40" : "bg-opora-brown/0"}`}
        />

        <div
          // A constant offset: the field sits exactly on the header's bottom edge (half on it,
          // half below it). On lg the header is taller by the catalog row — hence a separate value.
          // It doesn't depend on --header-offset, so with the header hidden the field is fully visible.
          className={`relative mx-auto mt-14 lg:mt-28 w-[80%] md:w-[30%] text-opora-brown
            transition-all duration-300 ease-out
            ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
        >
          <div className="flex items-center gap-3 bg-opora-white rounded-sm shadow-xl px-5 py-4">
            <SearchIcon className="w-5 h-5 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук товарів…"
              className="w-full bg-transparent text-lg focus:outline-none placeholder:text-opora-brown/40"
            />
            <button onClick={() => setIsOpen(false)} aria-label="Закрити" className="shrink-0 p-1 hover:opacity-70">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {hasQuery && (
            <div className="mt-3 bg-opora-white rounded-sm shadow-xl max-h-[60vh] overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-5 py-8 text-sm text-center text-opora-brown/60">
                  {isFetching ? "Шукаємо…" : "Нічого не знайдено"}
                </p>
              ) : (
                results.map((r) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-opora-softBeige transition-colors border-b border-opora-brown/5 last:border-0"
                  >
                    {r.image && (
                      // The width follows the height — the picture doesn't "float" in an empty beige plate.
                      <Image
                        src={r.image}
                        alt={r.name}
                        width={136}
                        height={68}
                        sizes="136px"
                        className="h-17 w-auto shrink-0 object-contain"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {r.catalog && (
                        <p className="text-[10px] uppercase tracking-wide text-opora-brown/50">{r.catalog}</p>
                      )}
                      <p className="text-sm font-medium leading-snug truncate">{r.name}</p>
                    </div>
                    <PriceLabel price={r.price} discountedPrice={r.discountedPrice} />
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}
