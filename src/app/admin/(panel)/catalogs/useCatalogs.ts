"use client";

import { useState } from "react";
import { deleteCatalog, reorderCatalogs, saveCatalog } from "../../actions";
import { tempId, fail } from "./shared";

export type Catalog = { id: string; name: string; sort_order: number };

export function useCatalogs(initialCatalogs: Catalog[]) {
  const [catalogs, setCatalogs] = useState(initialCatalogs);

  async function addCatalog(rawName: string) {
    const name = rawName.trim();
    if (!name || catalogs.some((c) => c.name === name)) return;
    const temp: Catalog = { id: tempId(), name, sort_order: catalogs.length };
    setCatalogs((prev) => [...prev, temp]);
    try {
      const saved = await saveCatalog({ name, sort_order: temp.sort_order });
      setCatalogs((prev) => prev.map((c) => (c.id === temp.id ? saved : c)));
    } catch (e) {
      setCatalogs((prev) => prev.filter((c) => c.id !== temp.id));
      fail(e);
    }
  }

  // Returns whether the deletion happened — the caller clears `selected` if so.
  async function removeCatalog(cat: Catalog, subCount: number) {
    if (subCount > 0 && !confirm(`У каталозі «${cat.name}» ще ${subCount} підкатегорій. Видалити каталог? (підкатегорії лишаться сиротами)`))
      return false;
    const prev = catalogs;
    setCatalogs((p) => p.filter((c) => c.id !== cat.id));
    try {
      await deleteCatalog(cat.id);
      return true;
    } catch (e) {
      setCatalogs(prev);
      fail(e);
      return false;
    }
  }

  // Same trick as moveOption in the tree, but for the top level of catalogs (a real array, not a tree).
  async function moveCatalog(from: number, to: number) {
    if (to < 0 || to >= catalogs.length) return;
    const ordered = [...catalogs];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const prev = catalogs;
    setCatalogs(ordered);
    try {
      await reorderCatalogs(ordered.map((c) => c.id));
    } catch (e) {
      setCatalogs(prev);
      fail(e);
    }
  }

  return { catalogs, addCatalog, removeCatalog, moveCatalog };
}
