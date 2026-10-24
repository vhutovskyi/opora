// Copies the long description (products.long_description) from a base bed onto its
// single-bed version: "Венеція" → "Венеція Односпальне", "Венеція Люкс" →
// "Венеція Люкс Односпальне". The pair is matched by name — the single one is exactly
// the base name + " Односпальне", so "Люкс" stays a separate pair instead of merging.
//
// A one-off data migration, hence a script rather than a button in the admin panel.
// Without arguments it only shows what it would do (dry run).
//   node scripts/copy-bed-descriptions.mjs          # take a look
//   node scripts/copy-bed-descriptions.mjs --apply  # write
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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY у .env');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const SUFFIX = ' Односпальне';

const api = async (path, init) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const products = await api('products?select=id,model,long_description&order=model');
const byModel = new Map(products.map((p) => [p.model, p]));
const hasBlocks = (p) => Array.isArray(p.long_description) && p.long_description.length > 0;

const singles = products.filter((p) => p.model?.endsWith(SUFFIX));
if (!singles.length) {
  console.log('Товарів із «Односпальне» у назві не знайдено.');
  process.exit(0);
}

const todo = [];
const skipped = [];
for (const single of singles) {
  const baseName = single.model.slice(0, -SUFFIX.length).trim();
  const base = byModel.get(baseName);
  if (!base) { skipped.push(`${single.model} — базового «${baseName}» немає в базі`); continue; }
  if (!hasBlocks(base)) { skipped.push(`${single.model} — у «${baseName}» порожній опис`); continue; }
  if (JSON.stringify(base.long_description) === JSON.stringify(single.long_description)) {
    skipped.push(`${single.model} — опис уже такий самий`);
    continue;
  }
  todo.push({ single, base, overwrite: hasBlocks(single) });
}

for (const s of skipped) console.log(`–  ${s}`);
for (const { single, base, overwrite } of todo) {
  console.log(`${apply ? '✓' : '→'}  ${base.model} → ${single.model} (${base.long_description.length} блоків)${overwrite ? '  ⚠ ПЕРЕЗАПИС наявного опису' : ''}`);
}

if (!apply) {
  console.log(`\nDry-run. Буде змінено ${todo.length} товар(ів). Запусти з --apply, щоб записати.`);
  process.exit(0);
}

for (const { single, base } of todo) {
  await api(`products?id=eq.${single.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ long_description: base.long_description }),
  });
}
console.log(`\nГотово: оновлено ${todo.length}. Кеш каталогу треба скинути — збережи будь-що в адмінці (bump) або дочекайся revalidate (1 год).`);
