create table if not exists product_accessories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  accessory_product_id uuid not null references products(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, accessory_product_id)
);
create index if not exists idx_product_accessories_product on product_accessories (product_id);
create index if not exists idx_product_accessories_accessory on product_accessories (accessory_product_id);
