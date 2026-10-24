"use client";

import { useMemo, useState } from "react";
import { deleteSubcategoryOption, reorderSubcategoryOptions, saveSubcategoryOption } from "../../actions";
import { buildSubcategoryTrees, type SubcategoryNode, type SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { tempId, fail } from "./shared";

export function useSubcategoryOptions(initialOptions: SubcategoryOptionRow[]) {
  const [options, setOptions] = useState(initialOptions);

  const treeByCatalog = useMemo(() => buildSubcategoryTrees(options), [options]);
  const countByCatalog = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of options) map.set(o.catalog, (map.get(o.catalog) ?? 0) + 1);
    return map;
  }, [options]);

  // parentId === null → a root under the selected catalog; otherwise a child of a specific node.
  // A new node goes to the end of its level, not in alphabetical order.
  async function addOption(catalog: string, parentId: string | null, name: string) {
    if (!catalog || !name) return;
    const sort_order = options.filter((o) => o.catalog === catalog && o.parent_id === parentId).length;
    const temp: SubcategoryOptionRow = { id: tempId(), catalog, parent_id: parentId, name, sort_order, slug: null, is_group: false };
    setOptions((prev) => [...prev, temp]);
    try {
      const saved = await saveSubcategoryOption({ catalog, parent_id: parentId, name, sort_order });
      setOptions((prev) => prev.map((x) => (x.id === temp.id ? saved : x)));
    } catch (e) {
      setOptions((prev) => prev.filter((x) => x.id !== temp.id));
      fail(e);
    }
  }

  // Slug for the human-readable /catalog?type=…&sub=<slug> URL. An error (malformed slug, already taken)
  // is shown and rolled back — the input keeps the typed text, so the edit doesn't have to be retyped.
  async function setSlug(node: SubcategoryNode, raw: string) {
    const slug = raw.trim() || null;
    const prev = options;
    setOptions((p) => p.map((x) => (x.id === node.id ? { ...x, slug } : x)));
    try {
      await saveSubcategoryOption({ id: node.id, catalog: node.catalog, parent_id: node.parent_id, name: node.name, slug });
    } catch (e) {
      setOptions(prev);
      fail(e);
    }
  }

  // Marks a root node as a Category Group (Матеріал, Розмір, ...) — a non-navigable header in the
  // Header/MenuDrawer nav, rendered as its own checkbox filter section in the storefront sidebar instead.
  async function setGroup(node: SubcategoryNode, is_group: boolean) {
    const prev = options;
    setOptions((p) => p.map((x) => (x.id === node.id ? { ...x, is_group } : x)));
    try {
      await saveSubcategoryOption({ id: node.id, catalog: node.catalog, parent_id: node.parent_id, name: node.name, is_group });
    } catch (e) {
      setOptions(prev);
      fail(e);
    }
  }

  // Moves a node among its siblings and renumbers the whole level (sort_order = position).
  async function moveOption(siblings: SubcategoryNode[], from: number, to: number) {
    if (to < 0 || to >= siblings.length) return;
    const ordered = [...siblings];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const newOrder = new Map(ordered.map((n, i) => [n.id, i]));
    const prev = options;
    setOptions((p) => p.map((x) => (newOrder.has(x.id) ? { ...x, sort_order: newOrder.get(x.id)! } : x)));
    try {
      await reorderSubcategoryOptions(ordered.map((n) => n.id));
    } catch (e) {
      setOptions(prev);
      fail(e);
    }
  }

  // Deletion cascades in the DB (parent_id ... on delete cascade), so we drop the subtree locally too.
  async function removeOption(node: SubcategoryNode) {
    const descendants = new Set<string>();
    const walk = (n: SubcategoryNode) => {
      descendants.add(n.id);
      n.children.forEach(walk);
    };
    walk(node);
    if (descendants.size > 1 && !confirm(`«${node.name}» має вкладені підкатегорії (${descendants.size - 1}). Видалити разом із ними?`)) return;

    const prev = options;
    setOptions((p) => p.filter((x) => !descendants.has(x.id)));
    try {
      await deleteSubcategoryOption(node.id);
    } catch (e) {
      setOptions(prev);
      fail(e);
    }
  }

  return { treeByCatalog, countByCatalog, addOption, setSlug, setGroup, moveOption, removeOption };
}
