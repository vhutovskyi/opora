"use server";

import { db, bump, bumpProduct } from "./_shared";
import { imageIdsForVariants, deleteOrphanedImages } from "@/lib/supabase/images";
import { releaseEstellaOffers } from "@/lib/estella/offers";

type VariantInput = {
  id?: string;
  product_id: string;
  name?: string;
  sku?: string;
  price?: number;
  in_stock?: boolean;
  visible?: boolean;
  discount_percent?: number | null;
  discount_price?: number | null;
  discounted_price?: number | null;
  sort_order?: number;
  optionIds?: string[];
};

// Random 8-digit article unique across ALL variants. Re-rolls on collision; the 90M space makes
// a hit vanishingly unlikely, so this is ~1 query in practice (20-try cap as a safety net).
export async function generateUniqueSku(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const sku = String(Math.floor(10000000 + Math.random() * 90000000));
    const { data, error } = await db().from("variants").select("id").eq("sku", sku).limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return sku;
  }
  throw new Error("Не вдалося згенерувати унікальний артикул");
}

// n fresh 8-digit articles, unique within the batch and against the DB (one batched
// collision check + re-roll).
async function freshSkus(n: number): Promise<string[]> {
  const gen = () => String(Math.floor(10000000 + Math.random() * 90000000));
  const used = new Set<string>();
  while (used.size < n) used.add(gen());
  const skus = [...used];
  const { data: existing } = await db().from("variants").select("sku").in("sku", skus);
  const taken = new Set((existing ?? []).map((r) => r.sku as string));
  return skus.map((sku) => {
    if (!taken.has(sku)) return sku;
    let ns = gen();
    while (used.has(ns) || taken.has(ns)) ns = gen();
    used.add(ns);
    return ns;
  });
}

// Assign fresh 8-digit articles to EVERY variant of a product. Updates run in parallel.
// Returns count updated.
export async function randomizeAllSkus(productId: string): Promise<number> {
  const { data: vars, error } = await db().from("variants").select("id").eq("product_id", productId);
  if (error) throw new Error(error.message);
  if (!vars?.length) return 0;

  const skus = await freshSkus(vars.length);
  await Promise.all(vars.map((v, i) => db().from("variants").update({ sku: skus[i] }).eq("id", v.id as string)));
  await bumpProduct(productId);
  return vars.length;
}

