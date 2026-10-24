"use server";

import { db, bump } from "./_shared";
import { isMissingTable } from "@/lib/supabase/client";
import type { LongDescriptionBlock, LongDescriptionSnippet } from "@/lib/longDescription/types";

// Shared long-description blocks (long_description_snippets). A product references them,
// the storefront inlines the references on read — that is why every change here purges the catalog cache.

export async function listSnippets(): Promise<LongDescriptionSnippet[]> {
  const { data, error } = await db()
    .from("long_description_snippets")
    .select("id, name, blocks")
    .order("name");
  // The table doesn't exist yet (long_description_snippets.sql is applied by hand). The product
  // page calls this list too, so without this branch it wouldn't open.
  if (isMissingTable(error)) return [];
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: (s.name as string) ?? "",
    blocks: (Array.isArray(s.blocks) ? s.blocks : []) as LongDescriptionBlock[],
  }));
}

export async function saveSnippet(input: { id?: string; name: string; blocks: LongDescriptionBlock[] }) {
  const payload = { name: input.name, blocks: input.blocks };
  const q = input.id
    ? db().from("long_description_snippets").update(payload).eq("id", input.id)
    : db().from("long_description_snippets").insert(payload);
  const { data, error } = await q.select("id").single();
  if (error) throw new Error(error.message);
  bump();
  return data.id as string;
}

export async function deleteSnippet(id: string) {
  const { error } = await db().from("long_description_snippets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
