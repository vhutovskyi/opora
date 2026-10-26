// Unit tests for the storefront catalog filters (src/lib/supabase/catalog.ts), DB-free.
// The rule under test: every filter — options, specs AND the price range — must hold for ONE AND THE
// SAME variant. It used to be checked against the product's union of variants, so AND behaved like OR.
// Run: npm test
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, setDb } from "./helpers/loadCatalog.mjs";

let catalog;
before(async () => {
  catalog = await loadCatalog();
});

// --- Fixture builders: rows shaped like the PostgREST nested selects catalog.ts makes ---
const HEX = { "Білий": "#FFFFFF", "Чорний": "#000000", "Рожевий": "#F4C2C2", "Дуб": "#B08850" };

function variant(id, options, price, { discounted = null, visible = true, sort = 0 } = {}) {
  return {
    id,
    price,
    discounted_price: discounted,
    visible,
    sort_order: sort,
    variant_images: [{ sort_order: 0, images: { url: `https://r2.test/images/${id}.jpg`, url_compressed: null } }],
    variant_options: Object.entries(options).map(([axis, value]) => ({
      options: { name: `${axis}: ${value}`, value: HEX[value] ?? value },
    })),
  };
}

function product(id, catalogName, minPrice, variants, createdAt = "2026-01-01") {
  return { id, slug: id, model: id, min_price: minPrice, created_at: createdAt, catalog: catalogName, visible: true, variants };
}

// A bed: white in 90 and 160, black only in 160, pink only as a HIDDEN variant (the cheapest one).
const bed = product("bed", "Ліжка", 10000, [
  variant("bed-pink-90", { "Колір": "Рожевий", "Розмір": "90×200" }, 9000, { visible: false, sort: 0 }),
  variant("bed-white-90", { "Колір": "Білий", "Розмір": "90×200" }, 10000, { sort: 1 }),
  variant("bed-white-160", { "Колір": "Білий", "Розмір": "160×200" }, 14000, { sort: 2 }),
  variant("bed-black-160", { "Колір": "Чорний", "Розмір": "160×200" }, 15000, { sort: 3 }),
]);
// A table with a price gap: nothing between 5000 and 8400.
const table = product("table", "Столи", 5000, [
  variant("table-white", { "Колір": "Білий" }, 5000, { sort: 0 }),
  variant("table-oak", { "Колір": "Дуб" }, 8400, { sort: 1 }),
], "2026-03-01");
// A chair whose white variant is on sale: 12000 → 9000.
const chair = product("chair", "Стільці", 12000, [
  variant("chair-white", { "Колір": "Білий" }, 12000, { discounted: 9000, sort: 0 }),
  variant("chair-black", { "Колір": "Чорний" }, 13000, { sort: 1 }),
], "2026-02-01");

const all = { type: ["Всі"] };
const ids = (products) => products.map((p) => p.id);
const cardIds = (p) => p.variations.map((v) => v.id);
const find = (products, id) => products.find((p) => p.id === id);

describe("option filters: AND between groups, on the same variant", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("matches a product that has the combination on one variant", async () => {
    const { products } = await catalog.getCatalogAndBounds({
      ...all,
      optionFilters: { "Колір": ["Колір: Білий"], "Розмір": ["Розмір: 160×200"] },
    });
    assert.deepEqual(ids(products), ["bed"]);
  });

  it("rejects a product whose variants have each value only separately", async () => {
    // The bed has black (in 160) and 90 (in white) — but no black 90. The old union logic matched it.
    const { products } = await catalog.getCatalogAndBounds({
      ...all,
      optionFilters: { "Колір": ["Колір: Чорний"], "Розмір": ["Розмір: 90×200"] },
    });
    assert.deepEqual(ids(products), []);
  });

  it("rejects a product that lacks the filtered axis entirely", async () => {
    // Table and chair have no Розмір — "Білий AND 160" can't hold for any of their variants.
    const { products } = await catalog.getCatalogAndBounds({
      ...all,
      optionFilters: { "Колір": ["Колір: Білий"], "Розмір": ["Розмір: 160×200"] },
    });
    assert.ok(!find(products, "table") && !find(products, "chair"));
  });

  it("treats values inside one group as OR", async () => {
    const { products } = await catalog.getCatalogAndBounds({
      ...all,
      optionFilters: { "Колір": ["Колір: Білий", "Колір: Чорний"], "Розмір": ["Розмір: 160×200"] },
    });
    assert.deepEqual(ids(products), ["bed"]);
    assert.deepEqual(cardIds(products[0]), ["bed-white-160", "bed-black-160"]);
  });

  it("ignores empty groups", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": [] } });
    assert.deepEqual(ids(products).sort(), ["bed", "chair", "table"]);
  });

  it("combines with the catalog type", async () => {
    const { products } = await catalog.getCatalogAndBounds({
      type: ["Столи"],
      optionFilters: { "Колір": ["Колір: Білий"] },
    });
    assert.deepEqual(ids(products), ["table"]);
  });
});