// Duplicate a colour (or any option): clones every variant of the product carrying `sourceOptionId`,
// replacing it with `targetOptionId`. Prices, the other options (size/material/lamels/checkboxes) and
// specs are copied — the price depends on the options, not on the colour.
//
// `copyPhotos` — reuse the same `images` rows (creates no new files in R2) when the photos of the
// new option match the template's. Off by default: a new colour has different photos, they are
// uploaded by hand, and the upload route propagates them to every variant with the same
// Матеріал+Колір.
//
// `filterOptionId` (optional) narrows the set: only variants that ALSO carry this option are
// cloned. Needed to complete the missing half of a set for an already existing colour — e.g.
// "лише Колір: Сірий", З білими ніжками: Так → Ні gives 8 variants without white legs.
export async function cloneVariantsByOption(
  productId: string,
  sourceOptionId: string,
  targetOptionId: string,
  filterOptionId?: string,
  copyPhotos = false
) {
  if (!sourceOptionId || !targetOptionId || sourceOptionId === targetOptionId)
    throw new Error("Оберіть різні опції — джерело і нову");

  const { data, error } = await db()
    .from("variants")
    .select(
      "id, name, price, in_stock, visible, discount_percent, discount_price, discounted_price, sort_order, variant_options ( option_id ), variant_specs ( spec_id, value, legacy_num ), variant_images ( image_id, sort_order )"
    )
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    name: string | null;
    price: number | null;
    in_stock: boolean | null;
    visible: boolean | null;
    discount_percent: number | null;
    discount_price: number | null;
    discounted_price: number | null;
    sort_order: number | null;
    variant_options: { option_id: string }[] | null;
    variant_specs: { spec_id: string; value: string | null; legacy_num: number | null }[] | null;
    variant_images: { image_id: string; sort_order: number | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const has = (r: Row, id: string) => (r.variant_options ?? []).some((o) => o.option_id === id);

  const scope = filterOptionId ? rows.filter((r) => has(r, filterOptionId)) : rows;
  const src = scope.filter((r) => has(r, sourceOptionId));
  if (!src.length) throw new Error("Немає варіацій з обраною опцією-джерелом");
  // We check within the set only: "Ні" already exists for other colours, but not for this one.
  if (scope.some((r) => has(r, targetOptionId))) throw new Error("Нова опція вже є у цих варіаціях");

  const maxOrder = Math.max(0, ...rows.map((r) => r.sort_order ?? 0));
  const skus = await freshSkus(src.length);
  const { data: inserted, error: e1 } = await db()
    .from("variants")
    .insert(
      src.map((r, i) => ({
        product_id: productId,
        name: r.name,
        sku: skus[i],
        price: r.price,
        in_stock: r.in_stock,
        visible: r.visible,
        discount_percent: r.discount_percent,
        discount_price: r.discount_price,
        discounted_price: r.discounted_price,
        sort_order: maxOrder + 1 + i,
      }))
    )
    .select("id, sku");
  if (e1) throw new Error(e1.message);

  // We map by sku, not by the row order in the response.
  const idBySku = new Map((inserted ?? []).map((r) => [r.sku as string, r.id as string]));
  const newIds = skus.map((s) => idBySku.get(s)!);

  const optRows = src.flatMap((r, i) =>
    (r.variant_options ?? []).map((o) => ({
      variant_id: newIds[i],
      option_id: o.option_id === sourceOptionId ? targetOptionId : o.option_id,
    }))
  );
  if (optRows.length) {
    const { error: e2 } = await db().from("variant_options").insert(optRows);
    if (e2) throw new Error(e2.message);
  }
  const specRows = src.flatMap((r, i) =>
    (r.variant_specs ?? []).map((s) => ({ variant_id: newIds[i], spec_id: s.spec_id, value: s.value, legacy_num: s.legacy_num }))
  );
  if (specRows.length) {
    const { error: e3 } = await db().from("variant_specs").insert(specRows);
    if (e3) throw new Error(e3.message);
  }
  if (copyPhotos) {
    const imgRows = src.flatMap((r, i) =>
      (r.variant_images ?? []).map((im) => ({ variant_id: newIds[i], image_id: im.image_id, sort_order: im.sort_order }))
    );
    if (imgRows.length) {
      const { error: e4 } = await db().from("variant_images").insert(imgRows);
      if (e4) throw new Error(e4.message);
    }
  }

  await bumpProduct(productId);
  return newIds.length;
}

export async function saveVariant(input: VariantInput) {
  const { id, optionIds, product_id, ...rest } = input;
  // On update we must NOT overwrite product_id (client passes a placeholder); on insert it's required.
  const q = id ? db().from("variants").update(rest).eq("id", id) : db().from("variants").insert({ ...rest, product_id });
  // product_id comes back from the write, not from input: on update the client sends a placeholder.
  const { data, error } = await q.select("id, product_id").single();
  if (error) throw new Error(error.message);
  const variantId = data.id as string;
  const owner = data.product_id as string | null;

  if (optionIds) {
    await db().from("variant_options").delete().eq("variant_id", variantId);
    if (optionIds.length) {
      const { error: e } = await db()
        .from("variant_options")
        .insert(optionIds.map((option_id) => ({ variant_id: variantId, option_id })));
      if (e) throw new Error(e.message);
    }
  }
  if (owner) await bumpProduct(owner);
  else bump();
  return variantId;
}

export async function deleteVariant(id: string) {
  // Same orphan-cleanup as deleteProduct, for a single variation. Images shared with sibling
  // variants (same Матеріал+Колір) survive; only images unique to this variant are removed.
  const { data } = await db().from("variants").select("sku, product_id").eq("id", id);
  const owner = (data || [])[0]?.product_id as string | undefined;
  const imageIds = await imageIdsForVariants([id]);

  const { error } = await db().from("variants").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await deleteOrphanedImages(imageIds);
  await releaseEstellaOffers(db(), (data || []).map((v) => v.sku as string | null));
  if (owner) await bumpProduct(owner);
  else bump();
}

// Persist variant display order (sort_order = position in the list).
export async function setVariantOrder(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db().from("variants").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) throw new Error(error.message);
  }
  bump();
}

function nextPrice(cur: number, mode: "set" | "amount" | "percent", value: number): number {
  const next = mode === "set" ? value : mode === "amount" ? cur + value : cur * (1 + value / 100);
  return Math.round(next * 100) / 100;
}

