// One-off importer for the Romax tables catalogue. Reads the product list from tablesData.ts and
// the photo→colour mapping from scripts/tables/photo-map.json, then creates products, options,
// variants and images the same way the admin editor would.
//
// Runs locally only: it reads the photo folder off the machine's disk (Downloads/TABLES by
// default). Idempotent per product — a product whose `model` already exists is skipped, so a
// failed run can simply be repeated.

import fs from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImagePair } from "@/lib/r2";
import { upsertImages, linkImagesToVariants } from "@/lib/supabase/images";
import {
  LEG_AXIS, LEGS, TABLES_CATALOG, TABLE_PRODUCTS, THICKNESS_AXIS, TOPS, TOP_AXIS, TYPE_AXIS,
  parseSizeDims, shortSizeLabel, surcharge, variantSpecValue, type TableProduct,
} from "./tablesData";

const db = () => supabaseAdmin();

type PhotoFolder = { photos: { file: string; view: number; top: string; legs: string; cost: number }[]; warnings: string[] };
// `_swatches` holds the hex colour measured off the renders for each tabletop/leg name.
type PhotoMap = Record<string, PhotoFolder> & { _swatches?: Record<string, string> };

export type ImportOptions = {
  /** Root of the supplier photo dump. */
  photoRoot: string;
  /** Path to scripts/tables/photo-map.json. */
  photoMapPath: string;
  /** Import only these models, matched exactly — «Стіл Long» must not also pull «Стіл Long Round». */
  only?: string[];
  /** Create products and variants but skip the (slow) R2 uploads. */
  skipPhotos?: boolean;
};

export type ImportResult = {
  created: { model: string; variants: number; photos: number }[];
  skipped: { model: string; reason: string }[];
  errors: { model: string; error: string }[];
};

// Options are global. `value` is what the storefront groups and selects on (the chip's LABEL comes
// from the name suffix, but getOptionGroups/matchesSelection compare `value`) — so every option
// needs one, or a whole axis collapses into a single chip. Colour axes get the hex measured off the
// renders, which also makes them render as swatches; other axes get their plain text label.
// An option that already exists keeps whatever value is on it — a hand-picked hex is never
// overwritten — except that a still-empty one gets filled in.
async function optionId(name: string, value: string | null, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const { data: found } = await db().from("options").select("id, value").eq("name", name).limit(1);
  let id = found?.[0]?.id as string | undefined;
  if (!id) {
    const { data, error } = await db().from("options").insert(value ? { name, value } : { name }).select("id").single();
    if (error) throw new Error(`option "${name}": ${error.message}`);
    id = data.id as string;
  } else if (value && !found?.[0]?.value) {
    await db().from("options").update({ value }).eq("id", id);
  }
  cache.set(name, id);
  return id;
}

async function specId(name: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const { data: found } = await db().from("specs").select("id").eq("name", name).maybeSingle();
  let id = found?.id as string | undefined;
  if (!id) {
    const { data, error } = await db().from("specs").insert({ name }).select("id").single();
    if (error) throw new Error(`spec "${name}": ${error.message}`);
    id = data.id as string;
  }
  cache.set(name, id);
  return id;
}

async function ensureCatalog() {
  const { data } = await db().from("catalogs").select("id").eq("name", TABLES_CATALOG).maybeSingle();
  if (!data) await db().from("catalogs").insert({ name: TABLES_CATALOG });
}

// Unique 8-digit articles, matching what the admin's variant tools generate.
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

