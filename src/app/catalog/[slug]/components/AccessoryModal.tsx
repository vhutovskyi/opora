// Quick view of an accessory: photos, variant picking, short specs.
// No long description/PDF manual — this is a compact quick view.
"use client";

import { useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import Image from "@/components/ui/OptimizedImage";
import { AccessoryLink, OptionGroup, Variant, hexColor, isHexColor, optKind } from "./types";
import { findVariantForOption, getOptionGroups, isOptionAvailable } from "./variantSelection";
import { productHref } from "@/lib/utils";

interface AccessoryModalProps {
  link: AccessoryLink;
  initialVariantId: string | null;
  initialQty: number;
  isChecked: boolean;
  onClose: () => void;
  onApply: (variantId: string, qty: number) => void;
}

const priceLabel = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;

export default function AccessoryModal({
  link,
  initialVariantId,
  initialQty,
  isChecked,
  onClose,
  onApply,
}: AccessoryModalProps) {
  const variants = link.product.variants;
  const [activeVariant, setActiveVariant] = useState<Variant | null>(
    variants.find((v) => v.id === initialVariantId) ?? variants[0] ?? null
  );
  // The accessory quantity lives here, not in the buy-box row: like the variant pick, it is
  // applied only together with "Застосувати", so closing the modal changes nothing.
  const [qty, setQty] = useState(Math.min(Math.max(1, initialQty), link.maxQty));
  // The index of the photo opened fullscreen (null — the lightbox is closed).
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const optionGroups = useMemo(() => getOptionGroups(variants), [variants]);
  const isColorGroup = (g: OptionGroup) => g.options.every((o) => isHexColor(o.value));
  const colorGroups = optionGroups.filter(isColorGroup);
  const otherGroups = optionGroups.filter((g) => !isColorGroup(g));
  const activeOptOf = (key: string) => activeVariant?.options.find((o) => optKind(o) === key);

  const images = activeVariant?.imagesCompressed?.length
    ? activeVariant.imagesCompressed
    : activeVariant?.images ?? [];
  // The full-size photo for the lightbox — the original, if there is one under the same index.
  const fullImage = zoomIdx === null ? null : activeVariant?.images?.[zoomIdx] ?? images[zoomIdx];
  const price = activeVariant?.price || link.product.minPrice;

  const handleOptionSelect = (key: string, value: string) => {
    const match = findVariantForOption(variants, activeVariant, key, value);
    if (match) setActiveVariant(match);
  };

  // Variant picking — the same logic as on the product page.
  const renderGroup = (group: OptionGroup) => {
    const activeOpt = activeOptOf(group.key);
    const colors = isColorGroup(group);
    return (
      <div key={group.key} className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">{activeOpt?.name ?? group.key}</span>
        <div className="flex flex-wrap items-center gap-2">
          {group.options.map((opt) => {
            const available = isOptionAvailable(variants, activeVariant, group.key, opt.value);
            const selected = activeOpt?.value === opt.value;
            if (colors) {
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleOptionSelect(group.key, opt.value)}
                  aria-pressed={selected}
                  aria-label={available ? opt.name : `${opt.name} — немає в наявності`}
                  className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${
                    selected ? "ring-1 ring-gray-900 ring-offset-2 scale-110" : "ring-1 ring-gray-900/60 hover:ring-gray-900"
                  }`}
                  style={{ backgroundColor: hexColor(opt.value) }}
                  title={available ? opt.name : `${opt.name} — немає в наявності`}
                >
                  {!available && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-300/80"
                    />
                  )}
                </button>
              );
            }
            const label = opt.value || (opt.name.includes(":") ? opt.name.split(":").pop()!.trim() : opt.name);
            return (
              <button
                key={opt.value || opt.name}
                type="button"
                onClick={() => handleOptionSelect(group.key, opt.value)}
                aria-pressed={selected}
                className={`rounded-md border px-2.5 py-1.5 text-sm leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${
                  selected ? "border-gray-900 bg-opora-softBeige font-medium" : "border-gray-300 bg-white hover:border-gray-900"
                } ${!available ? "line-through opacity-50" : ""}`}
                title={available ? label : `${label} — немає в наявності`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[92vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-opora-white text-opora-brown shadow-xl focus:outline-none"
        >
        <Dialog.Close
          aria-label="Закрити"
          className="absolute right-3 top-2 z-10 rounded p-1 text-2xl leading-none hover:opacity-70"
        >
          ×
        </Dialog.Close>
        {/* Layout: mobile — everything in one column; desktop — the options on the left, the photos on the right,
            the specs full width below them. */}
        <div className="grid gap-x-5 gap-y-4 overflow-y-auto p-6 sm:grid-cols-[26rem_minmax(0,1fr)]">
          <div className="min-w-0 pr-8 sm:col-span-2 sm:pr-0">
            <Dialog.Title className="text-lg font-medium tracking-wide">
              <a
                href={productHref(link.product)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline underline-offset-2"
              >
                {link.product.model}
              </a>
            </Dialog.Title>
            <p className="mt-1 text-base">{priceLabel(price)}</p>
          </div>

          {images.length > 0 && (
            <div className="sm:col-start-2 sm:row-start-2">
              <button
                type="button"
                onClick={() => setZoomIdx(0)}
                aria-label="Відкрити фото на весь екран"
                className="relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown"
              >
                <Image src={images[0]} alt={link.product.model} fill className="object-contain" sizes="(max-width: 640px) 10rem, 26rem" />
              </button>
            </div>
          )}

          {/* Options — the left column on desktop */}
          {(colorGroups.length > 0 || otherGroups.length > 0) && (
            <div className="flex flex-col gap-4 sm:col-start-1 sm:row-start-2">
              {colorGroups.map(renderGroup)}
              {otherGroups.map(renderGroup)}
            </div>
          )}

          {/* Short specs of the selected variant */}
          {(activeVariant?.specifications?.length ?? 0) > 0 && (
            <dl className="divide-y divide-stone-200 border-t border-stone-200 text-sm sm:col-span-2">
              {activeVariant!.specifications.map((s) => (
                <div key={s.name} className="flex justify-between gap-4 py-2">
                  <dt className="text-gray-500">{s.name}</dt>
                  <dd className="text-right">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 p-6">
            <a
              href={productHref(link.product)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-2 hover:text-amber-800"
            >
              Переглянути повну сторінку ↗
            </a>
            <div className="flex items-center gap-4">
              {link.maxQty > 1 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    aria-label="Зменшити кількість"
                    disabled={qty <= 1}
                    className="w-6 text-xl hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 rounded"
                  >
                    -
                  </button>
                  <span className="w-4 text-center text-base" aria-live="polite" aria-label={`Кількість: ${qty}`}>
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((n) => Math.min(link.maxQty, n + 1))}
                    aria-label="Збільшити кількість"
                    disabled={qty >= link.maxQty}
                    className="w-6 text-xl hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 rounded"
                  >
                    +
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => activeVariant && onApply(activeVariant.id, qty)}
                disabled={!activeVariant}
                className="bg-opora-brown px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isChecked
                  ? `Зберегти зміни · +${priceLabel(price * qty)}`
                  : `Зберегти · +${priceLabel(price * qty)}`}
              </button>
            </div>
          </div>
        </Dialog.Content>

        {/* Lightbox: a nested Dialog — Escape closes exactly it, not the whole modal */}
        {fullImage && (
          <Dialog.Root open onOpenChange={(o) => !o && setZoomIdx(null)}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80" />
              <Dialog.Content
                aria-describedby={undefined}
                onClick={() => setZoomIdx(null)}
                className="fixed inset-0 z-[60] cursor-zoom-out p-4 focus:outline-none"
              >
                <Dialog.Title className="sr-only">{link.product.model}</Dialog.Title>
                <Image
                  src={fullImage}
                  alt={link.product.model}
                  fill
                  className="object-contain p-4"
                  sizes="100vw"
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
