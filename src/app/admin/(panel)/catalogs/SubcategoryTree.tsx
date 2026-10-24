"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "../../ui";
import TreeNode from "./TreeNode";
import type { SubcategoryNode } from "@/lib/supabase/subcategoryTree";

export default function SubcategoryTree({
  selected,
  roots,
  onAddRoot,
  onAddChild,
  onRemove,
  onMove,
  onSlug,
  onToggleGroup,
}: {
  selected: string;
  roots: SubcategoryNode[];
  onAddRoot: (name: string) => void;
  onAddChild: (parentId: string, name: string) => void;
  onRemove: (node: SubcategoryNode) => void;
  onMove: (siblings: SubcategoryNode[], from: number, to: number) => void;
  onSlug: (node: SubcategoryNode, slug: string) => void;
  onToggleGroup: (node: SubcategoryNode, is_group: boolean) => void;
}) {
  const [rootInput, setRootInput] = useState("");

  const submit = () => {
    if (!rootInput.trim()) return;
    onAddRoot(rootInput);
    setRootInput("");
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Підкатегорії</h2>
      {!selected && <Badge tone="off">Оберіть каталог вище</Badge>}
      {selected && (
        <>
          <p className="text-sm text-gray-500">«+» на будь-якому рядку додає підкатегорію під ним — вкладеність не обмежена.</p>
          <div className="flex gap-2">
            <Input
              value={rootInput}
              onChange={(e) => setRootInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={`Назва під «${selected}»`}
              className="flex-1"
            />
            <Button onClick={submit} disabled={!rootInput.trim()}>
              + Добавити
            </Button>
          </div>
          {roots.length === 0 && <Badge tone="off">Ще немає підкатегорій</Badge>}
          <div className="space-y-2">
            {roots.map((node, i) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                siblings={roots}
                index={i}
                onAddChild={onAddChild}
                onRemove={onRemove}
                onMove={onMove}
                onSlug={onSlug}
                onToggleGroup={onToggleGroup}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
