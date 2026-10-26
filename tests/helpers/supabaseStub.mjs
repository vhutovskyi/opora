// In-memory stand-in for src/lib/supabase/client.ts, swapped in by loadCatalog.mjs.
// Serves the rows a test put in globalThis.__oporaDb, already shaped like PostgREST's nested selects:
//   { products: [...], variant_specs: [...], indexProducts?: [...], error?: {...} }
// Only top-level eq/in filters are applied (visible, catalog); nested ones ("specs.filterable",
// referencedTable order/limit) are the fixture's job — write the rows the query would return.
export function supabaseAdmin() {
  return { from: (table) => query(table) };
}

function query(table) {
  const filters = [];
  let columns = "";
  const q = {
    select(s) { columns = s; return q; },
    eq(col, val) { if (!col.includes(".")) filters.push((r) => r[col] === val); return q; },
    in(col, vals) { if (!col.includes(".")) filters.push((r) => vals.includes(r[col])); return q; },
    order() { return q; },
    limit() { return q; },
    then(resolve, reject) {
      const db = globalThis.__oporaDb || {};
      if (db.error) return Promise.resolve({ data: null, error: db.error }).then(resolve, reject);
      // The variant filter index is the products query WITHOUT photos — lets a test serve it
      // out of step with the catalog base, as two independently revalidated cache entries can be.
      const rows = table === "products" && db.indexProducts && !columns.includes("variant_images")
        ? db.indexProducts
        : db[table] || [];
      const data = structuredClone(rows).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return q;
}
