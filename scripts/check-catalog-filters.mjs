// Checks the catalog filters against the real DB: every filter (options, specs, price) must hold for ONE
// variant. Before, each was checked against the product's union of variants, so AND behaved like OR
// (Стіл Edgar matched «Тип: Розкладний» + «Розмір: 1100 × 700 мм», a combination that doesn't exist) and a
// price window falling between two variants still matched (Стіл Norman has nothing in 6000–8400).
// Asserts: the result equals a brute-force per-variant oracle; every card variation is a matching variant;
// the unfiltered output is unchanged against git HEAD (pass --no-head to skip).
// Run: node scripts/check-catalog-filters.mjs (reads .env / .env.local)
import assert from 'node:assert';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
Object.assign(process.env, env);

// unstable_cache → an in-process memo: fresh DB data, fetched once per run rather than once per case.
const dir = fs.mkdtempSync(join(tmpdir(), 'opora-catalog-check-'));
fs.writeFileSync(join(dir, 'next-cache.mjs'),
  'export const unstable_cache = (fn) => { const m = new Map(); return (...a) => { const k = JSON.stringify(a); if (!m.has(k)) m.set(k, fn(...a)); return m.get(k); }; };\n');
const bundle = (entry, out) =>
  execFileSync('node_modules/.bin/esbuild', [
    entry, '--bundle', '--format=esm', '--platform=node', '--packages=external',
    '--alias:@=./src', `--alias:next/cache=${join(dir, 'next-cache.mjs')}`, `--outfile=${out}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
// --packages=external keeps @supabase/* as node_modules imports, so the bundle must sit inside the repo.
const outNew = join(process.cwd(), 'node_modules/.cache/opora-catalog.new.mjs');
bundle('src/lib/supabase/catalog.ts', outNew);
const { getCatalogAndBounds } = await import(outNew);

// --- Oracle: raw rows straight from PostgREST ---
const get = async (p) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};
const sel = 'id,model,variants(id,price,discounted_price,visible,variant_options(options(name)))';
const raw = await get(`products?select=${encodeURIComponent(sel)}&visible=eq.true`);
// The filter's price is the main one (variants.price), never discounted_price.
const eff = (v) => +v.price || 0;
const variantById = new Map();
const products = raw.map((p) => ({
  id: p.id, model: p.model,
  variants: p.variants.filter((v) => v.visible !== false).map((v) => {
    const row = { id: v.id, price: eff(v), names: v.variant_options.map((o) => o.options?.name).filter(Boolean) };
    variantById.set(v.id, { ...row, productId: p.id });
    return row;
  }),
}));

const variantMatches = (v, f) =>
  Object.values(f.optionFilters).every((g) => g.some((n) => v.names.includes(n))) &&
  (f.priceMin == null && f.priceMax == null ||
    v.price > 0 && (f.priceMin == null || v.price >= f.priceMin) && (f.priceMax == null || v.price <= f.priceMax));

// --- Filter cases: the two regressions above, plus random combinations drawn from real variants ---
let seed = 42;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const pick = (a) => a[rnd(a.length)];
const axis = (n) => n.split(':')[0].trim();
const cases = [
  { optionFilters: { 'Тип': ['Тип: Розкладний'], 'Розмір': ['Розмір: 1100 × 700 мм'] } },
  { optionFilters: {}, priceMin: 6500, priceMax: 8000 },
];
const withVariants = products.filter((p) => p.variants.some((v) => v.names.length >= 2));
for (let i = 0; i < 150; i++) {
  const p = pick(withVariants);
  const a = pick(p.variants.filter((v) => v.names.length >= 2)).names;
  const b = pick(p.variants).names; // usually a different variant → a cross-variant pair
  const optionFilters = {};
  for (const n of [pick(a), pick(b)]) (optionFilters[axis(n)] ||= []).includes(n) || optionFilters[axis(n)].push(n);
  const f = { optionFilters };
  if (rnd(2)) { const price = pick(p.variants).price; f.priceMin = Math.max(0, price - 500 * rnd(4)); }
  if (rnd(2)) f.priceMax = (f.priceMin ?? 0) + 1000 + 1000 * rnd(10);
  cases.push(f);
}
// Every real cross-variant pair (two axes each offered by the product, never on the same variant) —
// exactly what the old union logic matched wrongly — and a price window inside each gap between variants.
for (const p of products) {
  const all = [...new Set(p.variants.flatMap((v) => v.names))];
  for (const a of all) for (const b of all) {
    if (a < b && axis(a) !== axis(b) && !p.variants.some((v) => v.names.includes(a) && v.names.includes(b)))
      cases.push({ optionFilters: { [axis(a)]: [a], [axis(b)]: [b] } });
  }
  const prices = [...new Set(p.variants.map((v) => v.price).filter((x) => x > 0))].sort((x, y) => x - y);
  for (let k = 1; k < prices.length; k++)
    if (prices[k] - prices[k - 1] > 2) cases.push({ optionFilters: {}, priceMin: prices[k - 1] + 1, priceMax: prices[k] - 1 });
}

// The catalog base drops products without a single variation/photo group — compare within what it can show.
const shown = new Set((await getCatalogAndBounds({ type: ['Всі'] })).products.map((p) => p.id));
let crossVariantCases = 0;
for (const f of cases) {
  const { products: got, bounds } = await getCatalogAndBounds({ type: ['Всі'], ...f });
  const label = JSON.stringify(f);
  const expected = products.filter((p) => p.variants.some((v) => variantMatches(v, f))).map((p) => p.id).sort();
  assert.deepEqual(got.map((p) => p.id).sort(), expected.filter((id) => shown.has(id)), `набір товарів @ ${label}`);
  for (const p of got) {
    assert.ok(p.variations.length > 0, `${p.name}: картка без варіацій @ ${label}`);
    for (const v of p.variations) {
      const row = variantById.get(v.id);
      assert.ok(row && row.productId === p.id, `${p.name}: варіація ${v.id} не з цього товару`);
      assert.ok(variantMatches(row, f), `${p.name}: на картці варіант ${row.names.join(', ')} / ${row.price}₴, що не підходить @ ${label}`);
    }
  }
  if (bounds) assert.ok(bounds.min <= bounds.max, `межі @ ${label}`);
  // Count the cases the old union logic (options vs the product's union, price as range overlap) got wrong.
  const oldMatch = (p) => {
    const prices = p.variants.map((v) => v.price).filter((x) => x > 0);
    return Object.values(f.optionFilters).every((g) => g.some((n) => p.variants.some((v) => v.names.includes(n)))) &&
      (f.priceMin == null || Math.max(0, ...prices) >= f.priceMin) && (f.priceMax == null || Math.min(Infinity, ...prices) <= f.priceMax);
  };
  if (products.some((p) => shown.has(p.id) && oldMatch(p) && !p.variants.some((v) => variantMatches(v, f)))) crossVariantCases++;
}
console.log(`OK: ${cases.length} комбінацій фільтрів збігаються з поваріантним оракулом (${crossVariantCases} з них стара логіка ламала)`);

// --- Unfiltered output must be unchanged against HEAD (allOptionNames is gone on purpose) ---
if (!process.argv.includes('--no-head')) {
  // Next to the original, so its relative imports (./client, ./imageGroups) resolve; removed right after.
  const headSrc = 'src/lib/supabase/.catalog.head.check.ts';
  const outHead = join(process.cwd(), 'node_modules/.cache/opora-catalog.head.mjs');
  fs.writeFileSync(headSrc, execFileSync('git', ['show', 'HEAD:src/lib/supabase/catalog.ts']));
  try { bundle(headSrc, outHead); } finally { fs.rmSync(headSrc); }
  const head = await import(outHead);
  for (const type of [['Всі'], ['Ліжка'], ['Столи']]) {
    for (const sort of ['default', 'price_asc', 'newest']) {
      const a = (await head.getCatalogAndBounds({ type, sort })).products.map(({ allOptionNames, ...p }) => p);
      const b = (await getCatalogAndBounds({ type, sort })).products;
      assert.deepStrictEqual(b, a, `без фільтрів вивід змінився: ${type} / ${sort}`);
    }
  }
  console.log('OK: без фільтрів вивід ідентичний HEAD');
}
