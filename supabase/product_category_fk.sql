-- Additive catalog FK. NOT a cutover: products.catalog (text) stays the source of truth
-- for every read path (src/lib/supabase/catalog.ts). This only adds a parallel id column
-- + backfill so a future FK-based read path is possible without a separate migration.
-- Nothing here drops or renames existing columns.
--
-- Why: products.catalog is free text with no FK to catalogs(id), so renaming a catalog
-- silently detaches products from it with zero DB-level warning.
--
-- Applied once by hand in the Supabase SQL editor (see CLAUDE.md — no migrations dir).

alter table products add column if not exists catalog_id uuid references catalogs(id);

create index if not exists idx_products_catalog_id on products (catalog_id);

-- One-time backfill from the existing text match. Trimmed because fetchFilterOptions
-- already groups by trimmed catalog text (catalog.ts), implying some stored values carry
-- stray whitespace; harmless no-op if none do.
update products p
set catalog_id = c.id
from catalogs c
where p.catalog_id is null and trim(p.catalog) = trim(c.name);

-- Keep catalog_id in sync going forward without touching any app write path (saveProduct,
-- folderImportCommit, the Estella importer and the legacy CSV importer all write only the
-- text column). Sets null (never blocks the write) when the text matches no catalogs row.
create or replace function products_sync_catalog_id() returns trigger as $$
begin
  new.catalog_id := (select id from catalogs where trim(name) = trim(new.catalog));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_sync_catalog_id on products;
create trigger trg_products_sync_catalog_id
before insert or update of catalog on products
for each row execute function products_sync_catalog_id();
