"use server";

import { db, bump } from "./_shared";
import { SLUG_RE } from "@/lib/supabase/client";
import type { SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";

export async function listSubcategoryOptions() {
  const { data } = await db()
    .from("subcategory_options")
    .select("id, catalog, parent_id, name, sort_order, slug, is_group")
    .order("catalog")
    .order("sort_order")
    .order("name");
  return (data || []) as SubcategoryOptionRow[];
}

export async function saveSubcategoryOption(input: {
  id?: string;
  catalog: string;
  parent_id: string | null;
  name: string;
  sort_order?: number;
  slug?: string | null;
  is_group?: boolean;
}) {
  const { id, ...fields } = input;
  // An empty input → null, not "": the column is unique, so two empty rows would conflict.
  if ("slug" in fields) {
    const slug = fields.slug?.trim() || null;
    if (slug && !SLUG_RE.test(slug)) throw new Error("Слаг: лише латиниця, цифри й дефіси (напр. wooden-beds)");
    fields.slug = slug;
  }
  const base = id ? db().from("subcategory_options").update(fields).eq("id", id) : db().from("subcategory_options").insert(fields);
  const { data, error } = await base.select("id, catalog, parent_id, name, sort_order, slug, is_group").single();
  if (error) throw new Error(error.code === "23505" ? `Слаг «${fields.slug}» вже зайнятий` : error.message);
  bump();
  return data as SubcategoryOptionRow;
}

// Renumbers the whole list of siblings (sort_order = position) instead of swapping two of them:
// legacy rows have sort_order 0 everywhere, so swapping two values would change nothing.
// There is only a handful of siblings per level, so N updates are cheaper than reasoning about ties.
export async function reorderSubcategoryOptions(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map(async (id, sort_order) => {
      const { error } = await db().from("subcategory_options").update({ sort_order }).eq("id", id);
      if (error) throw new Error(error.message);
    })
  );
  bump();
}

// Resolves a path of names (root→leaf) into a chain of ids, creating the missing levels.
// Reads the DB rather than the client's taxonomy snapshot: in a batch import neighbouring products
// often share one path, and the client snapshot updates asynchronously and lags behind.
export async function ensureSubcategoryPath(catalog: string, path: string[]): Promise<string[]> {
  const ids: string[] = [];
  let parentId: string | null = null;
  for (const raw of path) {
    const name = raw.trim();
    if (!name) continue;
    const base = db().from("subcategory_options").select("id").eq("catalog", catalog).eq("name", name);
    const { data: found } = await (parentId === null
      ? base.is("parent_id", null)
      : base.eq("parent_id", parentId)
    ).maybeSingle();
    let id = found?.id as string | undefined;
    if (!id) {
      const { data, error } = await db()
        .from("subcategory_options")
        .insert({ catalog, parent_id: parentId, name })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = data.id as string;
    }
    ids.push(id);
    parentId = id;
  }
  if (ids.length) bump();
  return ids;
}

export async function deleteSubcategoryOption(id: string) {
  const { error } = await db().from("subcategory_options").delete().eq("id", id);
  if (error) throw new Error(error.message);
  bump();
}
