import { supabaseAdmin } from "@/lib/supabase";
import { estellaColorParts } from "./colors";
import { detectCatalogFromRules, resolveOptionValue, resolveSplitGroup, type CatalogRule } from "./catalogRules";

export const PROMOTE_CHUNK = 100; // ponytail: bounds Cloudflare Workers subrequests per call; client loops until done.

type Offer = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  vendor: string | null;
  color_code: string | null;
  params: Record<string, string>;
};

type StagedRow = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  vendor: string | null;
  color_code: string | null;
  params: Record<string, string> | null;
  available: boolean;
};

// Promote up to PROMOTE_CHUNK not-yet-imported offers in the given scope into
// products/variants/options/variant_specs. Returns { done } false while more remain
// so the client can loop. Idempotent: the `imported` flag + product upsert-by-model.
export async function promoteOffers(
  db: ReturnType<typeof supabaseAdmin>,
  scope: string,
  ids: string[]
) {
  const counts = { products: 0, variants: 0, options: 0, variant_specs: 0 };

  // Load all catalog rules upfront
  const { data: rulesData } = await db.from("estella_catalog_rules").select("*");
  const rulesByName = new Map<string, CatalogRule>();
  (rulesData ?? []).forEach((row) => {
    rulesByName.set(row.catalog, {
      id: row.id,
      catalog: row.catalog,
      nameMatch: row.name_match,
      optionRules: row.option_rules,
      splitRule: row.split_rule,
    });
  });
  const rulesList = [...rulesByName.values()];

  // 1. Fetch this chunk of pending offers.
  let q = db
    .from("estella_offers")
    .select("offer_id, name, model, price, quantity, vendor, color_code, params, available")
    .eq("imported", false)
    .order("offer_id", { ascending: true })
    .limit(PROMOTE_CHUNK);
  if (scope === "selected") q = q.in("offer_id", ids.length ? ids : ["__none__"]);
  else if (scope === "available") q = q.eq("available", true);
  else if (scope === "unavailable") q = q.eq("available", false);
  // scope "all" → no extra filter

  const { data, error } = await q;
  if (error) throw error;
  const pending = (data ?? []) as StagedRow[];
  if (!pending.length) return { counts, done: true };

  // 2. Group offers into products, applying split rules. If a catalog has a splitRule,
  //    append the split group label to the product name for grouping.
  const groupingKeyByOffer = new Map<string, string>(); // offer_id → product grouping key
  const catalogByOffer = new Map<string, string>(); // offer_id → detected catalog
  const catalogByGroupingKey = new Map<string, string>(); // grouping key → detected catalog
  const names = new Set<string>();

  for (const o of pending) {
    const detectedCatalog = detectCatalogFromRules(o.name, rulesList) ?? "Ліжка";
    catalogByOffer.set(o.offer_id, detectedCatalog);
    const rule = rulesByName.get(detectedCatalog);

    let groupingKey = o.name;
    if (rule?.splitRule) {
      const { label } = resolveSplitGroup(rule.splitRule, o.model);
      groupingKey = `${o.name} ${label}`;
    }
    groupingKeyByOffer.set(o.offer_id, groupingKey);
    catalogByGroupingKey.set(groupingKey, detectedCatalog);
    names.add(groupingKey);
  }

  const vendorByName = new Map<string, string | null>();
  for (const o of pending) {
    const gk = groupingKeyByOffer.get(o.offer_id)!;
    if (!vendorByName.has(gk)) vendorByName.set(gk, o.vendor);
  }

  const specCache = new Map<string, string>();
  const ensureSpec = async (specName: string) => {
    if (specCache.has(specName)) return specCache.get(specName)!;
    const { data, error: se } = await db.from("specs").upsert({ name: specName }, { onConflict: "name" }).select("id").single();
    if (se) throw se;
    specCache.set(specName, data.id);
    return data.id;
  };

  // 3. Resolve/insert products (don't clobber existing edits — select first).
  //    Imported hidden (visible: false). Specs are now per-variant (see step 4b).
  const productIdByName = new Map<string, string>();
  for (const name of names) {
    const { data: existing } = await db.from("products").select("id").eq("model", name).maybeSingle();
    if (existing) {
      productIdByName.set(name, existing.id);
      continue;
    }
    // Use the already-detected catalog from the grouping logic
    const detectedCatalog = catalogByGroupingKey.get(name) ?? "Ліжка";

    const { data: created, error: e } = await db
      .from("products")
      .insert({ model: name, manufacturer: vendorByName.get(name) ?? null, catalog: detectedCatalog, visible: false })
      .select("id")
      .single();
    if (e) throw e;
    productIdByName.set(name, created.id);
    counts.products++;
  }

  // 4. Insert variants + color options in BULK (not per-offer) — a per-offer loop of awaits
  //    blew through the Worker's subrequest limit on products with many size/colour combos.
  //    Skip offers whose SKU already exists (re-import guard — sku == offer_id).
  const { data: existingSkus } = await db.from("variants").select("sku").in("sku", pending.map((o) => o.offer_id));
  const skuSet = new Set((existingSkus ?? []).map((r) => r.sku));
  const toInsert = pending.filter((o) => !skuSet.has(o.offer_id));

  const sortByProduct = new Map<string, number>();
  const variantRows = toInsert.map((o) => {
    const gk = groupingKeyByOffer.get(o.offer_id)!;
    const product_id = productIdByName.get(gk)!;
    const sort_order = sortByProduct.get(product_id) ?? 0;
    sortByProduct.set(product_id, sort_order + 1);
    return {
      product_id,
      name: o.model || null,
      sku: o.offer_id,
      price: o.price,
      in_stock: true, // always in stock on import (the XML quantity is ignored)
      sort_order,
    };
  });
  const variantIdBySku = new Map<string, string>();
  if (variantRows.length) {
    const { data: inserted, error: ve } = await db.from("variants").insert(variantRows).select("id, sku");
    if (ve) throw ve;
    for (const r of inserted ?? []) variantIdBySku.set(r.sku as string, r.id as string);
    counts.variants += inserted?.length ?? 0;
  }

  // 4b. variant_specs from each offer's own params (single value each; exclude Колір → option).
  const vsRows: { variant_id: string; spec_id: string; value: string; legacy_num: number }[] = [];
  for (const o of toInsert) {
    const variant_id = variantIdBySku.get(o.offer_id);
    if (!variant_id) continue;
    let legacy = 0;
    for (const [k, v] of Object.entries(o.params ?? {})) {
      if (k === "Колір") continue;
      const val = String(v ?? "").trim();
      if (!val) continue;
      const spec_id = await ensureSpec(k);
      vsRows.push({ variant_id, spec_id, value: val, legacy_num: legacy++ });
    }
  }
  if (vsRows.length) {
    const { error: vse } = await db.from("variant_specs").insert(vsRows);
    if (vse) throw vse;
    counts.variant_specs += vsRows.length;
  }

  // Resolve options from catalog rules + colors. Distinct options across the whole chunk → one upsert.
  const optionRows = new Map<string, { name: string; value: string }>();
  for (const o of toInsert) {
    // Colors (always)
    for (const color of o.color_code ? estellaColorParts(o.color_code) : [])
      optionRows.set(`Колір: ${color.name}`, { name: `Колір: ${color.name}`, value: color.hex });

    // Catalog-specific option rules
    const detectedCatalog = catalogByOffer.get(o.offer_id)!;
    const rule = rulesByName.get(detectedCatalog);
    if (rule) {
      for (const optRule of rule.optionRules) {
        const val = resolveOptionValue(optRule, {
          name: o.name,
          model: o.model,
          params: o.params ?? {},
        });
        if (val) {
          const optKey = `${optRule.optionName}: ${val}`;
          optionRows.set(optKey, { name: optKey, value: val });
        }
      }
    }
  }

  const optionIdByName = new Map<string, string>();
  if (optionRows.size) {
    const { data: opts, error: oe } = await db
      .from("options")
      .upsert([...optionRows.values()], { onConflict: "name,value" })
      .select("id, name");
    if (oe) throw oe;
    for (const r of opts ?? []) optionIdByName.set(r.name as string, r.id as string);
    counts.options += opts?.length ?? 0;
  }

  // variant_options links for the whole chunk → one upsert.
  const voRows: { variant_id: string; option_id: string }[] = [];
  const voSeen = new Set<string>();
  for (const o of toInsert) {
    const variant_id = variantIdBySku.get(o.offer_id);
    if (!variant_id) continue;

    const optionNames: string[] = [];

    // Colors
    if (o.color_code) {
      optionNames.push(...estellaColorParts(o.color_code).map((c) => `Колір: ${c.name}`));
    }

    // Catalog rules
    const detectedCatalog = catalogByOffer.get(o.offer_id)!;
    const rule = rulesByName.get(detectedCatalog);
    if (rule) {
      for (const optRule of rule.optionRules) {
        const val = resolveOptionValue(optRule, {
          name: o.name,
          model: o.model,
          params: o.params ?? {},
        });
        if (val) {
          optionNames.push(`${optRule.optionName}: ${val}`);
        }
      }
    }

    for (const optName of optionNames) {
      const option_id = optionIdByName.get(optName);
      if (!option_id) continue;
      const k = `${variant_id} ${option_id}`;
      if (voSeen.has(k)) continue; // ON CONFLICT can't hit the same row twice in one upsert
      voSeen.add(k);
      voRows.push({ variant_id, option_id });
    }
  }
  if (voRows.length) {
    const { error: le } = await db.from("variant_options").upsert(voRows, { onConflict: "variant_id,option_id" });
    if (le) throw le;
  }

  // 5. Recompute min_price for each touched product from ALL its variants
  //    (includes variants added in earlier runs, so the min stays correct).
  for (const name of names) {
    const product_id = productIdByName.get(name)!;
    const { data: vs, error: pe } = await db.from("variants").select("price").eq("product_id", product_id);
    if (pe) throw pe;
    const prices = (vs ?? []).map((r) => Number(r.price)).filter((p) => Number.isFinite(p) && p > 0);
    const min_price = prices.length ? Math.min(...prices) : 0;
    const { error: ue } = await db.from("products").update({ min_price }).eq("id", product_id);
    if (ue) throw ue;
  }

  // 6. Mark this chunk imported.
  const { error: me } = await db.from("estella_offers").update({ imported: true }).in("offer_id", pending.map((o) => o.offer_id));
  if (me) throw me;

  return { counts, done: pending.length < PROMOTE_CHUNK };
}
