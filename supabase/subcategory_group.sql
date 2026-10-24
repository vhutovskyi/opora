-- Mark root-level subcategory_options rows as "group" nodes (non-navigable headers in the filter sidebar and storefront nav).
-- A group node has children but is not itself a clickable link in the Header/MenuDrawer; it appears as a filter accordion section in the catalog page.
alter table subcategory_options add column if not exists is_group boolean not null default false;
