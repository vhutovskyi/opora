"use client";

import { memo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "../../../ui";
import { setVariantSpecs } from "../../../actions";
import type { Spec } from "./productEditorTypes";

const SpecsSection = memo(function SpecsSection({
  variantId,
  specs,
  current,
}: {
  variantId: string;
  specs: Spec[];
  current: { spec_id: string; value: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(current);
  const [busy, start] = useTransition();

  // Row order = display order on the product page (persisted as legacy_num by index).
  function move(i: number, dir: "up" | "down") {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }

  function save() {
    start(async () => {
      await setVariantSpecs(
        variantId,
        rows.filter((r) => r.spec_id)
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-600">Характеристики</span>
        <Button variant="ghost" onClick={() => setRows([...rows, { spec_id: "", value: "" }])}>
          + Рядок
        </Button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <select
            value={r.spec_id}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, spec_id: e.target.value } : x)))}
            className="w-1/2 rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">— характеристика —</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Input
            value={r.value}
            placeholder="Значення"
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          <Button variant="ghost" onClick={() => move(i, "up")} disabled={i === 0} aria-label="Вгору">
            ↑
          </Button>
          <Button variant="ghost" onClick={() => move(i, "down")} disabled={i === rows.length - 1} aria-label="Вниз">
            ↓
          </Button>
          <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ×
          </Button>
        </div>
      ))}
      <Button onClick={save} disabled={busy}>
        Зберегти характеристики
      </Button>
      {specs.length === 0 && <Badge tone="off">Спочатку створіть характеристики у розділі «Фільтри та Топ»</Badge>}
    </div>
  );
});

export default SpecsSection;
