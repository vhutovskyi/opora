-- Informational articles ("Щит чи масив", "Про ламелі", "Про фарбування"…) that the
-- product descriptions link to. The body of an article is the same block array as
-- products.long_description, so the editor and the renderer are shared.
-- The links in the descriptions are RELATIVE (/posts/<slug>), so they work the same
-- on localhost and on prod. Applied by hand in the Supabase SQL editor.

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,             -- ← Address: /posts/<slug>
  title      text not null,                    -- ← Title
  excerpt    text,                             -- ← Short description (meta description)
  blocks     jsonb not null default '[]'::jsonb,
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_slug_idx on posts (slug) where visible;
