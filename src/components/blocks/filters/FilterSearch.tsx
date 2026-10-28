"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { SearchIcon } from "@/components/ui/Icons";
import PriceLabel from "@/components/ui/PriceLabel";
import type { SearchResult } from "@/lib/supabase/search";

const SEARCH_DEBOUNCE_MS = 350;

// The same /api/search as in the header (HeaderSearch) — here without an overlay, as part of the filters.
export function FilterSearch() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const hasQuery = debounced.length >= 2;
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) throw new Error("search failed");
      return (await res.json()) as SearchResult[];
    },
    enabled: hasQuery,
    staleTime: 60_000,
  });

  return (
    <div className="pb-6 border-b border-opora-brown/10">
      <div className="flex items-center gap-3 border-b border-opora-brown/30 py-2">
        <SearchIcon className="w-5 h-5 shrink-0 opacity-50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук товарів…"
          className="w-full bg-transparent text-lg font-light focus:outline-none placeholder:text-opora-brown/40"
        />
      </div>
      {hasQuery && (
        <div className="mt-3 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-4 text-sm text-center text-opora-brown/60">
              {isFetching ? "Шукаємо…" : "Нічого не знайдено"}
            </p>
          ) : (
            results.map((r) => (
              <Link
                key={r.id}
                href={r.href}
                className="flex items-center gap-3 px-2 py-2 hover:bg-opora-softBeige transition-colors border-b border-opora-brown/5 last:border-0"
              >
                {r.image && (
                  <Image src={r.image} alt={r.name} width={68} height={68} sizes="68px" className="h-14 w-auto shrink-0 object-contain" />
                )}
                <div className="flex-1 min-w-0">
                  {r.catalog && <p className="text-[10px] uppercase tracking-wide text-opora-brown/50">{r.catalog}</p>}
                  <p className="text-sm font-medium leading-snug truncate">{r.name}</p>
                </div>
                <PriceLabel price={r.price} discountedPrice={r.discountedPrice} />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