describe("price filter: the same variant must be in range", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("rejects a window that falls in the gap between two variants", async () => {
    // The table spans 5000–8400 but has nothing in 6000–8000; the old range-overlap rule matched it.
    const { products } = await catalog.getCatalogAndBounds({ ...all, priceMin: 6000, priceMax: 8000 });
    assert.deepEqual(ids(products), []);
  });

  it("is inclusive at both ends", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, priceMin: 8400, priceMax: 8400 });
    assert.deepEqual(ids(products), ["table"]);
    assert.deepEqual(cardIds(products[0]), ["table-oak"]);
  });

  it("must hold on the variant that matched the options (minPrice no longer lets cheap colours through)", async () => {
    // White beds top out at 14000; only the BLACK bed costs 15000.
    const white = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Білий"] }, priceMin: 14500 });
    assert.deepEqual(ids(white.products), []);
    const black = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Чорний"] }, priceMin: 14500 });
    assert.deepEqual(ids(black.products), ["bed"]);
    assert.deepEqual(cardIds(black.products[0]), ["bed-black-160"]);
  });

  it("filters on the main price, never the sale price", async () => {
    // The white chair is 12000, on sale for 9000 — the filter only sees 12000.
    const aboveSale = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Білий"] }, priceMin: 10000 });
    assert.deepEqual(ids(aboveSale.products).sort(), ["bed", "chair"]);
    const belowRegular = await catalog.getCatalogAndBounds({ ...all, priceMax: 9500 });
    assert.deepEqual(ids(belowRegular.products), ["table"], "a 9000 ₴ sale doesn't put the chair under 9500");
  });

  it("still shows the sale price on the card of a product that matched", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, priceMin: 12000, priceMax: 12000 });
    const card = find(products, "chair").variations[0];
    assert.deepEqual([card.id, card.price, card.discountedPrice], ["chair-white", "12000", "9000"]);
  });

  it("never matches a variant without a price («Ціну уточнюйте») while a price filter is on", async () => {
    setDb({ products: [product("noprice", "Столи", 0, [variant("noprice-1", { "Колір": "Білий" }, 0)])] });
    assert.deepEqual(ids((await catalog.getCatalogAndBounds({ ...all, priceMax: 1000 })).products), []);
    assert.deepEqual(ids((await catalog.getCatalogAndBounds(all)).products), ["noprice"]);
  });
});

describe("hidden variants (visible = false)", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("never show up on the card", async () => {
    const { products } = await catalog.getCatalogAndBounds(all);
    assert.ok(!cardIds(find(products, "bed")).includes("bed-pink-90"));
  });

  it("can't satisfy an option filter", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Рожевий"] } });
    assert.deepEqual(ids(products), []);
  });

  it("can't satisfy the price filter or widen the bounds", async () => {
    const { products, bounds } = await catalog.getCatalogAndBounds({ type: ["Ліжка"], priceMax: 9500 });
    assert.deepEqual(ids(products), []);
    assert.equal(bounds.min, 10000, "the hidden 9000 ₴ variant must not lower the slider");
  });
});

