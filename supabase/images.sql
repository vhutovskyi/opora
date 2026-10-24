-- OPORA — normalized product images (replaces per-variant photos[]/photos_compressed[] arrays).
-- Run once by hand in the Supabase SQL editor (same convention as catalogs.sql / estella.sql).
-- Additive only: nothing breaks until the app code that reads variant_images is deployed.
--
-- Why: a `variants` row is one full option-combination (Матеріал × Колір × Розмір × Ламелі),
-- so identical photos were re-uploaded/re-attached once per size×lamels combo of the same
-- material+colour. Storing each image once and sharing it across the group kills that duplication.

create table if not exists images (
  id              uuid primary key default gen_random_uuid(),
  url             text not null unique,   -- R2 original URL; unique → dedup tool re-runs are idempotent
  url_compressed  text,                   -- R2 compressed URL (nullable — read path falls back to url)
  created_at      timestamptz default now()
);

create table if not exists variant_images (
  variant_id  uuid not null references variants(id) on delete cascade,
  image_id    uuid not null references images(id) on delete cascade,
  sort_order  int default 0,
  primary key (variant_id, image_id)
);

create index if not exists idx_variant_images_variant on variant_images (variant_id);
create index if not exists idx_variant_images_image   on variant_images (image_id);

-- NOTE: variants.photos / photos_compressed become legacy once the admin «Дублікати фото» tool
-- has migrated every product. Do NOT drop them yet — the migration action still reads them.
-- After running the tool across all products and spot-checking the storefront, drop by hand:
--   alter table variants drop column photos;
--   alter table variants drop column photos_compressed;
