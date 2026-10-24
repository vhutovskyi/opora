// src/components/blocks/SortContent.tsx
"use client";

import { useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { label: "За замовчуванням", value: "default" },
  { label: "Спочатку дешевші", value: "price_asc" },
  { label: "Спочатку дорожчі", value: "price_desc" },
  { label: "Новинки", value: "newest" },
];

export default function SortContent({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (queryString: string) => void;
}) {
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") || "default";

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    onApply(params.toString());
    onClose(); // Close drawer after selection
  };

  return (
    <div className="flex flex-col text-opora-brown">
      <h3 className="font-bold text-xl mb-6 text-center">Сортувати</h3>
      <div className="space-y-4">
        {SORT_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-full border border-opora-brown flex items-center justify-center`}>
              {currentSort === option.value && <div className="w-3 h-3 bg-opora-brown rounded-full" />}
            </div>
            <span className={`text-lg ${currentSort === option.value ? "underline decoration-opora-brown underline-offset-4" : ""}`}>
              {option.label}
            </span>
            {/* Native radio hidden for custom styling */}
            <input 
              type="radio" 
              name="sort" 
              value={option.value} 
              checked={currentSort === option.value}
              onChange={() => handleSortChange(option.value)}
              className="hidden" 
            />
          </label>
        ))}
      </div>
    </div>
  );
}