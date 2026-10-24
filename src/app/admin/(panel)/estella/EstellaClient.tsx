"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, ZoomImg } from "../../ui";
import FolderImportTab from "./FolderImportTab";
import RulesManager from "./RulesManager";
import { listCatalogRules } from "./rulesActions";
import OfferRow from "./OfferRow";
import { useBusyLog } from "./useBusyLog";
import { usePhotosMap } from "./usePhotosMap";
import { useOfferList } from "./useOfferList";
import { useEstellaActions } from "./useEstellaActions";
import type { Filter } from "./estellaTypes";

export default function EstellaClient() {
  const [tab, setTab] = useState<"xml" | "images" | "rules">("xml");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [catalogRules, setCatalogRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Load catalog rules when Rules tab is opened
  useEffect(() => {
    if (tab === "rules" && catalogRules.length === 0 && !loadingRules) {
      setLoadingRules(true);
      listCatalogRules()
        .then((rules) => setCatalogRules(rules))
        .catch((e) => console.error("Failed to load catalog rules:", e))
        .finally(() => setLoadingRules(false));
    }
  }, [tab]);

  const { busy, log, addLog, run } = useBusyLog();
  const { filter, setFilter, search, setSearch, items, counts, fetchNextPage, hasNextPage, isFetching } = useOfferList();
  const [photosMap, setPhotosMap] = usePhotosMap(items);
  const {
    upload,
    promote,
    markUnavailable,
    uploadRowPhotos,
    deleteRowPhoto,
    stagedPhotos,
    stagePhotos,
    removeStagedPhoto,
    attachStagedToSelected,
  } = useEstellaActions({ items, selected, setSelected, setPhotosMap, addLog, run });

  // useCallback so memo(OfferRow) sees a stable onToggle and skips unchanged rows.
  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "Всі", count: counts?.all },
    { key: "available", label: "Наявні", count: counts?.available },
    { key: "unavailable", label: "Немає в наявності", count: counts?.unavailable },
  ];

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab("xml")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "xml" ? "border-opora-brown text-opora-brown" : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          XML імпорт
        </button>
        <button
          onClick={() => setTab("images")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "images" ? "border-opora-brown text-opora-brown" : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Зображення (WordPress)
        </button>
        <button
          onClick={() => setTab("rules")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "rules" ? "border-opora-brown text-opora-brown" : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Правила
        </button>
      </div>

      {/* XML Import Tab — kept mounted (hidden) so switching tabs preserves each tab's state. */}
      <div className={tab === "xml" ? "space-y-6" : "hidden"}>
      {/* Uploads */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Всі товари (estella_all.xml)</span>
            <input
              type="file"
              accept=".xml"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "stage")}
              className="block w-full text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Наявні (estella_DATE.xml)</span>
            <input
              type="file"
              accept=".xml"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "availability")}
              className="block w-full text-sm"
            />
          </label>
        </div>
        {log.length > 0 && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">{log.join("\n")}</pre>
        )}
      </Card>

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => promote("selected")} disabled={busy || selected.size === 0}>
          Додати вибрані ({selected.size})
        </Button>
        <Button variant="ghost" onClick={() => promote("available")} disabled={busy}>
          Додати всі наявні
        </Button>
        <Button variant="ghost" onClick={() => promote("unavailable")} disabled={busy}>
          Додати всі відсутні
        </Button>
        <Button variant="ghost" onClick={() => promote("all")} disabled={busy}>
          Додати всі
        </Button>
        <Button variant="ghost" onClick={markUnavailable} disabled={busy || selected.size === 0}>
          Зняти з наявності ({selected.size})
        </Button>
      </div>

      {/* Batch photo attach: stage photo(s) once, then attach to every checked row below —
          for when one photo (a size/material shot) applies across many colour variants. */}
      <Card className="space-y-2">
        <div className="text-xs font-medium text-gray-600">
          Фото для вибраних рядків — виберіть фото один раз, позначте потрібні рядки чекбоксами нижче, натисніть «Прикріпити».
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              stagePhotos(e.target.files);
              e.target.value = "";
            }}
            className="text-sm"
          />
          <Button onClick={attachStagedToSelected} disabled={busy || !stagedPhotos.length || selected.size === 0}>
            Прикріпити до вибраних ({selected.size})
          </Button>
        </div>
        {stagedPhotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stagedPhotos.map((p, i) => (
              <span key={i} className="relative">
                <ZoomImg src={p.previewUrl} className="h-14 w-14 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => removeStagedPhoto(i)}
                  className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-600 text-[10px] leading-none text-white"
                  aria-label="Прибрати фото"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === t.key ? "bg-opora-brown text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1 opacity-70">({t.count})</span>}
          </button>
        ))}
        <div className="ml-auto w-64">
          <Input placeholder="Пошук за назвою, моделлю, Id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* List */}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="p-3"></th>
              <th className="p-3">Назва</th>
              <th className="p-3">Модель</th>
              <th className="p-3">Id</th>
              <th className="p-3">Ціна</th>
              <th className="p-3">К-сть</th>
              <th className="p-3">Колір</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Фото</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <OfferRow
                key={r.offer_id}
                r={r}
                checked={selected.has(r.offer_id)}
                onToggle={toggle}
                onUploadPhotos={uploadRowPhotos}
                onDeletePhoto={deleteRowPhoto}
                photos={photosMap[r.offer_id] ?? []}
                busy={busy}
              />
            ))}
            {items.length === 0 && !isFetching && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-400">
                  Порожньо. Завантажте estella_all.xml.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex justify-center border-t border-gray-100 p-3">
          {hasNextPage ? (
            <Button variant="ghost" onClick={() => fetchNextPage()} disabled={isFetching}>
              {isFetching ? "Завантаження…" : "Завантажити ще"}
            </Button>
          ) : (
            <span className="text-xs text-gray-400">{isFetching ? "Завантаження…" : `Показано ${items.length}`}</span>
          )}
        </div>
      </Card>
      </div>

      {/* Images Import Tab — kept mounted (hidden) so an in-progress folder import survives tab switches. */}
      <div className={tab === "images" ? "" : "hidden"}>
        <FolderImportTab />
      </div>

      {/* Rules Tab */}
      <div className={tab === "rules" ? "" : "hidden"}>
        {loadingRules ? (
          <Card className="flex items-center justify-center p-6">
            <Badge tone="off">Завантаження…</Badge>
          </Card>
        ) : (
          <RulesManager initialRules={catalogRules} />
        )}
      </div>
    </div>
  );
}
