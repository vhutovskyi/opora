-- Human-readable product addresses: /catalog/vega instead of /catalog/<uuid>.
-- Apply by hand in the Supabase SQL editor (like the rest of the files here).
--
-- The slug is OPTIONAL and breaks nothing: the product lookup accepts both a uuid and a slug
-- (see productRef in src/lib/supabase/products.ts), so old links —
-- in the sitemap, in "Ви раніше переглядали" in localStorage, shared by customers —
-- keep working. Filled in by hand in the product editor.

alter table products add column if not exists slug text;  -- ← Address (e.g. "vega")

-- Partial uniqueness: the many products without a slug don't conflict with each other.
create unique index if not exists idx_products_slug on products (lower(slug)) where slug is not null;
