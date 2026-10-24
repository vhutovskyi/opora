// Столи: narrows the size-varying characteristics from the price-list wording to the ONE size the
// variant actually is. The import wrote TableKind.specs verbatim onto every variant of a kind, so
// all three Parker sizes carry «Діаметр: 800 мм / 900 мм / 1100 мм» instead of 800, 900 and 1100.
//
// Reads each variant's own «Розмір» option (and «Товщина стільниці» where that is an axis) rather
// than matching the joined value positionally — Viro's four sizes and four extended lengths are
// not in the same order, so position would be wrong there.
//
// A one-off data migration, hence a script rather than a button in the admin panel. No photos are
// touched. Without arguments it only shows what it would do (dry run).
//   node scripts/tables/onetime-split-size-specs.mjs          # take a look
//   node scripts/tables/onetime-split-size-specs.mjs --apply  # write
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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY у .env');
  process.exit(1);
}

const apply = process.argv.includes('--apply');

const api = async (path, init) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

// The narrowing rules live with the importer, so the migration and any future import agree.
const bundle = join(tmpdir(), 'opora-tablesData.migrate.mjs');
execFileSync('node_modules/.bin/esbuild', ['src/lib/importer/tablesData.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
const { parseSizeDims, variantSpecValue, TABLES_CATALOG } = await import(bundle);

const products = await api(`products?catalog=eq.${encodeURIComponent(TABLES_CATALOG)}&select=id,model&order=model`);
if (!products.length) {
  console.error(`Немає товарів у каталозі «${TABLES_CATALOG}»`);
  process.exit(1);
}
console.log(`${products.length} товарів у каталозі «${TABLES_CATALOG}»\n`);

const SELECT = 'id,variant_options(options(name,value)),variant_specs(spec_id,value,specs(name))';
const PAGE = 500;

// spec_id|value → variant ids, so one PATCH covers every variant that lands on the same value.
const updates = new Map();
const skipped = [];
let variantCount = 0;
let productLines = [];

for (const p of products) {
  let from = 0, variants = [], page;
  do {
    page = await api(`variants?product_id=eq.${p.id}&select=${SELECT}&order=sort_order&offset=${from}&limit=${PAGE}`);
    variants.push(...page);
    from += PAGE;
  } while (page.length === PAGE);

  let changed = 0;
  const samples = new Map();
  for (const v of variants) {
    variantCount++;
    const opts = (v.variant_options ?? []).map((o) => o.options).filter(Boolean);
    const size = opts.find((o) => o.name?.startsWith('Розмір: '));
    if (!size?.value) { skipped.push(`${p.model}: варіант ${v.id} без опції «Розмір»`); continue; }
    const thickness = opts.find((o) => o.name?.startsWith('Товщина стільниці: '))?.value;
    const dims = parseSizeDims(size.value, thickness);

    for (const row of v.variant_specs ?? []) {
      const name = row.specs?.name;
      if (!name) continue;
      const next = variantSpecValue(name, row.value, dims);
      if (next === row.value) continue;
      changed++;
      const k = `${row.spec_id}|${next}`;
      if (!updates.has(k)) updates.set(k, { spec_id: row.spec_id, value: next, ids: [] });
      updates.get(k).ids.push(v.id);
      if (!samples.has(name)) samples.set(name, `${row.value}  →  ${next}   (${size.value})`);
    }
  }
  if (changed) {
    productLines.push(`${p.model} — ${changed} значень на ${variants.length} варіантах`);
    for (const [name, s] of samples) productLines.push(`    ${name}: ${s}`);
  }
}

console.log(productLines.join('\n') || 'Нічого міняти — усі характеристики вже по-варіантні.');
const total = [...updates.values()].reduce((n, u) => n + u.ids.length, 0);
console.log(`\n${total} рядків variant_specs у ${updates.size} групах, ${variantCount} варіантів переглянуто`);
if (skipped.length) console.log(`пропущено: ${skipped.length}\n  ` + skipped.slice(0, 10).join('\n  '));

if (!apply) {
  console.log('\nЦе пробний запуск. Запусти з --apply, щоб записати.');
  process.exit(0);
}

const CHUNK = 100; // keeps the ?variant_id=in.(…) URL a sane length
let done = 0;
for (const u of updates.values()) {
  for (let i = 0; i < u.ids.length; i += CHUNK) {
    const ids = u.ids.slice(i, i + CHUNK);
    await api(`variant_specs?spec_id=eq.${u.spec_id}&variant_id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ value: u.value }),
      headers: { Prefer: 'return=minimal' },
    });
    done += ids.length;
  }
}
console.log(`\nготово — оновлено ${done} рядків. Не забудь скинути кеш: будь-яке збереження в /admin робить bump().`);
