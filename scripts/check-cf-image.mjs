// Checks cfImageUrl: an absolute URL → /cdn-cgi/image/<options>/<url>, everything else unchanged.
// The point here is that the options are FIXED (one paid transform per photo, not one
// per width) and that the R2 URL stays intact, otherwise Cloudflare returns a 404 instead of the photo.
// Run: node scripts/check-cf-image.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'opora-utils.check.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/utils.ts',
  '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { cfImageUrl, CF_IMAGE_OPTS, CF_IMAGE_WIDTH_FULL, CF_IMAGE_WIDTH_CARD, imgFailed } =
  await import(out);

const R2 = 'https://pub-abc.r2.dev/images-compressed/1700000000-foo.jpg.webp';

// An absolute URL gets wrapped, and the URL itself stays verbatim (with protocol and extension).
const wrapped = cfImageUrl(R2);
assert.equal(wrapped, `/cdn-cgi/image/${CF_IMAGE_OPTS}/${R2}`, 'абсолютний URL → cdn-cgi');
assert.ok(wrapped.endsWith(R2), 'вихідний URL не обрізано');
assert.ok(wrapped.startsWith('/cdn-cgi/image/'), 'шлях відносний — same-origin зони');

// The options are constants: no width/quality "on the fly", otherwise the transform counter multiplies.
assert.match(CF_IMAGE_OPTS, /(^|,)format=auto(,|$)/, 'format=auto (не множить лічильник)');
assert.match(CF_IMAGE_OPTS, /(^|,)quality=\d+(,|$)/, 'quality фіксований');
assert.match(CF_IMAGE_OPTS, /(^|,)width=\d+(,|$)/, 'width фіксований');
assert.ok(!/\$\{|undefined|NaN/.test(CF_IMAGE_OPTS), 'опції без інтерполяції');

// Two FIXED tiers, and the card one is genuinely smaller — a catalogue page shows up to 48
// thumbnails, at the full width that was pure wasted bandwidth. The default must stay the full
// width so existing callers are untouched (and the counter doesn't gain a third value).
assert.ok(CF_IMAGE_WIDTH_CARD < CF_IMAGE_WIDTH_FULL, 'тайл картки менший за повний');
assert.equal(cfImageUrl(R2), cfImageUrl(R2, CF_IMAGE_WIDTH_FULL), 'дефолт = повна ширина');
assert.ok(
  cfImageUrl(R2, CF_IMAGE_WIDTH_CARD).includes(`width=${CF_IMAGE_WIDTH_CARD},`),
  'тайл картки потрапляє в URL'
);
assert.ok(cfImageUrl(R2, CF_IMAGE_WIDTH_CARD).endsWith(R2), 'URL не обрізано і для тайла');

// Local paths and mocks make no sense to push through cdn-cgi — left as they are.
assert.equal(cfImageUrl('/mock/chair.jpg'), '/mock/chair.jpg', 'локальний шлях без змін');
assert.equal(cfImageUrl(''), '', 'порожній рядок без змін');

// imgFailed — a detector for an error that happened BEFORE hydration (onError won't fire by then).
// Only a loaded photo with no dimensions counts as broken; everything else is still on its way.
assert.equal(imgFailed({ complete: true, naturalWidth: 0 }), true, 'complete без розмірів = помилка');
assert.equal(imgFailed({ complete: true, naturalWidth: 800 }), false, 'завантажене фото — не помилка');
assert.equal(imgFailed({ complete: false, naturalWidth: 0 }), false, 'ще вантажиться — не помилка');
assert.equal(imgFailed(null), false, 'відмонтований вузол — не помилка');

console.log('OK: cfImageUrl, imgFailed');
