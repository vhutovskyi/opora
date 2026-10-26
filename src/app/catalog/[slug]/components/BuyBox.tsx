// Right column: the compact purchase block (name, price, description, colour picking, button)
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BOOL_NO, BOOL_YES } from "@/lib/constants";
import type { Model3D } from "@/lib/models3d";
import CompareButton from "./CompareButton";
import { AccessoryLink, Option, OptionGroup, Product, VariantSummary, chipLabel, hexColor, isBoolGroup, isHexColor, isSelectGroup, optKind } from "./types";

// The modal with an option axis description — only after a click on ℹ.
const OptionInfoModal = dynamic(() => import("./OptionInfoModal"), { ssr: false });
// 3D/AR view — as a separate chunk, because it pulls in ~300KB of library.
const Model3DModal = dynamic(() => import("./Model3DModal"), { ssr: false });

interface BuyBoxProps {
  product: Product;
  activeVariant: VariantSummary | null;
  qty: number;
  optionGroups: OptionGroup[];
  // A markdown description per axis (key = group.key, e.g. "Матеріал"), set in the admin panel/filters.
  optionGroupInfo: Record<string, string>;
  // The product's 3D/AR model, if there is one (the .usdz URL is assembled by the server).
  model3d: Model3D | null;
  accessories: AccessoryLink[];
  selectedAccessories: Record<string, string | null>;
  accessoryQty: Record<string, number>;
  onQtyChange: (qty: number) => void;
  onOptionSelect: (key: string, value: string) => void;
  // Hovering an option is a reason to prefetch its photos (see useVariantMedia).
  onOptionHover: (key: string, value: string) => void;
  isOptionAvailable: (key: string, value: string) => boolean;
  // A doubled swatch (colour + a Так/Ні axis, e.g. "З білими ніжками") picks the variant directly
  // by id — unlike onOptionSelect, here TWO axes change at once (the colour and the legs).
  onSelectVariant: (variantId: string) => void;
  onHoverVariant: (variantId: string) => void;
  onAccessoryToggle: (linkId: string) => void;
  onOpenAccessoryModal: (linkId: string) => void;
  onAddToCart: () => void;
  onReadMore: () => void;
}

// A human-readable option label for the "Обрано: …" row (the name after ":", or the value).
const optionLabel = (o: Option) =>
  o.name.includes(":") ? o.name.split(":").pop()!.trim() : o.value || o.name;

// A short description out of raw markdown (without the markup)
const buildShortDescription = (description: string, limit = 160) => {
  const plain = (description || "")
    .replace(/[#*_>`~[\]()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    text: plain.length > limit ? plain.slice(0, limit).trimEnd() : plain,
    truncated: plain.length > limit,
  };
};

// The ℹ icon button next to an axis label — rendered only if there is a description for this key.
function GroupInfoButton({ groupKey, info, onOpen }: { groupKey: string; info: Record<string, string>; onOpen: (key: string) => void }) {
  if (!info[groupKey]) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Axis groups are also rendered inside <label> wrappers (the select) — we stop the click from reaching
        // the associated control.
        e.preventDefault();
        e.stopPropagation();
        onOpen(groupKey);
      }}
      aria-label={`Інфо: ${groupKey}`}
      title={`Інфо: ${groupKey}`}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-400 text-[10px] leading-none text-gray-500 hover:border-opora-brown hover:text-opora-brown"
    >
      i
    </button>
  );
}

