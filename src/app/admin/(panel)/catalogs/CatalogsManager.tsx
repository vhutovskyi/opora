"use client";

import { useState } from "react";
import type { SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { useCatalogs, type Catalog } from "./useCatalogs";
import { useSubcategoryOptions } from "./useSubcategoryOptions";
import CatalogList from "./CatalogList";
import SubcategoryTree from "./SubcategoryTree";

export default function CatalogsManager({
  initialCatalogs,
  initialOptions,
}: {
  initialCatalogs: Catalog[];
  initialOptions: SubcategoryOptionRow[];
}) {
  const { catalogs, addCatalog, removeCatalog, moveCatalog } = useCatalogs(initialCatalogs);
  const { treeByCatalog, countByCatalog, addOption, setSlug, setGroup, moveOption, removeOption } = useSubcategoryOptions(initialOptions);
  const [selected, setSelected] = useState(""); // the selected catalog whose tree we manage

  const roots = treeByCatalog.get(selected) ?? [];

  async function handleRemoveCatalog(cat: Catalog) {
    const removed = await removeCatalog(cat, countByCatalog.get(cat.name) ?? 0);
    if (removed && selected === cat.name) setSelected("");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <CatalogList
        catalogs={catalogs}
        selected={selected}
        countByCatalog={countByCatalog}
        onSelect={(name) => setSelected((prev) => (prev === name ? "" : name))}
        onAdd={addCatalog}
        onRemove={handleRemoveCatalog}
        onMove={moveCatalog}
      />
      <SubcategoryTree
        selected={selected}
        roots={roots}
        onAddRoot={(name) => addOption(selected, null, name)}
        onAddChild={(parentId, name) => addOption(selected, parentId, name)}
        onRemove={removeOption}
        onMove={moveOption}
        onSlug={setSlug}
        onToggleGroup={setGroup}
      />
    </div>
  );
}
