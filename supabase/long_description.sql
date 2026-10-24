-- Add per-product rich "big description" (Markdown + raw HTML), rendered as a
-- full-width block on the storefront product page. Applied by hand in the
-- Supabase SQL editor (no migrations dir — see CLAUDE.md).

alter table products add column if not exists long_description text;
