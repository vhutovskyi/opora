"use client";

import { memo, useEffect, useState } from "react";
import { Button, Card, Checkbox, Input } from "../../../ui";
import VariantCard from "./VariantCard";
import { useVariantBulkTools } from "./useVariantBulkTools";
import type { Opt, Spec, Variant } from "./productEditorTypes";

const VariantsSection = memo(function VariantsSection({
  productId,
  variants,
  options,
  specs,
}: {
  productId: string;
  variants: Variant[];
  options: Opt[];
  specs: Spec[];
}) {
  const {
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
  } = useVariantBulkTools(productId, variants, options, specs);

  // Load-more cursor over the in-memory list — beds have ~45+ variants and each card renders
  // an image grid, so mounting them all at once is the slow part. Reset when the search/filters change.
  const PAGE = 5;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q, filterOptionIds, filterSpecId, filterSpecValue]);
  const shown = visible.slice(0, limit);

  // Display-only filter for the option-chip list — narrows which chips show, doesn't touch selection.
  const [optionChipQuery, setOptionChipQuery] = useState("");

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Варіації ({variants.length})</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={randomizeAll} disabled={busy || ordered.length === 0} title="Нові унікальні артикули для всіх варіацій">
            🎲 Артикули всім
          </Button>
          <Button variant="ghost" onClick={addVariant} disabled={adding}>
            + Варіація
          </Button>
        </div>
      </div>

      {/* Bulk price update for all variants of the product */}
      {ordered.length > 0 && (
        <div className="rounded-lg bg-blue-50 p-3">
          <div className="mb-2 text-sm font-medium">Масове оновлення цін</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value as "set" | "amount" | "percent")}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="set">Встановити</option>
              <option value="amount">+/- Сума</option>
              <option value="percent">+/- %</option>
            </select>
            <div className="w-32">
              <Input type="number" value={priceValue} onChange={(e) => setPriceValue(Number(e.target.value))} />
            </div>
            <Button variant="ghost" onClick={applyBulkPrice} disabled={busy}>
              OK
            </Button>
          </div>
        </div>
      )}

      {/* Bulk sale (discount) for all variants of the product — one click to apply, one to remove */}
      {ordered.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3">
          <div className="mb-2 text-sm font-medium">Знижка для всіх варіацій</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={discountMode}
              onChange={(e) => setDiscountMode(e.target.value as "percent" | "price")}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="percent">Знижка %</option>
              <option value="price">Знижка: ціна ₴</option>
            </select>
            <div className="w-32">
              <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} />
            </div>
            <Button variant="ghost" onClick={applyDiscountToAll} disabled={busy}>
              Застосувати до всіх
            </Button>
            <Button variant="ghost" onClick={removeDiscountFromAll} disabled={busy}>
              Зняти знижку з усіх
            </Button>
          </div>
        </div>
      )}

      {/* Availability by option — bulk-mark every SKU carrying the selected option */}
      {productOptions.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3">
          <div className="text-sm font-medium">Наявність за опцією</div>
          <p className="mb-2 text-xs text-gray-500">Напр. колір закінчився — позначити всі SKU з цією опцією.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={stockOptionId}
              onChange={(e) => setStockOptionId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Оберіть опцію…</option>
              {productOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={stockTarget}
              onChange={(e) => setStockTarget(e.target.value as "in" | "out")}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="out">Немає в наявності</option>
              <option value="in">В наявності</option>
            </select>
            <Button variant="ghost" onClick={applyStockByOption} disabled={busy}>
              Застосувати
            </Button>
          </div>
        </div>
      )}

      {/* Visibility by option — bulk show/hide the variants with the selected option in the site selector.
          E.g. beds: config variants are imported hidden, here we switch on the needed "Конфігурація". */}
      {productOptions.length > 0 && (
        <div className="rounded-lg bg-emerald-50 p-3">
          <div className="text-sm font-medium">Показ за опцією</div>
          <p className="mb-2 text-xs text-gray-500">Показати/сховати всі SKU з цією опцією в селекторі на сторінці товару.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={visOptionId}
              onChange={(e) => setVisOptionId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Оберіть опцію…</option>
              {productOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={visTarget}
              onChange={(e) => setVisTarget(e.target.value as "show" | "hide")}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="show">Показувати</option>
              <option value="hide">Сховати</option>
            </select>
            <Button variant="ghost" onClick={applyVisibleByOption} disabled={busy}>
              Застосувати
            </Button>
          </div>
        </div>
      )}

      {/* Clone variants from an option template: prices/sizes/specs are copied (the price depends
          on the options, not on the colour), the photos are not. Two scenarios:
          • a new colour: the template "Колір: Бук" → the new "Колір: Сірий" (create it in "Фільтри" first);
          • complete a missing half: narrow down to "лише Колір: Сірий", template "З білими ніжками: Так" → "Ні". */}
      {productOptions.length > 0 && (
        <div className="rounded-lg bg-purple-50 p-3">
          <div className="text-sm font-medium">Клонувати варіації за опцією</div>
          <p className="mb-2 text-xs text-gray-500">
            Копіює варіації зі зразком опції, підмінивши її на нову (розміри, ціни, характеристики). Новий
            колір спершу створіть у «Фільтри».
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cloneFilterId}
              onChange={(e) => setCloneFilterId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Усі варіації</option>
              {productOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  лише {o.name}
                </option>
              ))}
            </select>
            <select
              value={cloneFromId}
              onChange={(e) => setCloneFromId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Зразок (є у товарі)…</option>
              {productOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-400">→</span>
            <select
              value={cloneToId}
              onChange={(e) => setCloneToId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Нова опція…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={applyCloneOption} disabled={busy}>
              Створити
            </Button>
          </div>
          <div className="mt-2">
            <Checkbox
              label="Копіювати фото зі зразка"
              checked={cloneCopyPhotos}
              onChange={(e) => setCloneCopyPhotos(e.target.checked)}
            />
          </div>
        </div>
      )}

      {ordered.length > 0 && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3">
          <Input
            value={query}
            placeholder="Пошук варіації: назва, артикул, ціна, опція, характеристика"
            onChange={(e) => setQuery(e.target.value)}
          />

          {(productOptions.length > 0 || productSpecs.length > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              {productOptions.length > 0 && (
                <div className="min-w-60 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Опції:</span>
                    <div className="w-40">
                      <Input
                        value={optionChipQuery}
                        placeholder="фільтр опцій…"
                        onChange={(e) => setOptionChipQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                    {productOptions
                      .filter((o) => o.name.toLowerCase().includes(optionChipQuery.trim().toLowerCase()))
                      .map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleFilterOption(o.id)}
                          className={`rounded-full border px-2 py-1 text-xs ${
                            filterOptionIds.includes(o.id)
                              ? "border-opora-brown bg-opora-brown text-white"
                              : "border-gray-300 text-gray-600"
                          }`}
                        >
                          {o.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {productSpecs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-gray-500">Характеристика:</span>
                  <select
                    value={filterSpecId}
                    onChange={(e) => setFilterSpecId(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">будь-яка…</option>
                    {productSpecs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {filterSpecId && (
                    <div className="w-32">
                      <Input
                        value={filterSpecValue}
                        placeholder="значення містить…"
                        onChange={(e) => setFilterSpecValue(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              {filtering && (
                <Button variant="ghost" onClick={clearFilters}>
                  Скинути пошук
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-purple-50 p-3">
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={selectAllVisible} className="underline">
              Обрати всі знайдені ({visible.length})
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-gray-400">·</span>
                <span>Обрано: {selected.size}</span>
                <button type="button" onClick={clearSelection} className="underline">
                  Скинути
                </button>
              </>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selPriceMode}
                onChange={(e) => setSelPriceMode(e.target.value as "set" | "amount" | "percent")}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="set">Ціна =</option>
                <option value="amount">Ціна +/- Сума</option>
                <option value="percent">Ціна +/- %</option>
              </select>
              <div className="w-28">
                <Input type="number" value={selPriceValue} onChange={(e) => setSelPriceValue(Number(e.target.value))} />
              </div>
              <Button variant="ghost" onClick={applySelectedPrice} disabled={busy}>
                OK
              </Button>

              <select
                value={selDiscountMode}
                onChange={(e) => setSelDiscountMode(e.target.value as typeof selDiscountMode)}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="none">Без знижки</option>
                <option value="percent">Знижка %</option>
                <option value="price">Знижка: ціна ₴</option>
              </select>
              {selDiscountMode !== "none" && (
                <div className="w-28">
                  <Input type="number" value={selDiscountValue} onChange={(e) => setSelDiscountValue(Number(e.target.value))} />
                </div>
              )}
              <Button variant="ghost" onClick={applySelectedDiscount} disabled={busy}>
                OK
              </Button>
            </div>
          )}
        </div>
      )}

      {shown.map((v) => {
        const i = ordered.indexOf(v);
        return (
          <VariantCard
            key={`${v.id}-${rev}`}
            variant={v}
            options={options}
            specs={specs}
            onMoveUp={filtering || i === 0 ? undefined : () => move(i, "up")}
            onMoveDown={filtering || i === ordered.length - 1 ? undefined : () => move(i, "down")}
            reordering={busy}
            selected={selected.has(v.id)}
            onToggleSelect={() => toggleSelect(v.id)}
          />
        );
      })}
      {visible.length > limit && (
        <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
          Показати ще ({visible.length - limit})
        </Button>
      )}
      {filtering && visible.length === 0 && <p className="text-sm text-gray-500">Нічого не знайдено.</p>}
    </Card>
  );
});

export default VariantsSection;
