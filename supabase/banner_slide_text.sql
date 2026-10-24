-- Optional per-slide title/subtitle override for the hero slider ("Слайдер" banners).
-- Apply by hand in the Supabase SQL editor (like the rest of the files here).
--
-- Both are optional: blank rows keep falling back to the hardcoded mock text
-- (src/components/layout/Slider.tsx, cycled by slide index), so existing slider
-- banners keep working unchanged.

alter table banners add column if not exists title text;     -- ← Заголовок слайду
alter table banners add column if not exists subtitle text;  -- ← Підзаголовок слайду
