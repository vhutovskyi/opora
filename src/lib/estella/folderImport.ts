import { estellaColorParts } from "./colors";
import { comboKeyOf } from "@/lib/accessoryCombo";

type DetectedColor = { code: string; name: string; hex: string };

type VariantCandidate = {
  productName: string;
  materialValue: string; // leaf folder name (Масив / Щит / …) — becomes a non-colour option
  breadcrumb: string; // path from product folder to the leaf, disambiguates duplicate branches
  colors: DetectedColor[]; // 0, 1 or 2 colours (two-tone / dual-code filenames → 2 options)
  colorKey: string; // stable join of codes, for grouping + SKU
  files: File[];
  sku: string;
  whiteLegs?: boolean; // beds only → the "З білими ніжками" checkbox option (undefined = there is no axis)
};

// One folder pick = one product. The picked folder's name is the product name; every leaf
// folder beneath it (however deep) is a variation.
type ProductParse = {
  productName: string;
  variants: VariantCandidate[];
  unassignedFiles: { file: File; breadcrumb: string }[];
  sizeBand?: "single" | "double"; // beds: which XML sizes belong to this product (see SINGLE_BED_RE)
};

function shortHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

// Extract every colour code from a filename, e.g. `..._107-LDSP_102-masyv_1920x1080_19860`
// → [107, 102]. A code is a 3-digit group NOT surrounded by other digits, so dimensions
// like `1920x1080` (would spuriously yield 108) and ids like `19860` are ignored. Each code
// is expanded via estellaColorParts (a single two-tone code like 173 already yields 2 colours).
function detectColors(filename: string): DetectedColor[] {
  const codes = filename.match(/(?<!\d)\d{3}(?!\d)/g) ?? [];
  const result: DetectedColor[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    for (const p of estellaColorParts(code)) {
      if (seen.has(p.hex)) continue;
      seen.add(p.hex);
      result.push({ code, name: p.name, hex: p.hex });
    }
  }
  return result;
}

// Pull the size token out of an XML model string, e.g. «80х200 106 Щит Л4» → «80x200».
// Separator may be Latin x, Cyrillic х or ×; normalise to Latin x. Returns null if absent.
export function parseModelSize(model: string): string | null {
  const m = model.match(/(\d{2,3})\s*[xх×]\s*(\d{2,4})/i);
  return m ? `${m[1]}x${m[2]}` : null;
}

// Pull the lamel token out of an XML model string, e.g. «80х200 106 Щит Л4» → «4см»,
// «… Л2,5» → «2.5см» (Ламелі option). Comma decimal → dot. Returns null if absent.
export function parseModelLamels(model: string): string | null {
  const m = model.match(/Л\s*(\d+(?:[,.]\d+)?)/);
  return m ? `${m[1].replace(",", ".")}см` : null;
}

// Beds only: the real colour code is the 3-digit group right before the material token
// (…_104-masyv_… / …_104-shchyt_…). Any later 3-digit group is a CONFIG number — ЛДСП 102/107,
// planka sizes — NOT a colour, so the generic detectColors (grabs every 3-digit group) would
// wrongly add e.g. 102=Бук / 107=Білий as a phantom second colour. Handles the masyv/masiv and
// shchyt/shzhyt spelling variants seen in the feed. Falls back to detectColors if not matched.
const BED_COLOR_RE = /(\d{3})-(?:mas[yi]v|sh[cz]hyt)/i;
function detectBedColors(filename: string): DetectedColor[] {
  const m = filename.match(BED_COLOR_RE);
  if (!m) return detectColors(filename);
  const result: DetectedColor[] = [];
  const seen = new Set<string>();
  for (const p of estellaColorParts(m[1])) {
    if (seen.has(p.hex)) continue;
    seen.add(p.hex);
    result.push({ code: m[1], name: p.name, hex: p.hex });
  }
  return result;
}

function isImageFile(file: File): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(file.name);
}

function getPathSegments(relativePath: string): string[] {
  return relativePath.split("/").filter((s) => s.length > 0);
}

