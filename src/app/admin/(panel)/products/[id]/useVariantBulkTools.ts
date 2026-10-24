import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cloneVariantsByOption,
  randomizeAllSkus,
  saveVariant,
  setBulkPrice,
  setDiscountForIds,
  setPriceForIds,
  setStockByOption,
  setVariantOrder,
  setVisibleByOption,
} from "../../../actions";
import type { DiscountMode, Opt, Spec, Variant } from "./productEditorTypes";

// Everything VariantsSection needs besides rendering: ordering, search, and the
// bulk price/stock/visibility/SKU tools that act across many variants at once.
export function useVariantBulkTools(productId: string, variants: Variant[], options: Opt[], specs: Spec[]) {
  const router = useRouter();
  const [adding, start] = useTransition();
  const [busy, startMove] = useTransition();

  // Render in saved order; reorder swaps sort_order via setVariantOrder.
  const ordered = [...variants].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Options/specs actually used by this product's variants — for the bulk-availability tool
  // and the detailed search panel's filter dropdowns.
  const usedOptionIds = new Set(ordered.flatMap((v) => (v.variant_options ?? []).map((o) => o.option_id)));
  const productOptions = options.filter((o) => usedOptionIds.has(o.id));
  const usedSpecIds = new Set(ordered.flatMap((v) => (v.variant_specs ?? []).map((s) => s.spec_id)));
  const productSpecs = specs.filter((s) => usedSpecIds.has(s.id));

  const [stockOptionId, setStockOptionId] = useState("");
  const [stockTarget, setStockTarget] = useState<"in" | "out">("out");
  const [visOptionId, setVisOptionId] = useState("");
  const [visTarget, setVisTarget] = useState<"show" | "hide">("show");
  const [cloneFromId, setCloneFromId] = useState("");
  const [cloneToId, setCloneToId] = useState("");
  const [cloneFilterId, setCloneFilterId] = useState("");
  const [cloneCopyPhotos, setCloneCopyPhotos] = useState(false);
  const [priceMode, setPriceMode] = useState<"set" | "amount" | "percent">("set");
  const [priceValue, setPriceValue] = useState(0);
  const [discountMode, setDiscountMode] = useState<Exclude<DiscountMode, "none">>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [selPriceMode, setSelPriceMode] = useState<"set" | "amount" | "percent">("set");
  const [selPriceValue, setSelPriceValue] = useState(0);
  const [selDiscountMode, setSelDiscountMode] = useState<DiscountMode>("none");
  const [selDiscountValue, setSelDiscountValue] = useState(0);
  const [query, setQuery] = useState("");
  const [rev, setRev] = useState(0); // bump → remount VariantCards so they re-read fresh SKUs after bulk randomize

  // Detailed search: extra filters by options (a variant must have ALL of the selected ones) and
  // by spec (the value contains a substring), on top of the text search.
  const [filterOptionIds, setFilterOptionIds] = useState<string[]>([]);
  const [filterSpecId, setFilterSpecId] = useState("");
  const [filterSpecValue, setFilterSpecValue] = useState("");
  const toggleFilterOption = (id: string) =>
    setFilterOptionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const clearFilters = () => {
    setFilterOptionIds([]);
    setFilterSpecId("");
    setFilterSpecValue("");
    setQuery("");
  };

  // Selecting variants with checkboxes — for bulk price/discount updates of the selected ones only.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  // A map of option_id → "value name" and spec_id → name for the text search.
  const optLabel = useMemo(
    () => new Map(options.map((o) => [o.id, `${o.name} ${o.value ?? ""}`.toLowerCase()])),
    [options]
  );
  const specLabel = useMemo(() => new Map(specs.map((s) => [s.id, s.name.toLowerCase()])), [specs]);

  // Search by name, sku, price, options or specs + the filters of the detail panel.
  // Ordering is disabled during a search (the arrows move the index in the full list, not in the filtered one).
  const q = query.trim().toLowerCase();
  const specFilterValue = filterSpecValue.trim().toLowerCase();
  const visible = ordered.filter((v) => {
    if (filterOptionIds.length && !filterOptionIds.every((id) => (v.variant_options ?? []).some((o) => o.option_id === id)))
      return false;
    if (filterSpecId) {
      const val = (v.variant_specs ?? []).find((s) => s.spec_id === filterSpecId)?.value?.toLowerCase() ?? "";
      if (!val.includes(specFilterValue)) return false;
    }
    if (!q) return true;
    return (
      (v.name ?? "").toLowerCase().includes(q) ||
      (v.sku ?? "").toLowerCase().includes(q) ||
      String(v.price ?? "").includes(q) ||
      (v.variant_options ?? []).some((o) => optLabel.get(o.option_id)?.includes(q)) ||
      (v.variant_specs ?? []).some((s) => (s.value ?? "").toLowerCase().includes(q) || specLabel.get(s.spec_id)?.includes(q))
    );
  });
  const filtering = q.length > 0 || filterOptionIds.length > 0 || filterSpecId.length > 0;
  const selectAllVisible = () => setSelected(new Set(visible.map((v) => v.id)));

  function addVariant() {
    start(async () => {
      await saveVariant({ product_id: productId, name: "", sku: "", price: 0, in_stock: true, optionIds: [] });
      router.refresh();
    });
  }
  function move(index: number, dir: "up" | "down") {
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return;
    const ids = ordered.map((v) => v.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startMove(async () => {
      await setVariantOrder(ids);
      router.refresh();
    });
  }
  function applyStockByOption() {
    if (!stockOptionId) return alert("Оберіть опцію");
    const inStock = stockTarget === "in";
    startMove(async () => {
      const n = await setStockByOption(productId, stockOptionId, inStock);
      router.refresh();
      alert(`Оновлено варіацій: ${n}`);
    });
  }
  function applyVisibleByOption() {
    if (!visOptionId) return alert("Оберіть опцію");
    startMove(async () => {
      const n = await setVisibleByOption(productId, visOptionId, visTarget === "show");
      router.refresh();
      alert(`Оновлено варіацій: ${n}`);
    });
  }
  function applyCloneOption() {
    if (!cloneFromId || !cloneToId) return alert("Оберіть опцію-джерело і нову опцію");
    const label = (id: string) => options.find((o) => o.id === id)?.name ?? "";
    const has = (v: Variant, id: string) => (v.variant_options ?? []).some((o) => o.option_id === id);
    const n = ordered.filter((v) => has(v, cloneFromId) && (!cloneFilterId || has(v, cloneFilterId))).length;
    const scope = cloneFilterId ? ` (лише «${label(cloneFilterId)}»)` : "";
    if (!confirm(`Створити ${n} нових варіацій «${label(cloneToId)}» за зразком «${label(cloneFromId)}»${scope}?`)) return;
    startMove(async () => {
      try {
        const created = await cloneVariantsByOption(productId, cloneFromId, cloneToId, cloneFilterId || undefined, cloneCopyPhotos);
        router.refresh();
        setCloneToId("");
        alert(`Створено варіацій: ${created}.${cloneCopyPhotos ? "" : " Тепер завантажте фото на нові варіації."}`);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Помилка");
      }
    });
  }
  function randomizeAll() {
    if (!ordered.length) return;
    if (!confirm(`Згенерувати нові унікальні артикули для всіх ${ordered.length} варіацій?`)) return;
    startMove(async () => {
      const n = await randomizeAllSkus(productId);
      router.refresh();
      setRev((r) => r + 1);
      alert(`Оновлено артикулів: ${n}`);
    });
  }
  function applyBulkPrice() {
    if (!ordered.length) return;
    if (!confirm("Оновити ціни для всіх варіацій?")) return;
    startMove(async () => {
      const n = await setBulkPrice(productId, priceMode, Number(priceValue) || 0);
      router.refresh();
      alert(`Оновлено цін: ${n}`);
    });
  }
  function applyDiscountToAll() {
    if (!ordered.length) return;
    if (!confirm(`Застосувати знижку для всіх ${ordered.length} варіацій?`)) return;
    startMove(async () => {
      const n = await setDiscountForIds(ordered.map((v) => v.id), discountMode, Number(discountValue) || 0);
      router.refresh();
      alert(`Оновлено варіацій: ${n}`);
    });
  }
  function removeDiscountFromAll() {
    if (!ordered.length) return;
    if (!confirm(`Прибрати знижку з усіх ${ordered.length} варіацій?`)) return;
    startMove(async () => {
      const n = await setDiscountForIds(ordered.map((v) => v.id), "none", 0);
      router.refresh();
      alert(`Оновлено варіацій: ${n}`);
    });
  }
  function applySelectedPrice() {
    const ids = [...selected];
    if (!ids.length) return alert("Оберіть варіації чекбоксами");
    if (!confirm(`Оновити ціну для ${ids.length} обраних варіацій?`)) return;
    startMove(async () => {
      const n = await setPriceForIds(ids, selPriceMode, Number(selPriceValue) || 0);
      router.refresh();
      alert(`Оновлено цін: ${n}`);
    });
  }
  function applySelectedDiscount() {
    const ids = [...selected];
    if (!ids.length) return alert("Оберіть варіації чекбоксами");
    const label = selDiscountMode === "none" ? "Прибрати знижку" : "Застосувати знижку";
    if (!confirm(`${label} для ${ids.length} обраних варіацій?`)) return;
    startMove(async () => {
      const n = await setDiscountForIds(ids, selDiscountMode, Number(selDiscountValue) || 0);
      router.refresh();
      alert(`Оновлено варіацій: ${n}`);
    });
  }

  return {
    ordered,
    visible,
    q,
    filtering,
    productOptions,
    productSpecs,
    filterOptionIds,
    toggleFilterOption,
    filterSpecId,
    setFilterSpecId,
    filterSpecValue,
    setFilterSpecValue,
    clearFilters,
    selected,
    toggleSelect,
    clearSelection,
    selectAllVisible,
    selPriceMode,
    setSelPriceMode,
    selPriceValue,
    setSelPriceValue,
    applySelectedPrice,
    selDiscountMode,
    setSelDiscountMode,
    selDiscountValue,
    setSelDiscountValue,
    applySelectedDiscount,
    adding,
    busy,
    rev,
    stockOptionId,
    setStockOptionId,
    stockTarget,
    setStockTarget,
    applyStockByOption,
    visOptionId,
    setVisOptionId,
    visTarget,
    setVisTarget,
    applyVisibleByOption,
    cloneFromId,
    setCloneFromId,
    cloneToId,
    setCloneToId,
    cloneFilterId,
    setCloneFilterId,
    cloneCopyPhotos,
    setCloneCopyPhotos,
    applyCloneOption,
    priceMode,
    setPriceMode,
    priceValue,
    setPriceValue,
    applyBulkPrice,
    discountMode,
    setDiscountMode,
    discountValue,
    setDiscountValue,
    applyDiscountToAll,
    removeDiscountFromAll,
    query,
    setQuery,
    addVariant,
    move,
    randomizeAll,
  };
}
