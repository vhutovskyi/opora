-- Shared long-description blocks: a set of blocks is edited once and inlined
-- into every product that references it (e.g. the same Estella colour palette).
-- A product stores the reference {"type":"snippet","snippetId":"<uuid>"} in long_description,
-- and the storefront expands it on the read side (resolveSnippets in products.ts).
-- Applied by hand in the Supabase SQL editor (no migrations dir — see CLAUDE.md).

create table if not exists long_description_snippets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                    -- ← Name (for the admin panel only)
  blocks     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
