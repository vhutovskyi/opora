// Romax tables: the price list ("Столи Romax.txt") turned into data, one entry per product.
// Paired with scripts/tables/photo-map.json (which says what colour each JPG shows), this is
// everything the import route needs. See TABLES_IMPORT.md for the folder survey behind it.

export const TABLES_CATALOG = "Столи";
export const TOP_AXIS = "Стільниця";
export const LEG_AXIS = "Ніжки";
export const THICKNESS_AXIS = "Товщина стільниці";
export const TYPE_AXIS = "Тип";

// Tabletop × leg combinations sold, in price-list order. Both axes are colour axes; the hex values
// live in scripts/tables/photo-map.json (`_swatches`), measured off the renders.
export const TOPS = [
  "Кашемір", "Ясен Серфсайд", "Антрацит", "Білий", "Бетонний Камінь", "Горіх Франклін",
  "Дуб Ендгрейн", "Дуб Крафт Золотий", "Дуб Сонома", "Мармур Кришталь", "Камінь П'єтра Гріджіо Чорний",
] as const;
export const LEGS = ["Чорний мат", "Білий мат", "Золотий мат"] as const;

// Surcharges on top of the size price. The two-axis combinations are listed explicitly in the
// price list rather than being the sum of the single-axis ones — keep them explicit here too.
const PREMIUM_TOPS = ["Мармур Кришталь", "Камінь П'єтра Гріджіо Чорний"];
export function surcharge(top: string, legs: string): number {
  const premium = PREMIUM_TOPS.includes(top), goldLegs = legs === "Золотий мат";
  if (premium && goldLegs) return 1500;
  if (premium) return 1000;
  if (goldLegs) return 500;
  return 0;
}

export type SizeRow = {
  /** Size label exactly as printed in the price list, e.g. "1100 × 750 × 750 мм". */
  label: string;
  price: number;
  /** Only where the tabletop thickness is a real choice with its own photos (Round, Pocker). */
  thickness?: string;
};

/**
 * Shop-facing size label. The price list prints the full triple, but the last number is always the
 * height and it is always 750 мм — it is already in «Характеристики», so repeating it on every chip
 * only makes the longest axis on the page longer still:
 *
 *   1100 (1500) × 750 × 750 мм  →  1100 (1500) × 750 мм   (length, extended length, width)
 *   Ø800 (1100) × 750 мм        →  Ø800 (1100) мм         (Ø = round, the diameter)
 *   900 (розкладається до 1300) × 650 × 750 мм, 18 мм → 900 (1300) × 650 мм, 18 мм
 *
 * Rule: drop the last «×» component (the height) and spell «розкладається до N» as «(N)». The
 * price-list wording stays in `label`, so the data can still be diffed against the source.
 * Checked by scripts/tables/check-size-labels.mjs.
 */
export function shortSizeLabel(label: string): string {
  const [core, ...rest] = label.split(",");
  const parts = core.replace(/розкладається до\s*/g, "").split("×").map((s) => s.trim());
  const kept = parts.slice(0, -1).join(" × ").replace(/\s*мм$/, "");
  return [`${kept} мм`, ...rest.map((s) => s.trim())].join(", ");
}

export type SizeDims = { primary?: string; extended?: string; width?: string; thickness?: string };

/**
 * The dimensions of ONE variant, read off its short size label (which is exactly the «Розмір»
 * option's value) plus the thickness axis where there is one:
 *
 *   «1100 (1500) × 750 мм»    → primary 1100, extended 1500, width 750
 *   «Ø800 (1100) мм»          → primary 800, extended 1100
 *   «900 (1300) × 650 мм, 18 мм» → … + thickness 18 мм (Edgar prints it in the label; Round,
 *                                   Pocker and Sherwood pass it in as a real option axis instead)
 */
export function parseSizeDims(shortLabel: string, thickness?: string): SizeDims {
  const [core = "", ...rest] = shortLabel.split(",");
  const [first = "", second = ""] = core.split("×").map((s) => s.trim());
  const [primary, extended] = first.match(/\d+/g) ?? [];
  const mm = (n?: string) => (n ? `${n} мм` : undefined);
  return {
    primary: mm(primary),
    extended: mm(extended),
    width: mm(second.match(/\d+/)?.[0]),
    thickness: thickness ?? (rest.join(",").trim() || undefined),
  };
}

