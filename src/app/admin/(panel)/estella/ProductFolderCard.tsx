"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, ZoomImg } from "../../ui";
import { parseModelSize, SINGLE_BED_MAX_WIDTH } from "@/lib/estella/folderImport";
import { listEstellaNames, listEstellaOffers } from "./folderImportActions";
import { offersFor } from "./folderImportUiHelpers";
import type { UiProduct, UiVariant, SubcategoryOption } from "./folderImportTypes";
import { buildSubcategoryTrees, type SubcategoryNode } from "@/lib/supabase/subcategoryTree";

// A textual "button" for picking files — a native input hidden under a label (add / replace photos).
function PhotoPick({ label, title, onPick }: { label: string; title: string; onPick: (files: FileList | null) => void }) {
  return (
    <label className="cursor-pointer text-gray-400 hover:text-opora-brown" title={title}>
      {label}
      <input
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onPick(e.currentTarget.files);
          e.currentTarget.value = ""; // so that re-picking the same files works too
        }}
      />
    </label>
  );
}

// One product's review/edit form: XML attach + name/catalog/subcategory/price + variants table +
// a footer (commit buttons). Shared by single mode (own Card) and batch mode (embedded in a row).
export function ProductFolderCard({
  product,
  catalogs,
  subcategoryOptions,
  busy,
  onChange,
  footer,
  embedded,
}: {
  product: UiProduct;
  catalogs: string[];
  subcategoryOptions: SubcategoryOption[];
  busy: boolean;
  onChange: (p: Partial<UiProduct>) => void;
  footer: React.ReactNode;
  embedded?: boolean;
}) {
  const attachedName = product.attachedTo;
  const includedCount = product.variants.filter((v) => v.included).length;

  // Lazy thumbnails: eager URL.createObjectURL for every variant froze the browser on big beds
  // (1500+ variations). Create object URLs only when the row's «Показати» is clicked; revoke on unmount.
  const [revealed, setRevealed] = useState<Record<number, string[]>>({});
  const createdUrls = useRef<string[]>([]);
  useEffect(() => () => createdUrls.current.forEach(URL.revokeObjectURL), []);
  const revealPhotos = (i: number, files: File[]) => {
    const urls = files.map((f) => URL.createObjectURL(f));
    createdUrls.current.push(...urls);
    setRevealed((prev) => ({ ...prev, [i]: urls }));
  };
  // Hints for every path level: the children of the node selected on the previous level.
  // We show one row more than is filled in, so the path can be deepened.
  const treeByCatalog = buildSubcategoryTrees(subcategoryOptions);
  const pathLevels: { value: string; suggestions: SubcategoryNode[] }[] = [];
  let levelNodes = treeByCatalog.get(product.catalog) ?? [];
  for (let i = 0; i <= product.subcategoryPath.length; i++) {
    const value = product.subcategoryPath[i] ?? "";
    // The last (empty) row is shown only if there is something to suggest or the path has already been started.
    if (i === product.subcategoryPath.length && levelNodes.length === 0) break;
    pathLevels.push({ value, suggestions: levelNodes });
    levelNodes = levelNodes.find((n) => n.name === value)?.children ?? [];
  }

  // Changing level i truncates the deeper levels — they belonged to another branch.
  const setPathLevel = (i: number, value: string) => {
    const next = product.subcategoryPath.slice(0, i);
    if (value.trim()) next[i] = value;
    onChange({ subcategoryPath: next });
  };

  const catId = `folder-catalogs-${product.productName}`;

  const setVariant = (i: number, v: Partial<UiVariant>) =>
    onChange({ variants: product.variants.map((prev, idx) => (idx === i ? { ...prev, ...v } : prev)) });

  // File order = photo order in the variant (the first one is the main one), so we swap both the files
  // and the already created object URLs, so the thumbnails don't diverge from what goes into the upload.
  const swapPhotos = (i: number, a: number, b: number) => {
    const files = product.variants[i].files.slice();
    if (b < 0 || b >= files.length) return;
    [files[a], files[b]] = [files[b], files[a]];
    setVariant(i, { files });
    setRevealed((prev) => {
      const urls = prev[i]?.slice();
      if (!urls) return prev;
      [urls[a], urls[b]] = [urls[b], urls[a]];
      return { ...prev, [i]: urls };
    });
  };

  // Re-upload: the native file input replaces the photos of THIS variant (old object URLs live until unmount).
  const replacePhotos = (i: number, picked: FileList | null) => {
    if (!picked?.length) return;
    setRevealed(({ [i]: _dropped, ...rest }) => rest);
    setVariant(i, { files: Array.from(picked) });
  };

  const addPhotos = (i: number, picked: FileList | null) => {
    if (!picked?.length) return;
    const added = Array.from(picked);
    setVariant(i, { files: [...product.variants[i].files, ...added] });
    if (!revealed[i]) return; // not revealed yet — the URLs are created on "Показати"
    const urls = added.map((f) => URL.createObjectURL(f));
    createdUrls.current.push(...urls);
    setRevealed((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...urls] }));
  };

  const removePhoto = (i: number, ti: number) => {
    setVariant(i, { files: product.variants[i].files.filter((_, idx) => idx !== ti) });
    const url = revealed[i]?.[ti];
    if (url) URL.revokeObjectURL(url);
    setRevealed((prev) => (prev[i] ? { ...prev, [i]: prev[i].filter((_, idx) => idx !== ti) } : prev));
  };

  // Per-card XML search: debounced over the prefilled attach name (only while not yet attached).
  const [nameMatches, setNameMatches] = useState<string[]>([]);
  useEffect(() => {
    if (product.attachedTo) {
      setNameMatches([]);
      return;
    }
    const q = product.attachName.trim();
    if (!q) {
      setNameMatches([]);
      return;
    }
    const t = setTimeout(() => {
      listEstellaNames(q).then(setNameMatches);
    }, 300);
    return () => clearTimeout(t);
  }, [product.attachName, product.attachedTo]);

  async function attachTo(name: string) {
    const offers = await listEstellaOffers(name);
    onChange({ attachName: name, attachedTo: name, attachOffers: offers });
  }

  const body = (
    <div className="space-y-5">
      {/* XML attach — prefilled with the folder name */}
      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            Прив'язати до товару з XML (estella_offers) — авто-збіг за кольором + матеріалом
          </span>
          {attachedName && (
            <Button variant="ghost" onClick={() => onChange({ attachedTo: null, attachOffers: [] })} disabled={busy}>
              — скасувати прив'язку —
            </Button>
          )}
        </div>
        {attachedName ? (
          <div className="rounded-lg border border-opora-brown/40 bg-opora-brown/5 px-3 py-2 text-sm">
            Прив'язано до: <b>{attachedName}</b> ({product.attachOffers.length} XML-варіацій). Кожен збіг за розміром створить окрему варіацію.
            {product.sizeBand && (
              <>
                {" "}
                Односпальне/двоспальне — окремі товари, тож беремо лише{" "}
                <b>{product.sizeBand === "single" ? `розміри ≤ ${SINGLE_BED_MAX_WIDTH}` : `розміри > ${SINGLE_BED_MAX_WIDTH}`}</b>.
              </>
            )}
          </div>
        ) : (
          <>
            <Input
              value={product.attachName}
              onChange={(e) => onChange({ attachName: e.target.value })}
              placeholder="Пошук товару за назвою (з XML)…"
              className="w-full text-sm"
              disabled={busy}
            />
            {product.attachName.trim() && nameMatches.length > 0 && (
              <div className="flex max-h-48 flex-col gap-1 overflow-auto rounded-lg border border-gray-200 p-2">
                {nameMatches.map((name) => (
                  <button
                    key={name}
                    onClick={() => attachTo(name)}
                    className="rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Product name + catalog + subcatalogs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-600">Назва товару</label>
          <Input value={product.productName} onChange={(e) => onChange({ productName: e.target.value })} className="mt-1 w-full text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Каталог{attachedName ? "" : " *"} (оберіть наявний або впишіть новий)</label>
          <Input
            list={catId}
            value={product.catalog}
            onChange={(e) => onChange({ catalog: e.target.value, subcategoryPath: [] })}
            placeholder="Ліжка, Тумби, Комоди…"
            className="mt-1 w-full text-sm"
          />
          <datalist id={catId}>
            {catalogs.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Ціна товару (₴)</label>
          <Input
            type="number"
            value={product.price}
            onChange={(e) => onChange({ price: e.target.value })}
            placeholder="Успадкується варіаціями без власної ціни (лише нові, не прив'язані)"
            className="mt-1 w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">
            Опція проміжної папки (напр. «Короб»)
          </label>
          <Input
            value={product.extraOptionName}
            onChange={(e) => onChange({ extraOptionName: e.target.value })}
            placeholder="Порожньо → проміжний рівень папок ігнорується"
            className="mt-1 w-full text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">
            Спільні опції для всіх варіацій (напр. «Тип» = «Щит/Масив»). Повтори ту саму назву з різними
            значеннями (напр. «Розмір» = «190см», «Розмір» = «200см») → варіації розмножаться по цих значеннях
          </label>
          <div className="mt-1 space-y-2">
            {product.customOptions.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <Input
                  value={o.name}
                  onChange={(e) =>
                    onChange({ customOptions: product.customOptions.map((p, idx) => (idx === oi ? { ...p, name: e.target.value } : p)) })
                  }
                  placeholder="Назва (напр. «Тип»)"
                  className="w-full text-sm"
                />
                <Input
                  value={o.value}
                  onChange={(e) =>
                    onChange({ customOptions: product.customOptions.map((p, idx) => (idx === oi ? { ...p, value: e.target.value } : p)) })
                  }
                  placeholder="Значення (напр. «Щит/Масив»)"
                  className="w-full text-sm"
                />
                <button
                  type="button"
                  onClick={() => onChange({ customOptions: product.customOptions.filter((_, idx) => idx !== oi) })}
                  className="px-1 text-gray-400 hover:text-red-600"
                  aria-label="Видалити опцію"
                >
                  ✕
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => onChange({ customOptions: [...product.customOptions, { name: "", value: "" }] })}
            >
              + додати опцію
            </Button>
          </div>
        </div>
        {product.catalog &&
          pathLevels.map((level, i) => {
            const listId = `folder-sub-${product.productName}-${i}`;
            return (
              <div key={i}>
                <label className="text-xs font-medium text-gray-600">Підкатегорія рівень {i + 1}</label>
                <Input
                  list={listId}
                  value={level.value}
                  onChange={(e) => setPathLevel(i, e.target.value)}
                  placeholder="Наявна або нова…"
                  className="mt-1 w-full text-sm"
                />
                <datalist id={listId}>
                  {level.suggestions.map((o) => (
                    <option key={o.id} value={o.name} />
                  ))}
                </datalist>
              </div>
            );
          })}
      </div>

      {/* Variations */}
      <div>
        <div className="mb-2 text-sm font-medium">Варіації ({includedCount}/{product.variants.length} обрано)</div>
        <table className="w-full text-xs">
          <thead className="border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="py-2 pr-2">✓</th>
              <th className="py-2 pr-2">Матеріал</th>
              {product.extraOptionName.trim() && <th className="py-2 pr-2">{product.extraOptionName.trim()}</th>}
              <th className="py-2 pr-2">Колір</th>
              {attachedName && <th className="py-2 pr-2">XML-збіги (розміри)</th>}
              <th className="py-2 pr-2">Ціна (₴)</th>
              <th className="py-2">Фото (перше — головне)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {product.variants.map((v, i) => {
              const matches = offersFor(product, v);
              const sizes = [...new Set(matches.map((o) => parseModelSize(o.model) ?? "?"))];
              return (
                <tr key={v.sku}>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-opora-brown"
                      checked={v.included}
                      onChange={(e) => setVariant(i, { included: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      value={v.materialValue}
                      onChange={(e) => setVariant(i, { materialValue: e.target.value })}
                      className="w-full text-xs"
                    />
                  </td>
                  {product.extraOptionName.trim() && (
                    <td className="py-2 pr-2">
                      <Input
                        value={v.breadcrumb}
                        onChange={(e) => setVariant(i, { breadcrumb: e.target.value })}
                        className="w-full text-xs"
                      />
                    </td>
                  )}
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-1">
                      {v.colors.map((c, ci) => (
                        <span key={ci} className="inline-flex items-center gap-1">
                          <input
                            type="color"
                            value={c.hex}
                            onChange={(e) =>
                              setVariant(i, { colors: v.colors.map((p, idx) => (idx === ci ? { ...p, hex: e.target.value } : p)) })
                            }
                            className="h-6 w-6 shrink-0 cursor-pointer rounded border border-gray-300 p-0"
                          />
                          <Input
                            value={c.name}
                            onChange={(e) =>
                              setVariant(i, { colors: v.colors.map((p, idx) => (idx === ci ? { ...p, name: e.target.value } : p)) })
                            }
                            className="w-28 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setVariant(i, { colors: v.colors.filter((_, idx) => idx !== ci) })}
                            className="px-1 text-gray-400 hover:text-red-600"
                            aria-label="Видалити колір"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      {v.colors.length === 0 && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  {attachedName && (
                    <td className="py-2 pr-2">
                      {matches.length ? (
                        <span className="text-gray-700">
                          <b>{matches.length}×</b> {sizes.join(", ")}
                        </span>
                      ) : (
                        <span className="text-amber-700">нова варіація</span>
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-2">
                    {matches.length ? (
                      // Attached: XML has per-size prices but no каркас/матрац/постіль split. Show the
                      // XML price as a hint; an override here replaces it on ALL sizes of this variant
                      // (manual packaging pricing). Empty → keep XML per-size prices.
                      <div className="flex flex-col gap-0.5">
                        <Input
                          type="number"
                          value={v.price}
                          onChange={(e) => setVariant(i, { price: e.target.value })}
                          placeholder={
                            [...new Set(matches.map((o) => o.price).filter((p): p is number => p != null))]
                              .map((p) => `₴${p}`)
                              .join(", ") || "XML"
                          }
                          className="w-24 text-xs"
                        />
                        <span className="text-gray-400">XML: {[...new Set(matches.map((o) => o.price).filter((p): p is number => p != null))].map((p) => `₴${p}`).join(", ") || "—"}</span>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        value={v.price}
                        onChange={(e) => setVariant(i, { price: e.target.value })}
                        placeholder={product.price ? product.price : "Ціну уточнюйте"}
                        className="w-24 text-xs"
                      />
                    )}
                  </td>
                  <td className="py-2">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {(revealed[i] ?? []).map((url, ti) => (
                        <span key={ti} className="inline-flex flex-col items-center">
                          <ZoomImg src={url} className="h-8 w-8 rounded object-cover" />
                          <span className="inline-flex">
                            <button
                              type="button"
                              onClick={() => swapPhotos(i, ti, ti - 1)}
                              disabled={ti === 0}
                              className="px-0.5 text-gray-400 hover:text-opora-brown disabled:opacity-30"
                              aria-label={`Перемістити фото ${ti + 1} лівіше`}
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              onClick={() => swapPhotos(i, ti, ti + 1)}
                              disabled={ti === v.files.length - 1}
                              className="px-0.5 text-gray-400 hover:text-opora-brown disabled:opacity-30"
                              aria-label={`Перемістити фото ${ti + 1} правіше`}
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              onClick={() => removePhoto(i, ti)}
                              className="px-0.5 text-gray-400 hover:text-red-600"
                              aria-label={`Видалити фото ${ti + 1}`}
                            >
                              ✕
                            </button>
                          </span>
                        </span>
                      ))}
                      {v.files.length > 0 && !revealed[i] && (
                        <Button variant="ghost" onClick={() => revealPhotos(i, v.files)} className="text-xs">
                          Показати
                        </Button>
                      )}
                      <span className="ml-1 text-gray-500">{v.files.length} шт</span>
                      <PhotoPick label="додати" title="Додати фото до цієї варіації" onPick={(f) => addPhotos(i, f)} />
                      <PhotoPick label="замінити" title="Замінити всі фото цієї варіації" onPick={(f) => replacePhotos(i, f)} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {product.unassignedCount > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {product.unassignedCount} фото не в папці Матеріалу — пропущені.
          </p>
        )}
      </div>

      {footer}
    </div>
  );

  return embedded ? body : <Card>{body}</Card>;
}
