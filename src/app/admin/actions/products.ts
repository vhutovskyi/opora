"use server";

import { db, bump, bumpProduct } from "./_shared";
import { imageIdsForVariants, deleteOrphanedImages } from "@/lib/supabase/images";
import { isMissingTable, byIdOrSlug, SLUG_RE } from "@/lib/supabase/client";
import { releaseEstellaOffers } from "@/lib/estella/offers";
import type { LongDescriptionBlock } from "@/lib/longDescription/types";
import type { ProductFull } from "../(panel)/products/[id]/productEditorTypes";

export async function listProducts() {
  const { data } = await db()
    .from("products")
    .select("id, slug, model, catalog, min_price, manufacturer, visible, variants(count)")
    .order("model");
  return (data || []).map((p) => ({
    id: p.id as string,
    slug: (p.slug as string) || null,
    model: p.model as string,
    catalog: (p.catalog as string) || "",
    min_price: Number(p.min_price || 0),
    manufacturer: (p.manufacturer as string) || "",
    visible: !!p.visible,
    variantCount: (p.variants as { count: number }[])?.[0]?.count ?? 0,
  }));
}

export async function getProductFull(idOrSlug: string) {
  // Accepts both a uuid and a slug — /admin/products/vega opens the same editor.
  const q = byIdOrSlug(
    db()
      .from("products")
      .select(
        `id, slug, model, manufacturer, min_price, catalog, description, long_description, seo_title, seo_description, assembly_video_url, assembly_pdf_url, visible, gallery_layout,
       product_subcategories ( subcategory_option_id ),
       variants ( id, name, sku, price, in_stock, visible, discount_percent, discount_price, discounted_price, sort_order, variant_images ( image_id, sort_order, images ( id, url, url_compressed ) ), variant_options ( option_id ), variant_specs ( id, spec_id, value, legacy_num ) ),
       product_accessories!product_id ( id, accessory_product_id, sort_order, max_qty, accessory:accessory_product_id ( id, model, combo_axis, variants ( variant_options ( options ( name, value ) ) ) ) )`
      ),
    idOrSlug
  );
  if (!q) return null;
  const { data, error } = await q.maybeSingle();
  // A query error (timeout, transient connection blip) must NOT look like "product not found" —
  // the page treats a null return as notFound() and would silently 404 on a real backend error.
  if (error) throw new Error(error.message);
  if (!data) return null;
  const id = data.id as string;

  // Separate query so an un-migrated DB leaves the product EDITABLE (no combo photos) instead of
  // erroring out — same guard rationale as listSnippets.
  const { data: combos, error: comboError } = await db()
    .from("accessory_combo_photos")
    .select("id, image_group_key, combo_key, label, accessory_combo_images ( sort_order, images ( id, url ) )")
    .eq("product_id", id);
  if (comboError && !isMissingTable(comboError)) throw new Error(comboError.message);

  // PostgREST types single-row FK embeds (accessory:accessory_product_id) as arrays; at runtime
  // they are objects, so the hand-written ProductFull shape is the accurate one.
  return { ...data, accessory_combo_photos: combos ?? [] } as unknown as ProductFull;
}

type ProductInput = {
  id?: string;
  slug?: string;
  model: string;
  manufacturer?: string;
  min_price?: number;
  catalog?: string;
  subcategoryOptionIds?: string[];
  description?: string;
  long_description?: LongDescriptionBlock[];
  seo_title?: string | null;
  seo_description?: string | null;
  assembly_video_url?: string;
  assembly_pdf_url?: string;
  visible?: boolean;
  gallery_layout?: string | null;
};
export async function saveProduct(input: ProductInput) {
  const { id, subcategoryOptionIds = [], ...fields } = input;

  // The slug becomes part of the product URL, so we validate it here. Empty → null (the product stays
  // reachable by uuid). "new" is taken by the /admin/products/new route.
  const slug = (fields.slug ?? "").trim() || null;
  if (slug && !SLUG_RE.test(slug)) {
    throw new Error("Адреса може містити лише латинські літери, цифри й дефіси (напр. Ammi-Plus)");
  }
  if (slug?.toLowerCase() === "new") throw new Error("Адреса «new» зарезервована");

  // Subcategories live only in product_subcategories (any depth/number) — the subcategory/
  // subcategory2 columns are gone, so nothing has to be derived from the set.
  //
  // slug explicitly rather than via ...fields: a cleared field must write null, while undefined
  // is simply dropped from the request body by supabase-js and the column keeps its old value.
  const payload = { ...fields, slug };
  const q = id ? db().from("products").update(payload).eq("id", id) : db().from("products").insert(payload);
  const { data, error } = await q.select("id").single();
  if (error) {
    throw new Error(error.code === "23505" ? `Адреса «${slug}» вже зайнята` : error.message);
  }
  const productId = data.id as string;

  await db().from("product_subcategories").delete().eq("product_id", productId);
  if (subcategoryOptionIds.length) {
    const { error: linkError } = await db()
      .from("product_subcategories")
      .insert(subcategoryOptionIds.map((sid) => ({ product_id: productId, subcategory_option_id: sid })));
    if (linkError) throw new Error(linkError.message);
  }

  await bumpProduct(productId);
  return productId;
}

export async function deleteProduct(id: string) {
  const { data } = await db().from("variants").select("id, sku").eq("product_id", id);
  const rows = (data || []) as { id: string; sku: string | null }[];
  // Collect image ids before the cascade removes the variant_images links, then delete any that
  // no other product's variant still shares.
  const imageIds = await imageIdsForVariants(rows.map((v) => v.id));

  const { error } = await db().from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await deleteOrphanedImages(imageIds);
  await releaseEstellaOffers(db(), rows.map((v) => v.sku));
  await bumpProduct(id);
}
