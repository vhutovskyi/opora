// Unit tests for activeCardVariation (src/components/ui/cardVariation.ts) — which variation a catalog
// ProductCard shows. The bug it fixes: after a colour filter change the new swatch appeared, but the photo
// stayed on the previous selection's variation until a hover, because the card kept a stale state object.
// Run: npm test
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/loadCatalog.mjs";

let activeCardVariation;
before(async () => {
  ({ activeCardVariation } = await loadModule("src/components/ui/cardVariation.ts", "cardVariation"));
});

const v = (id, colour) => ({ id, images: [`${id}.jpg`], allHexes: [{ hex: "#000", name: `Колір: ${colour}` }] });
const matching = (colour) => (variation) => !!colour && variation.allHexes.some((h) => h.name === `Колір: ${colour}`);

describe("activeCardVariation", () => {
  it("shows the first variation matching the filters", () => {
    const variations = [v("white", "Білий"), v("black", "Чорний")];
    const active = activeCardVariation({ variations, source: variations, filterKey: "Колір: Чорний", pick: null, matches: matching("Чорний") });
    assert.equal(active.id, "black");
  });

  it("falls back to the first swatch, then the first variation", () => {
    const variations = [v("white", "Білий"), v("black", "Чорний")];
    const base = { variations, source: variations, filterKey: "", pick: null, matches: () => false };
    assert.equal(activeCardVariation({ ...base, firstSwatch: variations[1] }).id, "black");
    assert.equal(activeCardVariation(base).id, "white");
    assert.equal(activeCardVariation({ ...base, variations: [], source: [] }), undefined);
  });

  it("keeps the swatch the visitor hovered while the data and filters are unchanged", () => {
    const variations = [v("white", "Білий"), v("black", "Чорний")];
    const pick = { id: "black", variations, filterKey: "" };
    const active = activeCardVariation({ variations, source: variations, filterKey: "", pick, matches: () => false });
    assert.equal(active.id, "black");
  });

  it("switches to the new data's colour when a filter change delivers new variations (the reported bug)", () => {
    // Filter «Білий»: the server sends only the white look; the card shows it.
    const whiteResponse = [v("white", "Білий")];
    const stalePick = { id: "white", variations: whiteResponse, filterKey: "Колір: Білий" };
    // Filter «Чорний»: the same card (same product id) receives a NEW variations array with the black look.
    const blackResponse = [v("black", "Чорний")];
    const active = activeCardVariation({
      variations: blackResponse,
      source: blackResponse,
      filterKey: "Колір: Чорний",
      pick: stalePick,
      matches: matching("Чорний"),
    });
    assert.equal(active.id, "black", "the photo must follow the new swatch without a hover");
  });

  it("ignores a pick made under other filters even when the data array is the same", () => {
    // Swatch picked with no filter; then «Чорний» is applied and the card hasn't got new data yet.
    const variations = [v("white", "Білий"), v("black", "Чорний")];
    const pick = { id: "white", variations, filterKey: "" };
    const active = activeCardVariation({ variations, source: variations, filterKey: "Колір: Чорний", pick, matches: matching("Чорний") });
    assert.equal(active.id, "black");
  });

  it("ignores a pick whose variation no longer exists in the data", () => {
    const variations = [v("white", "Білий")];
    const pick = { id: "gone", variations, filterKey: "" };
    assert.equal(activeCardVariation({ variations, source: variations, filterKey: "", pick, matches: () => false }).id, "white");
  });
});

describe("orderSwatchColors", () => {
  let orderSwatchColors;
  before(async () => {
    ({ orderSwatchColors } = await loadModule("src/components/ui/cardVariation.ts", "cardVariation"));
  });
  const c = (name, hex = "#000000") => ({ name, hex });
  const names = (colors) => colors.map((x) => x.name);

  it("puts «Ніжки» in the bottom half whichever order the DB returned (30 real products had both)", () => {
    const top = c("Стільниця: Дуб", "#B08850");
    const legs = c("Ніжки: Чорний", "#000000");
    assert.deepEqual(names(orderSwatchColors([top, legs])), ["Стільниця: Дуб", "Ніжки: Чорний"]);
    assert.deepEqual(names(orderSwatchColors([legs, top])), ["Стільниця: Дуб", "Ніжки: Чорний"]);
  });

  it("puts «Колір ніжок» in the bottom half too", () => {
    const upholstery = c("Колір оббивки: Сірий");
    const legs = c("Колір ніжок: Білий");
    assert.deepEqual(names(orderSwatchColors([legs, upholstery])), ["Колір оббивки: Сірий", "Колір ніжок: Білий"]);
  });

  it("orders non-leg axes by name, so the result never depends on the input order", () => {
    const input = [c("Стільниця: Дуб"), c("Колір / Декор: Венге"), c("Ніжки: Чорний"), c("Колір: Білий")];
    // Ukrainian collation: «Колір» before «Колір / Декор» (a prefix sorts first).
    const expected = ["Колір: Білий", "Колір / Декор: Венге", "Стільниця: Дуб", "Ніжки: Чорний"];
    assert.deepEqual(names(orderSwatchColors(input)), expected);
    assert.deepEqual(names(orderSwatchColors([...input].reverse())), expected);
  });

  it("orders two colours of one axis by value", () => {
    assert.deepEqual(names(orderSwatchColors([c("Колір: Чорний"), c("Колір: Білий")])), ["Колір: Білий", "Колір: Чорний"]);
  });

  it("doesn't mutate its input and keeps extra fields", () => {
    const input = [c("Ніжки: Чорний"), { ...c("Стільниця: Дуб"), extra: 1 }];
    const out = orderSwatchColors(input);
    assert.equal(input[0].name, "Ніжки: Чорний");
    assert.equal(out[0].extra, 1);
  });
});
