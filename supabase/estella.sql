-- Estella import — run once in the Supabase SQL editor.
-- Adds a staging table for the Estella XML feed.

-- Staging area for parsed <offer> rows. The huge estella_all.xml is parsed in the
-- browser and streamed here in batches; the admin list, filters and "Add" buttons
-- all read from this table. Promotion copies rows into products/variants.
create table if not exists estella_offers (
  offer_id   text primary key,            -- <offer Id>
  name       text,                         -- product name (groups offers into one product)
  model      text,                         -- variant descriptor (e.g. «80х200 106 Щит Л4»)
  price      numeric,
  quantity   numeric,
  vendor     text,
  color_code text,                         -- «Колір» param value (101–110)
  params     jsonb default '{}'::jsonb,    -- all <param> name→value (incl. Колір)
  available  boolean default false,        -- set from estella_DATE.xml
  imported   boolean default false,        -- already promoted to products/variants?
  created_at timestamptz default now()
);

create index if not exists idx_estella_available on estella_offers (available);
create index if not exists idx_estella_name       on estella_offers (name);
