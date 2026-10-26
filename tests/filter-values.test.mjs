// Unit tests for splitFilterValues (src/lib/utils.ts) — how an optFilter_/specFilter_ URL value is read.
// The server (parseCatalogParams) and the client (useFilterState, CatalogClient) share it, so a URL
// the filter panel writes with values.join(",") must come back as the same list.
// Run: npm test
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/loadCatalog.mjs";

let splitFilterValues;
before(async () => {
  ({ splitFilterValues } = await loadModule("src/lib/utils.ts", "utils"));
});

describe("splitFilterValues", () => {
  it("splits plain option names", () => {
    assert.deepEqual(splitFilterValues("Колір", "Колір: Білий,Колір: Чорний"), ["Колір: Білий", "Колір: Чорний"]);
  });

  it("keeps commas inside a value", () => {
    assert.deepEqual(
      splitFilterValues("Розмір", "Розмір: 900 (1300) × 650 мм, 18 мм,Розмір: 900 (1300) × 650 мм, 36 мм"),
      ["Розмір: 900 (1300) × 650 мм, 18 мм", "Розмір: 900 (1300) × 650 мм, 36 мм"]
    );
  });

  it("round-trips whatever the filter panel writes", () => {
    const values = ["Розмір: 1100 (розкладається до 1500) × 700 × 750 мм, 36 мм", "Розмір: 1100 × 700 мм", "Розмір: 90×200"];
    assert.deepEqual(splitFilterValues("Розмір", values.join(",")), values);
  });

  it("treats the group name literally (regex characters, spaces)", () => {
    assert.deepEqual(
      splitFilterValues("Колір / Декор", "Колір / Декор: Дуб, сонома,Колір / Декор: Венге"),
      ["Колір / Декор: Дуб, сонома", "Колір / Декор: Венге"]
    );
    // "." must not match any character: "Ax" isn't the group "A.".
    assert.deepEqual(splitFilterValues("A.", "A.: 1,Ax: 2"), ["A.: 1,Ax: 2"]);
  });

  it("splits unprefixed values (specs) on every comma, as before", () => {
    assert.deepEqual(splitFilterValues("Каркас", "Метал,Дерево"), ["Метал", "Дерево"]);
  });

  it("returns a single value unchanged", () => {
    assert.deepEqual(splitFilterValues("Колір", "Колір: Білий"), ["Колір: Білий"]);
  });
});