// Identify leaf folders: a folder is a leaf if it contains only image files
// (no subfolders with more images). Parse by building a path tree and marking leaves.
function buildFolderTree(files: File[]): Map<string, boolean> {
  const folders = new Map<string, boolean>(); // path → isLeaf
  const hasChildren = new Set<string>();

  for (const file of files) {
    const segments = getPathSegments(file.webkitRelativePath);
    for (let i = 0; i < segments.length - 1; i++) {
      const folderPath = segments.slice(0, i + 1).join("/");
      if (!folders.has(folderPath)) folders.set(folderPath, true); // assume leaf initially
      if (i < segments.length - 2) hasChildren.add(folderPath); // this folder has subfolders
    }
  }
  for (const folder of hasChildren) folders.set(folder, false);
  return folders;
}

// Group a product's image files into variations. `productName` is segment 0 of the paths that
// `segmentsOf` returns; every leaf folder beneath it → a variation (grouped by material + colour).
// Files sitting directly in the product folder (depth 2, no material subfolder) become ONE default
// variant with materialValue "" — this is the common "folder of photos, no material layer" shape.
function groupIntoVariants(files: File[], segmentsOf: (f: File) => string[]): { variants: VariantCandidate[]; unassignedFiles: { file: File; breadcrumb: string }[] } {
  const productName = segmentsOf(files[0])[0] ?? "Новий товар";
  const leafFolders = buildFolderTree(files.map((f) => ({ webkitRelativePath: segmentsOf(f).join("/") } as File)));

  const variants: VariantCandidate[] = [];
  const unassignedFiles: { file: File; breadcrumb: string }[] = [];

  const findOrPush = (materialValue: string, breadcrumb: string, colors: DetectedColor[], colorKey: string, file: File) => {
    let variant = variants.find((v) => v.materialValue === materialValue && v.colorKey === colorKey && v.breadcrumb === breadcrumb);
    if (!variant) {
      // Hash the ORIGINAL (non-slugged) fields — Cyrillic names would slug to "" and collide,
      // which both breaks React keys and (worse) makes the DB idempotency guard skip variants.
      const sku = `est-${colorKey || "nc"}-${shortHash([productName, materialValue, breadcrumb, colorKey].join("|"))}`;
      variant = { productName, materialValue, breadcrumb, colors, colorKey, files: [], sku };
      variants.push(variant);
    }
    variant.files.push(file);
  };

  for (const file of files) {
    const segments = segmentsOf(file);

    // Find the deepest leaf-folder ancestor below the product (folderPath length ≥ 2).
    let matched = false;
    for (let i = segments.length - 1; i >= 2; i--) {
      const folderPath = segments.slice(0, i).join("/");
      if (leafFolders.get(folderPath) !== true) continue;

      const materialValue = segments[i - 1];
      const breadcrumb = segments.slice(1, i - 1).join(" / ");
      const colors = detectColors(file.name);
      findOrPush(materialValue, breadcrumb, colors, colors.map((c) => c.code).join("-"), file);
      matched = true;
      break;
    }

    // Photo directly in the product folder (no material subfolder) → default variant, material "".
    if (!matched && segments.length === 2) {
      const colors = detectColors(file.name);
      findOrPush("", "", colors, colors.map((c) => c.code).join("-"), file);
      matched = true;
    }

    if (!matched) {
      unassignedFiles.push({ file, breadcrumb: segments.slice(1).join(" / ") });
    }
  }

  return { variants, unassignedFiles };
}

// Parse a single picked product folder. Root segment = product name; every leaf folder
// beneath it → a variation (grouped by material + detected colour).
export function parseProductFolder(fileList: FileList): ProductParse | null {
  const files = Array.from(fileList).filter(isImageFile);
  if (files.length === 0) return null;

  const productName = getPathSegments(files[0].webkitRelativePath)[0] ?? "Новий товар";
  const { variants, unassignedFiles } = groupIntoVariants(files, (f) => getPathSegments(f.webkitRelativePath));
  return { productName, variants, unassignedFiles };
}

