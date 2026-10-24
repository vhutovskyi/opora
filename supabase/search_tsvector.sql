-- Full-text search for products: generated tsvector column + GIN index, replacing the
-- unindexed ILIKE scan on model/catalog/description. This is exactly the upgrade named in
-- the ponytail comment in src/lib/supabase/search.ts ("tsvector-колонка + ...tsquery").
--
-- Why 'simple' and not 'english'/'russian': Postgres ships no Ukrainian dictionary, and a
-- wrong-language config produces wrong stems. 'simple' only lowercases and tokenizes — no
-- stemming — so the app compensates by appending :* to every word (prefix match), which
-- covers the common suffix inflection («стол:*» → столи / стола / столом).
--
-- long_description is deliberately NOT indexed: it holds hand-written Markdown/HTML, so its
-- Tailwind class names and tag names would flood the index with false-positive lexemes
-- («flex», «gap», «div»). It was covered by the old ILIKE scan; that coverage is dropped
-- on purpose — matching raw markup is noise, not a feature.
--
-- The column is GENERATED ... STORED, so Postgres maintains it on every insert/update.
-- No trigger, no app-side sync, no drift.
--
-- Applied once by hand in the Supabase SQL editor (see CLAUDE.md — no migrations dir).

alter table products add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(model, '') || ' ' || coalesce(catalog, '') || ' ' || coalesce(description, '')
    )
  ) stored;

create index if not exists idx_products_search_tsv on products using gin (search_tsv);
