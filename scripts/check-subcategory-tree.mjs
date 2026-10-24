// Check for buildSubcategoryTrees: arbitrary nesting, grouping by catalog,
// orphans as roots, no infinite loop. Run: node scripts/check-subcategory-tree.mjs
import { build } from "esbuild";
import assert from "node:assert/strict";

const bundled = await build({
  entryPoints: ["src/lib/supabase/subcategoryTree.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const { buildSubcategoryTrees, resolveSubRefs } = await import(
  "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64")
);

const row = (id, catalog, parent_id, name, sort_order = 0, slug = null) => ({ id, catalog, parent_id, name, sort_order, slug });

// 4 levels in one branch — the depth is not limited to two, as it used to be.
const deep = buildSubcategoryTrees([
  row("1", "Ліжка", null, "Дерев'яні"),
  row("2", "Ліжка", "1", "Дубові"),
  row("3", "Ліжка", "2", "З шухлядами"),
  row("4", "Ліжка", "3", "З підйомним механізмом"),
]);
const roots = deep.get("Ліжка");
assert.equal(roots.length, 1, "один корінь у каталозі");
assert.equal(roots[0].children[0].children[0].children[0].name, "З підйомним механізмом");

// Catalogs don't mix with each other.
const split = buildSubcategoryTrees([
  row("a", "Столи", null, "Круглі"),
  row("b", "Стільці", null, "Барні"),
]);
assert.equal(split.size, 2);
assert.equal(split.get("Столи").length, 1);
assert.equal(split.get("Столи")[0].name, "Круглі");
assert.equal(split.get("Стільці")[0].name, "Барні");

// The same name in different branches — different nodes (that's why the filter works by id, not by name).
const dupes = buildSubcategoryTrees([
  row("r1", "Ліжка", null, "Дерев'яні"),
  row("r2", "Ліжка", null, "Металеві"),
  row("c1", "Ліжка", "r1", "Двоспальні"),
  row("c2", "Ліжка", "r2", "Двоспальні"),
]);
const named = dupes.get("Ліжка").flatMap((n) => n.children).filter((n) => n.name === "Двоспальні");
assert.equal(named.length, 2, "однойменні вузли в різних гілках не зливаються");
assert.notEqual(named[0].id, named[1].id);

// An orphan (its parent is not in the set) shows up as a root instead of disappearing.
const orphan = buildSubcategoryTrees([row("x", "Тумби", "missing", "Загублена")]);
assert.equal(orphan.get("Тумби")?.length, 1, "сирота лишається видимою");

// A cycle doesn't hang the recursion: such nodes simply have no root and are not rendered.
const cyclic = buildSubcategoryTrees([
  row("p", "Комоди", "q", "A"),
  row("q", "Комоди", "p", "B"),
]);
assert.equal(cyclic.get("Комоди"), undefined, "цикл не дає коренів і не зациклює обхід");

// Sorting by name on every level when sort_order is equal (a tie).
const sorted = buildSubcategoryTrees([
  row("s2", "Столи", null, "Ялинові"),
  row("s1", "Столи", null, "Букові"),
  row("s3", "Столи", "s1", "Ясенові"),
  row("s4", "Столи", "s1", "Вільхові"),
]);
assert.deepEqual(sorted.get("Столи").map((n) => n.name), ["Букові", "Ялинові"]);
assert.deepEqual(sorted.get("Столи")[0].children.map((n) => n.name), ["Вільхові", "Ясенові"]);

// A manual sort_order beats the alphabet: a size/firmness scale is unreadable by name.
const manual = buildSubcategoryTrees([
  row("m0", "Матраци", null, "Розмір", 0),
  row("m1", "Матраци", "m0", "80x190", 0),
  row("m2", "Матраци", "m0", "90x200", 1),
  row("m3", "Матраци", "m0", "120x190", 2),
  row("m4", "Матраци", "m0", "140x190", 3),
]);
assert.deepEqual(
  manual.get("Матраци")[0].children.map((n) => n.name),
  ["80x190", "90x200", "120x190", "140x190"],
  "порядок заданий вручну, а не за алфавітом (інакше 120x190 стало б першим)"
);

// Several roots of one catalog (the Матеріал/Розмір/Конструкція facets) are managed by hand too.
const facets = buildSubcategoryTrees([
  row("f1", "Ліжка", null, "Матеріал", 0),
  row("f2", "Ліжка", null, "Розмір", 1),
  row("f3", "Ліжка", null, "Конструкція", 2),
]);
assert.deepEqual(
  facets.get("Ліжка").map((n) => n.name),
  ["Матеріал", "Розмір", "Конструкція"],
  "фасети в заданому порядку, а не за алфавітом"
);

// ===== resolveSubRefs: ?sub= accepts both a uuid and a slug =====
const UUID = "2314c4fa-099d-4f6f-af6f-437e5f4dd990";
const refRows = [
  row(UUID, "Ліжка", null, "Дерев'яні", 0, "wooden"),
  row("plain-id", "Ліжка", null, "М'які", 1, null),
];

assert.deepEqual(resolveSubRefs(["wooden"], refRows), [UUID], "слаг → id");
assert.deepEqual(resolveSubRefs(["WOODEN"], refRows), [UUID], "слаг без урахування регістру");
assert.deepEqual(resolveSubRefs([UUID], refRows), [UUID], "uuid лишається собою");
assert.deepEqual(resolveSubRefs(["plain-id"], refRows), ["plain-id"], "вузол без слага — за id");
assert.deepEqual(resolveSubRefs(["wooden", UUID], refRows), [UUID], "слаг і його ж uuid не дублюються");

// The point: a non-uuid must not reach .in(), otherwise Postgres returns an error instead of an empty list.
assert.deepEqual(resolveSubRefs(["%"], refRows), [], "сміття в URL відкидається");
assert.deepEqual(resolveSubRefs(["nosuchslug"], refRows), [], "невідомий слаг відкидається");
assert.deepEqual(resolveSubRefs([], refRows), [], "порожньо → порожньо");

console.log("✓ buildSubcategoryTrees + resolveSubRefs: усі перевірки пройдено");
