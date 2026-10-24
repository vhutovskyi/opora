import { supabaseAdmin } from "@/lib/supabase";
import { imageGroupKey } from "./imageGroups";
import { deleteImageUrls } from "@/lib/r2";

const db = () => supabaseAdmin();

// Image ids referenced by a set of variants (via variant_images).
export async function imageIdsForVariants(variantIds: string[]): Promise<string[]> {
  if (!variantIds.length) return [];
  const { data } = await db().from("variant_images").select("image_id").in("variant_id", variantIds);
  return [...new Set((data || []).map((r) => r.image_id as string))];
}

// Delete any of the candidate images that no variant still references (R2 objects + row).
// Images are shared across a Матеріал+Колір group, so deleting one variant usually leaves its
// images alive under its siblings — only genuinely orphaned rows are removed.
export async function deleteOrphanedImages(candidateImageIds: string[]) {
  if (!candidateImageIds.length) return;
  const { data: refs } = await db().from("variant_images").select("image_id").in("image_id", candidateImageIds);
  const stillUsed = new Set((refs || []).map((r) => r.image_id as string));
  const orphans = candidateImageIds.filter((id) => !stillUsed.has(id));
  if (!orphans.length) return;
  const { data: imgs } = await db().from("images").select("url, url_compressed").in("id", orphans);
  await deleteImageUrls(
    (imgs || []).flatMap((i) => [i.url as string, i.url_compressed as string | null].filter(Boolean) as string[])
  );
  await db().from("images").delete().in("id", orphans);
}

// Upsert images rows by url (idempotent), returning their ids in the SAME order as `pairs`.
export async function upsertImages(pairs: { url: string; url_compressed: string }[]): Promise<string[]> {
  if (!pairs.length) return [];
  const { data } = await db()
    .from("images")
    .upsert(
      pairs.map((p) => ({ url: p.url, url_compressed: p.url_compressed })),
      { onConflict: "url" }
    )
    .select("id, url");
  const idByUrl = new Map((data || []).map((r) => [r.url as string, r.id as string]));
  return pairs.map((p) => idByUrl.get(p.url)).filter(Boolean) as string[];
}

// Every variant of the same product whose Матеріал+Колір matches `variantId` (ignores розмір/ламелі),
// i.e. the set of variants that should share the same photos. Includes the variant itself.
export async function groupVariantIds(variantId: string): Promise<string[]> {
  const { data: target } = await db().from("variants").select("product_id").eq("id", variantId).maybeSingle();
  if (!target?.product_id) return [variantId];
  const { data: siblings } = await db()
    .from("variants")
    .select("id, variant_options ( options ( name ) )")
    .eq("product_id", target.product_id);
  type Row = { id: string; variant_options: { options: { name: string | null } | null }[] | null };
  const rows = (siblings || []) as unknown as Row[];
  const keyOf = (v: Row) =>
    imageGroupKey((v.variant_options || []).map((vo) => vo.options?.name).filter(Boolean) as string[]);
  const targetRow = rows.find((v) => v.id === variantId);
  if (!targetRow) return [variantId];
  const targetKey = keyOf(targetRow);
  return rows.filter((v) => keyOf(v) === targetKey).map((v) => v.id);
}

// Link image ids to every variant in the group, appending after each variant's current max sort_order.
export async function linkImagesToVariants(imageIds: string[], variantIds: string[]): Promise<void> {
  if (!imageIds.length || !variantIds.length) return;
  const { data: existing } = await db().from("variant_images").select("variant_id, sort_order").in("variant_id", variantIds);
  const maxByVariant = new Map<string, number>();
  for (const r of existing || []) {
    const cur = maxByVariant.get(r.variant_id as string) ?? -1;
    maxByVariant.set(r.variant_id as string, Math.max(cur, (r.sort_order as number) ?? 0));
  }
  const rows = variantIds.flatMap((variant_id) => {
    let n = (maxByVariant.get(variant_id) ?? -1) + 1;
    return imageIds.map((image_id) => ({ variant_id, image_id, sort_order: n++ }));
  });
  await db().from("variant_images").upsert(rows, { onConflict: "variant_id,image_id" });
}

// Swap an image with its left/right neighbour in display order, for `variantId` AND every sibling
// in its Матеріал+Колір group (same propagation as upload/delete — photos are shared, so the order
// should stay in sync across the group too).
export async function reorderGroupImage(variantId: string, imageId: string, dir: "left" | "right"): Promise<void> {
  const variantIds = await groupVariantIds(variantId);
  const { data } = await db().from("variant_images").select("variant_id, image_id, sort_order").in("variant_id", variantIds);
  const rows = (data || []) as { variant_id: string; image_id: string; sort_order: number | null }[];
  const byVariant = new Map<string, typeof rows>();
  for (const r of rows) byVariant.set(r.variant_id, [...(byVariant.get(r.variant_id) ?? []), r]);

  const updates: { variant_id: string; image_id: string; sort_order: number }[] = [];
  for (const [vId, list] of byVariant) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = list.findIndex((r) => r.image_id === imageId);
    const target = dir === "left" ? idx - 1 : idx + 1;
    if (idx === -1 || target < 0 || target >= list.length) continue;
    updates.push({ variant_id: vId, image_id: list[idx].image_id, sort_order: list[target].sort_order ?? target });
    updates.push({ variant_id: vId, image_id: list[target].image_id, sort_order: list[idx].sort_order ?? idx });
  }
  await Promise.all(
    updates.map((u) => db().from("variant_images").update({ sort_order: u.sort_order }).eq("variant_id", u.variant_id).eq("image_id", u.image_id))
  );
}

// Distinct image ids currently linked to any of these variants.
export async function groupImageIds(variantIds: string[]): Promise<string[]> {
  const { data } = await db().from("variant_images").select("image_id").in("variant_id", variantIds);
  return [...new Set((data || []).map((r) => r.image_id as string))];
}

// Hard-delete images (R2 objects + rows; cascade removes variant_images links).
export async function deleteImagesByIds(imageIds: string[]): Promise<void> {
  if (!imageIds.length) return;
  const { data: imgs } = await db().from("images").select("url, url_compressed").in("id", imageIds);
  await deleteImageUrls(
    (imgs || []).flatMap((i) => [i.url as string, i.url_compressed as string | null].filter(Boolean) as string[])
  );
  await db().from("images").delete().in("id", imageIds);
}
