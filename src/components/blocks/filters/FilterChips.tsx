"use client";

export interface FilterChip {
  label: string;
  onRemove: () => void;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  onResetAll: () => void;
}

export function FilterChips({ chips, onResetAll }: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="border-b border-opora-brown/10 pb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            onClick={chip.onRemove}
            className="flex items-center gap-2 px-3 py-1.5 bg-opora-brown/5 text-sm font-light hover:bg-opora-brown/10 transition-colors"
          >
            {chip.label}
            <span aria-hidden className="text-base leading-none">×</span>
            <span className="sr-only">Прибрати фільтр</span>
          </button>
        ))}
      </div>
      <button onClick={onResetAll} className="text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity">
        Скинути всі фільтри
      </button>
    </div>
  );
}
