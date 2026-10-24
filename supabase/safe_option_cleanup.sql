-- Safe pattern for bulk-deleting an option axis without cross-catalog blast radius.
--
-- Incident (restore_leg_color.sql): checkbox_options.sql ran `delete from options where
-- name ilike 'Колір ніжок:%'` globally to clean up a leg-color experiment on beds.
-- It also deleted the same axis for chairs (literally the same option row, since options
-- are shared: unique(name, value)). The chair axis was manually reconstructed in
-- restore_leg_color.sql by inferring color from image URL substrings.
--
-- Root cause: `options` rows are intentionally shared across product types (the unique
-- constraint and dedup-on-upsert in promoteService.ts ensure this). A name-only delete
-- can NEVER safely assume it only affects one catalog/product_type — if two catalogs
-- happen to use the same option axis name, a name-based deletion wipes it for both.
--
-- Any FUTURE bulk cleanup MUST follow this three-step shape instead of a blind
-- name-based delete. No new schema column is needed — products.catalog is already the
-- product-type dimension, reachable via the join: variant_options → variants → products.
--
-- HOW TO USE THIS TEMPLATE:
-- 1. Run Step 0 first — eyeball the catalog breakdown to confirm you're targeting the
--    right catalogs and not about to nuke option usage in unrelated product types.
-- 2. Run Step 1 to unlink the targeted catalog's variants from the option(s).
-- 3. Run Step 2 to delete the option rows only once verified they have zero remaining
--    variant_options references anywhere in the database.
-- 4. NEVER skip Step 0 or Step 2; NEVER run a name-based delete directly.
--
-- NOTE: `:pattern` and `:catalog` are placeholders — edit them per your actual cleanup.

-- STEP 0 — ALWAYS RUN FIRST, EYEBALL THE RESULTS.
-- Shows which catalogs' products are linked to the target option name(s), and the count.
-- If multiple unrelated catalogs show up, STOP here and revise your approach.
select p.catalog, count(distinct v.id) as variant_count
from options o
join variant_options vo on vo.option_id = o.id
join variants v on v.id = vo.variant_id
join products p on p.id = v.product_id
where o.name ilike :pattern  -- example: 'Колір ніжок:%'
group by p.catalog
order by p.catalog;

-- STEP 1 — UNLINK ONLY THE TARGET CATALOG'S VARIANTS.
-- Delete variant_options rows that link the target catalog's products to the option.
delete from variant_options vo
using variants v, products p, options o
where vo.variant_id = v.id
  and v.product_id = p.id
  and vo.option_id = o.id
  and o.name ilike :pattern  -- example: 'Колір ніжок:%'
  and p.catalog = :catalog;  -- example: 'Ліжка'

-- STEP 2 — DELETE THE OPTION ROWS ONLY ONCE VERIFIED ORPHANED EVERYWHERE.
-- This is the crucial safety check: we delete option rows only if they have ZERO
-- remaining variant_options references, not just zero references in the target catalog.
-- This prevents the same incident from recurring if the pattern happened to match
-- options in multiple catalogs.
delete from options o
where o.name ilike :pattern  -- same pattern as Step 0/1
  and not exists (select 1 from variant_options vo where vo.option_id = o.id);
