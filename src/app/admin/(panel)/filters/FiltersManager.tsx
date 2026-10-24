"use client";

import { useState } from "react";
import { BOOL_NO, BOOL_YES } from "@/lib/constants";
import { Badge, Button, Card, Checkbox, Input } from "../../ui";
import {
  deleteOption,
  deleteOptionFilter,
  deleteSpec,
  saveOption,
  saveOptionFilter,
  saveOptionGroupInfo,
  saveSpec,
  setTopProducts,
  updateOptionFilterSortOrder,
} from "../../actions";
import OptionInfoModal from "./OptionInfoModal";

type Opt = { id: string; name: string; value: string | null };
type Spec = { id: string; name: string; filterable: boolean };
type OF = { id: string; name: string; categories: string[]; sort_order?: number };
type GroupInfo = { key: string; info: string | null };

// Options are named "Kind: Value" (e.g. "Матеріал: Масив") — the info modal is keyed by
// the kind, so it's shared across every value under that axis instead of duplicated per row.
const kindOf = (name: string) => (name.includes(":") ? name.split(":")[0].trim() : name);

// Optimistic helpers: mutate local state instantly, run the server call in the background,
// roll back + alert on failure. ponytail: plain useState optimism, no library.
let tmp = 0;
const tempId = () => `tmp-${tmp++}`;

