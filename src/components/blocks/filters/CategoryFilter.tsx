"use client";

export interface CategoryFilterProps {
  categories: string[];
  activeTypes: string[];
  onClear: () => void;
  onToggle: (value: string) => void;
}

export function CategoryFilter({ categories, activeTypes, onClear, onToggle }: CategoryFilterProps) {
  return (
    <>
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="w-4 h-4 rounded-full border border-opora-brown/40 group-hover:border-opora-brown flex items-center justify-center">
          {activeTypes.length === 0 && <div className="w-2 h-2 rounded-full bg-opora-brown" />}
        </div>
        <span className="text-lg font-light">Всі</span>
        <input type="radio" name="category" className="hidden" checked={activeTypes.length === 0} onChange={onClear} />
      </label>
      {categories.map((cat) => {
        const isChecked = activeTypes.includes(cat);
        return (
          <label key={cat} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-4 h-4 rounded-full border border-opora-brown/40 group-hover:border-opora-brown flex items-center justify-center">
              {isChecked && <div className="w-2 h-2 rounded-full bg-opora-brown" />}
            </div>
            <span className="text-lg font-light">{cat}</span>
            <input type="radio" name="category" className="hidden" checked={isChecked} onChange={() => onToggle(cat)} />
          </label>
        );
      })}
    </>
  );
}