async function importProduct(p: TableProduct, map: PhotoMap, opts: ImportOptions) {
  const { data: existing } = await db().from("products").select("id").eq("model", p.model).maybeSingle();
  if (existing) return { skipped: "already exists", variants: 0, photos: 0 };

  const minPrice = Math.min(...p.kinds.flatMap((k) => k.sizes.map((s) => s.price)));
  const { data: prod, error: pe } = await db()
    .from("products")
    .insert({ model: p.model, catalog: TABLES_CATALOG, manufacturer: "Romax", min_price: minPrice, visible: true })
    .select("id")
    .single();
  if (pe) throw new Error(pe.message);
  const productId = prod.id as string;

  const optCache = new Map<string, string>();
  const specCache = new Map<string, string>();
  // Розкладний first: variants are inserted in this order, and the storefront takes the FIRST
  // variant as the page default and lists the Тип chips in encounter order.
  const kinds = [...p.kinds].sort((a, b) => Number(a.type !== "Розкладний") - Number(b.type !== "Розкладний"));
  const perDir = new Map(kinds.flatMap((k) => k.photos.map((ph) => [ph.dir, map[ph.dir.normalize("NFC")]] as const)));

  // Build the variant grid: kind × size row × tabletop × legs, all in one insert.
  // Only the colours a kind actually has renders for become variants — a folder occasionally ships
  // a short set (ELIPS SLIDE/нерозкладний has 10 of the 11), and a colour with no photo would
  // otherwise become a variant that shows nothing.
  const combos = kinds.flatMap((kind) => {
    const availableTops = new Set<string>();
    for (const ph of kind.photos) for (const x of perDir.get(ph.dir)?.photos ?? []) availableTops.add(x.top);
    const tops = TOPS.filter((t) => opts.skipPhotos || !availableTops.size || availableTops.has(t));
    // Thickness is an axis only where it has its own photo folders (Round, Pocker).
    const useThickness = new Set(kind.sizes.map((s) => s.thickness).filter(Boolean)).size > 1;
    return kind.sizes.flatMap((size) =>
      tops.flatMap((top) => LEGS.map((legs) => ({ kind, size, top, legs, useThickness })))
    );
  });
  const skus = await freshSkus(combos.length);
  const { data: inserted, error: ve } = await db()
    .from("variants")
    .insert(combos.map((c, i) => ({
      product_id: productId,
      name: `${c.kind.type} · ${shortSizeLabel(c.size.label)}${c.size.thickness && c.useThickness ? `, ${c.size.thickness}` : ""} — ${c.top} / ${c.legs}`,
      sku: skus[i],
      price: c.size.price + surcharge(c.top, c.legs),
      in_stock: true,
      visible: true,
      sort_order: i,
    })))
    .select("id, sku");
  if (ve) throw new Error(ve.message);
  const idBySku = new Map((inserted ?? []).map((r) => [r.sku as string, r.id as string]));
  const variantIds = skus.map((s) => idBySku.get(s)!);

  // Options. "Розмір: …" is deliberately the size axis name — imageGroups.ts treats that prefix as
  // non-visual, so all sizes of one colour share the same photos, which is exactly how these
  // renders work. "Тип: …" is NOT in that list, so нерозкладний and розкладний keep separate
  // photos even though they are now one product.
  const swatches = map._swatches ?? {};
  const optionRows: { variant_id: string; option_id: string }[] = [];
  for (const [i, c] of combos.entries()) {
    const ids = [
      await optionId(`${TYPE_AXIS}: ${c.kind.type}`, c.kind.type, optCache),
      await optionId(`Розмір: ${shortSizeLabel(c.size.label)}`, shortSizeLabel(c.size.label), optCache),
      await optionId(`${TOP_AXIS}: ${c.top}`, swatches[c.top] ?? c.top, optCache),
      await optionId(`${LEG_AXIS}: ${c.legs}`, swatches[c.legs] ?? c.legs, optCache),
    ];
    if (c.useThickness && c.size.thickness) ids.push(await optionId(`${THICKNESS_AXIS}: ${c.size.thickness}`, c.size.thickness, optCache));
    for (const option_id of ids) optionRows.push({ variant_id: variantIds[i], option_id });
  }
  for (let i = 0; i < optionRows.length; i += 500) {
    const { error } = await db().from("variant_options").insert(optionRows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  // Which characteristics a variant has is per kind — the розкладний ones carry «Довжина у
  // розкладеному вигляді», the нерозкладний ones do not. Their VALUES are per variant: kind.specs
  // prints the price-list wording, which joins every size of the kind with « / ».
  const specRows: { variant_id: string; spec_id: string; value: string; legacy_num: number }[] = [];
  for (const [i, c] of combos.entries()) {
    const dims = parseSizeDims(shortSizeLabel(c.size.label), c.size.thickness);
    let n = 0;
    for (const [name, value] of Object.entries(c.kind.specs)) {
      specRows.push({
        variant_id: variantIds[i],
        spec_id: await specId(name, specCache),
        value: variantSpecValue(name, value, dims),
        legacy_num: n++,
      });
    }
  }
  for (let i = 0; i < specRows.length; i += 500) {
    const { error } = await db().from("variant_specs").insert(specRows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  if (opts.skipPhotos) return { skipped: "", variants: variantIds.length, photos: 0 };

  // Photos: one upload per (tabletop, legs, thickness) group, linked to every variant in it —
  // the same grouping the admin upload route applies to sibling variants.
  let uploaded = 0;
  for (const kind of kinds) for (const ph of kind.photos) {
    const entry = perDir.get(ph.dir);
    if (!entry) continue;
    const byCombo = new Map<string, typeof entry.photos>();
    for (const photo of entry.photos) {
      const key = `${photo.top}|${photo.legs}`;
      const list = byCombo.get(key) ?? [];
      list.push(photo);
      byCombo.set(key, list);
    }
    for (const [key, photos] of byCombo) {
      const [top, legs] = key.split("|");
      const targets = variantIds.filter((_, i) => {
        const c = combos[i];
        return c.kind.type === kind.type && c.top === top && c.legs === legs
          && (!ph.thickness || c.size.thickness === ph.thickness);
      });
      if (!targets.length) continue;

      const ordered = [...photos].sort((a, b) => a.view - b.view);
      const pairs = [];
      for (const photo of ordered) {
        const abs = path.join(opts.photoRoot, ph.dir, photo.file);
        const buf = await fs.readFile(abs);
        const file = new File([new Uint8Array(buf)], photo.file, { type: "image/jpeg" });
        pairs.push(await uploadImagePair(file, { width: 1600, quality: 90 }));
        uploaded++;
      }
      const imageIds = await upsertImages(pairs.map((r) => ({ url: r.originalUrl, url_compressed: r.compressedUrl })));
      await linkImagesToVariants(imageIds, targets);
    }
  }
  return { skipped: "", variants: variantIds.length, photos: uploaded };
}

export async function importTables(opts: ImportOptions): Promise<ImportResult> {
  const map = JSON.parse(await fs.readFile(opts.photoMapPath, "utf8")) as PhotoMap;
  await ensureCatalog();

  const result: ImportResult = { created: [], skipped: [], errors: [] };
  for (const p of TABLE_PRODUCTS) {
    if (opts.only?.length && !opts.only.some((o) => p.model.toLowerCase() === o.toLowerCase())) continue;
    try {
      const r = await importProduct(p, map, opts);
      if (r.skipped) result.skipped.push({ model: p.model, reason: r.skipped });
      else result.created.push({ model: p.model, variants: r.variants, photos: r.photos });
    } catch (e) {
      result.errors.push({ model: p.model, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
