// Checks the tsquery build for search: a :* prefix on every word (compensates for the missing
// Ukrainian stemmer), AND between words, tsquery's special characters stripped — otherwise
// to_tsquery fails with a syntax error on ordinary user input.
// Run: node scripts/check-search-query.mjs   (esbuild is already in the project: TS is bundled into tmp)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// next stays external (search.ts imports next/cache, which can't be bundled), so the CJS bundle is written
// inside the project — that is where `require('next/cache')` resolves from node_modules.
const out = resolve('node_modules/.cache/opora-search.check.cjs');
execFileSync('node_modules/.bin/esbuild', ['src/lib/supabase/search.ts', '--bundle', '--format=cjs', '--platform=node', '--external:next', `--outfile=${out}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
const { tsQuery, likePattern } = await import(out);

// Every word gets a prefix, and they are joined with AND.
assert.equal(tsQuery('стіл'), 'стіл:*');
assert.equal(tsQuery('стіл білий'), 'стіл:* & білий:*');

// Word order doesn't matter — that is exactly what the ILIKE pattern couldn't do.
assert.equal(tsQuery('білий стіл'), 'білий:* & стіл:*');

// Case and extra spaces are normalized.
assert.equal(tsQuery('  СТІЛ   Білий '), 'стіл:* & білий:*');

// tsquery's special characters must not reach the query.
for (const raw of ['стіл & білий', 'стіл | білий', '!стіл', 'стіл:*:*', '(стіл)', "сті'л", 'стіл <-> білий']) {
  const q = tsQuery(raw);
  const body = q.replaceAll(':*', '').replaceAll(' & ', '');
  assert.ok(!/[&|!:()'<>]/.test(body), `службовий символ лишився: ${raw} → ${q}`);
}

// Digits and letters stay in one token: "160x200" is one word, it isn't split.
// (Sizes live in variant_specs/options, which are still searched with ILIKE, so a possible
// difference from Postgres tokenization has no effect on search here.)
assert.equal(tsQuery('160x200'), '160x200:*');
assert.equal(tsQuery('160 x 200'), '160:* & x:* & 200:*');

// Empty / non-word input → an empty query (searchProducts cuts it off by length anyway).
assert.equal(tsQuery(''), '');
assert.equal(tsQuery('!!!'), '');

// The ILIKE pattern stayed for options and specs — it isn't broken.
assert.equal(likePattern('стіл білий'), '%стіл%білий%');
assert.equal(likePattern(''), '');

console.log('OK: tsQuery + likePattern');
