-- Products ↔ subcategories as m:n, replacing the two-slot products.subcategory /
-- products.subcategory2 pair. A product can now carry any number of subcategories
-- (the old shape capped it at exactly two, an artificial restriction).
--
-- product_subcategories is the source of truth going forward and is written directly by
-- saveProduct (src/app/admin/actions/products.ts). The legacy text columns are KEPT and
-- derived from the selected set on every save (first level-1 pick → subcategory, its first
-- selected child → subcategory2) so anything still reading them keeps working. Nothing
-- here drops a column.
--
-- Applied once by hand in the Supabase SQL editor (see CLAUDE.md — no migrations dir).

create table if not exists product_subcategories (
  product_id            uuid not null references products(id) on delete cascade,
  subcategory_option_id uuid not null references subcategory_options(id) on delete cascade,
  primary key (product_id, subcategory_option_id)
);

create index if not exists idx_product_subcategories_subcategory
  on product_subcategories (subcategory_option_id);

-- One-time backfill: level-1 (products.subcategory → subcategory_options where parent is null).
insert into product_subcategories (product_id, subcategory_option_id)
select p.id, so.id
from products p
join subcategory_options so
  on so.parent is null
 and trim(so.catalog) = trim(p.catalog)
 and trim(so.name)    = trim(p.subcategory)
where p.subcategory is not null and trim(p.subcategory) <> ''
on conflict do nothing;

-- One-time backfill: level-2 (products.subcategory2 → the level-1 pick's child).
insert into product_subcategories (product_id, subcategory_option_id)
select p.id, so.id
from products p
join subcategory_options so
  on trim(so.parent)   = trim(p.subcategory)
 and trim(so.catalog)  = trim(p.catalog)
 and trim(so.name)     = trim(p.subcategory2)
where p.subcategory2 is not null and trim(p.subcategory2) <> ''
on conflict do nothing;
