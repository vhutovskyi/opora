-- Bed accessory-combination photos: replace the unused postillya/karkas/matrats_image_id mechanism
-- with a combination-aware one. One photo SET per (bed, material group, accessory-option combo).
-- Covers single-accessory and multi-accessory combos alike.
-- Run once by hand in the Supabase SQL editor (same convention as product_accessories.sql).

alter table product_accessories
  drop column if exists postillya_image_id,
  drop column if exists karkas_image_id,
  drop column if exists matrats_image_id;

-- Which of an accessory's own option axes is the "upgrade" that changes the HOST product's photo
-- (Шухляда → «Короб», Планка безпеки → «Розмір»). Lives on the accessory product, so it is learned
-- once and applies to every bed that links it. NULL = not known yet / never swaps photos.
-- Nothing to fill in by hand: the folder importer discovers it (the axis whose value the upgrade
-- folder name matched) and writes it back. A name-based rule could not work — «Розмір» is the
-- upgrade axis for a safety rail (134см/96см) but not for a drawer (190см/200см follows the bed).
alter table products add column if not exists combo_axis text;

-- The SAME accessory may now be linked to a product more than once: Лаос offers two «Планка
-- безпеки» at once (a small one and a large one), which is one product with two option values.
-- Nothing references product_accessories.id any more (combo photos are keyed by accessory
-- PRODUCT), so dropping the uniqueness is safe.
alter table product_accessories drop constraint if exists product_accessories_product_id_accessory_product_id_key;

create table if not exists accessory_combo_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,   -- the bed
  image_group_key text not null,  -- from src/lib/supabase/imageGroups.ts (Матеріал[+Колір])
  combo_key text not null,        -- canonical accessory-option combo (from src/lib/accessoryCombo.ts)
  label text not null,            -- admin-facing name for the upload row (material + combo label)
  created_at timestamptz not null default now(),
  unique (product_id, image_group_key, combo_key)
);

create table if not exists accessory_combo_images (
  combo_photo_id uuid not null references accessory_combo_photos(id) on delete cascade,
  image_id       uuid not null references images(id) on delete cascade,
  sort_order     int default 0,
  primary key (combo_photo_id, image_id)
);
create index if not exists idx_accessory_combo_images_combo on accessory_combo_images (combo_photo_id);
