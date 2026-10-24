"use server";

import { db, bump } from "./_shared";

export async function listSpecs() {
  const { data } = await db().from("specs").select("id, name, filterable").order("name");
  return (data || []) as { id: string; name: string; filterable: boolean }[];
}

export async function saveSpec(input: { id?: string; name: string; filterable?: boolean }) {
  const { id, ...fields } = input;
  const base = id ? db().from("specs").update(fields).eq("id", id) : db().from("specs").insert(fields);
  const { data, error } = await base.select("id, name, filterable").single();
  if (error) throw new Error(error.message);
  bump();
  return data as { id: string; name: string; filterable: boolean };
}

export async function deleteSpec(id: string) {
  const { error } = await db().from("specs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}

export async function setVariantSpecs(variantId: string, items: { spec_id: string; value: string }[]) {
  await db().from("variant_specs").delete().eq("variant_id", variantId);
  if (items.length) {
    const { error } = await db()
      .from("variant_specs")
      .insert(items.map((it, i) => ({ variant_id: variantId, spec_id: it.spec_id, value: it.value, legacy_num: i })));
    if (error) throw new Error(error.message);
  }
  bump();
}