// Discount columns derived from a mode + value against a variant's own price — same formula the
// per-variant editor uses (useVariantEditor.discountFields), so bulk and single-variant edits agree.
function discountFieldsFor(price: number, mode: "none" | "percent" | "price", value: number) {
  const val = Number(value) || 0;
  if (mode === "percent" && val > 0) {
    const discounted = Math.round(price * (1 - val / 100) * 100) / 100;
    return { discount_percent: val, discounted_price: discounted, discount_price: Math.round((price - discounted) * 100) / 100 };
  }
  if (mode === "price" && val > 0 && val < price) {
    const percent = price > 0 ? Math.round(((price - val) / price) * 100) : 0;
    return { discount_percent: percent, discounted_price: val, discount_price: Math.round((price - val) * 100) / 100 };
  }
  return { discount_percent: null, discounted_price: null, discount_price: null };
}

// Bulk-update every variant price of a product: set to a value, or add/subtract
// an absolute amount or a percentage. Leaves discount fields untouched.
export async function setBulkPrice(productId: string, mode: "set" | "amount" | "percent", value: number) {
  const { data: vs } = await db().from("variants").select("id, price").eq("product_id", productId);
  const rows = (vs ?? []) as { id: string; price: number | null }[];
  for (const r of rows) {
    const { error } = await db().from("variants").update({ price: nextPrice(Number(r.price) || 0, mode, value) }).eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  await bumpProduct(productId);
  return rows.length;
}

// Same as setBulkPrice but scoped to an explicit set of variant ids — the search + checkbox
// selection in VariantsSection lets an admin narrow this to just the rows they picked.
export async function setPriceForIds(ids: string[], mode: "set" | "amount" | "percent", value: number) {
  if (!ids.length) return 0;
  const { data: vs } = await db().from("variants").select("id, price").in("id", ids);
  const rows = (vs ?? []) as { id: string; price: number | null }[];
  for (const r of rows) {
    const { error } = await db().from("variants").update({ price: nextPrice(Number(r.price) || 0, mode, value) }).eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  bump();
  return rows.length;
}

// Bulk-apply a discount (or clear it) to an explicit set of variant ids, e.g. a checkbox
// selection from the search panel. Mirrors useVariantEditor's per-variant discount math.
export async function setDiscountForIds(ids: string[], mode: "none" | "percent" | "price", value: number) {
  if (!ids.length) return 0;
  const { data: vs } = await db().from("variants").select("id, price").in("id", ids);
  const rows = (vs ?? []) as { id: string; price: number | null }[];
  for (const r of rows) {
    const { error } = await db()
      .from("variants")
      .update(discountFieldsFor(Number(r.price) || 0, mode, value))
      .eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  bump();
  return rows.length;
}

// Bulk set in_stock for all of a product's variants that carry a given option
// (e.g. a colour ran out → mark every SKU with that colour as out of stock).
export async function setStockByOption(productId: string, optionId: string, inStock: boolean) {
  const { data: vs } = await db().from("variants").select("id").eq("product_id", productId);
  const vids = (vs ?? []).map((v) => v.id as string);
  if (!vids.length) return 0;
  const { data: links } = await db()
    .from("variant_options")
    .select("variant_id")
    .eq("option_id", optionId)
    .in("variant_id", vids);
  const ids = [...new Set((links ?? []).map((l) => l.variant_id as string))];
  if (ids.length) {
    const { error } = await db().from("variants").update({ in_stock: inStock }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  await bumpProduct(productId);
  return ids.length;
}

// Bulk set storefront visibility for all of a product's variants carrying a given option
// (e.g. show only the «Конфігурація» values a bed should expose in its selector). Hidden
// variants stay in the DB but are filtered out of the product page (see products.ts).
export async function setVisibleByOption(productId: string, optionId: string, visible: boolean) {
  const { data: vs } = await db().from("variants").select("id").eq("product_id", productId);
  const vids = (vs ?? []).map((v) => v.id as string);
  if (!vids.length) return 0;
  const { data: links } = await db()
    .from("variant_options")
    .select("variant_id")
    .eq("option_id", optionId)
    .in("variant_id", vids);
  const ids = [...new Set((links ?? []).map((l) => l.variant_id as string))];
  if (ids.length) {
    const { error } = await db().from("variants").update({ visible }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  await bumpProduct(productId);
  return ids.length;
}
