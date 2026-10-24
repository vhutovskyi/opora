// Checks the parsing of bed upgrade folders on the REAL layout (~/Downloads/BEDS if present —
// otherwise on the built-in sample): every config folder → a photo set of its own Матеріал+Колір group,
// and bedConfigPatterns yields the accessory option values per the agreed table.
// Run: node scripts/check-bed-combos.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'opora-bedCombos.check.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/estella/folderImport.ts',
  '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { parseBedCombos, bedConfigParts, resolveComboForConfig, deriveBedVariant } = await import(out);
const acOut = join(tmpdir(), 'opora-ac-for-beds.check.mjs');
execFileSync('node_modules/.bin/esbuild', ['src/lib/accessoryCombo.ts','--bundle','--format=esm','--platform=node','--alias:@=./src',`--outfile=${acOut}`], { stdio: ['ignore','ignore','inherit'] });
const { accessoryComboKey } = await import(acOut);
// Compatibility helper: patterns only, no quantities.
const bedConfigPatterns = (c) => bedConfigParts(c).map((p) => p.pattern);

// ── bedConfigPatterns: the agreed mapping table ──────────────────────────────
const m = (config, value) => bedConfigPatterns(config).some((re) => re.test(value));
assert.ok(m('З великою планкою', 'Подвійна 134 см'), 'велика → 134');
assert.ok(!m('З великою планкою', '96см'), 'велика ≠ 96');
assert.ok(m('З малою планкою безпеки', '96см'), 'мала → 96');
assert.ok(m('З одинарною великою планкою', '130-140см'), 'одинарна велика → 130-140');
assert.ok(m('З одинарною малою планкою', '70-80см'), 'одинарна мала → 70-80');
assert.ok(!m('З одинарною малою планкою', '96см'), 'одинарна мала ≠ подвійна 96');
assert.ok(m("З дерев'яними шухлядами", "Дерев'яні боковини"), 'дерев → боковини');
assert.ok(m('З шухлядами ЛДСП 102', 'ЛДСП 102'), 'ЛДСП 102');
assert.ok(!m('З шухлядами ЛДСП 102', 'ЛДСП 107'), 'ЛДСП 102 ≠ 107');
// Combinations yield TWO patterns — one per accessory.
assert.equal(bedConfigPatterns("З дерев'яними шухлядами та великою планкою").length, 2);
assert.equal(bedConfigPatterns('З шухлядами ЛДСП 107 та малою планкою').length, 2);
// "Одинарна" spreads over both rails in the name.
const both = bedConfigPatterns('З одинарною малою та великою планками');
assert.equal(both.length, 2);
assert.ok(both.some((re) => re.test('130-140см')) && both.some((re) => re.test('70-80см')));

// MIXED names: "одинарн" applies only TO WHAT COMES AFTER it.
// A double small (96) + a single large (130-140), and NOT two singles.
const mixed = bedConfigPatterns('З малою планкою та одинарною великою планкою');
assert.equal(mixed.length, 2);
assert.ok(mixed.some((re) => re.test('96см')), 'мала ПЕРЕД «одинарною» лишається подвійною');
assert.ok(mixed.some((re) => re.test('130-140см')), 'велика ПІСЛЯ «одинарною» — одинарна');
assert.ok(!mixed.some((re) => re.test('70-80см')), 'одинарної малої тут немає');
// A double small + a single small — TWO different values, not one.
const twoSmall = bedConfigPatterns("З дерев'яними шухлядами та малою планкою і одинарна мала планка");
assert.equal(twoSmall.length, 3, 'шухляди + подвійна мала + одинарна мала');
assert.ok(twoSmall.some((re) => re.test('96см')) && twoSmall.some((re) => re.test('70-80см')));
// A double small + a single small and large.
const three = bedConfigPatterns('З малою планкою та одинарною малою і великою планкою');
assert.equal(three.length, 3);
assert.ok(['96см', '70-80см', '130-140см'].every((v) => three.some((re) => re.test(v))));
// A plain folder without an upgrade yields no patterns.
assert.equal(bedConfigPatterns('').length, 0);

// ── parseBedCombos ───────────────────────────────────────────────────────────
const f = (path) => ({ name: path.split('/').pop(), webkitRelativePath: path });
const BEDS = join(homedir(), 'Downloads', 'BEDS');

