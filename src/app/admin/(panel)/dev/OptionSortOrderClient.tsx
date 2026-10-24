"use client";

import { useEffect, useState } from "react";
import { listOptions, updateOptionSortOrder } from "../../actions";
import { Button } from "../../ui";

export default function OptionSortOrderClient() {
  const [options, setOptions] = useState<{ id: string; name: string; value: string | null; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOptions();
  }, []);

  async function loadOptions() {
    setLoading(true);
    try {
      const data = await listOptions();
      setOptions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateSort(id: string, sortOrder: number) {
    try {
      await updateOptionSortOrder(id, sortOrder);
      setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, sort_order: sortOrder } : o)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    } catch (e) {
      alert("Помилка: " + (e instanceof Error ? e.message : "невідома"));
    }
  }

  if (loading) return <p>Завантаження...</p>;

  const grouped = new Map<string, typeof options>();
  for (const opt of options) {
    const group = opt.name.split(":")[0].trim();
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(opt);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([group, opts]) => (
        <div key={group} className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 font-semibold text-opora-brown">{group}</h3>
          <div className="space-y-2">
            {opts.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-3">
                <input
                  type="number"
                  value={opt.sort_order}
                  onChange={(e) => updateSort(opt.id, Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <span className="text-sm text-gray-600">
                  {opt.name} {opt.value && `(${opt.value})`}
                </span>
                <div className="ml-auto flex gap-1">
                  {idx > 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => updateSort(opt.id, opts[idx - 1].sort_order - 1)}
                      className="px-2 py-1"
                    >
                      ↑
                    </Button>
                  )}
                  {idx < opts.length - 1 && (
                    <Button
                      variant="ghost"
                      onClick={() => updateSort(opt.id, opts[idx + 1].sort_order + 1)}
                      className="px-2 py-1"
                    >
                      ↓
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
