-- Per-variant storefront visibility. Hides a variant from the product-page option
-- selector while keeping it (and its options/photos) in the DB. Default true, so every
-- existing variant and every non-beds import path is unaffected — only the beds folder
-- import writes false for config-bearing variations (curated back on via the admin editor).
-- Applied once by hand in the Supabase SQL editor (see CLAUDE.md — no migrations dir).

alter table variants add column if not exists visible boolean not null default true;