const sample = [
  // Аммі Плюс: the base photo (config="") — must be IGNORED.
  f('BEDS/Аммі Плюс/Аммі Плюс/Аммі Плюс з матрацом/Аммі Плюс/Масив/estella_ammi_plus_101-masyv_a.jpg'),
  // An upgrade in three packagings — one set, order постіль → каркас → матрац.
  f("BEDS/Аммі Плюс/Аммі Плюс/Аммі Плюс з матрацом/Аммі Плюс з дерев'яними шухлядами/Масив/estella_ammi_plus_101-masyv_m.jpg"),
  f("BEDS/Аммі Плюс/Аммі Плюс/Аммі Плюс каркас/Аммі Плюс з дерев'яними шухлядами/Масив/estella_ammi_plus_101-masyv_k.jpg"),
  f("BEDS/Аммі Плюс/Аммі Плюс/Аммі Плюс з постіллю/Аммі Плюс з дерев'яними шухлядами/Масив/estella_ammi_plus_101-masyv_p.jpg"),
  // Another material of the same upgrade — a SEPARATE set.
  f("BEDS/Аммі Плюс/Аммі Плюс/Аммі Плюс з матрацом/Аммі Плюс з дерев'яними шухлядами/Щит/estella_ammi_plus_101-shchyt_m.jpg"),
  // The "з білими ніжками" branch — the same product, but a different photo group.
  f("BEDS/Аммі Плюс/Аммі Плюс з білими ніжками/Аммі Плюс з матрацом/Аммі Плюс з дерев'яними шухлядами/Масив/estella_bili_ammi_plus_101-masyv_m.jpg"),
];
const parsed = parseBedCombos(sample, 'Так', 'Ні');

// The base photo didn't get in; 4 sets (Масив, Щит, Масив + white legs — and all under one config).
assert.equal(parsed.length, 3, `очікував 3 набори, отримав ${parsed.length}`);
assert.ok(parsed.every((g) => g.baseModel === 'Аммі Плюс'), 'модель однакова');
assert.ok(parsed.every((g) => /дерев/i.test(g.config)), 'усі — про дерев\'яні шухляди');

// The three packagings merged into ONE set, in the order постіль → каркас → матрац.
const masyv = parsed.find((g) => g.groupOptionNames.includes('Матеріал: Масив') && !g.groupLabel.includes('білі'));
assert.equal(masyv.files.length, 3);
assert.deepEqual(masyv.files.map((x) => x.name.slice(-6)), ['_p.jpg', '_k.jpg', '_m.jpg']);

// The "З білими ніжками" axis is present, because this model has such a branch.
assert.ok(masyv.groupOptionNames.includes('З білими ніжками: Ні'), 'плаїй бранч → Ні');
const white = parsed.find((g) => g.groupLabel.includes('білі'));
assert.ok(white.groupOptionNames.includes('З білими ніжками: Так'));
// The colour from the file name (101 = Горіх темний) gets into the group key.
assert.ok(masyv.groupOptionNames.some((n) => n.startsWith('Колір: ')), 'колір розпізнано');

// A model WITHOUT a white-legs branch gets no axis (otherwise the key wouldn't match the DB variants).
const noWhite = parseBedCombos(
  [f('BEDS/Лаос/Лаос з матрацом/Лаос з одинарною малою планкою/Масив/estella_laos_101-masyv_mala.jpg')],
  'Так', 'Ні'
);
assert.equal(noWhite.length, 1);
assert.ok(!noWhite[0].groupOptionNames.some((n) => n.startsWith('З білими ніжками')), 'осі немає');

