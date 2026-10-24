"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "../../ui";
import { dedupProductImages } from "./imageDedupActions";

type ProductRef = { id: string; model: string };

export default function ImageDedupClient({ products }: { products: ProductRef[] }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [totals, setTotals] = useState({ products: 0, deletedFiles: 0, variantsLinked: 0 });
  const [pick, setPick] = useState(""); // empty → all products; otherwise the model of the selected product

  const addLog = (line: string) => setLog((prev) => [...prev, line]);

  // An empty pick → all of them; otherwise only the product with this model (as typed in the field).
  const selected = pick.trim() ? products.filter((p) => p.model === pick.trim()) : products;

  async function run() {
    setBusy(true);
    setDone(false);
    setLog([]);
    setTotals({ products: 0, deletedFiles: 0, variantsLinked: 0 });
    let deletedFiles = 0;
    let variantsLinked = 0;
    let processed = 0;
    addLog(`Старт: ${selected.length} товарів`);
    try {
      for (const p of selected) {
        try {
          const res = await dedupProductImages(p.id);
          res.log.forEach(addLog);
          deletedFiles += res.deletedFiles;
          variantsLinked += res.variantsLinked;
          processed++;
          setTotals({ products: processed, deletedFiles, variantsLinked });
        } catch (err) {
          addLog(`❌ ${p.model}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      addLog(`— Готово — товарів: ${processed}, видалено файлів: ${deletedFiles}, зв'язано варіацій: ${variantsLinked}`);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <Input
          list="dedup-products"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          placeholder="Усі товари (або оберіть один)…"
          className="w-72 text-sm"
          disabled={busy}
        />
        <datalist id="dedup-products">
          {products.map((p) => (
            <option key={p.id} value={p.model} />
          ))}
        </datalist>
        <Button onClick={run} disabled={busy || selected.length === 0}>
          {busy ? "Обробка…" : `Запустити (${selected.length} товарів)`}
        </Button>
        {busy && <Badge tone="neutral">Оброблено: {totals.products}/{selected.length}</Badge>}
        {done && <Badge tone="ok">Готово</Badge>}
      </Card>

      {log.length > 0 && (
        <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">{log.join("\n")}</pre>
      )}

      {(busy || done) && (
        <Card className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-gray-500">Товарів оброблено</div>
            <div className="text-lg font-semibold">{totals.products}</div>
          </div>
          <div>
            <div className="text-gray-500">Файлів видалено з R2</div>
            <div className="text-lg font-semibold">{totals.deletedFiles}</div>
          </div>
          <div>
            <div className="text-gray-500">Варіацій зв'язано</div>
            <div className="text-lg font-semibold">{totals.variantsLinked}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
