// Checks the cell merging of the description table on a real example ("Відстань між
// ламелями" + "Довжина спального місця"): `<` merges to the left, `^` merges upward.
// Run: node scripts/check-table-spans.mjs   (esbuild is already in the project: TS is bundled into tmp)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), 'opora-tableSpans.check.mjs');
execFileSync(
  'node_modules/.bin/esbuild',
  ['src/lib/longDescription/tableSpans.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`],
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const { tableSpans } = await import(out);

const grid = tableSpans([
  ['Відстань між ламелями:', '<', '4 *см*', '2.5 *см*'],
  ['Довжина спального місця:', '190 *см*', '20 *шт*', '22 *шт*'],
  ['^', '200 *см*', '21 *шт*', '24 *шт*'],
]);

const shown = grid.map((row) => row.filter((c) => c.show));
assert.deepEqual(shown.map((r) => r.length), [3, 4, 3], 'злиті клітинки не мають рендеритись');
assert.equal(grid[0][0].colSpan, 2, '«Відстань між ламелями» на дві колонки');
assert.equal(grid[1][0].rowSpan, 2, '«Довжина спального місця» на два рядки');
assert.equal(grid[2][0].show, false);

// `^` under an already merged cell looks for the visible one above, not for the adjacent one.
const stacked = tableSpans([
  ['A', '<'],
  ['B', '^'],
]);
assert.equal(stacked[0][0].colSpan, 2);
assert.equal(stacked[1][0].rowSpan, 1, 'rowspan не чіпляється до сусіда ліворуч');
// There is no visible cell above — the marker stays as text so the admin sees the mistake.
assert.equal(stacked[1][1].show, true);
assert.equal(stacked[1][1].text, '^');

// An unpaired marker doesn't break the table.
assert.equal(tableSpans([['<', '^']])[0][0].text, '<');

console.log('OK: об\'єднання клітинок таблиці працює');
