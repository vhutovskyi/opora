-- Migrate specs from per-product (product_specs) to per-variant (variant_specs).
-- This one-time migration creates variant_specs, backfills it from product_specs
-- (copying each product's specs to all its variants), then drops product_specs.

create table if not exists variant_specs (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references variants(id) on delete cascade,
  spec_id     uuid not null references specs(id) on delete cascade,
  value       text,
  legacy_num  int
);
create index if not exists idx_variant_specs_variant on variant_specs (variant_id);

insert into variant_specs (variant_id, spec_id, value, legacy_num)
select v.id, ps.spec_id, ps.value, ps.legacy_num
from product_specs ps
join variants v on v.product_id = ps.product_id;

drop table product_specs;