// Parse a picked PARENT folder holding many product subfolders — each top-level subfolder
// (segment 1) becomes its own product. Rebases each file's path so the shared grouper sees
// the product folder as segment 0, then reuses the same leaf/material/colour logic per product.
export function parseBatchFolder(fileList: FileList): ProductParse[] {
  const files = Array.from(fileList).filter(isImageFile);
  if (files.length === 0) return [];

  const byProduct = new Map<string, File[]>();
  for (const file of files) {
    const name = getPathSegments(file.webkitRelativePath)[1];
    if (!name) continue; // file directly in the picked root, no product folder — skip
    if (!byProduct.has(name)) byProduct.set(name, []);
    byProduct.get(name)!.push(file);
  }

  const products: ProductParse[] = [];
  for (const [productName, groupFiles] of byProduct) {
    const { variants, unassignedFiles } = groupIntoVariants(
      groupFiles,
      (f) => [productName, ...getPathSegments(f.webkitRelativePath).slice(2)]
    );
    products.push({ productName, variants, unassignedFiles });
  }
  products.sort((a, b) => a.productName.localeCompare(b.productName, "uk"));
  return products;
}

// ── Beds constructor ───────────────────────────────────────────────────────────
// Beds nest inconsistently (0–3 wrapper/model folders before the packaging folder, then 0–2
// config folders, then the Масив/Щит leaf) and split Каркас/З матрацом/З постіллю into sibling
// folders. Those three are NOT separate variants — they're the same bed/colour shot in 3 setups,
// merged into ONE variant carrying all 3 photos (ordered З постіллю → Каркас → З матрацом), paired
// by colour code. Anchors ENTIRELY on the packaging keyword (каркас/матрац/постіл), never on
// container/wrapper folder NAMES — any number of container folders (a picked BEDS parent, a
// picked family folder, a picked single model folder, renamed or not) before the packaging
// folder all resolve the same way: the segment immediately before packaging is the model
// identity («Аммі з білими ніжками»); if packaging IS that segment (no separate identity
// folder), the model name is the packaging segment with the packaging phrase stripped
// («Дует Плюс з постіллю» → «Дует Плюс»).

const PACKAGING_RE = /каркас|матрац|постіл/i;

function normalizePackaging(segment: string): string {
  if (/каркас/i.test(segment)) return "Каркас";
  if (/матрац/i.test(segment)) return "З матрацом";
  if (/постіл/i.test(segment)) return "З постіллю";
  return "";
}

const PACKAGING_STRIP_RE = /\s*(каркас|з матрацом|з постіллю).*$/i;

// «Аммі з білими ніжками» is a sibling folder branch of the SAME bed, not another model and not an
// upgrade: strip it from the model name (so both branches land on one product) and turn it into the
// «З білими ніжками» checkbox option instead.
// \S* not \w* — \w is ASCII-only in JS, so «білими» would never match.
const WHITE_LEGS_RE = /\s*(?:з\s+)?б[іи]л\S*\s+ніжк\S*/i;

// The option axis for this branch — the "З білими ніжками: Так/Ні" checkbox (see BOOL_YES/BOOL_NO).
export const WHITE_LEGS_OPTION = "З білими ніжками";

// "Венеція Люкс односпальне" is a SEPARATE product (just like the folder), not an option. For beds the XML is
// split by the "Ліжка" catalog's splitRule (maxWidth 90) into "… Односпальне"/"… Двоспальне", so the folders
// also have to be told whose sizes these are: the single product takes widths ≤ 90, its pair — > 90. A product
// WITHOUT a pair is not filtered: one folder legitimately covers every size of the model.
const SINGLE_BED_RE = /\s*односпальне/i;
export const SINGLE_BED_MAX_WIDTH = 90;

// Strip a leading model prefix from a config folder name and capitalize the remainder,
// e.g. prefix «Дует Плюс», folder «Дует Плюс з дерев'яними шухлядами» → «З дерев'яними шухлядами».
// A config folder equal to the prefix (the plain, no-config variant) → "" (no config option).
function cleanConfig(segment: string, prefix: string): string {
  const rest = (segment.startsWith(prefix) ? segment.slice(prefix.length) : segment).trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}

