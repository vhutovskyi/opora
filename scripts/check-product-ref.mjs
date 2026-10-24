// Checks byIdOrSlug: uuid → eq("id"), slug → ilike("slug"), garbage → null.
// The last case is the point: ilike treats % and _ as wildcards, so without the regex
// /catalog/% would return an arbitrary product.
// Run: node scripts/check-product-ref.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'opora-client.check.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/supabase/client.ts',
  '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { byIdOrSlug, SLUG_RE } = await import(out);

// Query stub: records which filter was applied.
const spy = () => {
  const calls = [];
  const q = { calls, eq: (c, v) => (calls.push(['eq', c, v]), q), ilike: (c, v) => (calls.push(['ilike', c, v]), q) };
  return q;
};
const filterFor = (param) => {
  const q = spy();
  return byIdOrSlug(q, param) === null ? null : q.calls[0];
};

const UUID = '3ab524c2-8a16-4ba1-b619-a5105fc9812a';
assert.deepEqual(filterFor(UUID), ['eq', 'id', UUID], 'uuid → eq по id');
assert.deepEqual(filterFor(UUID.toUpperCase()), ['eq', 'id', UUID.toUpperCase()], 'uuid у верхньому регістрі теж uuid');

assert.deepEqual(filterFor('Vega'), ['ilike', 'slug', 'Vega'], 'слаг → ilike по slug');
assert.deepEqual(filterFor('Ammi-Plus'), ['ilike', 'slug', 'Ammi-Plus'], 'дефіси дозволені');
assert.deepEqual(filterFor('nota-bene-2'), ['ilike', 'slug', 'nota-bene-2'], 'цифри дозволені');

// Wildcard injection and any other garbage must give a 404, not a query.
for (const bad of ['%', '_', 'a%b', 've%', '', '-vega', 'vega-', 've--ga', 'ліжко', 'a b', '../../etc', 'a/b']) {
  assert.equal(filterFor(bad), null, `«${bad}» має відсіятися`);
  assert.ok(!SLUG_RE.test(bad), `SLUG_RE не має пропускати «${bad}»`);
}

// ── productHref/productRef: links must carry the slug whenever there is one ──
const utilsOut = join(tmpdir(), 'opora-utils.check.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/utils.ts',
  '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${utilsOut}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { productHref, productRef } = await import(utilsOut);

assert.equal(productHref({ id: UUID, slug: 'Vega' }), '/catalog/Vega', 'є слаг → слаг у посиланні');
assert.equal(productHref({ id: UUID, slug: null }), `/catalog/${UUID}`, 'немає слага → uuid');
assert.equal(productHref({ id: UUID, slug: '' }), `/catalog/${UUID}`, 'порожній слаг = немає слага');
assert.equal(productHref({ id: UUID }), `/catalog/${UUID}`, 'без поля slug теж працює');
assert.equal(productRef({ id: UUID, slug: 'Ammi-Plus' }), 'Ammi-Plus', 'адмінка бере той самий сегмент');

// Closing the loop: what productHref put into the link, the lookup must accept.
for (const p of [{ id: UUID, slug: 'Vega' }, { id: UUID, slug: null }]) {
  assert.notEqual(filterFor(productRef(p)), null, `${productRef(p)} має резолвитися`);
}

console.log('OK — byIdOrSlug розрізняє uuid/слаг, відсікає вайлдкарди; посилання віддають слаг');
