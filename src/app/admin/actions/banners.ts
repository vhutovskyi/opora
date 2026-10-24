"use server";

import { db, bump } from "./_shared";

export async function listBanners() {
  const { data } = await db().from("banners").select("*").order("type").order("sort_order");
  return data || [];
}

export async function saveBanner(input: {
  id?: string;
  name?: string;
  type: string;
  image?: string;
  sort_order?: number | null;
  active?: boolean;
  col_span?: number | null;
  title?: string | null;
  subtitle?: string | null;
}) {
  const { id, ...fields } = input;
  const q = id ? db().from("banners").update(fields).eq("id", id) : db().from("banners").insert(fields);
  const { error } = await q;
  if (error) throw new Error(error.message);
  bump();
}

export async function deleteBanner(id: string) {
  const { error } = await db().from("banners").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
