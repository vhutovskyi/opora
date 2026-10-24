// A flat subcategory_options list → a tree of arbitrary depth, grouped by catalog.
// The table is small (dozens of rows), so the tree is built in memory from one query —
// a recursive CTE in SQL would be overkill here.

export type SubcategoryOptionRow = {
  id: string;
  catalog: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  slug: string | null;
  is_group: boolean;
};

export type SubcategoryNode = SubcategoryOptionRow & { children: SubcategoryNode[] };

export function buildSubcategoryTrees(rows: SubcategoryOptionRow[]): Map<string, SubcategoryNode[]> {
  const nodes = new Map<string, SubcategoryNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const byCatalog = new Map<string, SubcategoryNode[]>();
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    // The parent isn't in the list (an orphaned row) → we show it as a root instead of hiding it.
    if (parent) parent.children.push(node);
    else {
      if (!byCatalog.has(node.catalog)) byCatalog.set(node.catalog, []);
      byCatalog.get(node.catalog)!.push(node);
    }
  }

  // The manual order (sort_order) beats the name: sizes and a firmness scale
  // become unreadable alphabetically (80x190 after 140x190).
  const sort = (list: SubcategoryNode[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const n of list) sort(n.children);
  };
  for (const roots of byCatalog.values()) sort(roots);

  return byCatalog;
}

// The ?sub= parameter may hold both a uuid and a slug (see subRef in utils.ts) — only ids may go into the query:
// subcategory_option_id is of type uuid, so a slug in .in() would give a parse error rather than an empty result.
// Unknown values are dropped: garbage in the URL must mean "no filter", not a 500.
export function resolveSubRefs(refs: string[], rows: SubcategoryOptionRow[]): string[] {
  const idBySlug = new Map<string, string>();
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.id);
    if (r.slug) idBySlug.set(r.slug.toLowerCase(), r.id);
  }
  const resolved = refs.map((ref) => idBySlug.get(ref.toLowerCase()) ?? ref).filter((id) => ids.has(id));
  return [...new Set(resolved)];
}
