"use client";

import { useState } from "react";
import { Badge, Button, Input } from "../../ui";
import type { SubcategoryNode } from "@/lib/supabase/subcategoryTree";

// One tree node: name + "add child" (at any depth) + order + delete.
export default function TreeNode({
  node,
  depth,
  siblings,
  index,
  onAddChild,
  onRemove,
  onMove,
  onSlug,
  onToggleGroup,
}: {
  node: SubcategoryNode;
  depth: number;
  siblings: SubcategoryNode[];
  index: number;
  onAddChild: (parentId: string, name: string) => void;
  onRemove: (node: SubcategoryNode) => void;
  onMove: (siblings: SubcategoryNode[], from: number, to: number) => void;
  onSlug: (node: SubcategoryNode, slug: string) => void;
  onToggleGroup: (node: SubcategoryNode, is_group: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [slug, setSlug] = useState(node.slug ?? "");

  const submit = () => {
    const name = value.trim();
    if (!name) return;
    onAddChild(node.id, name);
    setValue("");
    setAdding(false);
  };

  return (
    <div className={depth > 0 ? "ml-4 border-l border-gray-200 pl-4" : ""}>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
        <span className={depth === 0 ? "font-medium" : ""}>{node.name}</span>
        {depth === 0 && (
          <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={node.is_group}
              onChange={(e) => onToggleGroup(node, e.target.checked)}
            />
            Група
          </label>
        )}
        {/* Slug for the /catalog?sub=… URL — empty means uuid (subcategory_slug.sql). */}
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => slug.trim() !== (node.slug ?? "") && onSlug(node, slug)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="slug (лат.)"
          className="ml-auto w-40 font-mono text-xs"
        />
        <div className="flex items-center gap-1">
          {node.children.length > 0 && <Badge tone="neutral">{node.children.length}</Badge>}
          <Button variant="ghost" disabled={index === 0} onClick={() => onMove(siblings, index, index - 1)} title="Вище">
            ↑
          </Button>
          <Button
            variant="ghost"
            disabled={index === siblings.length - 1}
            onClick={() => onMove(siblings, index, index + 1)}
            title="Нижче"
          >
            ↓
          </Button>
          <Button variant="ghost" onClick={() => setAdding(!adding)} title="Додати підкатегорію">
            +
          </Button>
          <Button variant="ghost" onClick={() => onRemove(node)}>
            ×
          </Button>
        </div>
      </div>

      {adding && (
        <div className="mt-2 ml-4 flex gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={`Підкатегорія під «${node.name}»`}
            className="flex-1"
          />
          <Button onClick={submit} disabled={!value.trim()}>
            + Добавити
          </Button>
        </div>
      )}

      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child, i) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              siblings={node.children}
              index={i}
              onAddChild={onAddChild}
              onRemove={onRemove}
              onMove={onMove}
              onSlug={onSlug}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
