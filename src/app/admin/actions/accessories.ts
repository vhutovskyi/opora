"use server";

import { db, bump } from "./_shared";
import { deleteImagesByIds } from "@/lib/supabase/images";

// Replace the whole list. The same accessory product may appear twice (Лаос offers a small AND a
// large «Планка безпеки»), so there is no key to upsert on — and nothing references
// product_accessories.id any more (combo photos are keyed by accessory PRODUCT), so recreating
// the rows loses nothing.
export async function setProductAccessories(
  productId: string,
  accessories: { accessoryProductId: string; maxQty: number }[]
) {
  const rows = accessories.filter((r) => r.accessoryProductId);
  const { error: delError } = await db().from("product_accessories").delete().eq("product_id", productId);
  if (delError) throw new Error(delError.message);
  if (rows.length) {
    const { error } = await db()
      .from("product_accessories")
      .insert(
        rows.map(({ accessoryProductId, maxQty }, i) => ({
          product_id: productId,
          accessory_product_id: accessoryProductId,
          sort_order: i,
          max_qty: Math.max(1, maxQty || 1),
        }))
      );
    if (error) throw new Error(error.message);
  }
  bump();
}

// Delete combo photo sets — one set, or every set of a product (before re-running an import:
// R2 keys carry a Date.now() prefix, so a second import ADDS copies instead of replacing them).
// Returns how many sets were removed.
export async function deleteComboPhotos(productId: string, comboPhotoId?: string): Promise<number> {
  const base = db().from("accessory_combo_photos").select("id").eq("product_id", productId);
  const { data: sets, error: setsError } = comboPhotoId ? await base.eq("id", comboPhotoId) : await base;
  if (setsError) throw new Error(setsError.message);
  const setIds = (sets ?? []).map((s) => s.id as string);
  if (!setIds.length) return 0;

  const links: { image_id: string }[] = [];
  for (const chunk of chunked(setIds, 200)) {
    const { data } = await db().from("accessory_combo_images").select("image_id").in("combo_photo_id", chunk);
    links.push(...(data ?? []));
  }
  const candidates = [...new Set(links.map((l) => l.image_id))];

  for (const chunk of chunked(setIds, 200)) {
    const { error } = await db().from("accessory_combo_photos").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }

  // One upload can serve several sets (Лаос: «мала та велика планки»), so drop only the images
  // nothing references any more — and chunk the lookups, a bed can hold 1000+ of them.
  const stillUsed = new Set<string>();
  for (const chunk of chunked(candidates, 200)) {
    const [combo, variant] = await Promise.all([
      db().from("accessory_combo_images").select("image_id").in("image_id", chunk),
      db().from("variant_images").select("image_id").in("image_id", chunk),
    ]);
    for (const r of [...(combo.data ?? []), ...(variant.data ?? [])]) stillUsed.add(r.image_id as string);
  }
  const orphans = candidates.filter((id) => !stillUsed.has(id));
  for (const chunk of chunked(orphans, 200)) await deleteImagesByIds(chunk);

  bump();
  return setIds.length;
}

const chunked = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// products.combo_axis — which of the accessory's own option axes swaps the HOST product's photos.
// Normally written automatically by the folder importer (it learns the axis from whichever option
// value the upgrade-folder name matched), so there is nothing to configure by hand.
export async function setAccessoryComboAxis(accessoryProductId: string, axis: string | null) {
  const { error } = await db().from("products").update({ combo_axis: axis }).eq("id", accessoryProductId);
  if (error) throw new Error(error.message);
  bump();
}
