// "Порівняти" under the buy button: adds the ACTIVE variant (not the product) to the comparison.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CompareIcon } from "@/components/ui/Icons";
import { useCompareStore, type CompareAddResult } from "@/store/compareStore";
import { MAX_COMPARE_ITEMS, compareHref } from "@/lib/compare";
import { trackEvent } from "@/lib/analytics/umami";

export default function CompareButton({
  variantId,
  catalog,
  productName,
}: {
  variantId: string | undefined;
  catalog: string;
  productName: string;
}) {
  const items = useCompareStore((s) => s.items);
  const add = useCompareStore((s) => s.add);
  const remove = useCompareStore((s) => s.remove);
  const replace = useCompareStore((s) => s.replace);
  // Why the last add was refused — reset when another variant gets picked.
  const [refused, setRefused] = useState<Exclude<CompareAddResult, "added" | "exists"> | null>(null);

  // The list hydrates from localStorage on the client only (same as the cart counter in Header).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setRefused(null), [variantId]);

  if (!variantId) return null;
  const inList = mounted && items.some((i) => i.id === variantId);
  const listHref = compareHref(items.map((i) => i.id));

  const handleClick = () => {
    if (inList) {
      remove(variantId);
      return;
    }
    const result = add({ id: variantId, catalog });
    if (result === "added") trackEvent("Додано до порівняння", { product: productName });
    setRefused(result === "full" || result === "other-catalog" ? result : null);
  };

  // A different catalog: the customer chooses to drop the old list and start a new one with this variant.
  const startOver = () => {
    replace([{ id: variantId, catalog }]);
    setRefused(null);
    trackEvent("Додано до порівняння", { product: productName });
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={handleClick}
          aria-pressed={inList}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-opora-brown hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 rounded"
        >
          <CompareIcon className="h-5 w-5 shrink-0" />
          {inList ? "У порівнянні · прибрати" : "Додати до порівняння"}
        </button>
        {mounted && items.length > 0 && (
          <Link
            href={listHref}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-2 text-opora-brown/80 hover:text-opora-brown"
          >
            Порівняти ({items.length})
          </Link>
        )}
      </div>

      {refused === "full" && (
        <p className="text-xs text-gray-500" role="status">
          У порівнянні вже {MAX_COMPARE_ITEMS} товари — приберіть один, щоб додати цей.
        </p>
      )}
      {refused === "other-catalog" && (
        <p className="text-xs text-gray-500" role="status">
          Порівнювати можна товари лише одного каталогу, а у списку зараз «{items[0]?.catalog}».{" "}
          <button
            type="button"
            onClick={startOver}
            className="text-opora-brown underline underline-offset-2 hover:opacity-70"
          >
            Почати нове порівняння
          </button>
        </p>
      )}
    </div>
  );
}
