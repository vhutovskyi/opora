"use server";

import { db, bump } from "./_shared";

export async function listComments() {
  const { data } = await db().from("comments").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function saveComment(input: {
  id?: string;
  author_name?: string;
  rating?: number;
  text?: string;
  product_ref?: string;
  created_at?: string;
}) {
  const { id, ...fields } = input;
  const q = id ? db().from("comments").update(fields).eq("id", id) : db().from("comments").insert(fields);
  const { error } = await q;
  if (error) throw new Error(error.message);
  bump();
}

export async function deleteComment(id: string) {
  const { error } = await db().from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
