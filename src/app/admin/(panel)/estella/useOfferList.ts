import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Filter, Page } from "./estellaTypes";

// Staged-offers list: filter tabs + debounced search, paginated via useInfiniteQuery.
export function useOfferList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, fetchNextPage, hasNextPage, isFetching } = useInfiniteQuery<Page>({
    queryKey: ["estella", filter, searchQuery],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams({ filter, search: searchQuery });
      if (pageParam) p.set("cursor", String(pageParam));
      const res = await fetch(`/api/admin/estella?${p.toString()}`);
      if (!res.ok) throw new Error("Помилка завантаження");
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const counts = data?.pages[0]?.counts;

  return { filter, setFilter, search, setSearch, items, counts, fetchNextPage, hasNextPage, isFetching };
}
