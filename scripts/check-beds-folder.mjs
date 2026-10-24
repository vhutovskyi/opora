// Checks bed folder parsing on the real Estella layout (paths taken from R2 keys):
// packagings merge into ONE variant, the "з білими ніжками" branch is the same product with a
// "Колір ніжок" option, upgrade (config) folders are not imported at all.
// Run: node scripts/check-beds-folder.mjs   (esbuild is already in the project: TS is bundled into tmp)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bundle = (src, name) => {
  const out = join(tmpdir(), `opora-${name}.check.mjs`);
  execFileSync('node_modules/.bin/esbuild', [src, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return import(out);
};
const { deriveBedVariant, parseBedsFolder } = await bundle('src/lib/estella/folderImport.ts', 'folderImport');
const { offersFor } = await bundle('src/app/admin/(panel)/estella/folderImportUiHelpers.ts', 'uiHelpers');

const f = (path) => ({ name: path.split('/').pop(), webkitRelativePath: path });
const files = [
  // The base bed: three packaging folders → one variant, order постіль → каркас → матрац.
  f('BEDS/Аммі/Аммі/Аммі каркас/Аммі/Масив/estella_ammi_101-masyv_a.jpg'),
  f('BEDS/Аммі/Аммі/Аммі з матрацом/Аммі/Масив/estella_ammi_101-masyv_b.jpg'),
  f('BEDS/Аммі/Аммі/Аммі з постіллю/Аммі/Масив/estella_ammi_101-masyv_c.png'),
  // The white-legs branch: the same "Аммі" product, a separate variant.
  f('BEDS/Аммі/Аммі з білими ніжками/Аммі каркас/Аммі/Масив/estella_bili_nizhky_ammi_101-masyv_a.jpg'),
  f('BEDS/Аммі/Аммі з білими ніжками/Аммі з матрацом/Аммі/Масив/estella_bili_nizhky_ammi_101-masyv_b.jpg'),
  f('BEDS/Аммі/Аммі з білими ніжками/Аммі з постіллю/Аммі/Масив/estella_bili_nizhky_ammi_101-masyv_c.png'),
  // An upgrade (a config folder between packaging and material) — not imported.
  f('BEDS/Аммі/Аммі/Аммі з постіллю/Аммі з шухлядами/Масив/estella_ammi_101-masyv_d.png'),
];

const products = parseBedsFolder(files);
assert.equal(products.length, 1, 'біла гілка мусить лишитись тим самим товаром');
assert.equal(products[0].productName, 'Аммі');

const { variants } = products[0];
assert.equal(variants.length, 2, `апгрейди мають відпасти, лишитись 2 варіації (є ${variants.length})`);
const white = variants.find((v) => v.whiteLegs === true);
const plain = variants.find((v) => v !== white);
assert.ok(white && plain, 'мусить бути варіація з білими ніжками і базова');
assert.equal(white.files.length, 3, 'по 3 фото на варіацію, не 6');
assert.equal(plain.files.length, 3, 'по 3 фото на варіацію, не 6');
// The checkbox axis is complete: the base variant is explicitly false, otherwise the storefront collapses any pick onto it.
assert.equal(plain.whiteLegs, false);
assert.notEqual(plain.sku, white.sku);
assert.deepEqual(
  plain.files.map((x) => x.name.slice(-5)),
  ['_c.png', '_a.jpg', '_b.jpg'].map((s) => s.slice(-5)),
  'порядок фото: З постіллю → Каркас → З матрацом'
);

const derived = deriveBedVariant(['BEDS', 'Аммі', 'Аммі з білими ніжками', 'Аммі з постіллю', 'Аммі', 'Масив'], 'estella_ammi_101-masyv_c.png');
assert.equal(derived.baseModel, 'Аммі');
assert.equal(derived.config, '', 'сама біла гілка не є config-апгрейдом');
assert.equal(derived.whiteLegs, true);

// A product WITHOUT a white branch gets no axis at all (undefined, not false).
const plainOnly = parseBedsFolder(files.slice(0, 3));
assert.equal(plainOnly[0].variants[0].whiteLegs, undefined);
assert.equal(plainOnly[0].sizeBand, undefined, 'товар без пари «односпальне» бере всі розміри');

// "… односпальне" is a separate product, and the XML sizes are split between the pair at width 90.
const venetsia = parseBedsFolder([
  f('BEDS/Венеція Люкс/Венеція Люкс/Венеція Люкс з постіллю/Венеція Люкс/Масив/estella_venetsia_101-masyv_a.png'),
  f('BEDS/Венеція Люкс/Венеція Люкс односпальне/Венеція Люкс з постіллю/Венеція Люкс/Масив/estella_venetsia_101-masyv_b.png'),
]);
const single = venetsia.find((p) => /односпальне/i.test(p.productName));
const double = venetsia.find((p) => p !== single);
assert.equal(venetsia.length, 2, 'односпальне лишається окремим товаром');
assert.equal(single.sizeBand, 'single');
assert.equal(double.sizeBand, 'double');

const offers = ['80x190', '90x200', '120x190', '180x200'].map((s, i) => ({
  offer_id: `o${i}`,
  model: `${s.replace('x', 'х')} 101 Масив Л4`,
  color_code: '101',
  price: 1,
  quantity: 1,
  params: {},
}));
const ui = (p) => ({ ...p, attachedTo: 'Венеція Люкс', attachOffers: offers });
const sizesFor = (p) => offersFor(ui(p), p.variants[0]).map((o) => o.model.split(' ')[0]);
assert.deepEqual(sizesFor(single), ['80х190', '90х200'], 'односпальне бере лише ширину ≤ 90');
assert.deepEqual(sizesFor(double), ['120х190', '180х200'], 'двоспальне бере лише ширину > 90');
assert.equal(offersFor(ui(plainOnly[0]), plainOnly[0].variants[0]).length, 4, 'товар без пари — всі розміри');

console.log('✓ beds folder parse ok');
