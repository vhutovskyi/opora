"use server";

import { revalidatePath } from "next/cache";
import { purgeTags } from "@/lib/cache/purgeTags";
import { supabaseAdmin } from "@/lib/supabase";

const db = () => supabaseAdmin();

function bump() {
  purgeTags("catalog");
  revalidatePath("/admin");
}

// ── XML-staging reads (for the "attach to XML" dropdowns) ──────────────────────
// estella_offers holds XML *variations* (one row per <offer>), grouped into a product
// by the `name` column; `model` is the variation label. Distinct names power the product
// dropdown; the offers under a chosen name power the per-row variation dropdown.
export async function listEstellaNames(search: string): Promise<string[]> {
  const q = search.replace(/[%,]/g, "").trim();
  let query = db().from("estella_offers").select("name").not("name", "is", null).order("name").limit(500);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  return [...new Set((data ?? []).map((r) => r.name as string).filter(Boolean))].slice(0, 50);
}

// Force the selected offers back to un-imported so promote re-processes them. Promote's SKU guard
// skips offers whose variant still exists, so this only recreates variants deleted since a prior run.
export async function resetEstellaImported(offerIds: string[]): Promise<void> {
  if (!offerIds.length) return;
  await db().from("estella_offers").update({ imported: false }).in("offer_id", offerIds);
}

// Resolve promoted offers to their variant ids (variants.sku == offer_id). Used to upload a photo
// straight onto the variant an XML offer became, keyed by offer_id.
export async function getVariantIdsBySku(skus: string[]): Promise<Record<string, string>> {
  if (!skus.length) return {};
  const { data } = await db().from("variants").select("id, sku").in("sku", skus);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[r.sku as string] = r.id as string;
  return map;
}

// Photos currently attached to promoted offers' variants (sku == offer_id), keyed by offer_id.
// Used by the XML tab to show thumbnails right after (or before) uploading onto a variation row.
export type OfferPhoto = { imageId: string; url: string };
export async function getVariantPhotosBySku(skus: string[]): Promise<Record<string, OfferPhoto[]>> {
  if (!skus.length) return {};
  const { data } = await db()
    .from("variants")
    .select("sku, variant_images ( sort_order, images ( id, url ) )")
    .in("sku", skus);
  const map: Record<string, OfferPhoto[]> = {};
  for (const v of data ?? []) {
    const sku = v.sku as string | null;
    if (!sku) continue;
    type VI = { sort_order: number | null; images: { id: string; url: string } | null };
    const photos = ((v.variant_images as unknown as VI[] | null) ?? [])
      .filter((vi) => vi.images)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((vi) => ({ imageId: vi.images!.id, url: vi.images!.url }));
    if (photos.length) map[sku] = photos;
  }
  return map;
}

// Set availability for offers by their XML offer_id. Updates BOTH the staging flag
// (estella_offers.available → drives the list badge) and, for already-promoted offers,
// the storefront variant (variants.in_stock, sku == offer_id). Returns affected variant count.
export async function setInStockBySku(skus: string[], inStock: boolean): Promise<number> {
  if (!skus.length) return 0;
  const { error: oe } = await db().from("estella_offers").update({ available: inStock }).in("offer_id", skus);
  if (oe) throw new Error(oe.message);
  const { data, error } = await db().from("variants").update({ in_stock: inStock }).in("sku", skus).select("id");
  if (error) throw new Error(error.message);
  bump();
  return data?.length ?? 0;
}

export type EstellaOfferRef = {
  offer_id: string;
  model: string;
  price: number | null;
  quantity: number | null;
  color_code: string | null;
  params: Record<string, string>;
};

export async function listEstellaOffers(name: string): Promise<EstellaOfferRef[]> {
  const { data } = await db()
    .from("estella_offers")
    .select("offer_id, model, price, quantity, color_code, params")
    .eq("name", name)
    .order("offer_id");
  return (data ?? []).map((r) => ({
    offer_id: r.offer_id as string,
    model: (r.model as string) || "",
    price: r.price == null ? null : Number(r.price),
    quantity: r.quantity == null ? null : Number(r.quantity),
    color_code: (r.color_code as string) || null,
    params: (r.params as Record<string, string>) || {},
  }));
}

