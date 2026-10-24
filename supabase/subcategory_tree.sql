-- Migrate subcategory_options from a 2-level tree (free-text parent name matching)
-- to a true recursive tree (parent_id self-FK).
--
-- This file is run once by hand in the Supabase SQL editor, like estella.sql and catalogs.sql.
-- It is split into two phases: additive (new column, backfill) and destructive (drop old columns).
-- Verify the backfill before running destructive steps.

-- ===== PHASE 1: ADDITIVE (safe to run multiple times) =====

alter table subcategory_options add column parent_id uuid references subcategory_options(id) on delete cascade;
create index if not exists idx_subcategory_options_parent on subcategory_options (parent_id);

-- Backfill parent_id from the old free-text parent column.
-- A row's parent is the id of another row in the same catalog with the matching name and no parent of its own.
update subcategory_options child
set parent_id = p.id
from subcategory_options p
where child.parent is not null
  and child.catalog = p.catalog
  and child.parent = p.name
  and p.parent is null;

-- ===== VERIFY BACKFILL =====
-- Run this query to confirm every row with old `parent` is now linked:
-- select count(*) filter (where parent is not null and parent_id is null) as unlinked
-- from subcategory_options;
-- Should be 0.

-- ===== PHASE 2: DESTRUCTIVE (run only after verification above) =====
-- Uncomment these lines only after the backfill query above returns 0 unlinked rows.
-- Dropping the products columns is irreversible — the values are not recoverable
-- from product_subcategories (which stores ids, not the old free-text names).

-- alter table products drop column subcategory;
-- alter table products drop column subcategory2;
-- -- Dropping `parent` also drops the old unique (catalog, parent, name); replace it.
-- -- Same NULL caveat as before: Postgres treats each NULL parent_id as distinct,
-- -- so this does not block duplicate root names (neither did the old constraint).
-- alter table subcategory_options drop column parent;
-- alter table subcategory_options add constraint uq_subcategory_options_parent_name unique (catalog, parent_id, name);
