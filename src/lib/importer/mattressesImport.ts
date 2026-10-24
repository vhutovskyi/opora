// One-off importer for the Матраци catalogue. Reads the product list from mattressesData.ts and
// writes products, variants (one per size), options, specs and photos directly via supabaseAdmin.
// Idempotent per product — a product whose `model` already exists is skipped, so a failed run can
// simply be repeated. Runs locally only: it reads the photo folders off disk (matrases/photos/).
//
// Photos: "Розмір" is the only option axis and it's non-visual, so every size of a product shares
// the same photo set — the uploaded images are linked to ALL of a product's variants, not grouped.

import fs from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImagePair } from "@/lib/r2";
import { upsertImages, linkImagesToVariants } from "@/lib/supabase/images";
import { FILTERABLE_SPECS, MATTRESSES_CATALOG, MATTRESS_PRODUCTS, type MattressProduct } from "./mattressesData";

const db = () => supabaseAdmin();

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

export type ImportOptions = {
  /** Root of matrases/photos. */
  photoRoot: string;
  /** Import only these models, matched exactly. */
  only?: string[];
  /** Create products and variants but skip the (slow) R2 uploads. */
  skipPhotos?: boolean;
};

// `model` is "Матрац <Brand Model>" — the photo folder and the URL slug are both built from just
// the "<Brand Model>" part (ASCII, matches matrases/photos/<folder> exactly).
function bareModel(model: string): string {
  return model.replace(/^Матрац\s+/, "");
}

// Files are named "1.png", "2.jpg", "3.webp" — ordered by the leading number, extension varies
// and doesn't matter (Cloudflare re-encodes on upload/serving anyway).
async function loadPhotos(photoRoot: string, model: string): Promise<{ file: string; buffer: Buffer; mime: string }[]> {
  const dir = path.join(photoRoot, bareModel(model));
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files = entries
    .map((f) => ({ f, n: parseInt(f, 10), ext: path.extname(f).toLowerCase() }))
    .filter((x) => !Number.isNaN(x.n) && MIME_BY_EXT[x.ext])
    .sort((a, b) => a.n - b.n);
  return Promise.all(
    files.map(async ({ f, ext }) => ({ file: f, buffer: await fs.readFile(path.join(dir, f)), mime: MIME_BY_EXT[ext] }))
  );
}

async function ensureCatalog() {
  const { data } = await db().from("catalogs").select("id").eq("name", MATTRESSES_CATALOG).maybeSingle();
  if (!data) await db().from("catalogs").insert({ name: MATTRESSES_CATALOG });
}

// Options are global, deduped by name (the size axis value doubles as its own label).
async function optionId(name: string, value: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const { data: found } = await db().from("options").select("id").eq("name", name).limit(1);
  let id = found?.[0]?.id as string | undefined;
  if (!id) {
    const { data, error } = await db().from("options").insert({ name, value }).select("id").single();
    if (error) throw new Error(`option "${name}": ${error.message}`);
    id = data.id as string;
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
    const { data, error } = await db()
      .from("specs")
      .insert({ name, filterable: FILTERABLE_SPECS.has(name) })
      .select("id")
      .single();
    if (error) throw new Error(`spec "${name}": ${error.message}`);
    id = data.id as string;
  }
  cache.set(name, id);
  return id;
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

async function importProduct(p: MattressProduct, opts: ImportOptions) {
  const { data: existing } = await db().from("products").select("id").eq("model", p.model).maybeSingle();
  if (existing) return { skipped: "already exists", variants: 0, photos: 0 };

  const minPrice = Math.min(...p.sizes.map((s) => s.price));
  const description = `${p.description}\n\n${p.features.map((f) => `- ${f}`).join("\n")}`;
  const { data: prod, error: pe } = await db()
    .from("products")
    .insert({
      model: p.model,
      slug: bareModel(p.model).replace(/\s+/g, "-"),
      catalog: MATTRESSES_CATALOG,
      min_price: minPrice,
      description,
      gallery_layout: "1,2",
      visible: true,
    })
    .select("id")
    .single();
  if (pe) throw new Error(pe.message);
  const productId = prod.id as string;

  const skus = await freshSkus(p.sizes.length);
  const { data: inserted, error: ve } = await db()
    .from("variants")
    .insert(
      p.sizes.map((s, i) => ({
        product_id: productId,
        sku: skus[i],
        price: s.price,
        in_stock: true,
        visible: true,
        sort_order: i,
      }))
    )
    .select("id, sku");
  if (ve) throw new Error(ve.message);
  const idBySku = new Map((inserted ?? []).map((r) => [r.sku as string, r.id as string]));
  const variantIds = skus.map((s) => idBySku.get(s)!);

  const optCache = new Map<string, string>();
  const optionRows: { variant_id: string; option_id: string }[] = [];
  for (const [i, s] of p.sizes.entries()) {
    const id = await optionId(`Розмір: ${s.size}`, s.size, optCache);
    optionRows.push({ variant_id: variantIds[i], option_id: id });
  }
  const { error: oe } = await db().from("variant_options").insert(optionRows);
  if (oe) throw new Error(oe.message);

  const specCache = new Map<string, string>();
  const specRows: { variant_id: string; spec_id: string; value: string; legacy_num: number }[] = [];
  for (const variantId of variantIds) {
    let n = 0;
    for (const [name, value] of Object.entries(p.specs)) {
      specRows.push({ variant_id: variantId, spec_id: await specId(name, specCache), value, legacy_num: n++ });
    }
  }
  for (let i = 0; i < specRows.length; i += 500) {
    const { error } = await db().from("variant_specs").insert(specRows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  let uploaded = 0;
  if (!opts.skipPhotos) {
    const photos = await loadPhotos(opts.photoRoot, p.model);
    if (photos.length) {
      const pairs = [];
      for (const photo of photos) {
        const file = new File([new Uint8Array(photo.buffer)], photo.file, { type: photo.mime });
        pairs.push(await uploadImagePair(file, { width: 1600, quality: 90 }));
        uploaded++;
      }
      const imageIds = await upsertImages(pairs.map((r) => ({ url: r.originalUrl, url_compressed: r.compressedUrl })));
      await linkImagesToVariants(imageIds, variantIds);
    }
  }

  return { skipped: "", variants: variantIds.length, photos: uploaded };
}

export type MattressImportResult = {
  created: { model: string; variants: number; photos: number }[];
  skipped: { model: string; reason: string }[];
  errors: { model: string; error: string }[];
};

export async function importMattresses(opts: ImportOptions): Promise<MattressImportResult> {
  await ensureCatalog();
  const result: MattressImportResult = { created: [], skipped: [], errors: [] };
  for (const p of MATTRESS_PRODUCTS) {
    if (opts.only?.length && !opts.only.some((o) => p.model.toLowerCase() === o.toLowerCase())) continue;
    try {
      const r = await importProduct(p, opts);
      if (r.skipped) result.skipped.push({ model: p.model, reason: r.skipped });
      else result.created.push({ model: p.model, variants: r.variants, photos: r.photos });
    } catch (e) {
      result.errors.push({ model: p.model, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