// The "white legs" branch is shot in a TWO-TONE code (171-180 = base + Білий), but in the DB the white part
// is carried by the "З білими ніжками" checkbox, and Колір stays single. A second "Колір: Білий" would produce
// a key matching no variant at all (that is exactly why 14 Аммі sets found no group).
const twoTone = parseBedCombos([
  f("BEDS/Аммі/Аммі з білими ніжками/Аммі з матрацом/Аммі з дерев'яними шухлядами/Масив/estella_bili_ammi_171-masyv.jpg"),
  f("BEDS/Аммі/Аммі/Аммі з матрацом/Аммі з дерев'яними шухлядами/Масив/estella_ammi_101-masyv.jpg"),
], 'Так', 'Ні');
const wl = twoTone.find((g) => g.groupOptionNames.includes('З білими ніжками: Так'));
assert.ok(wl, 'гілка білих ніжок розпізнана');
assert.ok(!wl.groupOptionNames.includes('Колір: Білий'), 'Білий НЕ дублюється як колір');
assert.ok(wl.groupOptionNames.includes('Колір: Горіх темний'), 'базовий колір лишається');
assert.equal(wl.groupOptionNames.filter((n) => n.startsWith('Колір:')).length, 1, 'рівно один колір');
// A two-tone colour WITHOUT a white-legs branch — both colours stay (those really are two tones).
const plainTwoTone = parseBedCombos(
  [f("BEDS/Дует/Дует/Дует з матрацом/Дует з дерев'яними шухлядами/Масив/estella_duet_171-masyv.jpg")],
  'Так', 'Ні'
);
assert.equal(plainTwoTone[0].groupOptionNames.filter((n) => n.startsWith('Колір:')).length, 2);

// ── resolveComboForConfig: the axis discovers ITSELF ─────────────────────────
// Real axes from the DB: Шухляда has Короб/Матеріал/Розмір/Фурнітура, Планка — Матеріал/Розмір.
// combo_axis is NOT set: the importer must work out on its own that the upgrade is "Короб" and "Розмір".
const ax = (o) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));
const DRAWER = { accessoryProductId: 'd', label: 'Шухляда', comboAxis: null,
  byAxis: ax({ "Короб": ["Дерев'яні боковини", 'ЛДСП 102', 'ЛДСП 107'], 'Матеріал': ['Масив', 'Щит'],
               'Розмір': ['190см', '200см'], 'Фурнітура': ['Комфорт', 'Стандарт'] }) };
const RAIL = { accessoryProductId: 'r', label: 'Планка', comboAxis: null,
  byAxis: ax({ 'Матеріал': ['Масив', 'Щит'], 'Розмір': ['134см', '96см'] }) };
const SINGLE_RAIL = { accessoryProductId: 's', label: 'Планка одинарна', comboAxis: null,
  byAxis: ax({ 'Матеріал': ['Масив'], 'Розмір': ['70см', '80см', '130см', '140см'] }) };

let r = resolveComboForConfig("З дерев'яними шухлядами", [DRAWER, RAIL]);
assert.equal(r.axes.get('d'), 'Короб', 'вісь шухляди визначено сама');
assert.deepEqual(r.comboKeys, ["d:1:Дерев'яні боковини"]);
// The accessory's material/size/hardware do NOT reach the key.
assert.ok(!r.comboKeys[0].includes('Щит') && !r.comboKeys[0].includes('190см'));

r = resolveComboForConfig('З великою планкою', [DRAWER, RAIL]);
assert.equal(r.axes.get('r'), 'Розмір', 'вісь планки визначено сама');
assert.deepEqual(r.comboKeys, ['r:1:134см']);

// The drawer quantity → into the key; the axis is the same.
r = resolveComboForConfig('З 4 шухлядами ЛДСП 102', [DRAWER]);
assert.deepEqual(r.comboKeys, ['d:4:ЛДСП 102']);
assert.equal(r.axes.get('d'), 'Короб');

// A combination of two accessories — both axes, one key.
r = resolveComboForConfig("З дерев'яними шухлядами та малою планкою", [DRAWER, RAIL]);
assert.equal(r.comboKeys.length, 1);
assert.ok(r.comboKeys[0].includes("d:1:Дерев'яні боковини") && r.comboKeys[0].includes('r:1:96см'));

// One pattern → several values (Лаос): the set is attached to ALL of them, not to the first one that fits.
r = resolveComboForConfig('З одинарною малою планкою', [SINGLE_RAIL]);
assert.deepEqual(r.comboKeys.sort(), ['s:1:70см', 's:1:80см']);
r = resolveComboForConfig('З одинарною малою та великою планками', [SINGLE_RAIL]);
assert.equal(r.comboKeys.length, 4, '2 малих × 2 великих');
assert.ok(r.comboKeys.every((k) => k.split('+').length === 2));

