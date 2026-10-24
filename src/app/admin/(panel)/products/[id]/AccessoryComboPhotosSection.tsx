"use client";

import { memo, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Button, Card, ZoomImg } from "../../../ui";
import { imageGroupKey, isVisualOption } from "@/lib/supabase/imageGroups";
import { enumerateCombos } from "@/lib/accessoryCombo";
import { parseBedCombos, resolveComboForConfig } from "@/lib/estella/folderImport";
import { BOOL_NO, BOOL_YES } from "@/lib/constants";
import { isHexColor, optKind } from "@/app/catalog/[slug]/components/types";
import { deleteComboPhotos, setAccessoryComboAxis } from "../../../actions";
import type { ComboPhotoRow, Opt, ProductAccessoryRow, ProductListItem, Variant } from "./productEditorTypes";

// Bed photos for upgrade combinations (drawers / safety rails). One set per
// (product photo group × accessory option combination) — that is what replaces the gallery on the site
// when the customer picks this combination. The accessory colour is not part of the combination.
const AccessoryComboPhotosSection = memo(function AccessoryComboPhotosSection({
  productId,
  links,
  variants,
  options,
  comboPhotos,
  allProducts,
}: {
  productId: string;
  links: ProductAccessoryRow[];
  variants: Variant[];
  options: Opt[];
  comboPhotos: ComboPhotoRow[];
  allProducts: ProductListItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const optById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const modelById = useMemo(() => new Map(allProducts.map((p) => [p.id, p.model])), [allProducts]);

  // Photo groups of the bed itself: Матеріал+Колір (size/lamels don't change the photos).
  const groups = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const v of variants) {
      const names = (v.variant_options ?? [])
        .map((vo) => optById.get(vo.option_id)?.name)
        .filter(Boolean) as string[];
      const key = imageGroupKey(names);
      // The label lists visual options only: the key ignores size/lamels, so a full list would show
      // a random size and look like different groups sharing one key.
      if (!byKey.has(key)) byKey.set(key, names.filter(isVisualOption).join(" · ") || "Базова");
    }
    return [...byKey].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, "uk"));
  }, [variants, optById]);

  // All non-hex options of every accessory, grouped by axis. The importer looks for the value across ALL axes
  // and works out on its own which one is the upgrade axis ("Короб" for Шухляда, "Розмір" for Планка безпеки) — on
  // real data no folder name matches two axes at once, so the guess is unambiguous.
  const accessories = useMemo(
    () =>
      links.map((link) => {
        const byAxis = new Map<string, Set<string>>();
        for (const v of link.accessory?.variants ?? []) {
          for (const o of v.variant_options ?? []) {
            if (!o.options?.value || isHexColor(o.options.value)) continue;
            const axis = optKind({ name: o.options.name, value: o.options.value });
            if (!byAxis.has(axis)) byAxis.set(axis, new Set());
            byAxis.get(axis)!.add(o.options.value);
          }
        }
        return {
          accessoryProductId: link.accessory_product_id,
          label: modelById.get(link.accessory_product_id) ?? "Аксесуар",
          maxQty: Math.max(1, link.max_qty ?? 1),
          comboAxis: link.accessory?.combo_axis ?? null,
          byAxis,
        };
      }),
    [links, modelById]
  );

  // The manual combination grid only works with an already known axis (the import sets it).
  const accessoryAxes = useMemo(
    () =>
      accessories.flatMap((a) => {
        const values = a.comboAxis ? [...(a.byAxis.get(a.comboAxis) ?? [])] : [];
        return values.length
          ? [{ accessoryProductId: a.accessoryProductId, label: a.label, values, maxQty: a.maxQty }]
          : [];
      }),
    [accessories]
  );
  const axisless = accessories.filter((a) => !a.comboAxis);
  const combos = useMemo(() => enumerateCombos(accessoryAxes), [accessoryAxes]);

  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? "");
  const group = groups.find((g) => g.key === groupKey);
  const [comboModalOpen, setComboModalOpen] = useState(false);

  const photosByCombo = useMemo(() => {
    const map = new Map<string, ComboPhotoRow>();
    for (const c of comboPhotos) if (c.image_group_key === groupKey) map.set(c.combo_key, c);
    return map;
  }, [comboPhotos, groupKey]);

  async function upload(comboKey: string, label: string, files: FileList | null) {
    if (!files?.length || !group) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("file", f));
    fd.append("productId", productId);
    fd.append("imageGroupKey", groupKey);
    fd.append("comboKey", comboKey);
    fd.append("label", `${group.label} — ${label}`);
    await fetch("/api/products/media/accessory-combo", { method: "POST", body: fd });
    setBusy(false);
    router.refresh();
  }

  // ── Bulk import from a folder ────────────────────────────────────────────────
  // The BEDS folder holds ~2300 upgrade photo sets; by hand that is unrealistic. We parse the same
  // layout as the bed importer, only we take EXACTLY the config folders it skips.
  const knownGroupKeys = useMemo(() => new Set(groups.map((g) => g.key)), [groups]);

  // Parsing of the upgrade folder name lives in folderImport.ts (a pure function, covered by a check).
  const resolveCombo = (config: string) => resolveComboForConfig(config, accessories);

  async function importFolder(fileList: FileList | null) {
    if (!fileList?.length) return;
    const parsed = parseBedCombos(fileList, BOOL_YES, BOOL_NO);
    const jobs: { comboKeys: string[]; label: string; groupKey: string; files: File[] }[] = [];
    const skipped = { config: new Set<string>(), group: 0, model: new Set<string>() };
    const detectedAxes = new Map<string, string>(); // accessoryProductId → the detected axis

    for (const g of parsed) {
      const groupKey = imageGroupKey(g.groupOptionNames);
      // The folder may hold several models (the whole of BEDS) — we take only THIS product's groups.
      if (!knownGroupKeys.has(groupKey)) {
        skipped.group++;
        skipped.model.add(g.baseModel);
        continue;
      }
      const combo = resolveCombo(g.config);
      if (!combo) {
        skipped.config.add(g.config);
        continue;
      }
      for (const [accId, axis] of combo.axes) detectedAxes.set(accId, axis);
      jobs.push({ comboKeys: combo.comboKeys, label: combo.label, groupKey, files: g.files });
    }

    // Axes the accessory product doesn't have yet — those are the ones we write after the upload.
    const axesToSave = [...detectedAxes].filter(
      ([accId, axis]) => accessories.find((a) => a.accessoryProductId === accId)?.comboAxis !== axis
    );

    const report = [
      `Знайдено ${parsed.length} наборів, до цього товару підходить ${jobs.length}.`,
      skipped.group ? `Інші моделі/групи: ${skipped.group} (${[...skipped.model].join(", ")}).` : "",
      skipped.config.size ? `Не розпізнано апгрейди: ${[...skipped.config].join(" | ")}.` : "",
      axesToSave.length
        ? `Вісь апгрейду визначено автоматично: ${axesToSave
            .map(([accId, axis]) => `${modelById.get(accId) ?? "аксесуар"} → «${axis}»`)
            .join(", ")}.`
        : "",
      jobs.length ? `Завантажити ${jobs.reduce((n, j) => n + j.files.length, 0)} фото?` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!jobs.length || !confirm(report)) {
      setLog(report);
      return;
    }

    setBusy(true);
    // We write the axis BEFORE the upload: that is one tiny request, while the upload is long (Аммі has 352
    // sets). If it is interrupted halfway, the already uploaded photos still work — without the axis
    // the site couldn't match a single set.
    for (const [accId, axis] of axesToSave) await setAccessoryComboAxis(accId, axis);

    let done = 0;
    let failed = 0;
    // ponytail: 4 parallel uploads — same as in commitOneProduct, so we don't run into the Worker limits.
    const CONCURRENCY = 4;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          const fd = new FormData();
          for (const file of job.files) fd.append("file", file);
          fd.append("productId", productId);
          fd.append("imageGroupKey", job.groupKey);
          fd.append("comboKeys", JSON.stringify(job.comboKeys));
          fd.append("label", job.label);
          const res = await fetch("/api/products/media/accessory-combo", { method: "POST", body: fd });
          if (!res.ok) failed++;
          done++;
          setLog(`Завантажено ${done}/${jobs.length} наборів${failed ? `, помилок: ${failed}` : ""}…`);
        }
      })
    );
    setBusy(false);
    setLog(
      `✓ Готово: ${done - failed}/${jobs.length} наборів${failed ? `, помилок: ${failed}` : ""}` +
        (axesToSave.length ? `. Вісь апгрейду збережено.` : "")
    );
    router.refresh();
  }

  // Delete a whole set (or all the product's sets). Also needed before a repeated import: the R2 keys
  // contain Date.now(), so a second import ADDS copies of the photos instead of replacing them.
  async function removeSets(comboPhotoId?: string) {
    const what = comboPhotoId
      ? "Видалити всі фото цього набору?"
      : `Видалити ВСІ набори фото комбінацій цього товару (${comboPhotos.length})? Фото зникнуть із R2.`;
    if (!confirm(what)) return;
    setBusy(true);
    try {
      const n = await deleteComboPhotos(productId, comboPhotoId);
      setLog(`✓ Видалено наборів: ${n}`);
    } catch (e) {
      setLog(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
    router.refresh();
  }

  async function removePhoto(imageId: string) {
    if (!confirm("Видалити фото?")) return;
    setBusy(true);
    await fetch("/api/products/media/accessory-combo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    setBusy(false);
    router.refresh();
  }

  if (!links.length) return null;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Фото комбінацій аксесуарів</h2>
          <p className="text-xs text-gray-500">
            Фото ліжка з встановленим апгрейдом. Замінюють галерею, коли покупець обирає цю комбінацію.
          </p>
        </div>
        {comboPhotos.length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => removeSets()}>
            Видалити всі ({comboPhotos.length})
          </Button>
        )}
      </div>

      {axisless.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Ще не відомо, яка опція цих аксесуарів змінює фото:{" "}
          {axisless.map((a) => a.label).join(", ")}. Імпорт із теки визначить і запише її сам —
          ручна сітка комбінацій нижче з'явиться після нього.
        </p>
      )}

      {/* Bulk import: one model folder (or the whole of BEDS) → all upgrade sets at once.
          The upgrade folders the bed importer skips are exactly the ones needed here. */}
      <div className="rounded-lg border border-dashed border-gray-300 p-3">
        <label className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="font-medium">Імпорт із теки</span>
          <input
            type="file"
            // @ts-expect-error — webkitdirectory is not typed in React
            webkitdirectory=""
            directory=""
            multiple
            disabled={busy}
            onChange={(e) => importFolder(e.target.files)}
            className="text-xs"
          />
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Оберіть теку моделі (напр. BEDS/Аммі Плюс). Набори розкладаються за матеріалом і кольором
          автоматично; чужі моделі й нерозпізнані апгрейди пропускаються зі звітом.
        </p>
        {log && <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{log}</pre>}
      </div>

      <label className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        Група фото товару
        <select
          value={groupKey}
          onChange={(e) => setGroupKey(e.target.value)}
          className="min-w-64 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" disabled={!group} onClick={() => setComboModalOpen(true)}>
          Комбінації ({photosByCombo.size}/{combos.length})
        </Button>
      </label>
      {busy && <span className="text-xs text-gray-500">Завантаження...</span>}

      <Dialog.Root open={comboModalOpen} onOpenChange={setComboModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-opora-white p-6 text-opora-brown shadow-xl focus:outline-none"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <Dialog.Title className="text-xl font-medium tracking-wide">Комбінації: {group?.label}</Dialog.Title>
              <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
                ×
              </Dialog.Close>
            </div>
            <div className="space-y-3">
              {combos.map((combo) => {
                const row = photosByCombo.get(combo.comboKey);
                const photos = (row?.accessory_combo_images ?? [])
                  .filter((r) => r.images)
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((r) => r.images!);
                return (
                  <div key={combo.comboKey} className="rounded-lg bg-gray-50 p-3">
                    <span className="text-sm font-medium">{combo.label}</span>
                    {photos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {photos.map((p) => (
                          <div key={p.id} className="relative">
                            <ZoomImg src={p.url} className="h-16 w-16 rounded object-cover" />
                            <button
                              onClick={() => removePhoto(p.id)}
                              className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-white text-xs shadow"
                              aria-label="Видалити фото"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={busy}
                        onChange={(e) => upload(combo.comboKey, combo.label, e.target.files)}
                        className="text-xs"
                      />
                      {row && (
                        <Button variant="ghost" disabled={busy} onClick={() => removeSets(row.id)}>
                          Видалити всі {photos.length} фото
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  );
});

export default AccessoryComboPhotosSection;
