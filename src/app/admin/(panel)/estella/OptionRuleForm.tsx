"use client";

import { useState } from "react";
import { Button, Input } from "../../ui";
import type { OptionRule } from "@/lib/estella/catalogRules";

let tmp = 0;
const tempId = () => `tmp-opt-${tmp++}`;

// Form for adding/editing one OptionRule. Keeps its own field state; the parent
// remounts it via key when editingRule changes, so a separate resetForm isn't needed.
export function OptionRuleForm({
  editingRule,
  onSave,
  onCancel,
}: {
  editingRule: OptionRule | null;
  onSave: (rule: OptionRule) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState<"name" | "model" | "param">(editingRule?.source ?? "model");
  const [match, setMatch] = useState(editingRule?.match ?? "");
  const [optionName, setOptionName] = useState(editingRule?.optionName ?? "");
  const [valueMode, setValueMode] = useState<"capture" | "conditional">(editingRule?.valueMode ?? "capture");
  const [captureTemplate, setCaptureTemplate] = useState(editingRule?.captureTemplate ?? "");
  const [condMatch, setCondMatch] = useState(editingRule?.conditionalMatch ?? "");
  const [trueVal, setTrueVal] = useState(editingRule?.trueValue ?? "");
  const [falseVal, setFalseVal] = useState(editingRule?.falseValue ?? "");

  function submit() {
    if (!match || !optionName) return;

    // Preserve the id when editing so the parent replaces in place; otherwise mint a new temp id.
    const rule: OptionRule = {
      id: editingRule?.id ?? tempId(),
      source,
      match,
      optionName,
      valueMode,
    };

    if (valueMode === "capture") {
      if (!captureTemplate) return;
      rule.captureTemplate = captureTemplate;
    } else {
      rule.conditionalMatch = condMatch || match;
      rule.trueValue = trueVal || undefined;
      rule.falseValue = falseVal || undefined;
    }

    onSave(rule);
  }

  return (
    <div className="space-y-3 border-t border-gray-200 pt-3">
      <h3 className="text-sm font-medium">{editingRule ? "Редагувати правило" : "Добавити правило"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Джерело</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="name">name</option>
            <option value="model">model</option>
            <option value="param">param</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Назва опції</label>
          <Input
            value={optionName}
            onChange={(e) => setOptionName(e.target.value)}
            placeholder="e.g. Коліщатка"
            className="text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Regex (match)</label>
        <Input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="e.g. комфорт"
          className="text-sm font-mono"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Тип значення</label>
        <select
          value={valueMode}
          onChange={(e) => setValueMode(e.target.value as any)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="capture">Захоплення (${1}см)</option>
          <option value="conditional">Умовне (true/false)</option>
        </select>
      </div>

      {valueMode === "capture" && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Шаблон (e.g. ${'{'}<span className="text-red-500">1</span>{'}'}см)</label>
          <Input
            value={captureTemplate}
            onChange={(e) => setCaptureTemplate(e.target.value)}
            placeholder="${1}см"
            className="text-sm font-mono"
          />
        </div>
      )}

      {valueMode === "conditional" && (
        <>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Regex умови (якщо пусто — як match)</label>
            <Input
              value={condMatch}
              onChange={(e) => setCondMatch(e.target.value)}
              placeholder="(залишити пусто для match)"
              className="text-sm font-mono"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Якщо true</label>
              <Input
                value={trueVal}
                onChange={(e) => setTrueVal(e.target.value)}
                placeholder="e.g. Резинові"
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Якщо false</label>
              <Input
                value={falseVal}
                onChange={(e) => setFalseVal(e.target.value)}
                placeholder="e.g. Пластикові"
                className="text-sm"
              />
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={!match || !optionName}>
          {editingRule ? "Зберегти правило" : "+ Добавити правило"}
        </Button>
        {editingRule && (
          <Button variant="ghost" onClick={onCancel}>
            Скасувати
          </Button>
        )}
      </div>
    </div>
  );
}