/**
 * The value one characteristic takes on ONE variant. `kindValue` is the price-list wording out of
 * `TableKind.specs`, where a dimension that varies by size is every size joined with « / »
 * («800 мм / 900 мм / 1100 мм») — right for a price list, wrong on a variant, which is exactly one
 * of those sizes. Size-varying names are narrowed to the variant's own dimensions; everything else
 * (Висота, Обробка торців, Форма стільниці, …) really is shared by the kind and passes through.
 *
 * Matching by label beats matching by row index: Viro lists 4 sizes against 4 extended lengths that
 * are NOT in the same order (1150→1550, 1150→1950, 1400→1800, 1400→2200).
 */
export function variantSpecValue(name: string, kindValue: string, d: SizeDims): string {
  if (/у розкладеному вигляді$/.test(name)) return d.extended ?? kindValue;
  if (name === "Довжина" || name === "Діаметр") return d.primary ?? kindValue;
  if (name === "Ширина") return d.width ?? kindValue;
  // «ЛДСП 18 мм / 36 мм KronoSpan» spans the thickness axis, not the size axis.
  if (name === "Матеріал стільниці" && d.thickness && kindValue.includes("/")) return `ЛДСП ${d.thickness} KronoSpan`;
  return kindValue;
}

/**
 * A product is ONE model, and «розкладний / нерозкладний» is an option on it rather than a second
 * product — the same shape as Матеріал: Щит/Масив. The price list prints the two as separate
 * blocks ("Aston" and "Aston Slide") because each has its own dimensions, prices and photos, so
 * they stay separate here as `kinds` and get merged into one product at import time.
 */
export type TableKind = {
  type: "Нерозкладний" | "Розкладний";
  /** Characteristics for this kind — written to variant_specs on its variants only. */
  specs: Record<string, string>;
  sizes: SizeRow[];
  /** Photo folders relative to the TABLES root; `thickness` picks the folder for that variant. */
  photos: { dir: string; thickness?: string }[];
};

export type TableProduct = {
  model: string;
  kinds: TableKind[];
};

const LDSP18 = "ЛДСП 18 мм KronoSpan";
const LDSP36 = "ЛДСП 36 мм KronoSpan";
// «Тип» is deliberately absent: it is an option axis now, not a characteristic.
const base = (top = LDSP18) => ({
  "Висота": "750 мм",
  "Матеріал стільниці": top,
  "Матеріал каркаса": "Метал із порошковим покриттям",
  "Обробка торців": "кромка ПВХ",
});

