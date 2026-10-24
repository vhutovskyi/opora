"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Button, Card } from "../../ui";

// Filename → table key. Order matters (specific before generic).
// ponytail: match by substring in the Airtable export filename; skip Запити (PII) + Фільтри Каталогу.
function tableForFile(raw: string): string | null {
  // macOS file picker returns NFD-decomposed filenames (ї → і+◌̈, й → и+◌̆); normalize to NFC to match.
  const name = raw.normalize("NFC");
  if (name.includes("Товари_Характеристики") || name.includes("Товари/Характеристики")) return "productSpecs";
  if (name.includes("Найпопулярніші")) return "topProducts";
  if (name.includes("Фільтри Опцій")) return "optionFilters";
  if (name.includes("Фільтри Каталогу")) return null;
  if (name.includes("Варіації")) return "variants";
  if (name.includes("Опції")) return "options";
  if (name.includes("Характеристики")) return "specs";
  if (name.includes("Банери")) return "banners";
  if (name.includes("Коментарі")) return "comments";
  if (name.includes("Запити")) return null;
  if (name.includes("Товари")) return "products";
  return null;
}

// Parse a File as UTF-8 CSV → data rows (header + blank rows stripped). BOM handled by FileReader/text().
function parseCsv(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const rows = res.data as string[][];
        if (rows.length) rows[0][0] = rows[0][0].replace(/^﻿/, ""); // strip BOM on first header cell
        resolve(rows.slice(1)); // drop header row
      },
      error: reject,
    });
  });
}

export default function ImportPanel() {
  const [files, setFiles] = useState<{ file: File; table: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function onSelect(selected: FileList | null) {
    if (!selected) return;
    const matched = Array.from(selected)
      .map((file) => ({ file, table: tableForFile(file.name) }))
      .filter((m): m is { file: File; table: string } => m.table !== null);
    setFiles(matched);
    setLog(
      Array.from(selected).map((f) => {
        const t = tableForFile(f.name);
        return t ? `✓ ${f.name} → ${t}` : `– ${f.name} (пропущено)`;
      })
    );
  }

  async function runImport() {
    setBusy(true);
    try {
      const tables: Record<string, string[][]> = {};
      for (const { file, table } of files) tables[table] = await parseCsv(file);

      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables }),
      });
      const json = (await res.json()) as { error?: string; counts?: Record<string, number> };
      if (!res.ok) throw new Error(json.error || "Помилка імпорту");
      setLog((prev) => [
        ...prev,
        "— Готово —",
        ...Object.entries(json.counts ?? {}).map(([k, v]) => `${k}: ${v}`),
      ]);
    } catch (e) {
      setLog((prev) => [...prev, `❌ ${(e as Error).message}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-opora-brown">Імпорт CSV</h1>
      <p className="mb-4 text-sm text-gray-500">
        Одноразовий імпорт експорту з Airtable. Виберіть усі .csv-файли одразу — таблиця визначається за назвою файлу.
        Запускайте лише проти порожньої бази. «Запити» та «Фільтри Каталогу» пропускаються.
      </p>

      <Card>
        <input type="file" accept=".csv" multiple onChange={(e) => onSelect(e.target.files)} className="mb-4 block text-sm" />
        <Button onClick={runImport} disabled={busy || files.length === 0}>
          {busy ? "Імпорт..." : `Імпортувати (${files.length} файлів)`}
        </Button>

        {log.length > 0 && (
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">
            {log.join("\n")}
          </pre>
        )}
      </Card>
    </div>
  );
}
