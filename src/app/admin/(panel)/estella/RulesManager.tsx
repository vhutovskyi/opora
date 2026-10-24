"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "../../ui";
import { ESTELLA_CATALOGS, type CatalogRule, type OptionRule, type SplitRule } from "@/lib/estella/catalogRules";
import { saveCatalogRule } from "./rulesActions";
import { OptionRuleForm } from "./OptionRuleForm";

let tmp = 0;
const tempId = () => `tmp-${tmp++}`;

type ClientCatalogRule = Omit<CatalogRule, "id"> & { id?: string };

export default function RulesManager({ initialRules }: { initialRules: CatalogRule[] }) {
  const [rules, setRules] = useState<ClientCatalogRule[]>(initialRules);
  const [selected, setSelected] = useState(""); // selected catalog for editing
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null); // editing within a rule list
  // Changes on every save/cancel/target change → remounts OptionRuleForm (resets the fields).
  const [formNonce, setFormNonce] = useState(0);

  const [splitMaxWidth, setSplitMaxWidth] = useState("");
  const [splitOverLabel, setSplitOverLabel] = useState("");
  const [splitUnderLabel, setSplitUnderLabel] = useState("");
  const [newCatalog, setNewCatalog] = useState(""); // free-text name for a brand-new custom catalog
  const [nameMatch, setNameMatch] = useState(""); // regex detecting the selected catalog from a product name

  const fail = (e: unknown) => alert(`Помилка: ${(e as Error).message}`);

  // Built-in 6 + any custom catalogs already saved (deduped, preserving built-in order first).
  const allCatalogs = [...ESTELLA_CATALOGS, ...rules.map((r) => r.catalog).filter((c) => !ESTELLA_CATALOGS.includes(c as any))];
  const isBuiltIn = (c: string) => ESTELLA_CATALOGS.includes(c as any);

  const selectedRule = rules.find((r) => r.catalog === selected) as ClientCatalogRule | undefined;
  const editingRule = selectedRule?.optionRules.find((o) => o.id === editingRuleId) ?? null;

  // Optimistically update local state, then persist to the DB and reconcile with the server row.
  // A `tmp-` catalog id means "new catalog" → drop it so the DB mints a real uuid.
  async function persist(next: ClientCatalogRule) {
    setRules((prev) => prev.map((r) => (r.catalog === next.catalog ? next : r)));
    try {
      const saved = await saveCatalogRule({
        id: next.id?.startsWith("tmp-") ? undefined : next.id,
        catalog: next.catalog,
        optionRules: next.optionRules,
        splitRule: next.splitRule,
      });
      setRules((prev) => prev.map((r) => (r.catalog === next.catalog ? saved : r)));
    } catch (e) {
      fail(e);
    }
  }

  function saveRule() {
    if (selectedRule) persist(selectedRule);
  }

  function startEditRule(rule: OptionRule) {
    setEditingRuleId(rule.id);
    setFormNonce((n) => n + 1);
  }

  function cancelEdit() {
    setEditingRuleId(null);
    setFormNonce((n) => n + 1);
  }

  // Merge a built rule (from OptionRuleForm) into the selected catalog: replace in place when
  // editing, else append. Then reset/remount the form.
  function saveOptionRule(rule: OptionRule) {
    if (!selectedRule) return;
    const optionRules = editingRuleId
      ? selectedRule.optionRules.map((opt) => (opt.id === editingRuleId ? rule : opt))
      : [...selectedRule.optionRules, rule];
    persist({ ...selectedRule, optionRules });
    cancelEdit();
  }

  function removeOptionRule(id: string) {
    if (!selectedRule) return;
    persist({ ...selectedRule, optionRules: selectedRule.optionRules.filter((opt) => opt.id !== id) });
  }

  function updateSplitRule() {
    if (!selectedRule) return;
    const split: SplitRule | null =
      splitMaxWidth && splitOverLabel && splitUnderLabel
        ? { maxWidth: parseInt(splitMaxWidth, 10), overLabel: splitOverLabel, underLabel: splitUnderLabel }
        : null;
    persist({ ...selectedRule, splitRule: split });
  }

  function selectCatalog(catalog: string) {
    const cat = rules.find((r) => r.catalog === catalog);
    if (!cat) {
      // Create empty rule for this catalog
      setRules((prev) => [
        ...prev,
        { id: tempId(), catalog: catalog as any, nameMatch: null, optionRules: [], splitRule: null },
      ]);
    }
    setSelected(selected === catalog ? "" : catalog);
    setEditingRuleId(null);
    setFormNonce((n) => n + 1);
    setSplitMaxWidth("");
    setSplitOverLabel("");
    setSplitUnderLabel("");
    setNameMatch(cat?.nameMatch ?? "");
    if (cat?.splitRule) {
      setSplitMaxWidth(String(cat.splitRule.maxWidth));
      setSplitOverLabel(cat.splitRule.overLabel);
      setSplitUnderLabel(cat.splitRule.underLabel);
    }
  }

  // Create a brand-new custom catalog by name, then select it for editing.
  function addCatalog() {
    const name = newCatalog.trim();
    if (!name || allCatalogs.includes(name)) return;
    setRules((prev) => [...prev, { id: tempId(), catalog: name, nameMatch: null, optionRules: [], splitRule: null }]);
    setNewCatalog("");
    setSelected(name);
    setEditingRuleId(null);
    setFormNonce((n) => n + 1);
    setSplitMaxWidth("");
    setSplitOverLabel("");
    setSplitUnderLabel("");
    setNameMatch("");
  }

  function updateNameMatch() {
    if (!selectedRule) return;
    persist({ ...selectedRule, nameMatch: nameMatch.trim() || null });
  }

  return (
    <div className="grid max-w-6xl grid-cols-2 gap-6">
      {/* Left: catalog list */}
      <Card className="space-y-4">
        <h2 className="font-semibold">Каталоги</h2>
        <div className="space-y-2">
          {allCatalogs.map((catalog) => {
            const isActive = selected === catalog;
            const rule = rules.find((r) => r.catalog === catalog);
            return (
              <div
                key={catalog}
                onClick={() => selectCatalog(catalog)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                  isActive ? "border-opora-brown bg-opora-brown/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="font-medium">
                  {catalog}
                  {!isBuiltIn(catalog) && <span className="ml-2 text-xs text-gray-400">(власний)</span>}
                </span>
                {rule && (rule.optionRules.length > 0 || rule.splitRule) && (
                  <Badge tone="neutral">{rule.optionRules.length} правил</Badge>
                )}
              </div>
            );
          })}
        </div>
        {/* Create a custom catalog (e.g. «Планки безпеки») */}
        <div className="flex gap-2 border-t border-gray-200 pt-3">
          <Input
            value={newCatalog}
            onChange={(e) => setNewCatalog(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCatalog()}
            placeholder="Новий каталог (напр. Планки безпеки)"
            className="text-sm"
          />
          <Button variant="ghost" onClick={addCatalog} disabled={!newCatalog.trim()}>
            + Додати
          </Button>
        </div>
      </Card>

      {/* Right: edit selected catalog's rules */}
      <div className="space-y-4">
        {!selected ? (
          <Card className="flex items-center justify-center p-6">
            <Badge tone="off">Оберіть каталог</Badge>
          </Card>
        ) : (
          <>
            {/* Catalog detection: which product names route to this catalog. Built-ins also match by
                a hardcoded prefix; a regex here adds/overrides detection and is required for custom catalogs. */}
            <Card className="space-y-3">
              <h2 className="font-semibold">Визначення каталогу</h2>
              <p className="text-xs text-gray-600">
                Regex за назвою товару. Оффери, чия назва підходить, отримають опції цього каталогу.
                {isBuiltIn(selected) && " (Вбудований каталог також визначається за назвою автоматично.)"}
              </p>
              <div className="flex gap-2">
                <Input
                  value={nameMatch}
                  onChange={(e) => setNameMatch(e.target.value)}
                  placeholder="напр. ^планка безпеки"
                  className="text-sm font-mono"
                />
                <Button variant="ghost" onClick={updateNameMatch}>
                  Зберегти
                </Button>
              </div>
            </Card>

            {/* Option rules list */}
            <Card className="space-y-4">
              <h2 className="font-semibold">Опції для «{selected}»</h2>
              {selectedRule?.optionRules?.length === 0 && <Badge tone="off">Немає правил</Badge>}
              <div className="space-y-2">
                {selectedRule?.optionRules?.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-start justify-between rounded-lg border p-3 ${
                      editingRuleId === rule.id ? "border-opora-brown bg-opora-brown/5" : "border-gray-200"
                    }`}
                  >
                    <div className="flex-1 space-y-1 text-sm">
                      <div className="font-medium">{rule.optionName}</div>
                      <div className="text-gray-600">
                        {rule.source} ~ /{rule.match}/
                      </div>
                      {rule.valueMode === "capture" && (
                        <div className="text-xs text-gray-500">{rule.captureTemplate}</div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" onClick={() => startEditRule(rule)} className="text-gray-600 hover:text-gray-900">
                        ✎
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (editingRuleId === rule.id) cancelEdit();
                          removeOptionRule(rule.id);
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add / edit option rule form. key remounts it (clears fields) on target change. */}
              <OptionRuleForm
                key={`${editingRuleId ?? "new"}-${formNonce}`}
                editingRule={editingRule}
                onSave={saveOptionRule}
                onCancel={cancelEdit}
              />
            </Card>

            {/* Split rule */}
            <Card className="space-y-4">
              <h2 className="font-semibold">Розділення за розміром</h2>
              <p className="text-xs text-gray-600">Опціонально: розділяє товар на два за шириною</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Макс. ширина для "менший"</label>
                  <Input
                    type="number"
                    value={splitMaxWidth}
                    onChange={(e) => setSplitMaxWidth(e.target.value)}
                    placeholder="e.g. 120"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Назва "більший"</label>
                  <Input
                    value={splitOverLabel}
                    onChange={(e) => setSplitOverLabel(e.target.value)}
                    placeholder="e.g. Двоспальне"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Назва "менший"</label>
                  <Input
                    value={splitUnderLabel}
                    onChange={(e) => setSplitUnderLabel(e.target.value)}
                    placeholder="e.g. Односпальне"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={updateSplitRule} variant="ghost" disabled={!splitMaxWidth || !splitOverLabel || !splitUnderLabel}>
                  Зберегти розділення
                </Button>
                {selectedRule?.splitRule && (
                  <Button
                    onClick={() => {
                      setSplitMaxWidth("");
                      setSplitOverLabel("");
                      setSplitUnderLabel("");
                      if (selectedRule) persist({ ...selectedRule, splitRule: null });
                    }}
                    variant="ghost"
                    className="text-red-600"
                  >
                    Видалити розділення
                  </Button>
                )}
              </div>
            </Card>

            {/* Save button */}
            <Button onClick={saveRule} className="w-full">
              Зберегти всі зміни для {selected}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
