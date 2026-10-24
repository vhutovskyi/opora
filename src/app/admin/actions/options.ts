"use server";

import { db, bump } from "./_shared";

export async function listOptions() {
  const { data } = await db().from("options").select("id, name, value, sort_order").order("sort_order").order("name");
  return (data || []) as { id: string; name: string; value: string | null; sort_order: number }[];
}

// Options are shared across product types (unique(name, value)), so the per-product editor
// would otherwise offer every other catalog's axes. Scope by the catalog of the products
// already using each option; unused options stay selectable everywhere.
export async function listOptionsByCatalog(catalog: string) {
  if (!catalog) return listOptions();
  const { data } = await db()
    .from("options")
    .select("id, name, value, variant_options ( variants ( products ( catalog ) ) )")
    .order("name");
  type Row = {
    id: string;
    name: string;
    value: string | null;
    variant_options: { variants: { products: { catalog: string | null } | null } | null }[] | null;
  };
  return ((data || []) as unknown as Row[])
    .filter((o) => {
      const catalogs = (o.variant_options || []).map((vo) => vo.variants?.products?.catalog).filter(Boolean);
      return catalogs.length === 0 || catalogs.includes(catalog);
    })
    .map(({ id, name, value }) => ({ id, name, value }));
}

export async function saveOption(input: { id?: string; name: string; value?: string }) {
  const { id, ...fields } = input;
  const base = id ? db().from("options").update(fields).eq("id", id) : db().from("options").insert(fields);
  const { data, error } = await base.select("id, name, value").single();
  if (error) throw new Error(error.message);
  bump();
  return data as { id: string; name: string; value: string | null };
}

export async function deleteOption(id: string) {
  const { error } = await db().from("options").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}

// Info is keyed by axis ("Матеріал"), not by option row, so every value under that
// axis ("Матеріал: Масив", "Матеріал: Щит", ...) shares one markdown blob.
export async function listOptionGroupInfo() {
  const { data } = await db().from("option_group_info").select("key, info");
  return (data || []) as { key: string; info: string | null }[];
}

export async function saveOptionGroupInfo(key: string, info: string) {
  const { data, error } = await db()
    .from("option_group_info")
    .upsert({ key, info }, { onConflict: "key" })
    .select("key, info")
    .single();
  if (error) throw new Error(error.message);
  bump();
  return data as { key: string; info: string | null };
}

export async function updateOptionSortOrder(id: string, sortOrder: number) {
  const { error } = await db().from("options").update({ sort_order: sortOrder }).eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
