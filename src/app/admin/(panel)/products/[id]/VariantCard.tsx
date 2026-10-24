"use client";

import { useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Button, Checkbox, Field, Input, ZoomImg } from "../../../ui";
import SpecsSection from "./SpecsSection";
import { useVariantEditor } from "./useVariantEditor";
import type { DiscountMode, Opt, Spec, Variant } from "./productEditorTypes";

export default function VariantCard({
  variant,
  options,
  specs,
  onMoveUp,
  onMoveDown,
  reordering,
  selected,
  onToggleSelect,
}: {
  variant: Variant;
  options: Opt[];
  specs: Spec[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reordering?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { v, setV, busy, uploading, photos, toggleOption, finalPrice, save, remove, randomizeSku, uploadImages, deletePhoto, moveImage } =
    useVariantEditor(variant);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const currentSpecs = useMemo(
    () =>
      [...(variant.variant_specs ?? [])]
        .sort((a, b) => (a.legacy_num ?? 0) - (b.legacy_num ?? 0))
        .map((ps) => ({ spec_id: ps.spec_id, value: ps.value ?? "" })),
    [variant.variant_specs]
  );
  const selectedOptions = useMemo(() => options.filter((o) => v.optionIds.includes(o.id)), [options, v.optionIds]);
  const addableOptions = useMemo(() => options.filter((o) => !v.optionIds.includes(o.id)), [options, v.optionIds]);

  return (
    <div className={`rounded-lg border p-4 ${selected ? "border-opora-brown bg-opora-brown/5" : "border-gray-200"}`}>
      <div className="mb-2 flex items-center justify-between gap-1">
        {onToggleSelect ? (
          <Checkbox label="Обрано" checked={!!selected} onChange={onToggleSelect} />
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          <Button variant="ghost" onClick={onMoveUp} disabled={!onMoveUp || reordering} aria-label="Вгору">
            ↑
          </Button>
          <Button variant="ghost" onClick={onMoveDown} disabled={!onMoveDown || reordering} aria-label="Вниз">
            ↓
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Назва">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Артикул">
          <div className="flex gap-1">
            <Input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} />
            <Button
              variant="ghost"
              onClick={randomizeSku}
              disabled={busy}
              aria-label="Згенерувати унікальний артикул"
              title="Випадковий унікальний артикул (8 цифр)"
            >
              🎲
            </Button>
          </div>
        </Field>
        <Field label="Ціна">
          <Input type="number" value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <Checkbox label="В наявності" checked={v.in_stock} onChange={(e) => setV({ ...v, in_stock: e.target.checked })} />
        <Checkbox label="Показувати на сайті" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} />
      </div>

      {/* Discount: by percentage or by final price */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Знижка">
          <select
            value={v.discountMode}
            onChange={(e) => setV({ ...v, discountMode: e.target.value as DiscountMode })}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="none">Без знижки</option>
            <option value="percent">Відсоток %</option>
            <option value="price">Ціна ₴</option>
          </select>
        </Field>
        {v.discountMode !== "none" && (
          <>
            <Field label={v.discountMode === "percent" ? "% знижки" : "Ціна зі знижкою"}>
              <Input
                type="number"
                value={v.discountValue}
                onChange={(e) => setV({ ...v, discountValue: Number(e.target.value) })}
              />
            </Field>
            <span className="pb-2 text-sm text-gray-600">
              Кінцева: <b>{finalPrice.toLocaleString("uk-UA")} ₴</b>
            </span>
          </>
        )}
      </div>

      <div className="mt-3">
        <span className="text-xs font-medium text-gray-600">Опції</span>
        <div className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-auto">
          {selectedOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => toggleOption(o.id)}
              className="rounded-full border border-opora-brown bg-opora-brown px-2 py-1 text-xs text-white"
            >
              {o.name}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setOptionsOpen(true)}>
            + Опція
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <span className="text-xs font-medium text-gray-600">Фото</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative">
              <ZoomImg src={p.url} className="h-16 w-16 rounded object-cover" />
              <button
                onClick={() => deletePhoto(p.id)}
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-600 text-xs text-white"
              >
                ×
              </button>
              <div className="absolute inset-x-0 bottom-0 flex justify-between p-0.5">
                <button
                  type="button"
                  onClick={() => moveImage(p.id, "left")}
                  disabled={i === 0}
                  aria-label="Пересунути ліворуч"
                  className="h-4 w-4 rounded bg-black/60 text-[10px] leading-none text-white disabled:opacity-20"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(p.id, "right")}
                  disabled={i === photos.length - 1}
                  aria-label="Пересунути праворуч"
                  className="h-4 w-4 rounded bg-black/60 text-[10px] leading-none text-white disabled:opacity-20"
                >
                  ›
                </button>
              </div>
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" multiple onChange={(e) => uploadImages(e.target.files)} className="mt-2 text-xs" />
        {uploading && <span className="ml-2 text-xs text-gray-500">Завантаження...</span>}
      </div>

      <div className="mt-3">
        <Button variant="ghost" onClick={() => setSpecsOpen(true)}>
          Характеристики ({currentSpecs.length})
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <Button onClick={save} disabled={busy}>
          Зберегти варіацію
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          Видалити
        </Button>
      </div>

      <Dialog.Root open={specsOpen} onOpenChange={setSpecsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-opora-white p-6 text-opora-brown shadow-xl focus:outline-none"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <Dialog.Title className="text-xl font-medium tracking-wide">Характеристики: {v.name}</Dialog.Title>
              <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
                ×
              </Dialog.Close>
            </div>
            <SpecsSection variantId={variant.id} specs={specs} current={currentSpecs} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-opora-white p-6 text-opora-brown shadow-xl focus:outline-none"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <Dialog.Title className="text-xl font-medium tracking-wide">Додати опцію: {v.name}</Dialog.Title>
              <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
                ×
              </Dialog.Close>
            </div>
            <div className="flex flex-wrap gap-2">
              {addableOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleOption(o.id)}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-600"
                >
                  {o.name}
                </button>
              ))}
              {addableOptions.length === 0 && <p className="text-sm text-gray-400">Усі опції вже додано.</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
