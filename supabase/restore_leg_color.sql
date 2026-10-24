-- Restoring the "Колір ніжок" axis for the chairs.
--
-- checkbox_options.sql deleted this axis GLOBALLY (`delete from options where name ilike
-- 'Колір ніжок:%'`) for the sake of the beds — along with the beds it wiped the chairs, where the axis is needed:
-- the second swatches in BuyBox, the two-colour circle in ProductCard and the option in the admin panel disappeared.
--
-- The leg values are taken from the photo path: .../output/<upholstery>-<legs>/NN.png (chairs only).
-- Idempotent, run by hand in the Supabase SQL editor.

insert into options (name, value) values
  ('Колір ніжок: Чорний', '#000000'),
  ('Колір ніжок: Білий',  '#FFFFFF')
on conflict (name, value) do nothing;

insert into variant_options (variant_id, option_id)
select distinct vi.variant_id, o.id
from variant_images vi
join images i on i.id = vi.image_id
join options o
  on o.name = 'Колір ніжок: ' || case when i.url like '%-white/%' then 'Білий' else 'Чорний' end
where i.url like '%-white/%' or i.url like '%-black/%'
on conflict do nothing;

-- Rollback: delete from options where name ilike 'Колір ніжок:%';
