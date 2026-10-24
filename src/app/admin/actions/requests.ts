"use server";

import { revalidatePath } from "next/cache";
import { db } from "./_shared";

export async function listRequests() {
  const { data } = await db().from("requests").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function updateRequestProgress(id: string, progress: string) {
  const { error } = await db().from("requests").update({ progress }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/requests");
}

export async function deleteRequest(id: string) {
  const { error } = await db().from("requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/requests");
}
