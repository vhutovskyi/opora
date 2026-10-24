"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "../../ui";
import type { Catalog } from "./useCatalogs";

export default function CatalogList({
  catalogs,
  selected,
  countByCatalog,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  catalogs: Catalog[];
  selected: string;
  countByCatalog: Map<string, number>;
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
  onRemove: (cat: Catalog) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [newCatInput, setNewCatInput] = useState("");

  const submit = () => {
    if (!newCatInput.trim()) return;
    onAdd(newCatInput);
    setNewCatInput("");
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Каталоги</h2>
      <div className="flex gap-3">
        <Input
          value={newCatInput}
          onChange={(e) => setNewCatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Новий каталог (Стільці, Столи…)"
          className="flex-1"
        />
        <Button onClick={submit} disabled={!newCatInput.trim()}>
          + Добавити
        </Button>
      </div>
      {catalogs.length === 0 && <Badge tone="off">Ще немає каталогів</Badge>}
      <div className="space-y-2">
        {catalogs.map((cat, i) => {
          const isActive = selected === cat.name;
          const subCount = countByCatalog.get(cat.name) ?? 0;
          return (
            <div
              key={cat.id}
              onClick={() => onSelect(cat.name)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                isActive ? "border-opora-brown bg-opora-brown/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">{cat.name}</span>
              <div className="flex items-center gap-2">
                {subCount > 0 && <Badge tone="neutral">{subCount} підкат.</Badge>}
                <Button
                  variant="ghost"
                  disabled={i === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(i, i - 1);
                  }}
                  title="Вище"
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  disabled={i === catalogs.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(i, i + 1);
                  }}
                  title="Нижче"
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(cat);
                  }}
                >
                  ×
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
