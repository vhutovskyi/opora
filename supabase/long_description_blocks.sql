-- long_description: text (Markdown + raw HTML) → jsonb array of typed content blocks.
-- The admin now composes the product page's detailed description from a fixed set of
-- Tailwind section components (LongDescriptionRenderer) instead of free-form HTML.
-- Applied by hand in the Supabase SQL editor (no migrations dir — see CLAUDE.md).
--
-- Idempotent: the conversion only runs while the column is still text, so re-running this
-- on an already-migrated DB is a no-op instead of `operator does not exist: jsonb ~ unknown`.
-- Old Markdown/HTML prose is dropped (nothing renders it any more), but rows that already
-- hold a serialized block array are kept: while the column was text, saving from the new
-- builder stored the array as a JSON *string*, and that content is real.

do $$
begin
  if (
    select data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'long_description'
  ) = 'text' then
    alter table products alter column long_description drop default;

    alter table products
      alter column long_description type jsonb
      using case
        when long_description ~ '^\s*\[' then long_description::jsonb
        else null
      end;
  end if;
end $$;

alter table products alter column long_description set default '[]'::jsonb;
