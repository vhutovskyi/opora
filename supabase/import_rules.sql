-- Import rules: per-catalog rules for extracting options and splitting variants during XML/folder import.
-- Apply by hand in the Supabase SQL editor (same pattern as estella.sql, catalogs.sql, etc).

create table if not exists estella_catalog_rules (
  id           uuid primary key default gen_random_uuid(),
  catalog      text not null unique,                -- catalog name (6 built-ins + admin-defined custom ones)
  name_match   text,                                -- regex detecting this catalog from the product name (custom catalogs)
  option_rules jsonb not null default '[]'::jsonb, -- OptionRule[] (see src/lib/estella/catalogRules.ts)
  split_rule   jsonb,                               -- SplitRule | null
  created_at   timestamptz default now()
);

-- Custom catalogs added after the initial 6 need this column; safe to re-run.
alter table estella_catalog_rules add column if not exists name_match text;

-- Seed the existing hardcoded rules (Коліщатка for Тумби/Шухляди/Комоди, Ламелі for Ліжка).
-- These are inserted by hand or via the admin UI; update if needed.

insert into estella_catalog_rules (catalog, option_rules) values
  ('Тумби', '[{"id":"wheel-0","source":"model","match":"комфорт","optionName":"Коліщатка","valueMode":"conditional","conditionalMatch":"комфорт","trueValue":"Резинові","falseValue":"Пластикові"}]'::jsonb),
  ('Шухляди', '[{"id":"wheel-0","source":"model","match":"комфорт","optionName":"Коліщатка","valueMode":"conditional","conditionalMatch":"комфорт","trueValue":"Резинові","falseValue":"Пластикові"}]'::jsonb),
  ('Комоди', '[{"id":"wheel-0","source":"model","match":"комфорт","optionName":"Коліщатка","valueMode":"conditional","conditionalMatch":"комфорт","trueValue":"Резинові","falseValue":"Пластикові"}]'::jsonb),
  ('Ліжка', '[{"id":"lamels-0","source":"model","match":"Л\\s*(\\d+(?:[,.]\\d+)?)","optionName":"Відстань між ламелями","valueMode":"capture","captureTemplate":"${1}см"}]'::jsonb),
  ('Стільці', '[]'::jsonb),
  ('Столи', '[]'::jsonb)
on conflict (catalog) do nothing;

-- Custom catalog «Планки безпеки»: map model tokens («134 см 109 Масив») to options.
--   «134см» → Розмір (string), «Масив»/«Щит» → Матеріал (string). Колір («109» → Сірий) already
--   comes from the <param name="Колір"> code, so no model rule is needed for it.
insert into estella_catalog_rules (catalog, name_match, option_rules) values
  ('Планки безпеки', '^планка безпеки', '[
    {"id":"size-0","source":"model","match":"(\\d+)\\s*см","optionName":"Розмір","valueMode":"capture","captureTemplate":"${1}см"},
    {"id":"material-0","source":"model","match":"(Масив|Щит)","optionName":"Матеріал","valueMode":"capture","captureTemplate":"${1}"}
  ]'::jsonb)
on conflict (catalog) do update set name_match = excluded.name_match, option_rules = excluded.option_rules;
