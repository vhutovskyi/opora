-- Migration: drop per-variant quantity; availability is the in_stock boolean.
-- Run once in the Supabase SQL editor. in_stock already exists (schema.sql, default true).

update variants set in_stock = true where in_stock is null;   -- ← every variant with no availability → in stock
alter table variants drop column if exists quantity;
