-- Markdown info shown once per option axis ("key" — the part of an option's name
-- before the colon, e.g. "Матеріал"), not per value: "Матеріал: Масив" and
-- "Матеріал: Щит" share the same info instead of duplicating it per row.
create table if not exists option_group_info (
  key  text primary key,  -- ← The axis name before the colon ("Матеріал")
  info text
);
