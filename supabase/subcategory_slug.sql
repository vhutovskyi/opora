-- Human-readable addresses for subcategories: /catalog?type=Ліжка&sub=wooden instead of sub=<uuid>.
-- The same principle as products.slug (product_slug.sql): the column is optional,
-- the uuid addresses keep working, so links already out in the wild don't break.
-- Run once by hand in the Supabase SQL editor.

alter table subcategory_options add column if not exists slug text;

-- lower(slug) — the address must not depend on case (resolveSubRefs compares in lower case too).
-- Postgres treats NULLs as distinct, so there can be any number of slug-less rows.
-- Uniqueness is global rather than per catalog: a slug is resolved without the type= context.
create unique index if not exists uq_subcategory_options_slug
  on subcategory_options (lower(slug));
