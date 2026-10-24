// Checks that the 3D model registry doesn't drift from what actually sits on R2, and that the
// wood textures don't drift from the files in public/. This is where it breaks most easily: the map is
// keyed by the product slug, while the files live separately — a typo in the key or an unuploaded file
// gives a "silent" 404 instead of a preview. The model part makes live HEAD requests to R2
// (needs .env), so this script requires internet access.
// Run: node scripts/check-models3d.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = {};
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const R2_LIVE = env.R2_PUBLIC_DOMAIN;
if (!R2_LIVE) {
  console.error('Немає R2_PUBLIC_DOMAIN у .env — без нього не перевірити, що лежить на R2.');
  process.exit(1);
}

const bundle = (src, name) => {
  const out = join(tmpdir(), name);
  execFileSync('node_modules/.bin/esbuild', [
    src, '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(out);
};

const { model3dFor } = await bundle('src/lib/models3d.ts', 'opora-models3d.check.mjs');
const { woodComparison } = await bundle('src/lib/woodTextures.ts', 'opora-wood.check.mjs');

// ── 3D models ────────────────────────────────────────────────────────────────
// Slugs from the DB (products.slug) as of the Estella model import.
const SLUGS_WITH_MODELS = [
  'Ammi', 'Venecia', 'VeneciaLux', 'Duet', 'DuetPlus', 'Diana', 'Nota', 'NotaPlus',
  'NotaBene', 'Renata', 'RenataLux', 'Selena', 'SelenaAuri', 'Tytan', 'Atlas',
  'Vega', 'VegaTumba', 'Tessa', 'KomodVega',
  // single beds — narrowed down from the double ones (see models3d.ts)
  'VeneciaOne', 'VeneciaLuxOne', 'DianaOne', 'RenataOne', 'RenataLuxOne',
];

// Single and double are DIFFERENT files: if the key points at the same model, the customer
// sees the 160 bed on the page of the 90 one.
for (const [single, double] of [['VeneciaOne', 'Venecia'], ['VeneciaLuxOne', 'VeneciaLux'],
                                ['DianaOne', 'Diana'], ['RenataOne', 'Renata'],
                                ['RenataLuxOne', 'RenataLux']]) {
  assert.notEqual(model3dFor(single, 'https://x').glb, model3dFor(double, 'https://x').glb,
    `${single} не має вести на модель ${double}`);
}

const FAKE_R2 = 'https://pub-test.r2.dev';

for (const slug of SLUGS_WITH_MODELS) {
  const m = model3dFor(slug, FAKE_R2);
  assert.ok(m, `${slug}: модель має бути в реєстрі`);
  // Both formats from R2: .glb is fetched by <model-viewer> (needs CORS on the bucket — the prod domain
  // and localhost:3000 must be in its AllowedOrigins), .usdz is opened by iOS Quick Look
  // by navigating to the file (it doesn't care about CORS, but the same policy does no harm).
  const base = slug === 'KomodVega' ? 'KomodTessa' : slug; // the slug and the file diverge exactly here (a typo in the DB)
  assert.equal(m.glb, `${FAKE_R2}/models/${base}.glb`, `${slug}: glb з R2`);
  assert.ok(m.usdz.startsWith(FAKE_R2) && m.usdz.endsWith('.usdz'), `${slug}: usdz з R2`);
}

// Without an R2 domain the whole entry is null (not "glb yes, usdz no"): .glb used to live in public/ and
// worked without R2, now with no domain we show nothing at all rather than a broken link.
assert.equal(model3dFor('Ammi', undefined), null, 'без R2_PUBLIC_DOMAIN моделі немає взагалі');
assert.equal(model3dFor('Ammi', ''), null, 'порожній домен — так само null');
// A trailing slash in the domain must not produce "//models".
assert.equal(model3dFor('Ammi', `${FAKE_R2}/`).glb, model3dFor('Ammi', FAKE_R2).glb, 'слеш у кінці домену');

// A product without a model must not return a path — otherwise the "3D" button shows up everywhere.
for (const ref of [null, undefined, '', 'Laos', 'Malva', 'нема-такого',
                   '550e8400-e29b-41d4-a716-446655440000']) {
  assert.equal(model3dFor(ref, FAKE_R2), null, `${ref}: моделі бути не повинно`);
}

// ── Live checks against R2 ───────────────────────────────────────────────────
// The registry can "lie" — the file was deleted from the bucket but the map stayed. A HEAD on every glb/usdz
// with the REAL domain catches exactly that (and, along the way, that CORS on the bucket really is configured).
for (const slug of SLUGS_WITH_MODELS) {
  const m = model3dFor(slug, R2_LIVE);
  for (const [label, url] of [['glb', m.glb], ['usdz', m.usdz]]) {
    const r = await fetch(url, { method: 'HEAD' });
    assert.equal(r.status, 200, `${slug} ${label}: ${url} -> ${r.status} (немає на R2?)`);
  }
}

// CORS: without it <model-viewer> silently fails to load the .glb in the browser — a HEAD alone
// doesn't catch it (the browser, not fetch, checks the header), so we look at it directly.
{
  const probe = model3dFor(SLUGS_WITH_MODELS[0], R2_LIVE).glb;
  const site = (env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  for (const origin of [site, 'http://localhost:3000'].filter(Boolean)) {
    const r = await fetch(probe, { method: 'HEAD', headers: { Origin: origin } });
    assert.equal(
      r.headers.get('access-control-allow-origin'), origin,
      `CORS: origin ${origin} не дозволено на бакеті (R2 → Settings → CORS Policy)`
    );
  }
}

// ── "Масив / Щит" textures ───────────────────────────────────────────────────
// Hex values of the "Колір" option = ESTELLA_COLORS. The ones the supplier gave textures for.
const HEX_WITH_TEXTURE = {
  '#6B4423': 'Горіх темний', '#E4C9A0': 'Бук', '#B0702F': 'Горіх світлий',
  '#7A2318': 'Червоне дерево', '#C46A2E': 'Вільха', '#2B211C': 'Венге',
  '#9C3B24': 'Каштан',
};

for (const [hex, name] of Object.entries(HEX_WITH_TEXTURE)) {
  const w = woodComparison(hex);
  assert.ok(w.exact, `${hex}: текстура має бути точною`);
  assert.equal(w.colorName, name, `${hex}: назва кольору`);
  for (const p of [w.masyv, w.shchyt]) {
    assert.ok(existsSync(join('public', p)), `${hex}: немає файлу public${p}`);
  }
  // Solid wood and panel are DIFFERENT files, otherwise the comparison shows the same thing twice.
  assert.notEqual(w.masyv, w.shchyt, `${hex}: масив і щит мають різнитися`);
}

// Colours without a texture (painted ones) must not fail — we show an example and say so.
for (const hex of ['#F2EFEA', '#9A9A9A', '#E6D2D0', null, undefined, '', 'не-hex']) {
  const w = woodComparison(hex);
  assert.equal(w.exact, false, `${hex}: має бути позначено як приклад`);
  assert.ok(w.colorName, `${hex}: у прикладу все одно є назва кольору`);
  for (const p of [w.masyv, w.shchyt]) {
    assert.ok(existsSync(join('public', p)), `${hex}: немає файлу-прикладу public${p}`);
  }
}

// Hex case doesn't matter — the DB holds both #f2f2f2 and #F2F2F2.
assert.equal(woodComparison('#6b4423').masyv, woodComparison('#6B4423').masyv, 'hex регістронезалежний');
assert.ok(woodComparison(' #6B4423 ').exact, 'hex із пробілами');

console.log('OK: 3D-моделі та текстури дерева збігаються з public/');