// The bed doesn't have that accessory → the set is skipped, not attached at random.
assert.equal(resolveComboForConfig('З великою планкою', [DRAWER]), null);
// An explicitly set axis narrows the search (and guards against an accidental match in another axis).
assert.equal(resolveComboForConfig('З великою планкою', [{ ...RAIL, comboAxis: 'Матеріал' }]), null);

// Лаос: ONE "Планка безпеки" product is added to the bed TWICE (small + large). The key written by the
// importer from the "з одинарною малою та великою планками" folder must match the one the storefront
// assembles from the customer's two separate picks — otherwise the photos won't be found.
{
  const rails = resolveComboForConfig('З одинарною малою та великою планками', [SINGLE_RAIL]);
  // 2 small × 2 large = 4 keys, each with ONE accessory entry holding two values joined by "+".
  assert.equal(rails.comboKeys.length, 4);
  for (const k of rails.comboKeys) {
    assert.equal(k.split('|').length, 1, 'один запис аксесуара, не два');
    assert.equal(k.split(':')[2].split('+').length, 2, 'два значення в ньому');
  }
  // This is exactly the key the storefront assembles from two links to the same product.
  const fromStorefront = accessoryComboKey([
    { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 70см', value: '70см' }] },
    { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 130см', value: '130см' }] },
  ]);
  assert.ok(rails.comboKeys.includes(fromStorefront), `вітрина дає ${fromStorefront}, імпорт — ${rails.comboKeys.join(' | ')}`);
}

// ── The real folder, if available ────────────────────────────────────────────
if (existsSync(BEDS)) {
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(png|jpe?g|webp)$/i.test(e.name)) acc.push(f(p.slice(BEDS.length - 4).replaceAll('\\', '/')));
    }
    return acc;
  };
  const real = walk(BEDS);
  const realParsed = parseBedCombos(real, 'Так', 'Ні');
  const configs = [...new Set(realParsed.map((g) => g.config))].sort();
  const unmapped = configs.filter((c) => bedConfigPatterns(c).length === 0);
  console.log(`  реальна тека: ${real.length} фото → ${realParsed.length} наборів, ${configs.length} різних апгрейдів`);
  // Print WHAT EXACTLY each upgrade resolves to — so the table can be checked by eye.
  const CANDIDATES = ["Дерев'яні боковини", 'ЛДСП 102', 'ЛДСП 107', '134 см', '96см', '130-140см', '70-80см'];
  for (const c of configs) {
    const pats = bedConfigPatterns(c);
    const hits = CANDIDATES.filter((v) => pats.some((re) => re.test(v)));
    console.log(`    ${pats.length && hits.length === pats.length ? '✓' : '✗'} ${c}  →  ${hits.join(' + ') || '—'}`);
  }
  assert.equal(unmapped.length, 0, `апгрейди без правила: ${unmapped.join(' | ')}`);
  assert.ok(realParsed.every((g) => g.files.length > 0));
} else {
  console.log('  (теки ~/Downloads/BEDS немає — перевірено лише на зразку)');
}

// The drawer count is the accessory QUANTITY, not another option value: in "Нота Бене" the sets
// for 1/2/4 drawers differ and must not merge into one combo key.
assert.equal(bedConfigParts("З 4 дерев'яними шухлядами")[0].qty, 4);
assert.equal(bedConfigParts('З 2 шухлядами ЛДСП 102')[0].qty, 2);
assert.equal(bedConfigParts("З 1 дерев'яною шухлядою")[0].qty, 1);
assert.equal(bedConfigParts("З дерев'яними шухлядами")[0].qty, 1, 'без числа → 1');
// Rails have no quantity.
assert.ok(bedConfigParts('З великою планкою').every((p) => p.qty === 1));
// The number refers to the drawers only, a rail in the same name stays 1 pc.
const mix = bedConfigParts('З 4 шухлядами ЛДСП 107 та малою планкою');
assert.equal(mix.find((p) => /ЛДСП/.test(p.pattern.source)).qty, 4);
assert.equal(mix.find((p) => p.pattern.source === '96').qty, 1);

console.log('OK: bedCombos');
