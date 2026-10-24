import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getVariantIdsBySku, getVariantPhotosBySku, setInStockBySku, type OfferPhoto } from "./folderImportActions";
import { parseOffers, postEstella, STAGE_BATCH } from "./estellaApi";
import type { Row } from "./estellaTypes";

// Every mutating action on the XML tab: staging uploads, promote, availability, and the
// three ways to attach photos (per-row, batch-to-selected). Shares one busy/log/qc wiring
// (from useBusyLog) so each action body only has to describe its own steps.
export function useEstellaActions({
  items,
  selected,
  setSelected,
  setPhotosMap,
  addLog,
  run,
}: {
  items: Row[];
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setPhotosMap: Dispatch<SetStateAction<Record<string, OfferPhoto[]>>>;
  addLog: (line: string) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["estella"] });

  const upload = (file: File, action: "stage" | "availability") =>
    run(async () => {
      addLog(`Читаю ${file.name}…`);
      const offers = parseOffers(await file.text());
      addLog(`Розібрано ${offers.length} офферів.`);
      for (let i = 0; i < offers.length; i += STAGE_BATCH) {
        const chunk = offers.slice(i, i + STAGE_BATCH);
        const body =
          action === "stage"
            ? { action, offers: chunk, reset: i === 0 }
            : {
                action,
                reset: i === 0,
                offers: chunk.map((o) => ({ offer_id: o.offer_id, price: o.price, quantity: o.quantity })),
              };
        await postEstella(body);
        addLog(`  ${action === "stage" ? "збережено" : "позначено наявними"} ${Math.min(i + STAGE_BATCH, offers.length)}/${offers.length}`);
      }
      addLog("— Готово —");
      invalidate();
    });

  const promote = (scope: "selected" | "available" | "unavailable" | "all") =>
    run(async () => {
      const total = { products: 0, variants: 0, options: 0, variant_specs: 0 };
      const ids = scope === "selected" ? [...selected] : undefined;
      addLog(`Додаю (${scope})…`);
      let done = false;
      while (!done) {
        const res = await postEstella({ action: "promote", scope, ids });
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += res.counts?.[k] ?? 0;
        done = res.done ?? true;
      }
      addLog(`Готово: +${total.products} товарів, +${total.variants} варіацій, +${total.variant_specs} характеристик`);
      setSelected(new Set());
      invalidate();
    });

  // Mark selected variations out of stock.
  const markUnavailable = () =>
    run(async () => {
      addLog(`Знімаю з наявності ${selected.size} варіацій…`);
      const n = await setInStockBySku([...selected], false);
      addLog(`Готово: оновлено ${n} варіацій`);
      setSelected(new Set());
      invalidate();
    });

  // Upload photo(s) straight onto one XML variation. Promotes the offer first if needed
  // (so its variant exists), then attaches photos to THAT variant only (exact=true → no
  // Матеріал+Колір sibling propagation, since accessories share a colour).
  const uploadRowPhotos = useCallback(
    (offerId: string, imported: boolean, files: File[]) =>
      run(async () => {
        addLog(`Фото для ${offerId}…`);
        if (!imported) {
          let done = false;
          while (!done) {
            const res = await postEstella({ action: "promote", scope: "selected", ids: [offerId] });
            done = res.done ?? true;
          }
        }
        const map = await getVariantIdsBySku([offerId]);
        const variantId = map[offerId];
        if (!variantId) throw new Error("Варіацію не знайдено (не промоутнуто?)");
        const fd = new FormData();
        for (const f of Array.from(files)) fd.append("file", f);
        fd.append("variationId", variantId);
        fd.append("exact", "true");
        const res = await fetch("/api/products/media/images", { method: "POST", body: fd });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || `HTTP ${res.status}`);
        addLog(`  ✓ ${offerId}: ${files.length} фото`);
        const photos = await getVariantPhotosBySku([offerId]);
        setPhotosMap((prev) => ({ ...prev, ...photos }));
        invalidate();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run]
  );

  // Remove one photo (shared-group delete on the backend; harmless here since exact-mode
  // uploads never link to siblings, so it only ever affects this one variant).
  const deleteRowPhoto = useCallback(async (offerId: string, imageId: string) => {
    setPhotosMap((prev) => ({ ...prev, [offerId]: (prev[offerId] ?? []).filter((p) => p.imageId !== imageId) }));
    await fetch("/api/products/media/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Batch: stage photos once, attach the SAME photo(s) to every checked row (a size/material
  // photo is usually shared across a dozen colour variants — one row-by-row upload each would
  // mean re-picking the same file N times). previewUrl created once per file (not inline in
  // JSX) and revoked on removal/unmount — otherwise every re-render would leak one.
  const [stagedPhotos, setStagedPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const stagePhotos = (files: FileList | null) => {
    if (!files?.length) {
      addLog("⚠ Файл не обрано (діалог скасовано?)");
      return;
    }
    const added = Array.from(files).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setStagedPhotos((prev) => [...prev, ...added]);
    addLog(`Додано у кошик: ${added.length} фото (${added.map((a) => a.file.name).join(", ")})`);
  };
  const removeStagedPhoto = (i: number) =>
    setStagedPhotos((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  useEffect(() => () => stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const attachStagedToSelected = () => {
    if (!stagedPhotos.length || selected.size === 0) return Promise.resolve();
    return run(async () => {
      const ids = [...selected];
      const unpromoted = ids.filter((id) => !items.find((r) => r.offer_id === id)?.imported);
      if (unpromoted.length) {
        addLog(`Промоушу ${unpromoted.length} офферів…`);
        let done = false;
        while (!done) {
          const res = await postEstella({ action: "promote", scope: "selected", ids: unpromoted });
          done = res.done ?? true;
        }
      }
      const map = await getVariantIdsBySku(ids);
      const variantIds = ids.map((id) => map[id]).filter(Boolean);
      if (!variantIds.length) throw new Error("Жодної варіації не знайдено (не промоутнуто?)");

      addLog(`Прикріплюю ${stagedPhotos.length} фото до ${variantIds.length} варіацій…`);
      const fd = new FormData();
      for (const p of stagedPhotos) fd.append("file", p.file);
      fd.append("variationIds", JSON.stringify(variantIds));
      const res = await fetch("/api/products/media/images", { method: "POST", body: fd });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || `HTTP ${res.status}`);
      addLog(`✓ Готово`);

      const photos = await getVariantPhotosBySku(ids);
      setPhotosMap((prev) => ({ ...prev, ...photos }));
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setStagedPhotos([]);
      setSelected(new Set());
      invalidate();
    });
  };

  return {
    upload,
    promote,
    markUnavailable,
    uploadRowPhotos,
    deleteRowPhoto,
    stagedPhotos,
    stagePhotos,
    removeStagedPhoto,
    attachStagedToSelected,
  };
}
