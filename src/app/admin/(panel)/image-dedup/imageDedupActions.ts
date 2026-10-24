"use server";

import { updateTag } from "next/cache";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase";
import { imageGroupKey } from "@/lib/supabase/imageGroups";
import r2Client from "@/lib/r2/r2.client";

const db = () => supabaseAdmin();

type ImgPair = { url: string; url_compressed: string };

// Delete R2 objects behind photo URLs (original + its derived compressed key). Missing keys don't throw.
async function deleteR2ObjectsForUrls(urls: string[]): Promise<number> {
  const keys = new Set<string>();
  for (const url of urls) {
    let key: string | null = null;
    try {
      key = new URL(url).pathname.slice(1) || null;
    } catch {
      key = null;
    }
    if (!key) continue;
    keys.add(key);
    if (key.startsWith("images/")) keys.add(`images-compressed/${key.slice("images/".length)}.webp`);
  }
  await Promise.all(
    [...keys].map((Key) =>
      r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key })).catch(() => {})
    )
  );
  return keys.size;
}

// Upsert images by url (idempotent), returning ids in the SAME order as `pairs`.
async function upsertImages(pairs: ImgPair[]): Promise<string[]> {
  if (!pairs.length) return [];
  const { data, error } = await db()
    .from("images")
    .upsert(pairs.map((p) => ({ url: p.url, url_compressed: p.url_compressed })), { onConflict: "url" })
    .select("id, url");
  if (error) throw new Error(error.message);
  const idByUrl = new Map((data || []).map((r) => [r.url as string, r.id as string]));
  return pairs.map((p) => idByUrl.get(p.url)).filter(Boolean) as string[];
}

// Overwrite a variant's image links to exactly `imageIds`, in order. Clear-then-insert is simplest
// and idempotent (photo sets per variant are tiny).
async function setVariantImages(variantId: string, imageIds: string[]): Promise<void> {
  await db().from("variant_images").delete().eq("variant_id", variantId);
  if (imageIds.length) {
    const { error } = await db()
      .from("variant_images")
      .insert(imageIds.map((image_id, i) => ({ variant_id: variantId, image_id, sort_order: i })));
    if (error) throw new Error(error.message);
  }
}

type VImageRow = { sort_order: number | null; images: { url: string; url_compressed: string | null } | null };
type VRow = {
  id: string;
  sort_order: number | null;
  photos: string[] | null;
  photos_compressed: string[] | null;
  variant_options: { options: { name: string | null } | null }[] | null;
  variant_images: VImageRow[] | null;
};

// A variant's image pairs — from variant_images if already migrated, else legacy photos arrays.
function variantPairs(v: VRow): ImgPair[] {
  const rows = (v.variant_images || []).filter((r) => r.images);
  if (rows.length) {
    return rows
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((r) => ({ url: r.images!.url, url_compressed: r.images!.url_compressed || r.images!.url }));
  }
  const photos = v.photos || [];
  const comp = v.photos_compressed || [];
  return photos.map((url, i) => ({ url, url_compressed: comp[i] || url }));
}

export type DedupResult = { log: string[]; deletedFiles: number; variantsLinked: number; groups: number };

// Migrate + dedup ONE product's images. Groups variants by Матеріал+Колір (ignoring розмір/ламелі),
// links every variant in a group to one shared image set, and deletes the redundant R2 copies that
// only differed by size/lamels. Idempotent: re-running a migrated product is a no-op.
export async function dedupProductImages(productId: string): Promise<DedupResult> {
  const log: string[] = [];
  let deletedFiles = 0;
  let variantsLinked = 0;

  const { data: product, error } = await db()
    .from("products")
    .select(
      `model,
       variants ( id, sort_order, photos, photos_compressed,
                  variant_options ( options ( name ) ),
                  variant_images ( sort_order, images ( url, url_compressed ) ) )`
    )
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return { log: [`⚠ Товар ${productId} не знайдено`], deletedFiles: 0, variantsLinked: 0, groups: 0 };

  const name = (product.model as string) || productId;
  const variants = ((product.variants as unknown as VRow[]) || []).slice();

  // Group by visual-option key.
  const groups = new Map<string, VRow[]>();
  for (const v of variants) {
    const names = (v.variant_options || []).map((vo) => vo.options?.name).filter(Boolean) as string[];
    const key = imageGroupKey(names);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  for (const [key, group] of groups) {
    // Canonical (for the report) = lowest sort_order, tie-break by id.
    const ordered = group.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id));
    // Image source = the group variant with the MOST photos (robust if some variants got partial uploads).
    const source = group.reduce((best, v) => (variantPairs(v).length > variantPairs(best).length ? v : best), group[0]);
    const canonicalPairs = variantPairs(source);

    if (!canonicalPairs.length) {
      log.push(`• ${name} [${key || "—"}]: ${group.length} варіацій без фото — пропущено`);
      continue;
    }

    const imageIds = await upsertImages(canonicalPairs);
    const canonicalUrls = new Set(canonicalPairs.flatMap((p) => [p.url, p.url_compressed]));

    // Link the shared set to every variant in the group; collect + delete each variant's stray legacy copies.
    for (const v of group) {
      await setVariantImages(v.id, imageIds);
      variantsLinked++;
      const legacy = [...(v.photos || []), ...(v.photos_compressed || [])];
      // ponytail: legacy per-variant uploads use unique Date.now keys → safe to delete when not canonical.
      const dupes = legacy.filter((u) => u && !canonicalUrls.has(u));
      if (dupes.length) deletedFiles += await deleteR2ObjectsForUrls(dupes);
    }

    // Clear legacy arrays for the whole group (their R2 originals live on via images.url).
    await db().from("variants").update({ photos: [], photos_compressed: [] }).in("id", group.map((v) => v.id));

    log.push(
      `✓ ${name} [${key || "—"}]: канонічна ${ordered[0].id.slice(0, 8)} (${canonicalPairs.length} фото) → ${group.length} варіацій`
    );
  }

  updateTag("catalog");
  return { log, deletedFiles, variantsLinked, groups: groups.size };
}