// Pure mapping: FULL folder chain from whatever was picked (picked-root → … → material leaf,
// NO wrapper-stripping done by the caller) + filename → the 4 bed axes. Exported for a standalone
// assert-based check (no File/DOM needed).
export function deriveBedVariant(
  folderChain: string[],
  filename: string
): {
  baseModel: string;
  packaging: string;
  config: string;
  material: string;
  colors: DetectedColor[];
  whiteLegs: boolean;
} {
  const material = folderChain[folderChain.length - 1] ?? "";
  const pkgIdx = folderChain.findIndex((s) => PACKAGING_RE.test(s));
  const packaging = pkgIdx >= 0 ? normalizePackaging(folderChain[pkgIdx]) : "";

  // Model identity = the segment right before packaging (works no matter how many container
  // folders precede it — «Дует Плюс»/«Аммі»/«Аммі з білими ніжками» all land here correctly,
  // regardless of pick depth or what any wrapper folder happens to be named).
  // If packaging IS the first segment (no separate identity folder above it), strip the
  // packaging phrase from it instead.
  const identityIdx = pkgIdx > 0 ? pkgIdx - 1 : 0;
  const rawModel =
    pkgIdx === 0
      ? (folderChain[0] || "").replace(PACKAGING_STRIP_RE, "").trim() || folderChain[0] || "Новий товар"
      : folderChain[identityIdx] || "Новий товар";
  // White legs live in their own folder branch («Аммі» / «Аммі з білими ніжками» / …-з-постіллю / …):
  // same product, extra option. Strip the phrase so both branches group under one model.
  const whiteLegs = folderChain.some((s) => WHITE_LEGS_RE.test(s));
  const baseModel = whiteLegs ? rawModel.replace(WHITE_LEGS_RE, "").trim() || rawModel : rawModel;

  // config-name prefix to strip: the model name AS IT APPEARS in the packaging segment. For «з білими
  // ніжками» the inner folders drop that suffix (packaging «Аммі з матрацом», config «Аммі …»), so the
  // outer baseModel wouldn't match — the packaging segment's own model prefix does.
  const innerModel = pkgIdx >= 0 ? folderChain[pkgIdx].replace(PACKAGING_STRIP_RE, "").trim() : baseModel;

  // config: segments strictly between the packaging segment and the material leaf.
  const configStart = pkgIdx >= 0 ? pkgIdx + 1 : identityIdx + 1;
  const config = folderChain
    .slice(configStart, folderChain.length - 1)
    .map((s) => cleanConfig(s, innerModel))
    .filter(Boolean)
    .join(" / ");

  return { baseModel, packaging, config, material, colors: detectBedColors(filename), whiteLegs };
}

// Photo order within a merged variant: З постіллю (main/thumbnail) → Каркас → З матрацом.
const PACKAGING_ORDER = ["З постіллю", "Каркас", "З матрацом"];

