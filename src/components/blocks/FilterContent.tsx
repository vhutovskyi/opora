"use client";

import { forwardRef, useImperativeHandle } from "react";
import type { SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { FilterSearch } from "./filters/FilterSearch";
import { FilterAccordion } from "./filters/FilterAccordion";
import { FilterChips } from "./filters/FilterChips";
import { PriceFilter } from "./filters/PriceFilter";
import { CategoryFilter } from "./filters/CategoryFilter";
import { SubcategoryFilter, SubcategoryCheckboxes } from "./filters/SubcategoryFilter";
import { OptionFilterGroupAccordion } from "./filters/OptionFilterGroupAccordion";
import { SpecFilterGroupAccordion } from "./filters/SpecFilterGroupAccordion";
import { useFilterState } from "./filters/useFilterState";
import type { DynamicFilters } from "./filters/types";

export type { FilterOption, SpecFilterGroup, OptionFilterGroup, DynamicFilters } from "./filters/types";

export interface FilterContentRef {
  applyFilters: () => void;
}

interface FilterContentProps {
  onClose: () => void;
  filters: DynamicFilters;
  categories: string[];
  subcategoryOptions: SubcategoryOptionRow[];
  priceBounds: { min: number; max: number } | null;
  onApply: (queryString: string) => void;
  inline?: boolean;
  hideApplyButton?: boolean;
}

const FilterContent = forwardRef<FilterContentRef, FilterContentProps>(
  function FilterContent({ onClose, filters, categories, subcategoryOptions, priceBounds, onApply, inline, hideApplyButton }, ref) {
    const fs = useFilterState({ filters, subcategoryOptions, priceBounds, onApply });

    const applyFilters = () => {
      fs.applyFilters();
      onClose();
    };

    useImperativeHandle(ref, () => ({ applyFilters }));

    const showCategoryFilter = categories.length > 1;

    // Category Groups (Матеріал, Розмір, ...) get their own filter accordion, each acting as a
    // "select all subcategories under it" checkbox; everything else stays in the flat "Підкатегорія" list.
    const plainSubcatalogs = fs.availableSubcatalogs.filter((n) => !n.is_group);
    const groupSubcatalogs = fs.availableSubcatalogs.filter((n) => n.is_group);

    return (
      <div className={`flex flex-col ${inline ? '' : 'h-full'} text-opora-brown`}>
        <div className={inline ? 'space-y-6 pr-2' : 'flex-1 overflow-y-auto space-y-6 pr-2'}>

          <FilterSearch />

          <FilterChips chips={fs.chips} onResetAll={fs.resetAll} />

          <FilterAccordion title="Ціна">
            <PriceFilter
              priceBounds={priceBounds}
              priceMin={fs.priceMin}
              priceMax={fs.priceMax}
              setPriceMin={fs.setPriceMin}
              setPriceMax={fs.setPriceMax}
              commitPrices={fs.commitPrices}
              onTrackPick={fs.onPriceTrackPick}
            />
          </FilterAccordion>

          {showCategoryFilter && (
            <FilterAccordion title="Категорія">
              <CategoryFilter categories={categories} activeTypes={fs.activeTypes} onClear={fs.clearTypes} onToggle={fs.toggleType} />
            </FilterAccordion>
          )}

          {fs.activeTypes.length > 0 && plainSubcatalogs.length > 0 && (
            <FilterAccordion title="Підкатегорія">
              <SubcategoryFilter
                nodes={plainSubcatalogs}
                activeSubs={fs.activeSubs}
                onToggle={fs.toggleSub}
                onClear={() => fs.setActiveSubs([])}
              />
            </FilterAccordion>
          )}

          {fs.activeTypes.length > 0 && groupSubcatalogs.map((group) => (
            <FilterAccordion key={group.id} title={group.name}>
              <SubcategoryCheckboxes
                nodes={[group]}
                activeSubs={fs.activeSubs}
                onToggle={fs.toggleSub}
                depth={0}
              />
            </FilterAccordion>
          ))}

          {fs.visibleOptionFilters.map((group) => (
            <FilterAccordion key={group.groupName} title={group.groupName}>
              <OptionFilterGroupAccordion
                group={group}
                selected={fs.optionSelections[group.groupName] || []}
                onSelectSize={(value) => fs.setOptionSelections((prev) => ({ ...prev, [group.groupName]: value ? [value] : [] }))}
                onClear={() => fs.setOptionSelections(prev => ({ ...prev, [group.groupName]: [] }))}
                onToggle={(value) => fs.toggleGroupSelection(fs.setOptionSelections, group.groupName, value)}
              />
            </FilterAccordion>
          ))}

          {filters.specFilters.map((group) => (
            <FilterAccordion key={group.specName} title={group.specName}>
              <SpecFilterGroupAccordion
                group={group}
                selected={fs.specSelections[group.specName] || []}
                onClear={() => fs.setSpecSelections(prev => ({ ...prev, [group.specName]: [] }))}
                onToggle={(value) => fs.toggleSpecSelection(group.specName, value)}
              />
            </FilterAccordion>
          ))}

        </div>

        {!hideApplyButton && (
          <div className={inline ? 'pt-6' : 'pt-6 mt-auto bg-opora-white'}>
            <button onClick={applyFilters} className="w-full py-4 bg-opora-brown text-white text-lg font-medium hover:opacity-90 transition-opacity">
              Показати товари
            </button>
          </div>
        )}
      </div>
    );
  }
);

export default FilterContent;
