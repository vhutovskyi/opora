"use server";

import { db, bump } from "./_shared";

export async function listCatalogs() {
  const { data } = await db().from("catalogs").select("id, name, sort_order").order("sort_order").order("name");
  return (data || []) as { id: string; name: string; sort_order: number }[];
}

export async function saveCatalog(input: { id?: string; name: string; sort_order?: number }) {
  const { id, ...fields } = input;
  const base = id ? db().from("catalogs").update(fields).eq("id", id) : db().from("catalogs").insert(fields);
  const { data, error } = await base.select("id, name, sort_order").single();
  if (error) throw new Error(error.message);
  bump();
  return data as { id: string; name: string; sort_order: number };
}

export async function deleteCatalog(id: string) {
  const { error } = await db().from("catalogs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}

export async function reorderCatalogs(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map(async (id, sort_order) => {
      const { error } = await db().from("catalogs").update({ sort_order }).eq("id", id);
      if (error) throw new Error(error.message);
    })
  );
  bump();
}