// Payload from the client review UI — one folder pick = one product.
// attachProductName set → attach onto an existing XML-promoted product (looked up by model=name).
// The client promotes the mapped offers first, so their variants (sku = offer_id) already exist.
export type CommitPayload = {
  attachProductName?: string;
  productName: string;
  catalog: string;
  // A chain of subcategory tree node ids (root→leaf), already created by the client
  // via ensureSubcategoryPath. Empty = no subcategories set.
  subcategoryOptionIds?: string[];
  variants: Array<{
    sku: string; // unique map key (attach: `${folderSku}::${offerId}`; new: folderSku)
    materialValue: string;
    colors: Array<{ code: string; name: string; hex: string }>;
    included: boolean;
    price: number; // 0 → "Ціну уточнюйте"
    size?: string; // extracted from the XML model → «Розмір» option
    lamels?: string; // extracted from the XML model (Л4/Л2,5) → «Ламелі» option
    extraOptions?: Record<string, string>; // resolved from catalog rules
    attachOfferId?: string; // set → merge options/photos onto the XML variant with sku = this offer_id
    visible?: boolean; // storefront selector visibility; applied on INSERT only
  }>;
};

// Response maps temp SKU → created variant ID so client knows where to upload images
type CommitResult = {
  success: boolean;
  variantIdMap: Record<string, string>; // sku → variantId
  error?: string;
};

