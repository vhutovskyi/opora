"use client";

import { CSSProperties, ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CompareVariant } from "@/lib/supabase/types";
import { MOCK_PRODUCT_IMAGES } from "@/lib/constants";
import { MAX_COMPARE_ITEMS, compareHref } from "@/lib/compare";
import { catalogHref, productHref } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics/umami";
import { useCompareStore } from "@/store/compareStore";
import Toast from "@/components/ui/Toast";
import { CloseIcon, CompareIcon } from "@/components/ui/Icons";
import ImageSlider from "@/app/catalog/[slug]/components/ImageSlider";
import { useFullscreenGallery } from "@/app/catalog/[slug]/useFullscreenGallery";
import { chipLabel, hexColor, isHexColor, optKind } from "@/app/catalog/[slug]/components/types";

// Only needed after a click on a photo — its own chunk, same as on the product page.
const FullscreenGallery = dynamic(() => import("@/app/catalog/[slug]/components/FullscreenGallery"), { ssr: false });

// A table cell: `key` is what "Лише відмінності" compares, `content` is what is shown.
type Cell = { key: string; content: ReactNode };
type Row = { label: string; cells: Cell[] };
type Section = { title: string; rows: Row[] };

const EMPTY: Cell = { key: "", content: <span className="text-opora-brown/40">—</span> };

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

// "Колір: Сірий" → "Сірий" (a colour option's value is a hex, the human name is in the option name).
const colorLabel = (name: string) => (name.includes(":") ? name.split(":").pop()!.trim() : name);

function priceCell(v: CompareVariant): Cell {
  const sale = v.discountedPrice;
  return {
    key: String(sale ?? v.price),
    content: v.price > 0 ? (
      <span className="flex flex-wrap items-baseline gap-x-2">
        {sale && <span className="text-xs text-gray-400 line-through">{v.price.toLocaleString("uk-UA")} ₴</span>}
        <span className={sale ? "text-red-600" : undefined}>{(sale ?? v.price).toLocaleString("uk-UA")} ₴</span>
      </span>
    ) : (
      "Ціну уточнюйте"
    ),
  };
}

// Rows = the union over all columns, in order of first appearance; a variant without the axis/spec gets "—".
function buildSections(variants: CompareVariant[]): Section[] {
  const axes = [...new Set(variants.flatMap((v) => v.options.map(optKind)))];
  const specNames = [...new Set(variants.flatMap((v) => v.specifications.map((s) => s.name)))];

  const optionCell = (v: CompareVariant, axis: string): Cell => {
    const o = v.options.find((opt) => optKind(opt) === axis);
    if (!o) return EMPTY;
    if (isHexColor(o.value)) {
      return {
        key: o.value.toLowerCase(),
        content: (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-full ring-1 ring-gray-900/40"
              style={{ backgroundColor: hexColor(o.value) }}
            />
            {colorLabel(o.name)}
          </span>
        ),
      };
    }
    return { key: o.value, content: chipLabel(o) };
  };

  const specCell = (v: CompareVariant, name: string): Cell => {
    const value = v.specifications.find((s) => s.name === name)?.value?.trim();
    return value ? { key: value, content: value } : EMPTY;
  };

  return [
    {
      title: "Основне",
      rows: [
        { label: "Ціна", cells: variants.map(priceCell) },
        {
          label: "Наявність",
          cells: variants.map((v) => ({
            key: String(v.inStock),
            content: v.inStock ? "В наявності" : <span className="text-gray-400">Немає в наявності</span>,
          })),
        },
      ],
    },
    { title: "Опції", rows: axes.map((axis) => ({ label: axis, cells: variants.map((v) => optionCell(v, axis)) })) },
    {
      title: "Характеристики",
      rows: specNames.map((name) => ({ label: name, cells: variants.map((v) => specCell(v, name)) })),
    },
  ];
}