export default function FiltersManager({
  optionFilters: initialOF,
  options: initialOptions,
  optionGroupInfo: initialGroupInfo,
  specs: initialSpecs,
  products,
  topIds,
  catalogs,
}: {
  optionFilters: OF[];
  options: Opt[];
  optionGroupInfo: GroupInfo[];
  specs: Spec[];
  products: { id: string; model: string }[];
  topIds: string[];
  catalogs: string[];
}) {
  const [ofs, setOfs] = useState(initialOF);
  const [specs, setSpecs] = useState(initialSpecs);
  const [options, setOptions] = useState(initialOptions);
  const [groupInfo, setGroupInfo] = useState(initialGroupInfo);
  const [top, setTop] = useState<string[]>(topIds);
  const [savingTop, setSavingTop] = useState(false);
  const [topSearch, setTopSearch] = useState("");

  const [opt, setOpt] = useState({ name: "", value: "" });
  const [spec, setSpec] = useState({ name: "", filterable: false });
  const [of, setOf] = useState<{ name: string; categories: string[] }>({ name: "", categories: [] });

  const [editingOf, setEditingOf] = useState<string | null>(null);
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [infoKey, setInfoKey] = useState<string | null>(null);

  const fail = (e: unknown) => alert(`Помилка збереження: ${(e as Error).message}`);

  /* ----- Option filter groups ----- */
  async function addOf() {
    const name = of.name.trim();
    if (!name) return;
    const categories = of.categories;
    const temp: OF = { id: tempId(), name, categories };
    setOfs((p) => [...p, temp]);
    setOf({ name: "", categories: [] });
    try {
      const saved = await saveOptionFilter({ name, categories });
      setOfs((p) => p.map((x) => (x.id === temp.id ? saved : x)));
    } catch (e) {
      setOfs((p) => p.filter((x) => x.id !== temp.id));
      fail(e);
    }
  }
  async function editOf(g: OF, name: string, categories: string[]) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = g;
    setOfs((p) => p.map((x) => (x.id === g.id ? { ...x, name: trimmed, categories } : x)));
    setEditingOf(null);
    try {
      const saved = await saveOptionFilter({ id: g.id, name: trimmed, categories });
      setOfs((p) => p.map((x) => (x.id === g.id ? saved : x)));
    } catch (e) {
      setOfs((p) => p.map((x) => (x.id === g.id ? prev : x)));
      fail(e);
    }
  }
  async function removeOf(id: string) {
    const prev = ofs;
    setOfs((p) => p.filter((x) => x.id !== id));
    try {
      await deleteOptionFilter(id);
    } catch (e) {
      setOfs(prev);
      fail(e);
    }
  }
  async function moveOf(g: OF, direction: "up" | "down") {
    const idx = ofs.findIndex((x) => x.id === g.id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= ofs.length) return;
    const target = ofs[newIdx];
    const newOfs = [...ofs];
    [newOfs[idx], newOfs[newIdx]] = [newOfs[newIdx], newOfs[idx]];
    setOfs(newOfs);
    try {
      await Promise.all([
        updateOptionFilterSortOrder(g.id, (target.sort_order ?? 0) - 1),
        updateOptionFilterSortOrder(target.id, (g.sort_order ?? 0) + 1),
      ]);
    } catch (e) {
      setOfs(ofs);
      fail(e);
    }
  }

  /* ----- Specs ----- */
  async function addSpec() {
    const name = spec.name.trim();
    if (!name) return;
    const temp: Spec = { id: tempId(), name, filterable: spec.filterable };
    setSpecs((p) => [...p, temp]);
    setSpec({ name: "", filterable: false });
    try {
      const saved = await saveSpec({ name: temp.name, filterable: temp.filterable });
      setSpecs((p) => p.map((x) => (x.id === temp.id ? saved : x)));
    } catch (e) {
      setSpecs((p) => p.filter((x) => x.id !== temp.id));
      fail(e);
    }
  }
  async function toggleSpec(sp: Spec) {
    setSpecs((p) => p.map((x) => (x.id === sp.id ? { ...x, filterable: !x.filterable } : x)));
    try {
      await saveSpec({ id: sp.id, name: sp.name, filterable: !sp.filterable });
    } catch (e) {
      setSpecs((p) => p.map((x) => (x.id === sp.id ? sp : x)));
      fail(e);
    }
  }
  async function editSpec(sp: Spec, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSpecs((p) => p.map((x) => (x.id === sp.id ? { ...x, name: trimmed } : x)));
    setEditingSpec(null);
    try {
      const saved = await saveSpec({ id: sp.id, name: trimmed, filterable: sp.filterable });
      setSpecs((p) => p.map((x) => (x.id === sp.id ? saved : x)));
    } catch (e) {
      setSpecs((p) => p.map((x) => (x.id === sp.id ? sp : x)));
      fail(e);
    }
  }
  async function removeSpec(id: string) {
    const prev = specs;
    setSpecs((p) => p.filter((x) => x.id !== id));
    try {
      await deleteSpec(id);
    } catch (e) {
      setSpecs(prev);
      fail(e);
    }
  }

  /* ----- Options ----- */
  async function addOption() {
    const name = opt.name.trim();
    if (!name) return;
    const temp: Opt = { id: tempId(), name, value: opt.value || null };
    setOptions((p) => [...p, temp]);
    setOpt({ name: "", value: "" });
    try {
      const saved = await saveOption({ name: temp.name, value: temp.value ?? undefined });
      setOptions((p) => p.map((x) => (x.id === temp.id ? saved : x)));
    } catch (e) {
      setOptions((p) => p.filter((x) => x.id !== temp.id));
      fail(e);
    }
  }
  // A checkbox option = an axis of two values, "Так"/"Ні" (e.g. "З білими ніжками"). On the product page
  // such an axis is rendered as a single checkbox instead of chips. Both values are mandatory: a variant
  // without a value on the axis "matches" any pick, and the pick would always collapse onto it.
  async function addBoolOption() {
    const kind = opt.name.trim().replace(/:.*$/, "");
    if (!kind) return;
    setOpt({ name: "", value: "" });
    for (const value of [BOOL_YES, BOOL_NO]) {
      const temp: Opt = { id: tempId(), name: `${kind}: ${value}`, value };
      setOptions((p) => [...p, temp]);
      try {
        const saved = await saveOption({ name: temp.name, value });
        setOptions((p) => p.map((x) => (x.id === temp.id ? saved : x)));
      } catch (e) {
        setOptions((p) => p.filter((x) => x.id !== temp.id));
        fail(e);
      }
    }
  }
  async function editOption(o: Opt, name: string, value: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = o;
    setOptions((p) => p.map((x) => (x.id === o.id ? { ...x, name: trimmed, value: value || null } : x)));
    setEditingOpt(null);
    try {
      const saved = await saveOption({ id: o.id, name: trimmed, value: value || undefined });
      setOptions((p) => p.map((x) => (x.id === o.id ? saved : x)));
    } catch (e) {
      setOptions((p) => p.map((x) => (x.id === o.id ? prev : x)));
      fail(e);
    }
  }
  async function removeOptionGroup(kind: string, opts: Opt[]) {
    if (!confirm(`Видалити всю групу «${kind}» (${opts.length} опцій)? Дію не можна скасувати.`)) return;
    await Promise.all(opts.map((o) => removeOption(o.id)));
  }
  async function removeOption(id: string) {
    const prev = options;
    setOptions((p) => p.filter((x) => x.id !== id));
    try {
      await deleteOption(id);
    } catch (e) {
      setOptions(prev);
      fail(e);
    }
  }
  async function saveGroupInfo(key: string, info: string) {
    const prev = groupInfo;
    setGroupInfo((p) =>
      p.some((g) => g.key === key) ? p.map((g) => (g.key === key ? { ...g, info } : g)) : [...p, { key, info }]
    );
    try {
      const saved = await saveOptionGroupInfo(key, info);
      setGroupInfo((p) => p.map((g) => (g.key === key ? saved : g)));
    } catch (e) {
      setGroupInfo(prev);
      fail(e);
      throw e;
    }
  }

  /* ----- Top products ----- */
  function moveTop(id: string, direction: "up" | "down") {
    setTop((t) => {
      const idx = t.indexOf(id);
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || newIdx < 0 || newIdx >= t.length) return t;
      const next = [...t];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }
  async function saveTop() {
    setSavingTop(true);
    try {
      await setTopProducts(top);
    } catch (e) {
      fail(e);
    } finally {
      setSavingTop(false);
    }
  }

  const q = topSearch.toLowerCase().trim();
  const matches = q ? products.filter((p) => p.model.toLowerCase().includes(q)) : products;
  const selected = top.map((id) => products.find((p) => p.id === id)).filter(Boolean) as { id: string; model: string }[];

  const optionGroups = new Map<string, Opt[]>();
  for (const o of options) {
    const k = kindOf(o.name);
    optionGroups.set(k, [...(optionGroups.get(k) ?? []), o]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Top products — full-width: search + all products (left), selected (right) */}
      <Card className="space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Найпопулярніші товари</h2>
          <Button onClick={saveTop} disabled={savingTop}>
            {savingTop ? "Збереження..." : "Зберегти топ"}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: search + searchable products */}
          <div className="space-y-2">
            <Input placeholder="Пошук товару…" value={topSearch} onChange={(e) => setTopSearch(e.target.value)} />
            <div className="flex max-h-72 flex-col gap-1.5 overflow-auto rounded-lg border border-gray-200 p-2">
              {matches.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.model}
                  checked={top.includes(p.id)}
                  onChange={(e) => setTop((t) => (e.target.checked ? [...t, p.id] : t.filter((x) => x !== p.id)))}
                />
              ))}
              {matches.length === 0 && <p className="p-2 text-sm text-gray-400">Нічого не знайдено.</p>}
            </div>
          </div>
          {/* Right: selected top products */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Обрані ({selected.length})</span>
            <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-gray-200 p-2">
              {selected.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.model}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => moveTop(p.id, "up")} disabled={i === 0}>
                      ↑
                    </Button>
                    <Button variant="ghost" onClick={() => moveTop(p.id, "down")} disabled={i === selected.length - 1}>
                      ↓
                    </Button>
                    <Button variant="danger" onClick={() => setTop((t) => t.filter((x) => x !== p.id))}>
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              {selected.length === 0 && <p className="p-2 text-sm text-gray-400">Ще нічого не обрано.</p>}
            </div>
          </div>
        </div>
      </Card>

      {/* Option filter groups */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Групи фільтрів опцій</h2>
        {ofs.map((g) =>
          editingOf === g.id ? (
            <form
              key={g.id}
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                editOf(g, String(f.get("name") ?? ""), f.getAll("categories").map(String));
              }}
            >
              <div className="flex gap-2">
                <Input name="name" defaultValue={g.name} list="option-kinds" autoFocus />
                <Button type="submit">✓</Button>
                <Button type="button" variant="ghost" onClick={() => setEditingOf(null)}>
                  ×
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                {catalogs.map((c) => (
                  <Checkbox key={c} name="categories" value={c} label={c} defaultChecked={g.categories.includes(c)} />
                ))}
              </div>
            </form>
          ) : (
            <div key={g.id} className="flex items-center justify-between text-sm">
              <span>
                {g.name} <span className="text-gray-400">{g.categories.join(", ") || "усі категорії"}</span>
              </span>
              <div className="flex gap-1">
                {ofs.findIndex((x) => x.id === g.id) > 0 && (
                  <Button variant="ghost" onClick={() => moveOf(g, "up")}>
                    ↑
                  </Button>
                )}
                {ofs.findIndex((x) => x.id === g.id) < ofs.length - 1 && (
                  <Button variant="ghost" onClick={() => moveOf(g, "down")}>
                    ↓
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setEditingOf(g.id)}>
                  ✎
                </Button>
                <Button variant="danger" onClick={() => removeOf(g.id)}>
                  ×
                </Button>
              </div>
            </div>
          )
        )}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Назва (напр. Колір ніжок)"
              value={of.name}
              onChange={(e) => setOf({ ...of, name: e.target.value })}
              list="option-kinds"
            />
            <Button onClick={addOf} disabled={!of.name}>
              +
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            {catalogs.map((c) => (
              <Checkbox
                key={c}
                label={c}
                checked={of.categories.includes(c)}
                onChange={(e) =>
                  setOf((p) => ({
                    ...p,
                    categories: e.target.checked ? [...p.categories, c] : p.categories.filter((x) => x !== c),
                  }))
                }
              />
            ))}
          </div>
        </div>
        <datalist id="option-kinds">
          {Array.from(optionGroups.keys()).map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </Card>

      {/* Specs */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Характеристики</h2>
        <div className="max-h-60 space-y-1 overflow-auto">
          {specs.map((s) =>
            editingSpec === s.id ? (
              <form
                key={s.id}
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  editSpec(s, String(new FormData(e.currentTarget).get("name") ?? ""));
                }}
              >
                <Input name="name" defaultValue={s.name} autoFocus />
                <Button type="submit">✓</Button>
                <Button type="button" variant="ghost" onClick={() => setEditingSpec(null)}>
                  ×
                </Button>
              </form>
            ) : (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>
                  {s.name} {s.filterable && <Badge tone="neutral">фільтр</Badge>}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => toggleSpec(s)}>
                    {s.filterable ? "− фільтр" : "+ фільтр"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingSpec(s.id)}>
                    ✎
                  </Button>
                  <Button variant="danger" onClick={() => removeSpec(s.id)}>
                    ×
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Назва характеристики" value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} />
          <Checkbox label="фільтр" checked={spec.filterable} onChange={(e) => setSpec({ ...spec, filterable: e.target.checked })} />
          <Button onClick={addSpec} disabled={!spec.name}>
            +
          </Button>
        </div>
      </Card>

      {/* Options */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Опції</h2>
        <div className="max-h-60 space-y-3 overflow-auto">
          {Array.from(optionGroups.entries()).map(([kind, opts]) => (
            <div key={kind} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">{kind}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setInfoKey(kind)} title="Інфо (markdown) для всієї осі">
                    ℹ
                  </Button>
                  <Button variant="danger" onClick={() => removeOptionGroup(kind, opts)} title="Видалити всю групу опцій">
                    ×
                  </Button>
                </div>
              </div>
              {opts.map((o) =>
                editingOpt === o.id ? (
                  <form
                    key={o.id}
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      editOption(o, String(f.get("name") ?? ""), String(f.get("value") ?? ""));
                    }}
                  >
                    <Input name="name" defaultValue={o.name} autoFocus />
                    <Input name="value" defaultValue={o.value ?? ""} placeholder="#HEX" />
                    <Button type="submit">✓</Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingOpt(null)}>
                      ×
                    </Button>
                  </form>
                ) : (
                  <div key={o.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {o.value?.startsWith("#") && <span className="inline-block h-4 w-4 rounded-full border" style={{ background: o.value }} />}
                      {o.name}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => setEditingOpt(o.id)}>
                        ✎
                      </Button>
                      <Button variant="danger" onClick={() => removeOption(o.id)}>
                        ×
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Назва (Колір оббивки: Чорний)" value={opt.name} onChange={(e) => setOpt({ ...opt, name: e.target.value })} />
          <Input placeholder="#HEX або текст" value={opt.value} onChange={(e) => setOpt({ ...opt, value: e.target.value })} />
          <Button onClick={addOption} disabled={!opt.name}>
            +
          </Button>
          <Button
            variant="ghost"
            onClick={addBoolOption}
            disabled={!opt.name}
            title={`Створити пару «${BOOL_YES}»/«${BOOL_NO}» — на сторінці товару це один чекбокс (напр. «З білими ніжками»)`}
          >
            + чекбокс
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Значення = #HEX → кружечок кольору, «{BOOL_YES}»/«{BOOL_NO}» → чекбокс, будь-який інший текст → чіп.
        </p>
      </Card>

      {infoKey && (
        <OptionInfoModal
          groupKey={infoKey}
          initialInfo={groupInfo.find((g) => g.key === infoKey)?.info ?? null}
          onClose={() => setInfoKey(null)}
          onSave={(info) => saveGroupInfo(infoKey, info)}
        />
      )}
    </div>
  );
}
