"use client";

import { memo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../../ui";
import { setProductAccessories } from "../../../actions";
import type { ProductAccessoryRow, ProductListItem } from "./productEditorTypes";

const AccessoriesSection = memo(function AccessoriesSection({
  productId,
  links,
  allProducts,
}: {
  productId: string;
  links: ProductAccessoryRow[];
  allProducts: ProductListItem[];
}) {
  const router = useRouter();
  const sortedLinks = [...links].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const [rows, setRows] = useState(
    sortedLinks.map((l) => ({ productId: l.accessory_product_id, maxQty: l.max_qty ?? 1 }))
  );
  const [busy, start] = useTransition();

  function save() {
    start(async () => {
      await setProductAccessories(
        productId,
        rows
          .filter((r) => r.productId)
          .map((r) => ({ accessoryProductId: r.productId, maxQty: r.maxQty }))
      );
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Аксесуари (додаткові товари)</h2>
          <p className="text-xs text-gray-500">Опційні товари, які покупець зможе додати.</p>
        </div>
        <Button variant="ghost" onClick={() => setRows([...rows, { productId: "", maxQty: 1 }])}>
          + Додати аксесуар
        </Button>
      </div>
      {rows.map((row, i) => {
        // Duplicates are allowed: Лаос offers TWO "Планки безпеки" at once (a small and a large one) — that is one
        // product added twice, so we don't narrow the product list by what is selected in the other rows.
        const available = allProducts;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
            <select
              value={row.productId}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}
              className="min-w-64 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">— оберіть товар —</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.model}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Макс. кількість
              <input
                type="number"
                min={1}
                value={row.maxQty}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, maxQty: Math.max(1, Number(e.target.value) || 1) } : x)))
                }
                className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Видалити">
              ×
            </Button>
          </div>
        );
      })}
      <Button onClick={save} disabled={busy}>
        Зберегти аксесуари
      </Button>
    </Card>
  );
});

export default AccessoriesSection;
