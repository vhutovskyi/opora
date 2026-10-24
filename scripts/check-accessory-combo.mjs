// Checks the bed upgrade combination keys: the accessory colour is NOT part of the key, the order of
// accessories/values doesn't matter, and enumerateCombos covers both single and joint combinations.
// Run: node scripts/check-accessory-combo.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'opora-accessoryCombo.check.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/accessoryCombo.ts',
  '--bundle',
  '--format=esm',
  '--platform=node',
  '--alias:@=./src',
  `--outfile=${out}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { accessoryComboKey, axisValue, enumerateCombos, comboKeyIgnoringQty, comboKeyOf } = await import(out);

// A real option set of a "Шухляда" accessory variant (from the DB): only the "Короб" axis must yield a value.
const drawerOpts = (korob) => [
  { name: 'Колір: Горіх темний', value: '#6B4423' },
  { name: 'Короб: ' + korob, value: korob },
  { name: 'Матеріал: Щит', value: 'Щит' },
  { name: 'Розмір: 190см', value: '190см' },
  { name: 'Фурнітура: Комфорт', value: 'Комфорт' },
];
assert.equal(axisValue(drawerOpts('ЛДСП 102'), 'Короб'), 'ЛДСП 102');
// The accessory's material/size/hardware do NOT change the bed photos — they never reach the key.
assert.equal(axisValue(drawerOpts('ЛДСП 102'), 'Матеріал'), 'Щит', 'сама вісь читається…');
assert.ok(!accessoryComboKey([{ accessoryProductId: 'd', comboAxis: 'Короб', options: drawerOpts('ЛДСП 102') }]).includes('Щит'));
// The colour axis yields no value (hex), and the axis is absent → empty.
assert.equal(axisValue(drawerOpts('ЛДСП 102'), 'Колір'), '');
assert.equal(axisValue(drawerOpts('ЛДСП 102'), null), '');

// Changing only the accessory colour gives the SAME key — the gallery doesn't jump.
const rail = (color) => [{
  accessoryProductId: 'rail', qty: 1, comboAxis: 'Розмір',
  options: [{ name: 'Розмір: 134см', value: '134см' }, { name: 'Колір: X', value: color }],
}];
assert.equal(accessoryComboKey(rail('A52A2A')), accessoryComboKey(rail('FFFFFF')));
assert.equal(accessoryComboKey(rail('A52A2A')), 'rail:1:134см');

// Quantity is part of the key: 2 and 4 drawers are DIFFERENT bed photos (that is exactly how "Нота Бене" is shot).
const drawer = (qty) =>
  accessoryComboKey([{ accessoryProductId: 'd', qty, comboAxis: 'Короб', options: drawerOpts('ЛДСП 102') }]);
assert.notEqual(drawer(2), drawer(4));
assert.equal(drawer(4), 'd:4:ЛДСП 102');
// A missing/invalid quantity → 1, not NaN in the key (otherwise the set would never be found).
assert.equal(drawer(undefined), 'd:1:ЛДСП 102');
assert.equal(drawer(0), 'd:1:ЛДСП 102');

// An accessory without combo_axis never reaches the key at all.
assert.equal(accessoryComboKey([{ accessoryProductId: 'x', qty: 1, comboAxis: null, options: drawerOpts('ЛДСП 102') }]), '');

// A combination of two accessories — independent of order.
const both = [
  { accessoryProductId: 'rail', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 134см', value: '134см' }] },
  { accessoryProductId: 'drawer', qty: 1, comboAxis: 'Короб', options: drawerOpts('ЛДСП 102') },
];
assert.equal(accessoryComboKey(both), accessoryComboKey([...both].reverse()));
assert.equal(accessoryComboKey(both), 'drawer:1:ЛДСП 102|rail:1:134см');

// Listing for the admin panel: 2 values × 2 values → 2 + 2 + 4 = 8 combinations, without "everything off".
const combos = enumerateCombos([
  { accessoryProductId: 'rail', label: 'Планка', values: ['134см', '96см'] },
  { accessoryProductId: 'drawer', label: 'Шухляда', values: ['ЛДСП 102', 'Дерев\'яні боковини'] },
]);
assert.equal(combos.length, 8);
// maxQty multiplies the accessory variants (2 values × 4 pcs = 8, +1 "off" → 8 rows).
const withQty = enumerateCombos([
  { accessoryProductId: 'drawer', label: 'Шухляда', values: ['ЛДСП 102', 'ЛДСП 107'], maxQty: 4 },
]);
assert.equal(withQty.length, 8);
assert.ok(withQty.some((c) => c.label.includes('×4')));
assert.equal(new Set(combos.map((c) => c.comboKey)).size, 8);
assert.ok(combos.some((c) => c.comboKey === accessoryComboKey(both)));

// ── Quantity fallback ────────────────────────────────────────────────────────
// Аммі is shot only "з шухлядами" (no number → qty 1). The customer picks 2 drawers — there is no exact
// set, so we look it up without the quantity and show the same photos instead of an empty gallery.
const stored = accessoryComboKey([{ accessoryProductId: 'd', qty: 1, comboAxis: 'Короб', options: drawerOpts('ЛДСП 102') }]);
const wanted = accessoryComboKey([{ accessoryProductId: 'd', qty: 2, comboAxis: 'Короб', options: drawerOpts('ЛДСП 102') }]);
assert.notEqual(stored, wanted, 'точні ключі різні');
assert.equal(comboKeyIgnoringQty(stored), comboKeyIgnoringQty(wanted), 'без кількості — той самий');
assert.equal(comboKeyIgnoringQty(stored), 'd:ЛДСП 102');
// But DIFFERENT option values are not merged even without the quantity.
const other = accessoryComboKey([{ accessoryProductId: 'd', qty: 2, comboAxis: 'Короб', options: drawerOpts('ЛДСП 107') }]);
assert.notEqual(comboKeyIgnoringQty(stored), comboKeyIgnoringQty(other));
// Different accessories — not merged either.
assert.notEqual(comboKeyIgnoringQty('a:1:X'), comboKeyIgnoringQty('b:1:X'));
// The order after dropping the quantity stays canonical (keys are compared as strings).
assert.equal(comboKeyIgnoringQty('r:1:134см|d:4:ЛДСП 102'), comboKeyIgnoringQty('d:1:ЛДСП 102|r:9:134см'));
// A value with a colon inside doesn't break the parsing.
assert.equal(comboKeyIgnoringQty('a:2:8:00'), 'a:8:00');

// ── One accessory added TWICE (Лаос: small + large rail) ─────────────────────
// Two picks of the same product merge into ONE entry with values joined by "+", otherwise the
// customer's key ("s:1:70см|s:1:130см") wouldn't match what the importer wrote ("s:1:130см+70см").
const twoRails = accessoryComboKey([
  { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 70см', value: '70см' }] },
  { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 130см', value: '130см' }] },
]);
assert.equal(twoRails, 's:1:130см+70см');
// The pick order doesn't matter.
assert.equal(accessoryComboKey([
  { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 130см', value: '130см' }] },
  { accessoryProductId: 's', qty: 1, comboAxis: 'Розмір', options: [{ name: 'Розмір: 70см', value: '70см' }] },
]), twoRails);
// The same key if the values arrive already joined (as from the importer) — the operation is idempotent.
assert.equal(comboKeyOf([{ accessoryProductId: 's', qty: 1, sig: '130см+70см' }]), twoRails);
assert.equal(comboKeyOf([{ accessoryProductId: 's', qty: 1, sig: '70см' }, { accessoryProductId: 's', qty: 1, sig: '130см+70см' }]), twoRails);
// One and the same value twice is not doubled.
assert.equal(comboKeyOf([{ accessoryProductId: 's', qty: 1, sig: '70см' }, { accessoryProductId: 's', qty: 1, sig: '70см' }]), 's:1:70см');
// Different accessories stay separate entries.
assert.equal(comboKeyOf([{ accessoryProductId: 'b', qty: 1, sig: 'X' }, { accessoryProductId: 'a', qty: 1, sig: 'Y' }]), 'a:1:Y|b:1:X');

console.log('OK: accessoryCombo');
