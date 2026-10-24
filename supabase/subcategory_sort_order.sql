-- Add manual sort_order to subcategory_options tree nodes.
-- Allows admins to reorder facet groups and their values in CatalogsManager,
-- overriding the default alphabetical sort (which breaks size scales, firmness, etc).
-- This file is run once by hand in the Supabase SQL editor, like other one-off migrations.

alter table subcategory_options add column if not exists sort_order integer not null default 0;