export default function CompareClient({
  requestedIds,
  variants,
}: {
  // The ids from the URL (already validated/capped) and what the server resolved them to.
  requestedIds: string[];
  variants: CompareVariant[];
}) {
  const router = useRouter();
  const items = useCompareStore((s) => s.items);
  const removeItem = useCompareStore((s) => s.remove);
  const replaceItems = useCompareStore((s) => s.replace);
  const clearItems = useCompareStore((s) => s.clear);
  const storeIds = items.map((i) => i.id);

  // localStorage is only readable after mounting (same as the cart counter in Header).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Removed on this page — hidden at once, without waiting for the server render of the new URL.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [toast, setToast] = useState<{ message: string; subMessage?: string } | null>(null);
  const showToast = (message: string, subMessage?: string) => {
    setToast({ message, subMessage });
    setTimeout(() => setToast(null), 3000);
  };

  const shown = variants.filter((v) => !removed.has(v.id));
  const currentIds = requestedIds.filter((id) => !removed.has(id));
  // The page shows the visitor's OWN list (localStorage) or one opened from someone's link.
  // Only the own list is edited in the store; a foreign one can be saved as own.
  const isOwnList = !mounted || sameIds(currentIds, storeIds);

  // Opened as /compare (the header link before hydration, a bookmark) → move to the own list's URL.
  useEffect(() => {
    if (mounted && requestedIds.length === 0 && storeIds.length > 0) router.replace(compareHref(storeIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, requestedIds.length, storeIds.length]);

  // A shared link opened by someone with an empty list — it simply becomes their list.
  useEffect(() => {
    if (mounted && storeIds.length === 0 && shown.length > 0 && removed.size === 0) {
      replaceItems(shown.map((v) => ({ id: v.id, catalog: v.catalog })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, storeIds.length, shown.length]);

  // The own list referenced variants the server no longer serves (hidden, deleted, moved to another
  // catalog) — drop them from localStorage and the URL instead of keeping a dead "4 of 4".
  useEffect(() => {
    if (!mounted || !isOwnList) return;
    const found = new Set(shown.map((v) => v.id));
    const missing = currentIds.filter((id) => !found.has(id));
    const catalogChanged = shown.some((v) => items.find((i) => i.id === v.id)?.catalog !== v.catalog);
    if (!missing.length && !catalogChanged) return;
    replaceItems(shown.map((v) => ({ id: v.id, catalog: v.catalog })));
    setRemoved((prev) => new Set([...prev, ...missing]));
    if (missing.length) router.replace(compareHref(shown.map((v) => v.id)), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOwnList, variants]);

  // Fullscreen gallery — one for the whole page, filled with the clicked column's originals.
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const gallery = useFullscreenGallery(galleryImages.length);
  const openGallery = (v: CompareVariant, index: number) => {
    trackEvent("Відкрито галерею", { product: v.model, index, page: "compare" });
    setGalleryImages(v.images.length ? v.images : [...MOCK_PRODUCT_IMAGES]);
    gallery.open(index);
  };

  const handleRemove = (id: string) => {
    if (isOwnList) removeItem(id);
    setRemoved((prev) => new Set(prev).add(id));
    router.replace(compareHref(currentIds.filter((x) => x !== id)), { scroll: false });
  };

  const handleClear = () => {
    clearItems();
    setRemoved(new Set(currentIds));
    router.replace(compareHref([]), { scroll: false });
  };

  const handleSaveShared = () => {
    replaceItems(shown.map((v) => ({ id: v.id, catalog: v.catalog })));
    showToast("Збережено у ваше порівняння");
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${compareHref(currentIds)}`;
    trackEvent("Поділитися порівнянням", { count: currentIds.length });
    try {
      await navigator.clipboard.writeText(url);
      showToast("Посилання скопійовано");
    } catch {
      showToast("Не вдалося скопіювати", url);
    }
  };

  const pageClass = "min-h-screen bg-opora-white text-opora-brown";
  const containerClass = "mx-auto max-w-400 px-4 pb-16 pt-24 md:pt-32 lg:px-8 lg:pt-40";

  // Waiting for the redirect to the own list (or for localStorage) — not an empty state flash.
  if (requestedIds.length === 0 && (!mounted || storeIds.length > 0)) {
    return (
      <main className={pageClass}>
        <div className={containerClass}>
          <div className="h-8 w-56 rounded bg-opora-softBeige animate-pulse" />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="aspect-square rounded-sm bg-opora-softBeige animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (shown.length === 0) {
    return (
      <main className={pageClass}>
        <div className={`${containerClass} flex flex-col items-center text-center`}>
          <CompareIcon className="h-12 w-12 text-opora-brown/40" />
          <h1 className="mt-4 text-2xl font-medium md:text-3xl">
            {requestedIds.length > 0 && removed.size === 0 ? "Ці товари більше недоступні" : "Список порівняння порожній"}
          </h1>
          <p className="mt-3 max-w-md text-sm text-stone-600">
            Додайте товари кнопкою «Додати до порівняння» на сторінці товару — до {MAX_COMPARE_ITEMS} варіантів з
            одного каталогу.
          </p>
          <Link
            href="/catalog"
            className="mt-6 inline-flex min-h-11 items-center bg-opora-brown px-8 text-sm font-medium text-white hover:opacity-90"
          >
            До каталогу
          </Link>
        </div>
      </main>
    );
  }

  const catalog = shown[0].catalog;
  const sections = buildSections(shown)
    .map((s) => ({
      ...s,
      rows: onlyDiff && shown.length > 1 ? s.rows.filter((r) => new Set(r.cells.map((c) => c.key)).size > 1) : s.rows,
    }))
    .filter((s) => s.rows.length > 0);

  // Mobile: product columns only (the row label goes on its own line above the values), two of them
  // across the screen and the rest scrolled to. md+: a sticky label column in front.
  const gridStyle = { "--cols": shown.length } as CSSProperties;
  const gridClass =
    "grid gap-x-4 md:gap-x-0 grid-cols-[repeat(var(--cols),minmax(10rem,18rem))] md:grid-cols-[13rem_repeat(var(--cols),minmax(12rem,18rem))]";
  // The label column stays put while the columns scroll under it — so it needs a solid background.
  const labelCellClass = "md:sticky md:left-0 md:z-20 md:bg-opora-white md:pr-4";
  const valueCellClass = "md:pl-4";

  return (
    <main className={pageClass}>
      <div className={containerClass}>
        {/* Title + actions */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-medium md:text-3xl">Порівняння</h1>
            <p className="mt-1 text-sm text-stone-600">
              {catalog && (
                <>
                  <Link href={catalogHref(catalog)} className="underline underline-offset-2 hover:text-opora-brown">
                    {catalog}
                  </Link>
                  {" · "}
                </>
              )}
              {shown.length} з {MAX_COMPARE_ITEMS}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {shown.length > 1 && (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyDiff}
                  onChange={(e) => setOnlyDiff(e.target.checked)}
                  className="h-4 w-4 accent-opora-brown"
                />
                Лише відмінності
              </label>
            )}
            {shown.length < MAX_COMPARE_ITEMS && catalog && (
              <Link href={catalogHref(catalog)} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:opacity-70">
                + Додати ще
              </Link>
            )}
            <button type="button" onClick={handleShare} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:opacity-70">
              Поділитися
            </button>
            {isOwnList && (
              <button type="button" onClick={handleClear} className="inline-flex min-h-11 items-center text-gray-500 underline underline-offset-2 hover:text-opora-brown">
                Очистити
              </button>
            )}
          </div>
        </div>

        {/* A list opened from someone's link while the visitor has a list of their own */}
        {mounted && !isOwnList && (
          <div className="mt-6 flex flex-col gap-3 rounded-sm bg-opora-softBeige px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
            <p>
              Це порівняння відкрито за посиланням.
              {storeIds.length > 0 && " Збереження замінить ваш поточний список."}
            </p>
            <button
              type="button"
              onClick={handleSaveShared}
              className="min-h-11 shrink-0 bg-opora-brown px-5 text-sm font-medium text-white hover:opacity-90"
            >
              Зберегти як моє порівняння
            </button>
          </div>
        )}

        {/* The table — scrolls sideways when the columns don't fit */}
        <div className="mt-8 overflow-x-auto pb-2">
          <div className={gridClass} style={gridStyle}>
            {/* Product header row */}
            <div className={`hidden md:block ${labelCellClass}`} />
            {shown.map((v) => {
              const images = v.imagesCompressed.length ? v.imagesCompressed : [...MOCK_PRODUCT_IMAGES];
              return (
                // isolate: the slider's dots/close button (z-30) must stay under the sticky label column (z-20).
                <div key={v.id} className={`relative isolate flex flex-col pb-4 ${valueCellClass}`}>
                  <div className="relative">
                    <ImageSlider
                      images={images}
                      onImageClick={(index) => openGallery(v, index)}
                      sizes="(max-width: 768px) 50vw, 18rem"
                      altPrefix={v.model}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(v.id)}
                      aria-label={`Прибрати з порівняння: ${v.model}`}
                      className="absolute right-1 top-1 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  </div>
                  <Link
                    href={`${productHref({ id: v.productId, slug: v.slug })}?variant=${v.id}`}
                    className="mt-3 text-base font-medium leading-snug hover:opacity-70 md:text-lg"
                  >
                    {v.model}
                  </Link>
                  <p className="mt-0.5 text-xs text-opora-brown/60">Art: {v.sku || "N/A"}</p>
                </div>
              );
            })}

            {sections.map((section) => (
              <div key={section.title} className="contents">
                {/* Section title — spans the whole table, its text stays on screen while scrolling */}
                <div className="col-span-full pt-6 pb-2">
                  <h2 className="sticky left-0 w-max text-xs font-semibold uppercase tracking-wide text-opora-brown/70">
                    {section.title}
                  </h2>
                </div>
                {section.rows.map((row) => (
                  <div key={row.label} className="contents">
                    <div
                      className={`col-span-full border-t border-opora-brown/10 pt-3 text-xs text-gray-500 md:col-span-1 md:py-3 md:text-sm ${labelCellClass}`}
                    >
                      <span className="sticky left-0 block w-max max-w-[80vw] md:static md:w-auto md:max-w-none">{row.label}</span>
                    </div>
                    {row.cells.map((cell, i) => (
                      <div
                        key={shown[i].id}
                        className={`break-words pt-1 pb-3 text-sm md:border-t md:border-opora-brown/10 md:pt-3 ${valueCellClass}`}
                      >
                        {cell.content}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {onlyDiff && sections.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-600">Відмінностей немає — варіанти однакові за всіма параметрами.</p>
          )}
        </div>
      </div>

      {gallery.mounted && <FullscreenGallery images={galleryImages} {...gallery.galleryProps} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}