export const TABLE_PRODUCTS: TableProduct[] = [
  {
    model: "Стіл Aston",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 × 750 × 750 мм", price: 6000 },
          { label: "1300 × 850 × 750 мм", price: 6900 },
        ],
        photos: [{ dir: "ASTON/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Довжина у розкладеному вигляді": "1500 мм / 1700 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 (1500) × 750 × 750 мм", price: 9600 },
          { label: "1300 (1700) × 850 × 750 мм", price: 9900 },
        ],
        photos: [{ dir: "ASTON/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Edgar",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм", "Ширина": "700 мм" },
        sizes: [{ label: "1100 × 700 × 750 мм", price: 4700 }],
        photos: [{ dir: "EDGAR SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base("ЛДСП 18 мм / 36 мм KronoSpan"),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        // Thickness is part of the size row here (one photo set for the whole model), unlike Round/Pocker.
        sizes: [
          { label: "900 (розкладається до 1300) × 650 × 750 мм, 18 мм", price: 7600 },
          { label: "900 (розкладається до 1300) × 650 × 750 мм, 36 мм", price: 8100 },
          { label: "1100 (розкладається до 1500) × 700 × 750 мм, 18 мм", price: 8400 },
          { label: "1100 (розкладається до 1500) × 700 × 750 мм, 36 мм", price: 8900 },
          { label: "1100 (розкладається до 1900) × 700 × 750 мм, 18 мм", price: 8900 },
          { label: "1100 (розкладається до 1900) × 700 × 750 мм, 36 мм", price: 9400 },
        ],
        photos: [{ dir: "EDGAR SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Elips",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 × 750 × 750 мм", price: 4800 },
          { label: "1300 × 850 × 750 мм", price: 5400 },
        ],
        photos: [{ dir: "ELIPS SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм / 1300 мм",
          "Довжина у розкладеному вигляді": "1200 мм / 1500 мм / 1700 мм",
          "Ширина": "650 мм / 750 мм / 850 мм",
        },
        sizes: [
          { label: "900 (розкладається до 1200) × 650 × 750 мм", price: 7800 },
          { label: "1100 (розкладається до 1500) × 750 × 750 мм", price: 8200 },
          { label: "1300 (розкладається до 1700) × 850 × 750 мм", price: 8700 },
        ],
        photos: [{ dir: "ELIPS SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Fortis",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 × 750 × 750 мм", price: 7200 },
          { label: "1300 × 850 × 750 мм", price: 7600 },
        ],
        photos: [{ dir: "FORTIS SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Довжина у розкладеному вигляді": "1500 мм / 1700 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 (розкладається до 1500) × 750 × 750 мм", price: 10200 },
          { label: "1300 (розкладається до 1700) × 850 × 750 мм", price: 10800 },
        ],
        photos: [{ dir: "FORTIS SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Magnit",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "900 мм / 1000 мм / 1100 мм", "Ширина": "600 мм / 650 мм / 700 мм" },
        sizes: [
          { label: "900 × 600 × 750 мм", price: 4300 },
          { label: "1000 × 650 × 750 мм", price: 4400 },
          { label: "1100 × 700 × 750 мм", price: 4900 },
        ],
        photos: [{ dir: "MAGNIT/нерозкладний" }],
      },
    ],
  },
  {
    model: "Стіл Norman",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "900 мм / 1100 мм", "Ширина": "650 мм / 700 мм" },
        sizes: [
          { label: "900 × 650 × 750 мм", price: 4300 },
          { label: "1100 × 700 × 750 мм", price: 4500 },
        ],
        photos: [{ dir: "NORMAN SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        sizes: [
          { label: "900 (1300) × 650 × 750 мм", price: 8400 },
          { label: "1100 (1500) × 700 × 750 мм", price: 9200 },
          { label: "1100 (1900) × 700 × 750 мм", price: 9800 },
        ],
        photos: [{ dir: "NORMAN SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Oscar",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Форма стільниці": "кругла", "Діаметр": "800 мм / 900 мм" },
        sizes: [
          { label: "Ø800 × 750 мм", price: 6400 },
          { label: "Ø900 × 750 мм", price: 6800 },
        ],
        photos: [{ dir: "OSCAR SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Форма стільниці": "кругла", "Діаметр": "800 мм / 900 мм", "Довжина у розкладеному вигляді": "1100 мм / 1300 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 9400 },
          { label: "Ø900 (1300) × 750 мм", price: 9700 },
        ],
        photos: [{ dir: "OSCAR SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Parker",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Діаметр": "900 мм" },
        sizes: [{ label: "Ø900 × 750 мм", price: 5200 }],
        photos: [{ dir: "PARKER SLIDE/нерозкладений" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм", "Довжина у розкладеному вигляді": "1100 мм / 1300 мм / 1400 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 8300 },
          { label: "Ø900 (1300) × 750 мм", price: 8500 },
          { label: "Ø1100 (1400) × 750 мм", price: 9400 },
        ],
        photos: [{ dir: "PARKER SLIDE/розкладений" }],
      },
    ],
  },
  {
    model: "Стіл Ralf",
    kinds: [
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        sizes: [
          { label: "900 (1300) × 650 × 750 мм", price: 8500 },
          { label: "1100 (1500) × 700 × 750 мм", price: 9200 },
          { label: "1100 (1900) × 700 × 750 мм", price: 9800 },
        ],
        photos: [{ dir: "RALF SLIDE/розкладений" }],
      },
    ],
  },
  {
    model: "Стіл Ronni",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм", "Ширина": "750 мм" },
        sizes: [{ label: "1100 × 750 × 750 мм", price: 5200 }],
        photos: [{ dir: "RONNI SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм / 1300 мм",
          "Довжина у розкладеному вигляді": "1200 мм / 1500 мм / 1700 мм",
          "Ширина": "650 мм / 750 мм / 850 мм",
        },
        sizes: [
          { label: "900 (1200) × 650 × 750 мм", price: 8000 },
          { label: "1100 (1500) × 750 × 750 мм", price: 8400 },
          { label: "1300 (1700) × 850 × 750 мм", price: 8900 },
        ],
        photos: [{ dir: "RONNI SLIDE/розкладений" }],
      },
    ],
  },
  {
    model: "Стіл Round",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base("ЛДСП 18 мм / 36 мм KronoSpan"), "Форма стільниці": "кругла", "Діаметр": "600 мм / 700 мм / 800 мм" },
        // Thickness has its own photo folders here, so it becomes a real (visual) option axis.
        sizes: [
          { label: "Ø600 × 750 мм", thickness: "18 мм", price: 4400 },
          { label: "Ø600 × 750 мм", thickness: "36 мм", price: 4900 },
          { label: "Ø700 × 750 мм", thickness: "18 мм", price: 4500 },
          { label: "Ø700 × 750 мм", thickness: "36 мм", price: 5300 },
          { label: "Ø800 × 750 мм", thickness: "18 мм", price: 4600 },
          { label: "Ø800 × 750 мм", thickness: "36 мм", price: 5500 },
        ],
        photos: [
          { dir: "ROUND/ROUND 18", thickness: "18 мм" },
          { dir: "ROUND/ROUND 36", thickness: "36 мм" },
        ],
      },
    ],
  },
  {
    model: "Стіл Simple",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(LDSP36), "Довжина": "800 мм / 900 мм / 1000 мм / 1150 мм", "Ширина": "600 мм / 650 мм / 700 мм / 750 мм" },
        sizes: [
          { label: "800 × 600 × 750 мм", price: 4900 },
          { label: "900 × 650 × 750 мм", price: 5300 },
          { label: "1000 × 700 × 750 мм", price: 5600 },
          { label: "1150 × 750 × 750 мм", price: 6400 },
        ],
        photos: [{ dir: "SIMPLE/нерозкладний" }],
      },
    ],
  },
  {
    model: "Стіл Viking",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Довжина": "800 мм", "Довжина у розкладеному вигляді": "2150 мм", "Ширина": "800 мм" },
        sizes: [{ label: "800 (2150) × 800 × 750 мм", price: 13900 }],
        photos: [{ dir: "VIKING/нерозкладний" }],
      },
    ],
  },
  {
    model: "Стіл Long",
    kinds: [
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "400 мм",
          "Довжина у розкладеному вигляді": "2200 мм / 2400 мм / 3000 мм",
          "Ширина": "800 мм / 900 мм",
        },
        sizes: [
          { label: "400 (2200) × 800 × 750 мм", price: 13500 },
          { label: "400 (2400) × 900 × 750 мм", price: 14500 },
          { label: "400 (3000) × 900 × 750 мм", price: 15500 },
        ],
        photos: [{ dir: "LONG" }],
      },
    ],
  },
  {
    model: "Стіл Diamant",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм", "Ширина у розкладеному вигляді": "1100 мм / 1300 мм / 1500 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 10600 },
          { label: "Ø900 (1300) × 750 мм", price: 10900 },
          { label: "Ø1100 (1500) × 750 мм", price: 11900 },
        ],
        photos: [{ dir: "DIAMANT SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Elegant",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм" },
        sizes: [
          { label: "Ø800 × 750 мм", price: 6900 },
          { label: "Ø900 × 750 мм", price: 7200 },
          { label: "Ø1100 × 750 мм", price: 7900 },
        ],
        photos: [{ dir: "ELEGANT SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм", "Ширина у розкладеному вигляді": "1100 мм / 1300 мм / 1400 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 9400 },
          { label: "Ø900 (1300) × 750 мм", price: 9700 },
          { label: "Ø1100 (1400) × 750 мм", price: 10400 },
        ],
        photos: [{ dir: "ELEGANT SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Ember",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "900 мм / 1100 мм", "Ширина": "650 мм / 700 мм" },
        sizes: [
          { label: "900 × 650 × 750 мм", price: 4400 },
          { label: "1100 × 700 × 750 мм", price: 4900 },
        ],
        photos: [{ dir: "EMBER SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        sizes: [
          { label: "900 (1300) × 650 × 750 мм", price: 8200 },
          { label: "1100 (1500) × 700 × 750 мм", price: 8900 },
          { label: "1100 (1900) × 700 × 750 мм", price: 9400 },
        ],
        photos: [{ dir: "EMBER SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Grace",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм", "Діаметр у розкладеному вигляді": "2200 мм / 2900 мм / 3500 мм" },
        sizes: [
          { label: "Ø800 (2200) × 750 мм", price: 16900 },
          { label: "Ø900 (2900) × 750 мм", price: 18900 },
          { label: "Ø900 (3500) × 750 мм", price: 19900 },
        ],
        photos: [{ dir: "GRACE" }],
      },
    ],
  },
  {
    model: "Стіл Long Round",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "900 мм", "Ширина у розкладеному вигляді": "2900 мм / 3500 мм" },
        sizes: [
          { label: "Ø900 (2900) × 750 мм", price: 16500 },
          { label: "Ø900 (3500) × 750 мм", price: 17500 },
        ],
        photos: [{ dir: "LONG ROUND" }],
      },
    ],
  },
  {
    model: "Стіл Next",
    kinds: [
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        sizes: [
          { label: "900 (1300) × 650 × 750 мм", price: 9200 },
          { label: "1100 (1500) × 700 × 750 мм", price: 9700 },
          { label: "1100 (1900) × 700 × 750 мм", price: 10500 },
        ],
        photos: [{ dir: "NEXT SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Original",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(LDSP36), "Довжина": "900 мм / 1000 мм / 1200 мм / 1300 мм", "Ширина": "650 мм / 700 мм / 750 мм / 800 мм" },
        sizes: [
          { label: "900 × 650 × 750 мм", price: 5200 },
          { label: "1000 × 700 × 750 мм", price: 5600 },
          { label: "1200 × 750 × 750 мм", price: 6400 },
          { label: "1300 × 800 × 750 мм", price: 6700 },
        ],
        photos: [{ dir: "ORIGINAL" }],
      },
    ],
  },
  {
    model: "Стіл Ovaro",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 × 750 × 750 мм", price: 7500 },
          { label: "1300 × 850 × 750 мм", price: 8200 },
        ],
        photos: [{ dir: "OVARO SLIDE/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: { ...base(), "Довжина": "1100 мм / 1300 мм", "Довжина у розкладеному вигляді": "1500 мм / 1700 мм", "Ширина": "750 мм / 850 мм" },
        sizes: [
          { label: "1100 (1500) × 750 × 750 мм", price: 10800 },
          { label: "1300 (1700) × 850 × 750 мм", price: 11900 },
        ],
        photos: [{ dir: "OVARO SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Pocker",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base("ЛДСП 18 мм / 36 мм KronoSpan"), "Довжина": "600 мм / 700 мм / 800 мм", "Ширина": "600 мм / 700 мм / 800 мм" },
        sizes: [
          { label: "600 × 600 × 750 мм", thickness: "18 мм", price: 4200 },
          { label: "600 × 600 × 750 мм", thickness: "36 мм", price: 4400 },
          { label: "700 × 700 × 750 мм", thickness: "36 мм", price: 4600 },
          { label: "800 × 800 × 750 мм", thickness: "36 мм", price: 4900 },
        ],
        photos: [
          { dir: "POCKER/18 ММ", thickness: "18 мм" },
          { dir: "POCKER/36 ММ", thickness: "36 мм" },
        ],
      },
    ],
  },
  {
    model: "Стіл Rondo",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм", "Ширина у розкладеному вигляді": "1100 мм / 1300 мм / 1500 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 9400 },
          { label: "Ø900 (1300) × 750 мм", price: 9700 },
          { label: "Ø1100 (1500) × 750 мм", price: 10500 },
        ],
        photos: [{ dir: "RONDO SLIDE" }],
      },
    ],
  },
  {
    model: "Стіл Rotaro",
    kinds: [
      {
        type: "Розкладний",
        specs: { ...base(), "Діаметр": "800 мм / 900 мм / 1100 мм", "Діаметр у розкладеному вигляді": "1100 мм / 1300 мм / 1400 мм" },
        sizes: [
          { label: "Ø800 (1100) × 750 мм", price: 9400 },
          { label: "Ø900 (1300) × 750 мм", price: 9800 },
          { label: "Ø1100 (1400) × 750 мм", price: 10500 },
        ],
        photos: [{ dir: "ROTARO SLIDE/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Viro",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1150 мм", "Ширина": "750 мм" },
        sizes: [{ label: "1150 × 750 × 750 мм", price: 9900 }],
        photos: [{ dir: "VIRO/нерозкладний" }],
      },
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "1150 мм / 1400 мм",
          "Довжина у розкладеному вигляді": "1550 мм / 1800 мм / 1950 мм / 2200 мм",
          "Ширина": "750 мм / 850 мм",
        },
        sizes: [
          { label: "1150 (1550) × 750 × 750 мм", price: 12600 },
          { label: "1150 (1950) × 750 × 750 мм", price: 12900 },
          { label: "1400 (1800) × 850 × 750 мм", price: 13900 },
          { label: "1400 (2200) × 850 × 750 мм", price: 14600 },
        ],
        photos: [{ dir: "VIRO/розкладний" }],
      },
    ],
  },
  {
    model: "Стіл Ten",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Діаметр": "1400 мм", "Ширина": "700 мм" },
        sizes: [{ label: "1400 × 700 × 750 мм", price: 9200 }],
        photos: [{ dir: "TEN/нерозкладний" }],
      },
    ],
  },
  {
    model: "Стіл Torin",
    kinds: [
      {
        type: "Нерозкладний",
        specs: { ...base(), "Довжина": "1300 мм", "Ширина": "900 мм" },
        sizes: [{ label: "1300 × 900 × 750 мм", price: 10900 }],
        photos: [{ dir: "TORIN/нерозкладний" }],
      },
    ],
  },
  {
    // Always Розкладний — there is no fixed-size Sherwood. "SHERWOOD 36" is a tabletop thickness,
    // not a second type: it's a real (photographed) axis like Round/Pocker, not baked into the
    // label. 18 мм sizes are listed first so that thickness is the default (розкладний/розкладний
    // folder holds 18 мм, SHERWOOD SLIDE/SHERWOOD 36 holds 36 мм).
    model: "Стіл Sherwood",
    kinds: [
      {
        type: "Розкладний",
        specs: {
          ...base("ЛДСП 18 мм / 36 мм KronoSpan"),
          "Довжина": "900 мм / 1100 мм",
          "Довжина у розкладеному вигляді": "1300 мм / 1500 мм / 1900 мм",
          "Ширина": "650 мм / 700 мм",
        },
        sizes: [
          { label: "900 (1300) × 650 × 750 мм", thickness: "18 мм", price: 9000 },
          { label: "900 (1300) × 650 × 750 мм", thickness: "36 мм", price: 10300 },
          { label: "1100 (1500) × 700 × 750 мм", thickness: "18 мм", price: 9500 },
          { label: "1100 (1500) × 700 × 750 мм", thickness: "36 мм", price: 11000 },
          { label: "1100 (1900) × 700 × 750 мм", thickness: "18 мм", price: 10300 },
          { label: "1100 (1900) × 700 × 750 мм", thickness: "36 мм", price: 11700 },
        ],
        photos: [
          { dir: "SHERWOOD SLIDE/розкладний", thickness: "18 мм" },
          { dir: "SHERWOOD SLIDE/SHERWOOD 36", thickness: "36 мм" },
        ],
      },
    ],
  },
  {
    // No нерозкладний kind: VEGAS SLIDE/ only ships the розкладний renders — see UNRESOLVED.
    model: "Стіл Vegas",
    kinds: [
      {
        type: "Розкладний",
        specs: {
          ...base(),
          "Довжина": "1150 мм / 1400 мм",
          "Довжина у розкладеному вигляді": "1550 мм / 1800 мм / 1950 мм / 2200 мм",
          "Ширина": "750 мм / 850 мм",
        },
        sizes: [
          { label: "1150 (1550) × 750 × 750 мм", price: 11900 },
          { label: "1150 (1950) × 750 × 750 мм", price: 12600 },
          { label: "1400 (1800) × 850 × 750 мм", price: 13400 },
          { label: "1400 (2200) × 850 × 750 мм", price: 13900 },
        ],
        photos: [{ dir: "VEGAS SLIDE/розкладний" }],
      },
    ],
  },
];

