"use client";

import { useState } from "react";
import { Button, Card, Checkbox } from "../../ui";
import { TABLE_PRODUCTS, UNRESOLVED } from "@/lib/importer/tablesData";

// A one-off import of the Romax table catalog. Details — TABLES_IMPORT.md.
// Every product is a separate request (like the Estella promotion): a full import is 2208 uploads to R2,
// in one request it would time out, and this way the progress is visible and a single product can be imported.
export default function TablesPanel() {
  const [busy, setBusy] = useState("");
  const [skipPhotos, setSkipPhotos] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState<Record<string, "ok" | "skip" | "fail">>({});

  async function importOne(model: string) {
    const res = await fetch("/api/admin/import-tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ only: [model], skipPhotos }),
    });
    const json = (await res.json()) as {
      error?: string;
      created?: { variants: number; photos: number }[];
      skipped?: { reason: string }[];
      errors?: { error: string }[];
    };
    if (!res.ok) throw new Error(json.error || "Помилка імпорту");

    const created = json.created?.[0];
    const failed = json.errors?.[0];
    const skipped = json.skipped?.[0];
    setDone((d) => ({ ...d, [model]: failed ? "fail" : skipped ? "skip" : "ok" }));
    setLog((l) => [
      ...l,
      failed
        ? `❌ ${model} — ${failed.error}`
        : skipped
          ? `– ${model} (${skipped.reason})`
          : `✓ ${model} — ${created?.variants ?? 0} варіацій, ${created?.photos ?? 0} фото`,
    ]);
    return created ?? { variants: 0, photos: 0 };
  }

  async function run(models: string[], label: string) {
    setBusy(label);
    if (models.length > 1) setLog([]);
    let variants = 0, photos = 0;
    try {
      for (const model of models) {
        const r = await importOne(model);
        variants += r.variants;
        photos += r.photos;
      }
      if (models.length > 1) setLog((l) => [...l, "— Готово —", `Разом: ${variants} варіацій, ${photos} фото`]);
    } catch (e) {
      setLog((l) => [...l, `❌ ${(e as Error).message}`]);
    } finally {
      setBusy("");
    }
  }

  const mark = { ok: "✓", skip: "–", fail: "❌" } as const;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-opora-brown">Столи Romax</h1>
      <p className="mb-4 text-sm text-gray-500">
        Разовий імпорт {TABLE_PRODUCTS.length} товарів із фото з теки <code>~/Downloads/TABLES</code>.
        Працює лише локально (<code>npm run dev</code>) — фото читаються з диска. Товар, який уже є в базі,
        пропускається, тож перерваний імпорт можна просто запустити ще раз.
      </p>

      <Card>
        <Checkbox
          checked={skipPhotos}
          onChange={(e) => setSkipPhotos(e.target.checked)}
          label="Без фото (швидка перевірка: лише товари, варіації та характеристики)"
        />
        <div className="mt-4">
          <Button onClick={() => run(TABLE_PRODUCTS.map((p) => p.model), "all")} disabled={!!busy}>
            {busy === "all" ? "Імпорт усіх…" : `Імпортувати всі (${TABLE_PRODUCTS.length})`}
          </Button>
        </div>

        <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
          {TABLE_PRODUCTS.map((p) => {
            const variants = p.kinds.reduce((n, k) => n + k.sizes.length, 0) * 33;
            return (
              <li key={p.model} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-4 text-gray-400">{done[p.model] ? mark[done[p.model]] : ""}</span>
                <span className="flex-1">
                  {p.model}
                  <span className="ml-2 text-xs text-gray-400">
                    {p.kinds.map((k) => k.type).join(" + ")} · до {variants} варіацій
                  </span>
                </span>
                <Button onClick={() => run([p.model], p.model)} disabled={!!busy}>
                  {busy === p.model ? "…" : "Імпортувати"}
                </Button>
              </li>
            );
          })}
        </ul>

        {log.length > 0 && (
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">
            {log.join("\n")}
          </pre>
        )}
      </Card>

      <h2 className="mt-8 mb-2 text-lg font-semibold text-opora-brown">Після імпорту — вручну</h2>
      <ul className="mb-6 list-disc pl-5 text-sm text-gray-600">
        <li>
          Hex-коди кольорів проставляються автоматично — виміряні з рендерів. За потреби підправте
          їх у розділі «Фільтри та Топ»; повторний імпорт їх не перезапише.
        </li>
        <li>Перевірити блоки фото з низькою впевненістю — перелік у <code>TABLES_IMPORT.md</code>.</li>
      </ul>

      <h2 className="mb-2 text-lg font-semibold text-opora-brown">Не імпортується — бракує даних</h2>
      <ul className="list-disc pl-5 text-sm text-gray-600">
        {UNRESOLVED.map((u) => (
          <li key={u.what}>
            <b>{u.what}</b> — {u.missing}
          </li>
        ))}
      </ul>
    </div>
  );
}
