-- Per-product desktop gallery grid layout, configured in the admin editor.
-- Comma-separated images-per-row, e.g. "1,2" = row 1 one full-width image, row 2 two half-width.
-- Images beyond the pattern fall back to the default 2-col grid. Null/empty = default.
alter table products add column if not exists gallery_layout text;