// Parse a picked folder tree (BEDS parent, a wrapper, or a single model) into bed products.
// Groups by base model across wrappers; variant identity = material + colour (packaging does NOT
// split variants — its 3 folders merge into one variant's photos, ordered by packaging). Config
// (upgrade) folders are skipped entirely: only the plain bed's З постіллю/Каркас/З матрацом photos.
export function parseBedsFolder(fileList: FileList): ProductParse[] {
  const files = Array.from(fileList).filter(isImageFile);
  if (files.length === 0) return [];

  const products = new Map<string, ProductParse>();
  // Per-variant photo buckets keyed by packaging, so photo order is deterministic regardless of
  // the browser's directory-enumeration order. Flattened into variant.files after the loop.
  const filesByPackaging = new Map<VariantCandidate, Map<string, File[]>>();
  for (const file of files) {
    // Full chain from whatever was picked (BEDS parent, a family folder, or a single model),
    // filename dropped. deriveBedVariant anchors on the packaging keyword itself, so no
    // wrapper-name detection is needed here — any number of leading container folders resolve
    // correctly regardless of what they're named.
    const segments = getPathSegments(file.webkitRelativePath);
    const chain = segments.slice(0, -1);
    if (chain.length < 2) continue; // need at least [model, material]

    const { baseModel, packaging, config, material, colors, whiteLegs } = deriveBedVariant(chain, file.name);
    // Upgrades (drawers, a lifting mechanism…) are NOT imported — they used to be photo-carrier variants that
    // only duplicated images in R2. The accessory photos are uploaded by the admin by hand in the product editor.
    if (config) continue;
    const colorKey = colors.map((c) => c.code).join("-");

    let product = products.get(baseModel);
    if (!product) {
      product = { productName: baseModel, variants: [], unassignedFiles: [] };
      products.set(baseModel, product);
    }
    let variant = product.variants.find(
      (v) => v.breadcrumb === config && v.materialValue === material && v.colorKey === colorKey && !!v.whiteLegs === whiteLegs
    );
    if (!variant) {
      const sku = `bed-${colorKey || "nc"}-${shortHash([baseModel, config, material, colorKey, whiteLegs ? "wl" : ""].join("|"))}`;
      variant = { productName: baseModel, materialValue: material, breadcrumb: config, colors, colorKey, files: [], sku, whiteLegs: whiteLegs || undefined };
      product.variants.push(variant);
      filesByPackaging.set(variant, new Map());
    }
    const buckets = filesByPackaging.get(variant)!;
    if (!buckets.has(packaging)) buckets.set(packaging, []);
    buckets.get(packaging)!.push(file);
  }

  // Flatten each variant's packaging buckets into files, З постіллю → Каркас → З матрацом
  // (any unexpected packaging value falls through last, preserving its own insertion order).
  for (const [variant, buckets] of filesByPackaging) {
    const ordered = [...buckets.keys()].sort(
      (a, b) => (PACKAGING_ORDER.indexOf(a) + 1 || 99) - (PACKAGING_ORDER.indexOf(b) + 1 || 99)
    );
    // Base variant (config="") = the plain model subfolder's own photos, one per packaging bucket
    // (постіль → каркас → матрац). That's the default gallery; Estella's base render is what it is.
    variant.files = ordered.flatMap((pkg) => buckets.get(pkg)!);
  }

  // Products WITH a white-legs branch: mark the rest explicitly `false`, so BOTH values of the
  // «З білими ніжками» axis exist. Without a value on every variant the storefront resolves any
  // choice onto the first (plain) variant — matchesSelection ignores axes a variant lacks.
  // Products with no such branch keep `undefined` → no checkbox at all.
  for (const p of products.values()) {
    if (!p.variants.some((v) => v.whiteLegs)) continue;
    for (const v of p.variants) v.whiteLegs = !!v.whiteLegs;
  }

  // The pair "Венеція Люкс" + "Венеція Люкс односпальне": each gets its own width range. A product without a pair
  // stays without a sizeBand → it takes every XML size, as before.
  const singleBases = new Set(
    [...products.keys()].filter((n) => SINGLE_BED_RE.test(n)).map((n) => n.replace(SINGLE_BED_RE, "").trim())
  );
  for (const [name, p] of products) {
    if (SINGLE_BED_RE.test(name)) p.sizeBand = "single";
    else if (singleBases.has(name)) p.sizeBand = "double";
  }

  return [...products.values()].sort((a, b) => a.productName.localeCompare(b.productName, "uk"));
}

// ── Combo (upgrade) photos ─────────────────────────────────────────────────────
// The mirror image of parseBedsFolder: it keeps ONLY the config (upgrade) folders that
// parseBedsFolder throws away, because those photos are the bed shown with an accessory
// installed. They don't become variants — they become accessory_combo_photos sets, keyed by
// the same imageGroupKey the plain photos use, so each material/colour keeps its own set.

export type BedComboParse = {
  baseModel: string;
  config: string;          // upgrade folder text, e.g. «З шухлядами ЛДСП 102 та великою планкою»
  groupOptionNames: string[]; // «Матеріал: Щит», «Колір: Горіх світлий», «З білими ніжками: Ні»
  groupLabel: string;
  files: File[];
};

