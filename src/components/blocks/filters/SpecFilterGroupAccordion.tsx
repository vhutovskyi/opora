"use client";

import type { SpecFilterGroup } from "../FilterContent";

export interface SpecFilterGroupAccordionProps {
  group: SpecFilterGroup;
  selected: string[];
  onClear: () => void;
  onToggle: (value: string) => void;
}

export function SpecFilterGroupAccordion({ group, selected, onClear, onToggle }: SpecFilterGroupAccordionProps) {
  const isAll = selected.length === 0;
  return (
    <>
      <label className="flex items-center gap-3 cursor-pointer group mb-3">
        <div className="w-4 h-4 rounded-full border border-opora-brown flex items-center justify-center group-hover:bg-opora-brown/10 transition-colors">
          {isAll && <div className="w-2.5 h-2.5 bg-opora-brown rounded-full" />}
        </div>
        <span className={`text-lg font-light ${isAll ? "font-medium underline underline-offset-4" : ""}`}>Усі</span>
        <input type="checkbox" className="hidden" checked={isAll} onChange={onClear} />
      </label>
      {group.values.map((val) => {
        const isSelected = selected.includes(val);
        return (
          <label key={val} className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${isSelected ? 'bg-opora-brown border-opora-brown' : 'border-opora-brown/40 group-hover:border-opora-brown'}`}>
              {isSelected && <span className="text-white text-xs leading-none">✓</span>}
            </div>
            <span className={`text-lg font-light ${isSelected ? "font-medium underline underline-offset-4" : ""}`}>{val}</span>
            <input type="checkbox" className="hidden" checked={isSelected} onChange={() => onToggle(val)} />
          </label>
        );
      })}
    </>
  );
}
