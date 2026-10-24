-- Per-accessory cap on how many units a customer can add on the product page.
-- Run once by hand in the Supabase SQL editor (same convention as product_accessories.sql).
alter table product_accessories
  add column if not exists max_qty int not null default 1;
