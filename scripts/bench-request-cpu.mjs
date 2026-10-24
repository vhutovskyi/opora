// Where the CPU of a request actually goes, measured on real data.
// Why CPU and not wall-clock: the Workers FREE plan allows 10ms of CPU per request, and waiting on
// Supabase/KV does not count toward it. A slow page in `npm run dev` is mostly I/O; a DOWN worker is
// CPU. So this measures only the JS work, split by phase, for the heaviest product and the catalog.
// Run: node scripts/bench-request-cpu.mjs
import fs from 'node:fs';

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const raw = async (p) => {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.text();
};
const ms = (fn, iters) => { fn(); const t = process.hrtime.bigint(); for (let i = 0; i < iters; i++) fn(); return Number(process.hrtime.bigint() - t) / 1e6 / iters; };
const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2);

const BOOL_YES = 'Так', ORDER = ['Щит', 'Стандарт'];
const rank1 = (v) => { const i = ORDER.indexOf(v); return i < 0 ? 0 : i - ORDER.length; };
const boolYes = (v) => (v.variant_options || []).some((o) => o.options?.value === BOOL_YES) ? 1 : 0;
const vRank = (v) => (v.variant_options || []).reduce((s, o) => s + rank1(o.options?.value || ''), 0);
const compressedUrl = (u) => `${u.replace('/images/', '/images-compressed/')}.webp`;

// ---------- 1. the product page's miss path: the heaviest product ----------
const V = 'id,name,sku,price,in_stock,visible,sort_order,variant_images(sort_order,images(url,url_compressed)),variant_options(options(name,value)),variant_specs(value,legacy_num,specs(name))';
const A = `product_accessories!product_id(id,sort_order,max_qty,accessory:accessory_product_id(id,slug,model,min_price,combo_axis,variants(${V})))`;

const list = JSON.parse(await raw(`products?select=id,model&visible=eq.true`));
let worst = null;
for (const p of list) {
  const body = await raw(`products?select=id,model,visible,long_description,${V.replace(/^/, 'variants(')}),${A}&id=eq.${p.id}`);
  const combo = await raw(`accessory_combo_photos?select=image_group_key,combo_key,accessory_combo_images(sort_order,images(url,url_compressed))&product_id=eq.${p.id}`);
  const size = Buffer.byteLength(body) + Buffer.byteLength(combo);
  if (!worst || size > worst.size) worst = { ...p, body, combo, size };
}

const parsed = JSON.parse(worst.body)[0];
const combos = JSON.parse(worst.combo);
const variants = parsed.variants || [];
const accVariants = (parsed.product_accessories || []).reduce((n, a) => n + (a.accessory?.variants?.length || 0), 0);

const specsOf = (v) => (v.variant_specs || []).slice().sort((a, b) => (a.legacy_num || 0) - (b.legacy_num || 0)).map((s) => ({ name: s.specs?.name || 'Невідомо', value: String(s.value || '') }));
const poolOld = () => { const sets = [], seen = new Map(); return { sets, id: (sp) => { const k = JSON.stringify(sp); let i = seen.get(k); if (i === undefined) { i = sets.push(sp) - 1; seen.set(k, i); } return i; } }; };
const poolNew = () => { const sets = [], seen = new Map(); return { sets, id: (sp) => { const k = sp.map((s) => `${s.name}\u0000${s.value}`).join("\u0001"); let i = seen.get(k); if (i === undefined) { i = sets.push(sp) - 1; seen.set(k, i); } return i; } }; };
const sortOld = (r) => (r || []).filter((v) => v.visible !== false).sort((a, b) => boolYes(a) - boolYes(b) || vRank(a) - vRank(b) || (a.sort_order || 0) - (b.sort_order || 0));
const sortNew = (r) => (r || []).filter((v) => v.visible !== false).map((v) => ({ v, b: boolYes(v), r: vRank(v), o: v.sort_order || 0 })).sort((x, y) => x.b - y.b || x.r - y.r || x.o - y.o).map((d) => d.v);

