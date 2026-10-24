-- Top-level catalogs (Каталоги) shown in the storefront filter.
-- Subcatalogs (levels 1–2) live in subcategory_options, linked by the catalog NAME.
-- One-off migration: run by hand in the Supabase SQL editor (like estella.sql).

create table if not exists catalogs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- ← Catalog name (Стільці, Столи…)
  sort_order int  not null default 0        -- ← order in the catalog filter
);

-- Seed from catalogs already referenced by products and subcategory_options,
-- so nothing that exists today disappears from the filter.
insert into catalogs (name)
select distinct catalog
from (
  select catalog from products where catalog is not null and catalog <> ''
  union
  select catalog from subcategory_options
) s
where catalog is not null and catalog <> ''
on conflict (name) do nothing;