export async function commitFolderImport(payload: CommitPayload): Promise<CommitResult> {
  try {
    const variantIdMap: Record<string, string> = {};
    const productName = payload.productName;

    const included = payload.variants.filter((v) => v.included);
    // Cache key for an (option name, value) pair — same scheme the old per-option resolver used.
    const okey = (name: string, value: string) => `${name} ${value}`;

    // 1. Resolve every distinct option (material/size/colour) in ONE batched upsert.
    const distinctOptions = new Map<string, { name: string; value: string }>();
    const addOpt = (name: string, value: string) => distinctOptions.set(okey(name, value), { name, value });
    for (const v of included) {
      if (v.materialValue) addOpt(`Матеріал: ${v.materialValue}`, v.materialValue);
      if (v.size) addOpt(`Розмір: ${v.size}`, v.size);
      if (v.lamels) addOpt(`Відстань між ламелями: ${v.lamels}`, v.lamels);
      for (const c of v.colors) addOpt(`Колір: ${c.name}`, c.hex);
      // Extra options from catalog rules
      if (v.extraOptions) {
        for (const [optName, optVal] of Object.entries(v.extraOptions)) {
          addOpt(optName, optVal);
        }
      }
    }
    const optionId = new Map<string, string>();
    if (distinctOptions.size) {
      const { data, error } = await db()
        .from("options")
        .upsert([...distinctOptions.values()], { onConflict: "name,value" })
        .select("id, name, value");
      if (error) throw new Error(`Failed to upsert options: ${error.message}`);
      for (const r of data ?? []) optionId.set(okey(r.name as string, r.value as string), r.id as string);
    }

    // 2. Resolve variant ids + the products they live under.
    const variantBySku = new Map<string, string>();
    const touchedProducts = new Set<string>(); // every product that gets variants/updates here

    // Attach targets: keyed by payload sku (v.sku), which encodes the custom fan-out combo
    // (e.g. `${folderSku}::${offerId}::200см`). The promoted XML variant (sku = offer_id) is looked
    // up GLOBALLY — promote() may split one XML name across several products. The FIRST target per
    // offer reuses that promoted variant; EXTRA combos (Розмір 190/200…) clone it into new variants
    // under the same product, so each combo is an independent, selectable variant instead of piling
    // every custom value onto one variant.
    const attachVars = included.filter((v) => v.attachOfferId);
    if (attachVars.length) {
      const offerIds = [...new Set(attachVars.map((v) => v.attachOfferId!))];
      const { data } = await db().from("variants").select("id, sku, product_id, price").in("sku", offerIds);
      const offerVar = new Map<string, { id: string; product_id: string; price: number }>();
      for (const r of data ?? []) {
        offerVar.set(r.sku as string, { id: r.id as string, product_id: r.product_id as string, price: Number(r.price) || 0 });
        touchedProducts.add(r.product_id as string);
      }
      const usedOffer = new Set<string>();
      const clones: { sku: string; product_id: string; price: number }[] = [];
      for (const v of attachVars) {
        const ov = offerVar.get(v.attachOfferId!);
        if (!ov) continue; // offer wasn't promoted → skip (client warns via missing map entry)
        if (!usedOffer.has(v.attachOfferId!)) {
          usedOffer.add(v.attachOfferId!);
          variantBySku.set(v.sku, ov.id);
        } else {
          clones.push({ sku: v.sku, product_id: ov.product_id, price: v.price > 0 ? v.price : ov.price });
        }
      }
      if (clones.length) {
        // Idempotency: a re-import may already hold the clone variants — reuse by sku, insert the rest.
        const { data: existing } = await db().from("variants").select("id, sku").in("sku", clones.map((c) => c.sku));
        for (const r of existing ?? []) variantBySku.set(r.sku as string, r.id as string);
        const toInsert = clones.filter((c) => !variantBySku.has(c.sku));
        if (toInsert.length) {
          const { data: made, error } = await db()
            .from("variants")
            .insert(toInsert.map((c) => ({ product_id: c.product_id, sku: c.sku, in_stock: true, price: c.price })))
            .select("id, sku");
          if (error) throw new Error(`Failed to clone attach variants: ${error.message}`);
          for (const r of made ?? []) variantBySku.set(r.sku as string, r.id as string);
        }
      }

      // Copy XML characteristics (variant_specs) from each promoted offer variant onto its clones, so
      // every size/lamels/config variant shows the same characteristics as the base offer — not only
      // the first one. Non-destructive + idempotent: fills only clones that have no specs yet.
      const specPairs = attachVars
        .map((v) => ({ src: offerVar.get(v.attachOfferId!)?.id, dst: variantBySku.get(v.sku) }))
        .filter((p): p is { src: string; dst: string } => !!p.src && !!p.dst && p.src !== p.dst);
      if (specPairs.length) {
        const srcIds = [...new Set(specPairs.map((p) => p.src))];
        const dstIds = [...new Set(specPairs.map((p) => p.dst))];
        const [{ data: srcSpecs }, { data: filled }] = await Promise.all([
          db().from("variant_specs").select("variant_id, spec_id, value, legacy_num").in("variant_id", srcIds),
          db().from("variant_specs").select("variant_id").in("variant_id", dstIds),
        ]);
        const already = new Set((filled ?? []).map((r) => r.variant_id as string));
        const bySrc = new Map<string, { spec_id: string; value: string | null; legacy_num: number | null }[]>();
        for (const r of srcSpecs ?? []) {
          const arr = bySrc.get(r.variant_id as string) ?? [];
          arr.push({ spec_id: r.spec_id as string, value: r.value as string | null, legacy_num: r.legacy_num as number | null });
          bySrc.set(r.variant_id as string, arr);
        }
        const vsRows = specPairs
          .filter((p) => !already.has(p.dst))
          .flatMap((p) => (bySrc.get(p.src) ?? []).map((s) => ({ variant_id: p.dst, ...s })));
        if (vsRows.length) {
          const { error } = await db().from("variant_specs").insert(vsRows);
          if (error) throw new Error(`Failed to copy variant specs: ${error.message}`);
        }
      }
    }

    // New (folder-only) variants need a home product. Resolve/create by model, then insert.
    // sku scoped to THIS product: folder SKUs bake in the parse-time name and aren't unique in the DB.
    const newVars = included.filter((v) => !v.attachOfferId);
    let newProductId: string | null = null;
    if (newVars.length) {
      const targetName = payload.attachProductName || productName;
      const { data: existing } = await db().from("products").select("id").eq("model", targetName).maybeSingle();
      if (existing) {
        newProductId = existing.id as string;
      } else {
        const { data: created, error } = await db()
          .from("products")
          .insert({ model: targetName, visible: false })
          .select("id")
          .single();
        if (error) throw new Error(`Failed to create product ${targetName}: ${error.message}`);
        newProductId = created.id as string;
      }
      touchedProducts.add(newProductId);

      const newSkus = newVars.map((v) => v.sku);
      const { data: existingV } = await db().from("variants").select("id, sku").eq("product_id", newProductId).in("sku", newSkus);
      for (const r of existingV ?? []) variantBySku.set(r.sku as string, r.id as string);
      const toInsert = newVars
        .filter((v) => !variantBySku.has(v.sku))
        // visible on INSERT only — re-import never clobbers an admin's manual curation.
        .map((v) => ({ product_id: newProductId!, sku: v.sku, in_stock: true, price: v.price || 0, visible: v.visible ?? true }));
      if (toInsert.length) {
        const { data, error } = await db().from("variants").insert(toInsert).select("id, sku");
        if (error) throw new Error(`Failed to create variants: ${error.message}`);
        for (const r of data ?? []) variantBySku.set(r.sku as string, r.id as string);
      }
    }

    // Product-level field updates. Never overwrite `model` in attach mode — split products keep
    // their «… Двоспальне/Односпальне» names; only push catalog onto every touched product.
    const fieldUpdate: Record<string, unknown> = {};
    if (payload.catalog) fieldUpdate.catalog = payload.catalog;
    if (!payload.attachProductName && productName) fieldUpdate.model = productName; // folder-only: name editable
    if (Object.keys(fieldUpdate).length && touchedProducts.size) {
      await db().from("products").update(fieldUpdate).in("id", [...touchedProducts]);
    }

    // Subcategories — only via product_subcategories (that is what the catalog filter reads).
    // We link by ready-made ids instead of looking up by name: in a tree of arbitrary depth
    // one name can repeat in different branches.
    const subIds = payload.subcategoryOptionIds ?? [];
    if (subIds.length && touchedProducts.size) {
      const links = [...touchedProducts].flatMap((pid) =>
        subIds.map((sid) => ({ product_id: pid, subcategory_option_id: sid }))
      );
      await db().from("product_subcategories").upsert(links, { onConflict: "product_id,subcategory_option_id" });
    }

    // 3. Build variant_options links + XML price updates for attached variants.
    const voRows: { variant_id: string; option_id: string }[] = [];
    const voSeen = new Set<string>();
    const priceUpdates = new Map<string, { upd: Record<string, unknown>; ids: string[] }>();
    for (const v of included) {
      const variantId = variantBySku.get(v.sku);
      if (!variantId) continue; // attach: offer wasn't promoted → skip (client warns via missing map entry)
      variantIdMap[v.sku] = variantId;

      const link = (name: string, value: string) => {
        const oid = optionId.get(okey(name, value));
        if (!oid) return;
        const k = `${variantId} ${oid}`;
        if (voSeen.has(k)) return; // ON CONFLICT can't hit the same row twice in one upsert
        voSeen.add(k);
        voRows.push({ variant_id: variantId, option_id: oid });
      };
      if (v.materialValue) link(`Матеріал: ${v.materialValue}`, v.materialValue);
      if (v.size) link(`Розмір: ${v.size}`, v.size);
      if (v.lamels) link(`Відстань між ламелями: ${v.lamels}`, v.lamels);
      for (const c of v.colors) link(`Колір: ${c.name}`, c.hex);
      // Extra options from catalog rules
      if (v.extraOptions) {
        for (const [optName, optVal] of Object.entries(v.extraOptions)) {
          link(optName, optVal);
        }
      }

      // Connect XML price (promote sets it; explicit keeps it fresh on re-import).
      if (v.attachOfferId) {
        const upd: Record<string, unknown> = {};
        if (v.price > 0) upd.price = v.price;
        if (Object.keys(upd).length) {
          const gk = JSON.stringify(upd);
          if (!priceUpdates.has(gk)) priceUpdates.set(gk, { upd, ids: [] });
          priceUpdates.get(gk)!.ids.push(variantId);
        }
      }
    }

    // 4. One upsert for all option links; grouped bulk updates for price (in parallel).
    if (voRows.length) {
      const { error } = await db().from("variant_options").upsert(voRows, { onConflict: "variant_id,option_id" });
      if (error) throw new Error(`Failed to link options: ${error.message}`);
    }
    await Promise.all(
      [...priceUpdates.values()].map((g) => db().from("variants").update(g.upd).in("id", g.ids))
    );

    // Recompute min_price for every touched product (split → several products from one import).
    for (const pid of touchedProducts) {
      const { data: variants } = await db().from("variants").select("price").eq("product_id", pid);
      const prices = (variants || []).map((v) => Number(v.price) || 0).filter((p) => p > 0);
      await db()
        .from("products")
        .update({ min_price: prices.length > 0 ? Math.min(...prices) : 0 })
        .eq("id", pid);
    }

    bump();
    return { success: true, variantIdMap };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, variantIdMap: {}, error: msg };
  }
}