// Products in the price list with no photo folder we could identify, and photo folders with no
// price list entry. Left out of the import on purpose — see TABLES_IMPORT.md for what each needs.
export const UNRESOLVED = [
  { what: "Kardinal (обидва типи)", missing: "KARDINAL SLIDE/ has two un-suffixed 33-photo blocks and no Slide-specific extended render — cannot tell which block belongs to which type" },
  { what: "Lite (обидва типи)", missing: "same as Kardinal: LITE SLIDE/ is flat, so the two blocks cannot be split between нерозкладний and розкладний" },
  { what: "Rondo — нерозкладний", missing: "photos — RONDO SLIDE/ holds only the slide kind's two views (…, …_ext)" },
  { what: "Ralf — нерозкладний", missing: "photos — RALF SLIDE/ has only розкладений" },
  { what: "Next — нерозкладний", missing: "photos — NEXT SLIDE/ has only розкладний" },
  { what: "Torin — розкладний", missing: "photos — TORIN/ has only нерозкладний (its 2 blocks are that kind's two views)" },
  { what: "Rotaro — нерозкладний", missing: "characteristics and prices — ROTARO SLIDE/нерозкладний has photos, the price list has no fixed-size Rotaro" },
  { what: "Vegas — нерозкладний", missing: "photos — VEGAS SLIDE/ has only розкладний" },
  { what: "Sherwood Round", missing: "photos — no folder in the dump matches this (round, Ø900/1100) model; the price list now has characteristics and prices" },
];
