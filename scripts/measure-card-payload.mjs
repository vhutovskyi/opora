// Measures the payload of the CARD paths against live Supabase data: getTopProducts (home page)
// as it is now vs. the card-shaped query. The point is the Next cache's 2MB per-entry limit —
// fetchCatalogBase was already reshaped for it once (7.1MB → 0.48MB), and the comments there say
// "adding a field means measuring again". This is that measurement, so it doesn't have to be
// re-improvised by hand next time.
//
// It also asserts the dedup is lossless for the card's colour palette: ProductCard builds its
// swatches from the unique hexes across variations, so collapsing by imageGroupKey must not drop
// a colour. Reads the real DB (service role), prints sizes only — never any credential.
// Run: node scripts/measure-card-payload.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// imageGroupKey is the single source of truth for "which options change how a product looks" —
// bundled from src rather than re-implemented here, so this can't drift from the app.
const out = join(tmpdir(), 'opora-imagegroups.measure.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/supabase/imageGroups.ts',
  '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { imageGroupKey } = await import(out);

// .env.local / .env, without echoing anything out of them.
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping');
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const kb = (o) => (bytes(o) / 1024).toFixed(1);

const { data: top } = await db.from('top_products').select('product_id, sort_order').order('sort_order');
const ids = (top || []).map((r) => r.product_id).filter(Boolean);
console.log(`top_products: ${ids.length} products`);
if (ids.length === 0) { console.log('nothing pinned — nothing to measure'); process.exit(0); }

const opts = (v) => (v.variant_options || []).map((vo) => vo.options).filter(Boolean);

// ---- BEFORE: the full variant select, every image, every visible variant ----
const BEFORE =
  'id, name, sku, price, discounted_price, in_stock, visible, sort_order, variant_images ( sort_order, images ( url, url_compressed ) ), variant_options ( options ( name, value ) )';
const { data: before, error: e1 } = await db
  .from('products')
  .select(`id, slug, model, min_price, catalog, variants ( ${BEFORE} )`)
  .in('id', ids)
  .eq('visible', true);
assert.ifError(e1);

let beforeVariations = 0, beforeImages = 0;
const beforePayload = before.map((p) => {
  const vis = (p.variants || []).filter((v) => v.visible !== false);
  beforeVariations += vis.length;
  return {
    id: p.id, slug: p.slug, name: p.model, price: Number(p.min_price || 0), catalog: p.catalog,
    variations: vis.map((v) => {
      const rows = (v.variant_images || []).filter((r) => r.images);
      beforeImages += rows.length;
      const o = opts(v);
      return {
        id: v.id,
        colorName: o.map((x) => x.name || '').join(' / ') || 'Unknown',
        allHexes: o.map((x) => ({ hex: x.value || '', name: x.name || '' })),
        images: rows.map((r) => r.images.url),
        imagesCompressed: rows.map((r) => r.images.url_compressed || r.images.url),
        price: String(Number(v.price || 0)),
      };
    }),
  };
});

// ---- AFTER: 2 photos per variant counted by Postgres, one variant per look, compressed only ----
const AFTER =
  'id, price, discounted_price, visible, sort_order, variant_images ( sort_order, images ( url, url_compressed ) ), variant_options ( options ( name, value ) )';
const { data: after, error: e2 } = await db
  .from('products')
  .select(`id, slug, model, min_price, catalog, variants ( ${AFTER} )`)
  .in('id', ids)
  .eq('visible', true)
  .order('sort_order', { referencedTable: 'variants.variant_images' })
  .limit(2, { referencedTable: 'variants.variant_images' });
assert.ifError(e2);

let afterVariations = 0, afterImages = 0;
const afterPayload = after.map((p) => {
  const seen = new Set();
  const variations = [];
  for (const v of (p.variants || []).filter((x) => x.visible !== false)) {
    const o = opts(v);
    const look = imageGroupKey(o.map((x) => x.name || '').filter(Boolean));
    if (seen.has(look)) continue;
    seen.add(look);
    const rows = (v.variant_images || []).filter((r) => r.images);
    afterImages += rows.length;
    variations.push({
      id: v.id,
      colorName: o.map((x) => x.name || '').join(' / ') || 'Unknown',
      allHexes: o.map((x) => ({ hex: x.value || '', name: x.name || '' })),
      images: rows.map((r) => r.images.url_compressed || r.images.url),
      price: String(Number(v.price || 0)),
    });
  }
  afterVariations += variations.length;
  return { id: p.id, slug: p.slug, name: p.model, price: Number(p.min_price || 0), catalog: p.catalog, variations };
});

console.log(`\nBEFORE  variations: ${String(beforeVariations).padStart(5)}  photos: ${String(beforeImages).padStart(5)}  ${kb(beforePayload).padStart(8)} KB`);
console.log(`AFTER   variations: ${String(afterVariations).padStart(5)}  photos: ${String(afterImages).padStart(5)}  ${kb(afterPayload).padStart(8)} KB`);
console.log(`\nreduction: ${(100 - (bytes(afterPayload) / bytes(beforePayload)) * 100).toFixed(1)}%  (2MB cache limit: ${kb(afterPayload)} KB)`);

// The card renders at most 2 photos of the active variation — anything beyond that was fetched for nothing.
assert.ok(afterImages <= afterVariations * 2, 'не більше 2 фото на варіацію');
assert.ok(bytes(afterPayload) < bytes(beforePayload), 'payload зменшився');
assert.ok(bytes(afterPayload) < 2 * 1024 * 1024, 'вписується у 2MB ліміт кешу Next');

// Lossless for the palette: every distinct colour combination still has a variation carrying it.
const isHex = (v) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((v || '').trim());
const hexSets = (payload) => payload.map((p) => {
  const s = new Set();
  for (const v of p.variations) {
    const h = v.allHexes.filter((x) => isHex(x.hex)).map((x) => x.hex).join('|');
    if (h) s.add(h);
  }
  return s;
});
const a = hexSets(beforePayload), b = hexSets(afterPayload);
const lost = [];
for (let i = 0; i < a.length; i++) {
  for (const h of a[i]) if (!b[i].has(h)) lost.push(`${beforePayload[i].name}: ${h}`);
}
assert.deepEqual(lost, [], `дедуп не втрачає кольори картки: ${lost.slice(0, 5).join(', ')}`);

console.log('OK: card payload measured, дедуп без втрати кольорів');
