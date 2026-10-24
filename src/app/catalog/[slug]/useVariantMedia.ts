"use client";

import { useCallback, useRef, useState } from "react";
import type { VariantMedia } from "./components/types";

// ponytail: a plain Map in state instead of TanStack Query — all that is needed here is a
// "variant id → media" cache for the lifetime of the page. Variant media doesn't change within a session,
// so neither invalidation nor repeated requests are needed. If SSR hydration or a cache shared
// between pages is ever needed — then useQuery it is.
export function useVariantMedia(initialVariantId: string | undefined, initialMedia: VariantMedia) {
  const [byId, setById] = useState<Record<string, VariantMedia>>(() =>
    initialVariantId ? { [initialVariantId]: initialMedia } : {}
  );
  // So that one and the same id isn't fetched twice (hover + click).
  const requested = useRef(new Set(initialVariantId ? [initialVariantId] : []));

  const load = useCallback((variantId?: string) => {
    if (!variantId || requested.current.has(variantId)) return;
    requested.current.add(variantId);
    fetch(`/api/products/variant/${variantId}`)
      .then((r) => (r.ok ? (r.json() as Promise<VariantMedia>) : null))
      .then((media) => media && setById((prev) => ({ ...prev, [variantId]: media })))
      .catch(() => requested.current.delete(variantId)); // the network failed — let it be retried
  }, []);

  return { byId, load };
}
