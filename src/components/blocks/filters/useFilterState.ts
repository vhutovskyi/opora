"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildSubcategoryTrees, resolveSubRefs, type SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { subRef } from "@/lib/utils";
import type { FilterChip } from "./FilterChips";
import { shortValue } from "./filterFormat";
import type { DynamicFilters } from "./types";

// Empty → "", otherwise digits only, clamped to the catalog bounds.
const clampPrice = (v: string, lo: number, hi: number) => {
  const digits = v.replace(/\D/g, "");
  return digits ? String(Math.min(Math.max(Number(digits), lo), hi)) : "";
};

function parsePrefixedFiltersFromUrl(searchParams: URLSearchParams, prefix: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value.split(",");
    }
  });
  return result;
}

const parseTypesFromUrl = (v: string | null) => (v && v !== "Всі" ? v.split(",") : []);

interface UseFilterStateArgs {
  filters: DynamicFilters;
  subcategoryOptions: SubcategoryOptionRow[];
  priceBounds: { min: number; max: number } | null;
  onApply: (queryString: string) => void;
}

// All the state/URL-sync logic of the filter panel. FilterContent keeps only the markup.
export function useFilterState({ filters, subcategoryOptions, priceBounds, onApply }: UseFilterStateArgs) {
  const searchParams = useSearchParams();

  // We keep the state in ids (the checkboxes are matched by them), while the URL carries the slug when one is set —
  // so we resolve on the way in and translate back on the way out.
  const parseSubsFromUrl = (v: string | null) => (v ? resolveSubRefs(v.split(","), subcategoryOptions) : []);
  const [activeTypes, setActiveTypes] = useState(parseTypesFromUrl(searchParams.get("type")));
  const [activeSubs, setActiveSubs] = useState(parseSubsFromUrl(searchParams.get("sub")));
  const [optionSelections, setOptionSelections] = useState<Record<string, string[]>>(
    parsePrefixedFiltersFromUrl(searchParams, "optFilter_")
  );
  const [specSelections, setSpecSelections] = useState<Record<string, string[]>>(
    parsePrefixedFiltersFromUrl(searchParams, "specFilter_")
  );
  const [priceMin, setPriceMin] = useState(searchParams.get("priceMin") || "");
  const [priceMax, setPriceMax] = useState(searchParams.get("priceMax") || "");

  // The APPLIED filters — what is already in the URL. The chips are built from these, not from the local state:
  // otherwise the chip block appeared while the slider was still being dragged, the panel height jumped
  // and the page scrolled away. The local state is a draft until it is applied.
  const appliedTypes = parseTypesFromUrl(searchParams.get("type"));
  const appliedSubs = parseSubsFromUrl(searchParams.get("sub"));
  const appliedOptions = parsePrefixedFiltersFromUrl(searchParams, "optFilter_");
  const appliedSpecs = parsePrefixedFiltersFromUrl(searchParams, "specFilter_");
  const appliedPriceMin = searchParams.get("priceMin") || "";
  const appliedPriceMax = searchParams.get("priceMax") || "";

  // The catalog bounds + inverted values ("from" greater than "to") are swapped.
  const priceLo = priceBounds?.min ?? 0;
  const priceHi = priceBounds?.max ?? Number.MAX_SAFE_INTEGER;
  const normalizePrices = (min: string, max: string) => {
    const a = clampPrice(min, priceLo, priceHi);
    const b = clampPrice(max, priceLo, priceHi);
    return a && b && Number(a) > Number(b) ? { min: b, max: a } : { min: a, max: b };
  };

  // Chips are applied instantly, so the new value is passed explicitly —
  // setState hasn't yet updated the state the query is built from.
  type FilterState = {
    activeTypes: string[];
    activeSubs: string[];
    optionSelections: Record<string, string[]>;
    specSelections: Record<string, string[]>;
    priceMin: string;
    priceMax: string;
  };

  const buildAndApply = (overrides: Partial<FilterState> = {}) => {
    const s: FilterState = { activeTypes, activeSubs, optionSelections, specSelections, priceMin, priceMax, ...overrides };
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", s.activeTypes.length > 0 ? s.activeTypes.join(",") : "Всі");
    // A subcatalog only makes sense within the selected catalogs.
    if (s.activeTypes.length > 0 && s.activeSubs.length > 0)
      params.set("sub", s.activeSubs.map((id) => subRefById.get(id) ?? id).join(","));
    else params.delete("sub");

    const keysToDelete: string[] = [];
    params.forEach((_, key) => {
      if (key.startsWith("specFilter_") || key.startsWith("optFilter_")) keysToDelete.push(key);
    });
    keysToDelete.forEach((key) => params.delete(key));
    if (s.activeTypes.length > 0) {
      for (const [groupName, vals] of Object.entries(s.optionSelections)) {
        if (vals.length > 0) params.set("optFilter_" + groupName, vals.join(','));
      }
    }
    for (const [specName, vals] of Object.entries(s.specSelections)) {
      if (vals.length > 0) params.set("specFilter_" + specName, vals.join(','));
    }

    // We normalize here too: a click on "Показати товари" can outrun the input's onBlur.
    const price = normalizePrices(s.priceMin, s.priceMax);
    if (price.min) params.set("priceMin", price.min);
    else params.delete("priceMin");
    if (price.max) params.set("priceMax", price.max);
    else params.delete("priceMax");

    onApply(params.toString());
  };

  // The price applies by itself as soon as the field/slider loses focus (or the handle is released) —
  // unlike the other filters, which wait for "Показати товари". The chip appears from here as well.
  // Comparing with the applied value is mandatory: a blur without an edit (a click into the field and away, or a blur
  // right after the mouseup of the same handle) would otherwise push router.push with the very same parameters.
  const commitPrices = () => {
    const n = normalizePrices(priceMin, priceMax);
    setPriceMin(n.min);
    setPriceMax(n.max);
    if (n.min !== appliedPriceMin || n.max !== appliedPriceMax) {
      buildAndApply({ priceMin: n.min, priceMax: n.max });
    }
  };
  // A click on the slider track always affects the lower bound (as in the original behaviour) —
  // normalizePrices itself swaps min/max if the click landed left of the already selected maximum.
  const onPriceTrackPick = (rounded: string) => {
    const n = normalizePrices(priceMin, rounded);
    setPriceMin(n.min);
    setPriceMax(n.max);
    if (n.min !== appliedPriceMin || n.max !== appliedPriceMax) {
      buildAndApply({ priceMin: n.min, priceMax: n.max });
    }
  };

  // Category is a single choice (a radio), not multi-select: a click always replaces instead of adding.
  // Switching the catalog resets the selected subcatalogs (they are tied to specific trees), the price
  // (the bounds are 1250-23595 in one catalog and 5000-90000 in another; an old absolute bound from
  // the previous catalog either cuts nothing off or cuts absolutely everything off), and the option/spec
  // filters (both are scoped to categories too — a filter from the old catalog may not exist on the new one).
  const toggleType = (value: string) => {
    const nextTypes = activeTypes.includes(value) ? [] : [value];
    setActiveSubs([]);
    setPriceMin("");
    setPriceMax("");
    setOptionSelections({});
    setSpecSelections({});
    setActiveTypes(nextTypes);
    buildAndApply({ activeTypes: nextTypes, activeSubs: [], priceMin: "", priceMax: "", optionSelections: {}, specSelections: {} });
  };
  const clearTypes = () => {
    setActiveTypes([]);
    setActiveSubs([]);
    setPriceMin("");
    setPriceMax("");
    setOptionSelections({});
    setSpecSelections({});
    buildAndApply({ activeTypes: [], activeSubs: [], priceMin: "", priceMax: "", optionSelections: {}, specSelections: {} });
  };

  // Marking a node drags the whole branch below it along; unmarking touches only the node itself —
  // descendants selected separately stay selected.
  const toggleSub = (id: string, descendantIds: string[]) =>
    setActiveSubs((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...new Set([...prev, id, ...descendantIds])]
    );

  // The subcategory trees of all the selected catalogs (merged) + a name lookup by id (for the chip
  // of the active filter: the URL holds an id, but the name is what has to be shown).
  const treeByCatalog = useMemo(() => buildSubcategoryTrees(subcategoryOptions), [subcategoryOptions]);
  const availableSubcatalogs = activeTypes.flatMap((t) => treeByCatalog.get(t) ?? []);
  const subNameById = useMemo(
    () => new Map(subcategoryOptions.map((s) => [s.id, s.name])),
    [subcategoryOptions]
  );
  const subRefById = useMemo(
    () => new Map(subcategoryOptions.map((s) => [s.id, subRef(s)])),
    [subcategoryOptions]
  );

  const toggleGroupSelection = (
    setSelections: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    groupName: string,
    value: string,
  ) => {
    setSelections(prev => {
      const current = prev[groupName] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [groupName]: next };
    });
  };

  const toggleSpecSelection = (specName: string, value: string) =>
    toggleGroupSelection(setSpecSelections, specName, value);

  // We show the filter options only when a category is selected (not on "Всі"),
  // and we filter the values by the product categories that use them.
  const visibleOptionFilters =
    activeTypes.length === 0
      ? []
      : filters.optionFilters
          .filter((group) => group.categories.length === 0 || group.categories.some((c) => activeTypes.includes(c)))
          .map((group) => ({
            ...group,
            values: group.values.filter((v) => v.categories.some((c) => activeTypes.includes(c))),
          }))
          .filter((group) => group.values.length > 0);

  const removeFromGroup = (
    setSelections: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    key: "optionSelections" | "specSelections",
    selections: Record<string, string[]>,
    groupName: string,
    value: string,
  ) => {
    const next = { ...selections, [groupName]: (selections[groupName] || []).filter((v) => v !== value) };
    setSelections(next);
    buildAndApply({ [key]: next });
  };

  const chips: FilterChip[] = [];
  for (const t of appliedTypes) {
    chips.push({
      label: `Категорія: ${t}`,
      onRemove: () => {
        const nextTypes = activeTypes.filter((v) => v !== t);
        setActiveTypes(nextTypes);
        setActiveSubs([]);
        setPriceMin("");
        setPriceMax("");
        setOptionSelections({});
        setSpecSelections({});
        buildAndApply({ activeTypes: nextTypes, activeSubs: [], priceMin: "", priceMax: "", optionSelections: {}, specSelections: {} });
      },
    });
  }
  for (const s of appliedSubs) {
    chips.push({
      label: `Підкатегорія: ${subNameById.get(s) ?? s}`,
      onRemove: () => {
        const next = activeSubs.filter((v) => v !== s);
        setActiveSubs(next);
        buildAndApply({ activeSubs: next });
      },
    });
  }
  for (const [groupName, vals] of Object.entries(appliedOptions)) {
    for (const v of vals) {
      chips.push({
        label: `${groupName}: ${shortValue(v)}`,
        onRemove: () => removeFromGroup(setOptionSelections, "optionSelections", optionSelections, groupName, v),
      });
    }
  }
  for (const [specName, vals] of Object.entries(appliedSpecs)) {
    for (const v of vals) {
      chips.push({
        label: `${specName}: ${v}`,
        onRemove: () => removeFromGroup(setSpecSelections, "specSelections", specSelections, specName, v),
      });
    }
  }
  if (appliedPriceMin || appliedPriceMax) {
    chips.push({
      label: `Ціна: ${appliedPriceMin || priceBounds?.min || 0}–${appliedPriceMax || priceBounds?.max || "∞"}`,
      onRemove: () => {
        setPriceMin("");
        setPriceMax("");
        buildAndApply({ priceMin: "", priceMax: "" });
      },
    });
  }

  const resetAll = () => {
    setActiveTypes([]);
    setActiveSubs([]);
    setOptionSelections({});
    setSpecSelections({});
    setPriceMin("");
    setPriceMax("");
    buildAndApply({
      activeTypes: [],
      activeSubs: [],
      optionSelections: {},
      specSelections: {},
      priceMin: "",
      priceMax: "",
    });
  };

  return {
    activeTypes, activeSubs, setActiveSubs, toggleType, clearTypes, toggleSub, availableSubcatalogs,
    optionSelections, setOptionSelections, specSelections, setSpecSelections,
    toggleGroupSelection, toggleSpecSelection, visibleOptionFilters,
    priceMin, priceMax, setPriceMin, setPriceMax, commitPrices, onPriceTrackPick,
    chips, resetAll, applyFilters: buildAndApply,
  };
}
