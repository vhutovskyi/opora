// Checks the size-label shortening on REAL price-list rows: the height (the last number) disappears,
// "розкладається до N" becomes "(N)", a round tabletop keeps its Ø, the thickness isn't lost.
// Run: node scripts/tables/check-size-labels.mjs   (esbuild is already in the project: TS is bundled into tmp)
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "opora-tablesData.check.mjs");
execFileSync("node_modules/.bin/esbuild", ["src/lib/importer/tablesData.ts", "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`], {
  stdio: ["ignore", "ignore", "inherit"],
});
const { shortSizeLabel, TABLE_PRODUCTS, parseSizeDims, variantSpecValue } = await import(out);

const cases = [
  ["1100 × 750 × 750 мм", "1100 × 750 мм"],
  ["1300 (1700) × 850 × 750 мм", "1300 (1700) × 850 мм"],
  ["Ø800 × 750 мм", "Ø800 мм"],
  ["Ø1100 (1500) × 750 мм", "Ø1100 (1500) мм"],
  ["900 (розкладається до 1300) × 650 × 750 мм, 18 мм", "900 (1300) × 650 мм, 18 мм"],
  ["1100 (розкладається до 1900) × 700 × 750 мм, 36 мм", "1100 (1900) × 700 мм, 36 мм"],
  ["800 (2150) × 800 × 750 мм", "800 (2150) × 800 мм"],
];
for (const [input, want] of cases) {
  assert.equal(shortSizeLabel(input), want, `«${input}» → «${shortSizeLabel(input)}», очікували «${want}»`);
}

// Every price-list row must shorten, stay shorter and keep its first number.
for (const p of TABLE_PRODUCTS) {
  for (const k of p.kinds) {
    for (const s of k.sizes) {
      const short = shortSizeLabel(s.label);
      assert.ok(short.endsWith("мм") || /мм,/.test(short), `${p.model}: «${short}» не закінчується на мм`);
      // Exactly one "×" component fewer — that is the height. ("750 мм" at the end may be the WIDTH.)
      const xs = (t) => (t.split(",")[0].match(/×/g) ?? []).length;
      assert.equal(xs(short), xs(s.label) - 1, `${p.model}: «${short}» — прибрано не один розмір`);
      assert.ok(short.length < s.label.length, `${p.model}: «${short}» не коротше за «${s.label}»`);
      assert.equal(short.match(/\d+/)?.[0], s.label.match(/\d+/)?.[0], `${p.model}: змінилась довжина у «${short}»`);
      if (s.thickness) assert.ok(short.includes(s.thickness) || !s.label.includes(s.thickness), `${p.model}: загубилась товщина у «${short}»`);
    }
  }
}

// Shortening must not merge two different sizes into one label within a product.
for (const p of TABLE_PRODUCTS) {
  const seen = new Map();
  for (const k of p.kinds) {
    for (const s of k.sizes) {
      // Thickness is a separate axis (Round, Pocker), so the same size in 18 and 36 mm is not a duplicate.
      const key = `${k.type}|${s.thickness ?? ""}|${shortSizeLabel(s.label)}`;
      assert.ok(!seen.has(key), `${p.model}: «${key}» дублюється (${seen.get(key)} і ${s.label})`);
      seen.set(key, s.label);
    }
  }
}

// Narrowing kind.specs onto one variant: a « / » list must come apart into single values, and
// together those values must cover exactly the list — nothing invented, no size left behind.
let narrowed = 0;
for (const p of TABLE_PRODUCTS) {
  for (const k of p.kinds) {
    const dims = k.sizes.map((s) => parseSizeDims(shortSizeLabel(s.label), s.thickness));
    for (const [name, kindValue] of Object.entries(k.specs)) {
      const got = dims.map((d) => variantSpecValue(name, kindValue, d));
      if (!kindValue.includes(" / ")) {
        assert.deepEqual([...new Set(got)], [kindValue], `${p.model} ${k.type} / ${name}: незмінне значення роздвоїлось — ${[...new Set(got)]}`);
        continue;
      }
      narrowed++;
      for (const v of got) assert.ok(!v.includes("/"), `${p.model} ${k.type} / ${name}: у варіанта лишилось «${v}»`);
      // Матеріал стільниці splits on the thickness axis, not the size axis, so it has its own shape.
      if (name === "Матеріал стільниці") continue;
      assert.deepEqual(
        [...new Set(got)].sort(), kindValue.split(" / ").map((s) => s.trim()).sort(),
        `${p.model} ${k.type} / ${name}: «${kindValue}» → ${[...new Set(got)]}`,
      );
    }
  }
}

const total = TABLE_PRODUCTS.reduce((n, p) => n + p.kinds.reduce((m, k) => m + k.sizes.length, 0), 0);
console.log(`ok — ${cases.length} прикладів + ${total} рядків прайсу + ${narrowed} злитих характеристик розділено`);
