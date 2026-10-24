"use client";

import type { OptionFilterGroup } from "../FilterContent";
import { shortValue, sortSizeValues } from "./filterFormat";

export interface OptionFilterGroupAccordionProps {
  group: OptionFilterGroup;
  selected: string[];
  onSelectSize: (value: string) => void;
  onClear: () => void;
  onToggle: (value: string) => void;
}

// Розмір is separate: a select instead of checkboxes (a single choice), with the values sorted as numbers.
// The other option groups — colour circles with multi-select.
export function OptionFilterGroupAccordion({ group, selected, onSelectSize, onClear, onToggle }: OptionFilterGroupAccordionProps) {
  if (group.groupName === "Розмір") {
    const sortedValues = sortSizeValues(group.values.map((c) => c.label));
    const selectedSize = selected[0] ?? "";
    return (
      <select
        value={selectedSize}
        onChange={(e) => onSelectSize(e.target.value)}
        className="w-full border border-opora-brown/30 bg-transparent p-3 text-lg font-light focus:border-opora-brown focus:outline-none"
      >
        <option value="">Усі</option>
        {sortedValues.map((label) => (
          <option key={label} value={label}>{shortValue(label)}</option>
        ))}
      </select>
    );
  }

  return (
    <>
      <label className="flex items-center gap-3 cursor-pointer group mb-3">
        <div className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center bg-white group-hover:scale-110 transition-transform">
          {selected.length === 0 && <div className="w-2.5 h-2.5 bg-opora-brown rounded-full" />}
        </div>
        <span className={`text-lg font-light ${selected.length === 0 ? "font-medium underline underline-offset-4" : ""}`}>Усі</span>
        <input type="checkbox" className="hidden" checked={selected.length === 0} onChange={onClear} />
      </label>
      {group.values.map((c) => (
        <label key={c.label} className="flex items-center gap-3 cursor-pointer group">
          <div className={`w-5 h-5 shrink-0 rounded-full shadow-sm transition-transform ${selected.includes(c.label) ? 'ring-2 ring-opora-brown ring-offset-1 scale-110' : 'border border-black/10 group-hover:scale-110'}`} style={{ backgroundColor: c.hex }} />
          <span className={`text-lg font-light ${selected.includes(c.label) ? "font-medium underline underline-offset-4" : ""}`}>{shortValue(c.label)}</span>
          <input type="checkbox" className="hidden" checked={selected.includes(c.label)} onChange={() => onToggle(c.label)} />
        </label>
      ))}
    </>
  );
}