export default function BuyBox({
  product,
  activeVariant,
  qty,
  optionGroups,
  optionGroupInfo,
  model3d,
  accessories,
  selectedAccessories,
  accessoryQty,
  onQtyChange,
  onOptionSelect,
  onOptionHover,
  isOptionAvailable,
  onAccessoryToggle,
  onOpenAccessoryModal,
  onAddToCart,
  onReadMore,
  onSelectVariant,
  onHoverVariant,
}: BuyBoxProps) {
  const isUnavailable = !activeVariant || !activeVariant.inStock;
  const short = buildShortDescription(product.description);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);

  // The price actually charged for a variant — the sale price when one is set, otherwise the plain price.
  const effectivePrice = (v: VariantSummary | null | undefined) => (v?.discountedPrice || v?.price) ?? 0;

  // Total: variant × quantity + the selected accessories (each accessory × its own quantity)
  const accessoryTotal = accessories.reduce((sum, link) => {
    const id = selectedAccessories[link.id] ?? null;
    if (id === null) return sum;
    const variant = link.product.variants.find((v) => v.id === id);
    const unitPrice = variant ? effectivePrice(variant) : link.product.minPrice;
    return sum + unitPrice * (accessoryQty[link.id] ?? 1);
  }, 0);
  const cartTotal = (activeVariant ? effectivePrice(activeVariant) : product.minPrice) * qty + accessoryTotal;
  const onSale = !!activeVariant?.discountedPrice;

  // Colour is rendered separately (circles, on the right); the other options (material, size and so on) are
  // text chips, which we put on the left under the price so the column doesn't keep an empty spot.
  // The split is by the KIND of group: a group with all-hex values → colours, otherwise → chips.
  // A Так/Ні axis (e.g. "З білими ніжками") no longer has a rendering of its own: it becomes the second
  // swatch (colour + white) right after the ordinary colour — see legsGroup below.
  const isColorGroup = (g: OptionGroup) => g.options.every((o) => isHexColor(o.value));
  const colorGroups = optionGroups.filter(isColorGroup);
  const boolGroups = optionGroups.filter(isBoolGroup);
  const textGroups = optionGroups.filter((g) => !isColorGroup(g) && !isBoolGroup(g));
  // Long labels (table sizes) — as a dropdown, short ones — as chips.
  const selectGroups = textGroups.filter(isSelectGroup);
  const chipGroups = textGroups.filter((g) => !isSelectGroup(g));
  const activeOptOf = (key: string) => activeVariant?.options.find((o) => optKind(o) === key);

  // Tables have 11 tabletop shades — at the usual size the row doesn't fit next to the name and
  // wraps into an ugly "10 + 1". That is why exactly those rows are a bit denser: 20px instead of 24px and
  // a smaller gap. 11 × 20 + 10 × 6 = 280px instead of 344px — it fits on one line.
  const manySwatches = colorGroups.some((g) => g.options.length > 8);
  const swatchSize = manySwatches ? "md:w-5 md:h-5" : "md:w-6 md:h-6";
  const swatchGap = manySwatches ? "md:gap-1.5" : "md:gap-2";

  // ponytail: only ONE Так/Ні axis occurs in the data (the legs) — we take boolGroups[0].
  // For a product without that axis (almost all of them) legsGroup is undefined, and the second swatch is drawn nowhere.
  const legsGroup = boolGroups[0];

  const colorPicker = product.variants && product.variants.length > 0 && colorGroups.length > 0 && (
    <div className="flex flex-row flex-wrap items-start gap-x-6 gap-y-3 md:justify-end md:pt-2 md:min-w-0 md:flex-1">
      {colorGroups.map((group) => {
        // We filter the colour group by the selected non-hex options (the material), so as not to show
        // colours this material doesn't have and not to "jump" between materials.
        const selectedByKind = new Map(activeVariant?.options.map((o) => [optKind(o), o.value]) ?? []);
        const visibleOptions = activeVariant
          ? group.options.filter((opt) =>
              product.variants.some(
                (v) =>
                  v.options.some((o) => optKind(o) === group.key && o.value === opt.value) &&
                  v.options.every((o) => isHexColor(o.value) || selectedByKind.get(optKind(o)) === o.value)
              )
            )
          : group.options;
        const activeOpt = activeOptOf(group.key);

        // When there is a legs axis — the colour and the legs are always picked TOGETHER, by the id of a specific variant:
        // otherwise a click on an ordinary circle could leave the "with legs" variant active (if it
        // exists for this colour too), because onOptionSelect keeps the values of the other axes.
        const variantFor = (colorValue: string, legsValue: string) =>
          product.variants.find(
            (v) =>
              v.options.some((o) => optKind(o) === group.key && o.value === colorValue) &&
              v.options.some((o) => optKind(o) === legsGroup!.key && o.value === legsValue) &&
              v.options.every(
                (o) =>
                  isHexColor(o.value) ||
                  optKind(o) === legsGroup!.key ||
                  selectedByKind.get(optKind(o)) === o.value
              )
          );

        // variant given → the click/highlight follow a specific id (aware of the Так/Ні axis);
        // not given (no legs axis for this colour) → the old behaviour through onOptionSelect.
        const renderSwatch = (opt: Option, hex2: string | null, variant: VariantSummary | undefined) => {
          const selected = variant ? activeVariant?.id === variant.id : activeOpt?.value === opt.value;
          const available = variant ? variant.inStock : isOptionAvailable(group.key, opt.value);
          const label = hex2 ? `${opt.name} · ${legsGroup!.key}` : opt.name;
          return (
            <button
              key={`${opt.value}-${hex2 ?? "plain"}`}
              type="button"
              onClick={variant ? () => onSelectVariant(variant.id) : () => onOptionSelect(group.key, opt.value)}
              onMouseEnter={variant ? () => onHoverVariant(variant.id) : () => onOptionHover(group.key, opt.value)}
              aria-pressed={selected}
              aria-label={available ? label : `${label} — немає в наявності`}
              className={`relative w-8 h-8 ${swatchSize} rounded-full transition-all duration-200 overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${
                selected
                  ? 'ring-1 ring-gray-900 ring-offset-2 ring-offset-white scale-110'
                  : 'ring-1 ring-gray-900/60 ring-offset-0 hover:ring-gray-900 hover:scale-105'
              }`}
              style={
                hex2
                  ? { background: `linear-gradient(135deg, ${hexColor(opt.value)} 49.5%, ${hexColor(hex2)} 50.5%)` }
                  : { backgroundColor: hexColor(opt.value) }
              }
              title={available ? label : `${label} — немає в наявності`}
            >
              {!available && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-300/80"
                />
              )}
            </button>
          );
        };

        // The second row (legs "Так") — only the colours that really have such a photo set;
        // on a line of its own rather than mixed with the ordinary ones, so wrapping doesn't split the pairs.
        const leggedOptions = legsGroup
          ? visibleOptions
              .map((opt) => ({ opt, variant: variantFor(opt.value, BOOL_YES) }))
              .filter((e): e is { opt: Option; variant: VariantSummary } => !!e.variant)
          : [];

        return (
          <div key={group.key} className="flex flex-col items-start md:items-end gap-1 basis-full">
            <span className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 whitespace-nowrap">
              {activeOpt?.name ?? group.key}
              <GroupInfoButton groupKey={group.key} info={optionGroupInfo} onOpen={setInfoKey} />
            </span>
            {/* On mobile the circles are bigger and wrap into 2 rows */}
            <div className={`flex items-center gap-2.5 ${swatchGap} flex-wrap justify-start md:justify-end`}>
              {visibleOptions.map((opt) => renderSwatch(opt, null, legsGroup ? variantFor(opt.value, BOOL_NO) : undefined))}
            </div>
            {leggedOptions.length > 0 && (
              <div className={`flex items-center gap-2.5 ${swatchGap} flex-wrap justify-start md:justify-end`}>
                {leggedOptions.map(({ opt, variant }) => renderSwatch(opt, "FFFFFF", variant))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {/* On mobile — a vertical stack (so the sku doesn't overlap the colours);
          on desktop — name/price on the left, colour picking on the right */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 mb-6">
        <div>
          <h1 className="text-2xl font-medium tracking-wide mb-1">
            {product.model || product.name}
          </h1>
          <p className="text-xs text-opora-brown/80 mb-4 whitespace-nowrap">Art: {activeVariant?.sku || 'N/A'}</p>

          {/* The price updates with the active variant, the quantity and the selected accessories */}
          <p className="flex items-center gap-2 text-xl">
            {onSale && (
              <span className="text-base text-gray-400 line-through">
                {((activeVariant!.price || 0) * qty + accessoryTotal).toLocaleString('uk-UA')} ₴
              </span>
            )}
            <span className={onSale ? "text-red-600" : undefined}>{cartTotal.toLocaleString('uk-UA')} ₴</span>
          </p>
        </div>

        {colorPicker}
      </div>

      {/* Axes with long labels (table sizes) — as a dropdown: chips with such strings
          would take three rows and cover the rest of the purchase block. */}
      {selectGroups.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {selectGroups.map((group) => {
            const activeOpt = activeOptOf(group.key);
            return (
              <label key={group.key} className="flex flex-row flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                  {group.key}
                  <GroupInfoButton groupKey={group.key} info={optionGroupInfo} onOpen={setInfoKey} />
                </span>
                <select
                  value={activeOpt?.value ?? ""}
                  onChange={(e) => onOptionSelect(group.key, e.target.value)}
                  className="w-auto max-w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm transition-colors hover:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2"
                >
                  {group.options.map((opt) => (
                    <option key={opt.value || opt.name} value={opt.value}>
                      {chipLabel(opt)}
                      {isOptionAvailable(group.key, opt.value) ? "" : " — немає в наявності"}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {/* Text options (material, lamel spacing...) — across the full width of the block */}
      {chipGroups.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {chipGroups.map((group) => {
            const activeOpt = activeOptOf(group.key);
            return (
            <div key={group.key} className="flex flex-row flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                {activeOpt?.name ?? group.key}
                <GroupInfoButton groupKey={group.key} info={optionGroupInfo} onOpen={setInfoKey} />
              </span>
              {group.options.map((opt) => {
                  const available = isOptionAvailable(group.key, opt.value);
                  const selected = activeOpt?.value === opt.value;
                  const label = chipLabel(opt);
                  return (
                    <button
                      key={opt.value || opt.name}
                      type="button"
                      onClick={() => onOptionSelect(group.key, opt.value)}
                      onMouseEnter={() => onOptionHover(group.key, opt.value)}
                      aria-pressed={selected}
                      className={`rounded-md border text-sm leading-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${
                        selected
                          ? 'border-gray-900 bg-opora-softBeige font-medium'
                          : 'border-gray-300 bg-white hover:border-gray-900'
                      } ${!available ? 'line-through opacity-50' : ''}`}
                      style={{ padding: '5px 10px' }}
                      title={available ? label : `${label} — немає в наявності`}
                    >
                      {label}
                    </button>
                  );
                })}
            </div>
            );
          })}
        </div>
      )}

      {/* Extra products (accessories) — below the variant options: first the bed itself is configured,
          then the upsells are added. The quantity and the accessory variant are picked in the "Змінити" modal. */}
      {accessories.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {accessories.map((link) => {
            const selectedVariantId = selectedAccessories[link.id] ?? null;
            const checked = selectedVariantId !== null;
            const variant = checked
              ? link.product.variants.find((v) => v.id === selectedVariantId)
              : undefined;
            const unitPrice = variant ? effectivePrice(variant) : link.product.minPrice;
            const qtyForLink = accessoryQty[link.id] ?? 1;
            const addonPrice = checked ? unitPrice * qtyForLink : unitPrice;
            const summary = variant?.options.map(optionLabel).filter(Boolean).join(", ");
            // The selected accessory colour — as a circle at the end of the row (two-tone ones give two circles).
            const colorOptions = variant?.options.filter((o) => isHexColor(o.value)) ?? [];
            return (
              <div key={link.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <span
                      className={`w-4 h-4 border transition-colors flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-opora-brown border-opora-brown'
                          : 'border-opora-brown/40 group-hover:border-opora-brown'
                      }`}
                    >
                      {checked && <span className="text-white text-xs leading-none">✓</span>}
                    </span>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => onAccessoryToggle(link.id)}
                    />
                    <span className="text-sm">{link.product.model}</span>
                    <span className="text-sm text-opora-brown/70">+ {addonPrice.toLocaleString('uk-UA')} ₴</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenAccessoryModal(link.id)}
                    className="text-sm text-gray-500 underline underline-offset-2 hover:text-opora-brown transition-colors"
                  >
                    Змінити
                  </button>
                  {/* The selected accessory colour — as a circle right after "Змінити" (two-tone ones give two). */}
                  {colorOptions.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      {colorOptions.map((o) => (
                        <span
                          key={o.name}
                          title={optionLabel(o)}
                          className="h-4 w-4 rounded-full ring-1 ring-gray-900/40"
                          style={{ backgroundColor: hexColor(o.value) }}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {checked && summary && (
                  <p className="ml-7 text-xs text-gray-500">
                    Обрано: {summary}
                    {qtyForLink > 1 && ` · ${qtyForLink} шт`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* A short description with a link to the full one */}
      {short.text && (
        <p className="text-sm text-stone-600 leading-relaxed border-t border-stone-200 pt-6 mb-6">
          {short.text}
          {short.truncated && (
            <>
              …{' '}
              <button
                onClick={onReadMore}
                className="text-stone-900 underline underline-offset-2 hover:text-amber-800 transition-colors"
              >
                Більше
              </button>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-6 mb-6">
        <button
          type="button"
          onClick={() => onQtyChange(Math.max(1, qty - 1))}
          aria-label="Зменшити кількість"
          disabled={qty <= 1}
          className="text-xl w-6 hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 rounded"
        >
          -
        </button>
        <span className="text-lg font-light" aria-live="polite" aria-label={`Кількість: ${qty}`}>{qty}</span>
        <button
          type="button"
          onClick={() => onQtyChange(qty + 1)}
          aria-label="Збільшити кількість"
          className="text-xl w-6 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 rounded"
        >
          +
        </button>
      </div>

      <button
        onClick={onAddToCart}
        className={`w-full py-4 text-white font-medium transition-opacity ${
          isUnavailable ? 'bg-gray-400 cursor-not-allowed' : 'bg-opora-brown hover:opacity-90'
        }`}
        disabled={isUnavailable}
      >
        {isUnavailable ? 'Немає в наявності' : 'Додати до кошика'}
      </button>

      <CompareButton
        variantId={activeVariant?.id}
        catalog={product.catalog}
        productName={product.model || product.name}
      />

      {/* 3D/AR — only for products that have a model (see src/lib/models3d.ts) */}
      {model3d && (
        <button
          type="button"
          onClick={() => setShow3d(true)}
          className="mt-3 w-full border border-opora-brown py-3.5 text-sm font-medium text-opora-brown transition-colors hover:bg-opora-brown hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2"
        >
          Подивитися в 3D
        </button>
      )}

      {infoKey && optionGroupInfo[infoKey] && (
        <OptionInfoModal
          groupKey={infoKey}
          info={optionGroupInfo[infoKey]}
          colorHex={activeOptOf("Колір")?.value ?? null}
          onClose={() => setInfoKey(null)}
        />
      )}

      {show3d && model3d && (
        <Model3DModal
          model={model3d}
          title={product.model || product.name}
          onClose={() => setShow3d(false)}
        />
      )}
    </div>
  );
}