// Beds only: group every upgrade photo by (model, config, material+colour+whiteLegs). Photo order
// within a group follows PACKAGING_ORDER, same as the plain variant photos.
export function parseBedCombos(fileList: FileList, boolYes: string, boolNo: string): BedComboParse[] {
  const files = Array.from(fileList).filter(isImageFile);
  const groups = new Map<string, BedComboParse & { byPackaging: Map<string, File[]> }>();
  // A product only gets the «З білими ніжками» axis if that folder branch exists — matching
  // parseBedsFolder, otherwise the key wouldn't line up with the variants already in the DB.
  const modelsWithWhiteLegs = new Set<string>();
  const parsed: { chain: string[]; file: File; derived: ReturnType<typeof deriveBedVariant> }[] = [];

  for (const file of files) {
    const chain = getPathSegments(file.webkitRelativePath).slice(0, -1);
    if (chain.length < 2) continue;
    const derived = deriveBedVariant(chain, file.name);
    if (!derived.config) continue; // plain bed photos — parseBedsFolder's job
    if (derived.whiteLegs) modelsWithWhiteLegs.add(derived.baseModel);
    parsed.push({ chain, file, derived });
  }

  for (const { file, derived } of parsed) {
    const { baseModel, config, material, colors, whiteLegs, packaging } = derived;
    // White-legs shots carry a TWO-TONE colour code (171-180 → base + Білий), but the DB models
    // the white part as the «З білими ніжками» checkbox with a single Колір. Keeping both would
    // build a group key that matches no variant, so drop the Білий component on that branch.
    const effectiveColors =
      whiteLegs && colors.length > 1 ? colors.filter((c) => c.name !== "Білий") || colors : colors;
    const groupOptionNames = [
      material ? `Матеріал: ${material}` : "",
      ...(effectiveColors.length ? effectiveColors : colors).map((c) => `Колір: ${c.name}`),
      modelsWithWhiteLegs.has(baseModel) ? `${WHITE_LEGS_OPTION}: ${whiteLegs ? boolYes : boolNo}` : "",
    ].filter(Boolean);
    const key = `${baseModel}|${config}|${groupOptionNames.join("|")}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        baseModel,
        config,
        groupOptionNames,
        groupLabel: [material, ...colors.map((c) => c.name), whiteLegs ? "білі ніжки" : ""].filter(Boolean).join(" · "),
        files: [],
        byPackaging: new Map(),
      };
      groups.set(key, group);
    }
    if (!group.byPackaging.has(packaging)) group.byPackaging.set(packaging, []);
    group.byPackaging.get(packaging)!.push(file);
  }

  return [...groups.values()].map(({ byPackaging, ...g }) => {
    const ordered = [...byPackaging.keys()].sort(
      (a, b) => (PACKAGING_ORDER.indexOf(a) + 1 || 99) - (PACKAGING_ORDER.indexOf(b) + 1 || 99)
    );
    return { ...g, files: ordered.flatMap((pkg) => byPackaging.get(pkg)!) };
  });
}

// Which accessory option value each upgrade folder means. Matching is by VALUE pattern rather than
// by accessory name, so one rule resolves both "which accessory" and "which of its options" —
// whichever linked accessory owns a matching value wins. Mapping given by the shop owner:
//   велика планка → подвійна 134 см · мала планка → подвійна 96 см
//   одинарна велика → 130-140 см · одинарна мала → 70-80 см
//   дерев'яні шухляди → Дерев'яні боковини · шухляди ЛДСП 1xx → ЛДСП 1xx
// «Одинарн» scopes POSITIONALLY: every rail word after it is a single rail, every one before it a
// double. The real folder names need exactly that — «З малою планкою та одинарною великою планкою»
// is a double 96 + a single 130-140, while «З одинарною малою та великою планками» is two singles
// sharing one «одинарною». A whole-string flag got the mixed ones wrong.
// A leading count («З 4 шухлядами ЛДСП 102») is the accessory QUANTITY, not another option —
// «Нота Бене» ships 1/2/4-drawer shots of the same option and they must not share a photo set.
export function bedConfigParts(config: string): { pattern: RegExp; qty: number }[] {
  const parts: { pattern: RegExp; qty: number }[] = [];
  const drawerQty = Number(config.match(/(\d+)\s+(?:\S+\s+)?шухляд/i)?.[1] ?? 1) || 1;
  if (/дерев/i.test(config)) parts.push({ pattern: /дерев/i, qty: drawerQty });
  const ldsp = config.match(/ЛДСП\s*(\d+)/i);
  if (ldsp) parts.push({ pattern: new RegExp(`ЛДСП\\s*${ldsp[1]}`, "i"), qty: drawerQty });
  const singleFrom = config.search(/одинарн/i);
  for (const m of config.matchAll(/велик|мал/gi)) {
    const single = singleFrom >= 0 && (m.index ?? 0) > singleFrom;
    parts.push({ pattern: /велик/i.test(m[0]) ? (single ? /130|140/ : /134/) : single ? /70|80/ : /96/, qty: 1 });
  }
  // Same rail twice in one name would be one value, not two.
  return parts.filter((p, i) => parts.findIndex((o) => o.pattern.source === p.pattern.source) === i);
}

// One linked accessory as the combo resolver needs it: every non-colour option value it offers,
// grouped by axis, plus the axis already learned for it (null until the first import).
export type ComboAccessory = {
  accessoryProductId: string;
  label: string;
  comboAxis: string | null;
  maxQty?: number;
  byAxis: Map<string, Set<string>>;
};

// Upgrade folder name → the combo key(s) it stands for, plus which axis each accessory matched on.
// The axis is DISCOVERED here rather than configured: on the real catalogue no folder name matches
// values on two different axes of the same accessory, so whichever axis matched is the upgrade one
// («Короб» for Шухляда, «Розмір» for Планка безпеки). Once known it is stored on the accessory
// product and reused (and then only that axis is searched).
export function resolveComboForConfig(
  config: string,
  accessories: ComboAccessory[]
): { comboKeys: string[]; label: string; axes: Map<string, string> } | null {
  const parts = bedConfigParts(config);
  if (!parts.length) return null;

  const perPart = parts.map((part) =>
    accessories.flatMap((a) =>
      [...a.byAxis]
        .filter(([axis]) => !a.comboAxis || axis === a.comboAxis)
        .flatMap(([axis, values]) =>
          [...values].filter((v) => part.pattern.test(v)).map((v) => ({ a, v, axis, qty: part.qty }))
        )
    )
  );
  if (perPart.some((m) => m.length === 0)) return null; // this bed doesn't link that accessory

  // A pattern can legitimately match SEVERAL values (Лаос: «одинарна мала планка» is both 70см and
  // 80см — the length follows the bed's width, the photo is the same), so the set is linked to every
  // resulting combination; otherwise half the customer's choices would show no upgrade photo.
  let rows: { a: ComboAccessory; v: string; axis: string; qty: number }[][] = [[]];
  for (const matches of perPart) rows = rows.flatMap((r) => matches.map((m) => [...r, m]));

  const comboKeys = new Set<string>();
  for (const row of rows) {
    // comboKeyOf merges matches on the same accessory (Лаос: a small AND a large single rail).
    const key = comboKeyOf(row.map((m) => ({ accessoryProductId: m.a.accessoryProductId, qty: m.qty, sig: m.v })));
    if (key) comboKeys.add(key);
  }
  if (!comboKeys.size) return null;

  const label = rows[0].map((m) => `${m.a.label}${m.qty > 1 ? ` ×${m.qty}` : ""}: ${m.v}`).join(" + ");
  return {
    comboKeys: [...comboKeys],
    label: comboKeys.size > 1 ? `${label} (+${comboKeys.size - 1})` : label,
    axes: new Map(rows[0].map((m) => [m.a.accessoryProductId, m.axis])),
  };
}

export type { DetectedColor, VariantCandidate, ProductParse };
