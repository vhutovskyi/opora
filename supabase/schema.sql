-- OPORA — Supabase Postgres schema (replaces Airtable).
-- Run once in the Supabase SQL editor. Column names are English snake_case;
-- the app's service layer maps them to the UI shapes.
-- ponytail: RLS left off — all access is server-side with the service-role key.

create extension if not exists "pgcrypto";

create table if not exists products (
  id                  uuid primary key default gen_random_uuid(),
  model               text not null unique,        -- ← Model (primary/display)
  manufacturer        text,                         -- ← Manufacturer
  min_price           numeric default 0,            -- ← Minimum price
  catalog             text,                         -- ← Catalog (e.g. "Стільці")
  -- Subcategories — m:n through product_subcategories (any depth/number);
  -- the subcategory/subcategory2 columns were removed (see supabase/subcategory_tree.sql).
  description         text,                         -- ← Description
  long_description    jsonb default '[]'::jsonb,     -- ← Long description (blocks, the product page)
  gallery_layout      text,                         -- ← Gallery layout: photos per row, "1,2" (see gallery_layout.sql)
  assembly_video_url  text,                         -- ← Assembly video
  assembly_pdf_url    text,                         -- ← Assembly PDF
  visible             boolean default true,         -- ← Visible
  created_at          timestamptz default now()
);

create table if not exists variants (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id) on delete cascade,
  name               text,                          -- ← Name (usually blank)
  sku                text,                          -- ← SKU
  in_stock           boolean default true,          -- ← In stock
  price              numeric default 0,             -- ← Price
  discount_percent   numeric,                       -- ← Discount (percent)
  discount_price     numeric,                       -- ← Discount (price)
  discounted_price   numeric,                       -- ← Discounted price
  photos             text[] default '{}',           -- ← Photos (URLs)
  photos_compressed  text[] default '{}',           -- ← Compressed photos (URLs)
  sort_order         int default 0,
  visible            boolean not null default true  -- ← Visible on the site (beds: config variants are hidden by default); see variant_visibility.sql
);

create table if not exists options (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,                             -- ← Name ("Колір оббивки: Чорний")
  value  text,                                      -- ← Value (hex)
  sort_order int default 0,                         -- ← Order in filter
  unique (name, value)
);
-- unique(name, value) above does NOT cover null values (Postgres treats each NULL as distinct),
-- so null-valued options (e.g. "Матеріал: Масив") need this partial index to stay deduped.
create unique index if not exists uq_options_name_null_value on options (name) where value is null;

-- Markdown info shown once per option axis ("key" — the part of an option's name before the
-- colon, e.g. "Матеріал"), not per value: "Матеріал: Масив" and "Матеріал: Щит" share one row.
create table if not exists option_group_info (
  key  text primary key,  -- ← The axis name before the colon ("Матеріал")
  info text
);

create table if not exists variant_options (
  variant_id  uuid references variants(id) on delete cascade,
  option_id   uuid references options(id) on delete cascade,
  primary key (variant_id, option_id)
);

create table if not exists specs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                 -- ← Name
  filterable  boolean default false                 -- ← Filterable
);

create table if not exists variant_specs (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references variants(id) on delete cascade,
  spec_id     uuid not null references specs(id) on delete cascade,
  value       text,                                 -- ← Value
  legacy_num  int                                   -- ← Name autonumber (ordering)
);

-- Optional add-on products offered on a product's page (see supabase/product_accessories.sql).
-- The 3 *_image_id columns hold bed-style photos (з постіллю / каркас / з матрацом) picked from
-- THIS product's own images — shown in the buy-box gallery when the accessory is selected.
create table if not exists product_accessories (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references products(id) on delete cascade,
  accessory_product_id  uuid not null references products(id) on delete cascade,
  sort_order            int  not null default 0,
  max_qty               int  not null default 1,   -- ← The maximum quantity of this accessory on the product page
  postillya_image_id    uuid references images(id) on delete set null,
  karkas_image_id       uuid references images(id) on delete set null,
  matrats_image_id      uuid references images(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (product_id, accessory_product_id)
);

create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  product_ref  text,                                -- ← Product (= model name)
  author_name  text,                                -- ← First and last name
  rating       numeric,                             -- ← Rating
  text         text,                                -- ← Text
  created_at   date                                 -- ← Created
);

create table if not exists banners (
  id          uuid primary key default gen_random_uuid(),
  name        text,                                 -- ← Name
  type        text,                                 -- ← Type: Слайдер | Каталог | Категорія
  image       text,                                 -- ← Image
  sort_order  numeric,                              -- ← Order
  active      boolean default true,                 -- ← Active
  col_span    int                                   -- ← Width (1–4)
);

create table if not exists top_products (
  product_id  uuid references products(id) on delete cascade,
  sort_order  int default 0,
  primary key (product_id)
);

create table if not exists option_filters (
  id          uuid primary key default gen_random_uuid(),
  name        text,                                 -- ← Name (group prefix)
  categories  text[] default '{}',                  -- ← Categories
  sort_order  int default 0                         -- ← Order in filters
);

-- Leads/orders — created going forward, NOT imported (old Запити is PII + test junk).
create table if not exists requests (
  id                  uuid primary key default gen_random_uuid(),
  name                text,
  phone_number        text,
  order_number        text,
  delivery            text,
  delivery_city       text,
  delivery_warehouse  text,
  orders              jsonb,
  progress            text,
  created_at          timestamptz default now()
);

-- Top-level catalogs shown in the storefront filter (see supabase/catalogs.sql for the migration + seed).
create table if not exists catalogs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- ← Catalog name (Стільці, Столи…)
  sort_order int  not null default 0        -- ← order in the catalog filter
);

-- A subcategory tree of arbitrary depth (see supabase/subcategory_tree.sql —
-- the migration from the previous 2-level scheme with a text parent).
create table if not exists subcategory_options (
  id        uuid primary key default gen_random_uuid(),
  catalog   text not null,      -- ← which main catalog this belongs under, e.g. "Ліжка" (catalogs.name)
  parent_id uuid references subcategory_options(id) on delete cascade,  -- ← null = a root under the catalog
  name      text not null,
  unique (catalog, parent_id, name)
);
create index if not exists idx_subcategory_options_parent on subcategory_options (parent_id);

create index if not exists idx_products_catalog        on products (catalog);
create index if not exists idx_products_visible        on products (visible);
create index if not exists idx_variants_product_id     on variants (product_id);
create index if not exists idx_variant_specs_variant   on variant_specs (variant_id);
create index if not exists idx_variant_options_variant on variant_options (variant_id);
create index if not exists idx_banners_type            on banners (type);
create index if not exists idx_comments_product_ref    on comments (product_ref);
create index if not exists idx_subcategory_options_catalog on subcategory_options (catalog);
create index if not exists idx_product_accessories_product   on product_accessories (product_id);
create index if not exists idx_product_accessories_accessory  on product_accessories (accessory_product_id);
