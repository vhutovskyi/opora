-- Столи: «Матеріал каркаса» — «метал» → «Метал із порошковим покриттям».
-- Applied by hand in the Supabase SQL editor, like every other file here. Idempotent: the second
-- run matches nothing. Purge the storefront cache afterwards (any save in /admin calls bump()).
update variant_specs vs
set value = 'Метал із порошковим покриттям'
from specs s, variants v, products p
where vs.spec_id = s.id
  and s.name = 'Матеріал каркаса'
  and vs.variant_id = v.id
  and v.product_id = p.id
  and p.catalog = 'Столи'
  and vs.value = 'метал';