describe("the card of a filtered product", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("unfiltered: one variation per look, the first variant in page order", async () => {
    const { products } = await catalog.getCatalogAndBounds(all);
    // Розмір doesn't change the photo: both white beds are one look, represented by the first (90).
    assert.deepEqual(cardIds(find(products, "bed")), ["bed-white-90", "bed-black-160"]);
    assert.equal(find(products, "bed").price, 10000, "unfiltered price stays products.min_price");
  });

  it("keeps only the looks with a matching variant", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Чорний"] } });
    assert.deepEqual(cardIds(find(products, "bed")), ["bed-black-160"]);
    assert.deepEqual(cardIds(find(products, "chair")), ["chair-black"]);
  });

  it("represents a look by its matching variant — link and price follow a non-visual filter", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Розмір": ["Розмір: 160×200"] } });
    const [white] = find(products, "bed").variations;
    assert.deepEqual([white.id, white.price], ["bed-white-160", "14000"], "the 160 cm bed, not the look's default 90 cm one");
    // The photos still come from the look (shared by every size).
    assert.deepEqual(white.images, ["https://r2.test/images/bed-white-90.jpg"]);
  });

  it("orders checkbox variants («Так») after the unticked ones, as the product page does", async () => {
    setDb({
      products: [product("nightstand", "Тумби", 7000, [
        variant("legs-yes", { "З білими ніжками": "Так" }, 7000, { sort: 0 }),
        variant("legs-no", { "З білими ніжками": "Ні" }, 7000, { sort: 1 }),
      ])],
    });
    const { products } = await catalog.getCatalogAndBounds(all);
    assert.deepEqual(cardIds(products[0]), ["legs-no", "legs-yes"]);
  });
});

describe("price bounds", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("unfiltered: the full range of visible variants, at the main price", async () => {
    const { bounds } = await catalog.getCatalogAndBounds(all);
    assert.deepEqual(bounds, { min: 5000, max: 15000 });
  });

  it("follow the option filters but ignore the price filter itself", async () => {
    // White variants: bed 10000–14000, table 5000, chair 12000 (its 9000 sale doesn't count).
    // The price window must not shrink the slider.
    const { products, bounds } = await catalog.getCatalogAndBounds({
      ...all,
      optionFilters: { "Колір": ["Колір: Білий"] },
      priceMin: 11000,
      priceMax: 12500,
    });
    assert.deepEqual(ids(products), ["chair"]);
    assert.deepEqual(bounds, { min: 5000, max: 14000 });
  });

  it("are null when nothing matches", async () => {
    const { bounds } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Зелений"] } });
    assert.equal(bounds, null);
  });
});

describe("sorting", () => {
  beforeEach(() => setDb({ products: [bed, table, chair] }));

  it("price_asc on a filtered list sorts by the cheapest MATCHING variant", async () => {
    // Black: chair 13000, bed 15000. By min_price it would be bed (10000) first.
    const { products } = await catalog.getCatalogAndBounds({ ...all, sort: "price_asc", optionFilters: { "Колір": ["Колір: Чорний"] } });
    assert.deepEqual(ids(products), ["chair", "bed"]);
  });

  it("price_asc / price_desc / newest unfiltered", async () => {
    const asc = await catalog.getCatalogAndBounds({ ...all, sort: "price_asc" });
    assert.deepEqual(ids(asc.products), ["table", "bed", "chair"]);
    const desc = await catalog.getCatalogAndBounds({ ...all, sort: "price_desc" });
    assert.deepEqual(ids(desc.products), ["chair", "bed", "table"]);
    const newest = await catalog.getCatalogAndBounds({ ...all, sort: "newest" });
    assert.deepEqual(ids(newest.products), ["table", "chair", "bed"]);
  });

  it("doesn't leak internal fields to the client", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Білий"] } });
    for (const key of ["createdAt", "priceLo", "priceHi", "allOptionNames"]) assert.ok(!(key in products[0]), key);
  });
});

describe("spec filters: per variant too", () => {
  const sofa = product("sofa", "Дивани", 20000, [
    variant("sofa-metal", { "Колір": "Білий" }, 20000, { sort: 0 }),
    variant("sofa-foam", { "Колір": "Чорний" }, 21000, { sort: 1 }),
  ]);
  beforeEach(() =>
    setDb({
      products: [sofa],
      variant_specs: [
        { value: "Метал", variant_id: "sofa-metal", specs: { name: "Каркас" } },
        { value: "Піна", variant_id: "sofa-foam", specs: { name: "Наповнювач" } },
      ],
    })
  );

  it("matches a spec on one variant", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, specFilters: { "Каркас": ["Метал"] } });
    assert.deepEqual(cardIds(products[0]), ["sofa-metal"]);
  });

  it("rejects two specs that live on different variants", async () => {
    const { products } = await catalog.getCatalogAndBounds({ ...all, specFilters: { "Каркас": ["Метал"], "Наповнювач": ["Піна"] } });
    assert.deepEqual(ids(products), []);
  });

  it("must hold together with the option filters", async () => {
    const { products } = await catalog.getCatalogAndBounds({
      ...all,
      specFilters: { "Каркас": ["Метал"] },
      optionFilters: { "Колір": ["Колір: Чорний"] },
    });
    assert.deepEqual(ids(products), []);
  });
});