const packVariant = (v, pool) => {
  const imgs = (v.variant_images || []).filter((r) => r.images).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const images = imgs.map((r) => r.images.url);
  const comp = imgs.map((r) => r.images.url_compressed || r.images.url);
  return { id: v.id, images, imagesCompressed: comp.every((u, i) => u === compressedUrl(images[i])) ? null : comp,
    options: ((v.variant_options || []).map((o) => o.options).filter(Boolean)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk')).map((o) => ({ name: o.name || '', value: o.value || '' })),
    specs: pool.id(specsOf(v)) };
};
const packAll = (sortFn, poolFn) => {
  const pool = poolFn();
  return { specSets: pool.sets,
    variants: sortFn(variants).map((v) => packVariant(v, pool)),
    accessories: (parsed.product_accessories || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).filter((a) => a.accessory)
      .map((a) => ({ id: a.id, variants: sortFn(a.accessory.variants).map((v) => packVariant(v, pool)) })),
    accessoryComboPhotos: combos.map((c) => {
      const r = (c.accessory_combo_images || []).filter((x) => x.images).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const images = r.map((x) => x.images.url), comp = r.map((x) => x.images.url_compressed || x.images.url);
      return { imageGroupKey: c.image_group_key, comboKey: c.combo_key, images, imagesCompressed: comp.every((u, i) => u === compressedUrl(images[i])) ? null : comp };
    }) };
};
const packedNew = packAll(sortNew, poolNew);
const unpack = (d) => ({ ...d, variants: d.variants.map((v) => ({ ...v, imagesCompressed: v.imagesCompressed ?? v.images.map(compressedUrl), specifications: d.specSets[v.specs] })) });

console.log(`\n=== 1. Сторінка товару, найважчий: ${worst.model} ===`);
console.log(`   ${variants.length} варіацій + ${accVariants} у аксесуарах + ${combos.length} комбо-наборів; відповідь Supabase ${mb(worst.body)}МБ + ${mb(worst.combo)}МБ`);
console.log(`   ПРОМАХ кеша (раз на годину / після bump):`);
console.log(`     JSON.parse відповіді        ${ms(() => JSON.parse(worst.body), 20).toFixed(2)}ms   ← неминуче`);
console.log(`     пакування old               ${ms(() => packAll(sortOld, poolOld), 20).toFixed(2)}ms`);
console.log(`     пакування new               ${ms(() => packAll(sortNew, poolNew), 20).toFixed(2)}ms`);
console.log(`   ПОПАДАННЯ (кожен запит):`);
console.log(`     JSON.parse з KV             ${ms(() => JSON.parse(JSON.stringify(packedNew)), 20).toFixed(2)}ms`);
console.log(`     unpack                      ${ms(() => unpack(structuredClone(packedNew)), 20).toFixed(2)}ms`);

// ---------- 2. the catalog page: runs on EVERY request ----------
const CV = 'id,price,sort_order,variant_images(sort_order,images(url,url_compressed)),variant_options(options(name,value))';
// the real query caps images at 2 per variant (Postgres-side), so replicate it or the miss cost lies
const baseRaw = await raw(`products?select=id,slug,model,min_price,created_at,catalog,variants(${CV})&visible=eq.true&variants.variant_images.order=sort_order&variants.variant_images.limit=2`);
const baseRows = JSON.parse(baseRaw);

const imageGroupKeyish = (names) => names.filter((n) => /Матеріал|Колір/.test(n)).sort().join('|');
const buildBase = () => baseRows.map((p) => {
  const all = new Set(), seen = new Set(), variations = [];
  for (const v of (p.variants || []).map((v) => ({ v, b: boolYes(v), r: vRank(v), o: v.sort_order || 0 })).sort((x, y) => x.b - y.b || x.r - y.r || x.o - y.o).map((d) => d.v)) {
    const linked = (v.variant_options || []).map((o) => o.options).filter(Boolean);
    const names = linked.map((o) => o.name || '').filter(Boolean);
    for (const n of names) all.add(n);
    const look = imageGroupKeyish(names);
    if (seen.has(look)) continue;
    seen.add(look);
    variations.push({ id: v.id, allHexes: linked.map((o) => ({ hex: o.value || '', name: o.name || '' })), images: (v.variant_images || []).filter((r) => r.images).slice(0, 2).map((r) => r.images.url_compressed || r.images.url) });
  }
  return { id: p.id, name: p.model, price: Number(p.min_price || 0), maxPrice: Math.max(0, ...(p.variants || []).map((v) => Number(v.price || 0))), createdAt: p.created_at || '', variations, allOptionNames: [...all] };
}).filter((p) => p.variations.length > 0);

const base = buildBase();
// one full filter+sort+strip pass = what getFilteredCatalog does over the cached base
const onePass = () => {
  let c = base.filter((p) => p.allOptionNames.length >= 0);
  const sorted = [...c].sort((a, b) => a.price - b.price);
  return sorted.map(({ createdAt, ...rest }) => rest);
};
const pass = ms(onePass, 200);
console.log(`\n=== 2. Сторінка каталогу (кожен запит, попадання в кеш) ===`);
console.log(`   ${base.length} товарів / ${base.reduce((n, p) => n + p.variations.length, 0)} варіацій у базі; відповідь Supabase ${mb(baseRaw)}МБ`);
console.log(`     один прохід фільтр+сорт     ${pass.toFixed(2)}ms`);
console.log(`     було: 2 проходи             ${(pass * 2).toFixed(2)}ms   ← getFilteredCatalog + getPriceBounds`);
console.log(`     стало: 1 прохід             ${pass.toFixed(2)}ms   ← getCatalogAndBounds`);
console.log(`   ПРОМАХ кеша додає:`);
console.log(`     JSON.parse відповіді        ${ms(() => JSON.parse(baseRaw), 20).toFixed(2)}ms`);
console.log(`     побудова базового payload   ${ms(buildBase, 20).toFixed(2)}ms`);
console.log(`\nБюджет Workers FREE = 10ms CPU/запит (PAID = 30s). Тут немає рендера React —\nдодай його зверху: це зазвичай найбільша частина CPU на SSR-сторінці.`);
