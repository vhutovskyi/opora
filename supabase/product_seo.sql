-- Product SEO metadata, edited by hand in the admin panel.
-- Apply by hand in the Supabase SQL editor (like the rest of the files here).
--
-- Both fields are OPTIONAL: empty = generated as before (the title from the model,
-- the description from the minimum price). See generateMetadata in src/app/catalog/[slug]/page.tsx.

alter table products add column if not exists seo_title       text;  -- ← SEO title (<title>)
alter table products add column if not exists seo_description text;  -- ← SEO description (meta description)
