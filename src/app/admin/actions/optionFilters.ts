"use server";

import { db, bump } from "./_shared";

export async function listOptionFilters() {
  const { data } = await db().from("option_filters").select("*").order("sort_order").order("name");
  return (data || []) as { id: string; name: string; categories: string[]; sort_order: number }[];
}

export async function saveOptionFilter(input: { id?: string; name: string; categories: string[] }) {
  const { id, ...fields } = input;
  const base = id ? db().from("option_filters").update(fields).eq("id", id) : db().from("option_filters").insert(fields);
  const { data, error } = await base.select("id, name, categories").single();
  if (error) throw new Error(error.message);
  bump();
  return data as { id: string; name: string; categories: string[] };
}

export async function deleteOptionFilter(id: string) {
  const { error } = await db().from("option_filters").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}

export async function updateOptionFilterSortOrder(id: string, sortOrder: number) {
  const { error } = await db().from("option_filters").update({ sort_order: sortOrder }).eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
