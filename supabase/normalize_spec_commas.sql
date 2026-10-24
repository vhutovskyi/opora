-- Normalize list separators in product_specs so the UI (splits on ", ") lists real
-- multi-value characteristics but never splits a decimal comma.
--
-- Touches ONLY values that are not a single plain number:
--   «80х200,80х190»  → «80х200, 80х190»   (real list — will render as bullets)
--   «0,14», «0.096», «33» → left untouched (single number — renders as one value)
--
-- Assumes units live in the spec NAME, not the value (e.g. «Об'єм (м3)» → «0,14»).
-- A rare unit-suffixed decimal like «1,5 м» would be wrongly spaced — fix those by hand.

update product_specs
set value = regexp_replace(btrim(value), '\s*,\s*', ', ', 'g')
where value like '%,%'
  and btrim(value) !~ '^-?\d+([.,]\d+)?$';