describe("robustness", () => {
  it("drops a product the variant index doesn't know yet (cache entries out of step) instead of crashing", async () => {
    setDb({ products: [bed, table], indexProducts: [table] });
    const filtered = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Білий"] } });
    assert.deepEqual(ids(filtered.products), ["table"]);
    const unfiltered = await catalog.getCatalogAndBounds(all);
    assert.deepEqual(ids(unfiltered.products).sort(), ["bed", "table"], "the unfiltered list doesn't read the index");
  });

  it("drops a product whose index looks match none of the base's (renamed colour mid-revalidation)", async () => {
    const renamed = product("bed", "Ліжка", 10000, [variant("bed-white-90", { "Колір": "Молочний" }, 10000)]);
    setDb({ products: [bed], indexProducts: [renamed] });
    const { products } = await catalog.getCatalogAndBounds({ ...all, optionFilters: { "Колір": ["Колір: Молочний"] } });
    assert.deepEqual(ids(products), []);
  });

  it("propagates a database error", async () => {
    setDb({ error: { message: "boom" } });
    await assert.rejects(catalog.getCatalogAndBounds(all));
  });

  it("getFilteredCatalog returns exactly getCatalogAndBounds().products", async () => {
    setDb({ products: [bed, table, chair] });
    const params = { ...all, sort: "price_asc", optionFilters: { "Колір": ["Колір: Білий"] }, priceMax: 12000 };
    assert.deepEqual(await catalog.getFilteredCatalog(params), (await catalog.getCatalogAndBounds(params)).products);
  });
});

describe("parseCatalogParams", () => {
  it("reads type, sort, option/spec filters and prices", async () => {
    const params = await catalog.parseCatalogParams({
      type: "Ліжка,Столи",
      sort: "price_asc",
      "optFilter_Колір": "Колір: Білий,Колір: Чорний",
      "specFilter_Каркас": "Метал",
      priceMin: "1000",
      priceMax: "9000",
    });
    assert.deepEqual(params, {
      type: ["Ліжка", "Столи"],
      sub: [],
      sort: "price_asc",
      optionFilters: { "Колір": ["Колір: Білий", "Колір: Чорний"] },
      specFilters: { "Каркас": ["Метал"] },
      priceMin: 1000,
      priceMax: 9000,
    });
  });

  it("defaults to every catalog and no price bounds; ignores blank or garbage prices", async () => {
    const params = await catalog.parseCatalogParams({ priceMin: "", priceMax: "abc" });
    assert.deepEqual([params.type, params.sort, params.priceMin, params.priceMax], [["Всі"], "default", undefined, undefined]);
  });

  it("keeps an option value that itself contains a comma", async () => {
    // Real «Розмір» values: 14 of them carry «, 18 мм» / «, 36 мм» (Стіл Edgar). Splitting on every comma
    // turned one selected size into two names that match nothing — an empty catalog.
    const value = "Розмір: 900 (1300) × 650 мм, 18 мм";
    const params = await catalog.parseCatalogParams({ "optFilter_Розмір": `${value},Розмір: 1100 × 700 мм` });
    assert.deepEqual(params.optionFilters, { "Розмір": [value, "Розмір: 1100 × 700 мм"] });
  });
});

describe("paginateCatalog", () => {
  const list = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  it("pages by cursor", () => {
    const first = catalog.paginateCatalog(list, null, 2);
    assert.deepEqual([ids(first.products), first.nextCursor], [["a", "b"], "b"]);
    const last = catalog.paginateCatalog(list, "d", 2);
    assert.deepEqual([ids(last.products), last.nextCursor], [["e"], null]);
  });

  it("restarts from the top when the cursor is gone (the filter changed under the client)", () => {
    assert.deepEqual(ids(catalog.paginateCatalog(list, "zzz", 2).products), ["a", "b"]);
  });
});
