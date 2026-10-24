import { parseModelSize, parseModelLamels, WHITE_LEGS_OPTION, type DetectedColor } from "@/lib/estella/folderImport";
import { BOOL_NO, BOOL_YES } from "@/lib/constants";
import { saveCatalog, ensureSubcategoryPath } from "../../actions";
import { commitFolderImport, resetEstellaImported } from "./folderImportActions";
import { getCatalogRule } from "./rulesActions";
import { resolveOptionValue } from "@/lib/estella/catalogRules";
import { imageGroupKey } from "@/lib/supabase/imageGroups";
import { offersFor } from "./folderImportUiHelpers";
import type { UiProduct, Mode } from "./folderImportTypes";

// Data from the component that commitOneProduct needs: the catalog list + two callbacks
// (a progress logger and a trigger to re-read the taxonomy after inline catalog creation).
// Subcategories aren't needed here — the path is resolved on the server (ensureSubcategoryPath).
export type CommitDeps = {
  mode: Mode;
  catalogs: string[];
  addLog: (line: string) => void;
  ensureTaxonomyLoaded: () => void;
};

// POST helper for the promote endpoint (same route the XML tab uses).
async function post(body: unknown): Promise<{ error?: string; done?: boolean }> {
  const res = await fetch("/api/admin/estella", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string; done?: boolean };
  if (!res.ok) throw new Error(json.error || "Помилка промоушену");
  return json;
}

async function uploadVariantImages(variantId: string, files: File[], label: string, addLog: (line: string) => void) {
  const formData = new FormData();
  for (const file of files) formData.append("file", file);
  formData.append("variationId", variantId);
  try {
    const res = await fetch("/api/products/media/images", { method: "POST", body: formData });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    addLog(`  ✓ ${label}: ${files.length} фото`);
  } catch (err) {
    addLog(`  ❌ ${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Import ONE product: build variant targets → (attach) promote XML offers → ensure taxonomy →
// commitFolderImport → upload photos. Used by single-mode commit and the batch commit-all loop.
// Throws on hard failure so the caller can mark/skip; per-file upload errors are logged, not thrown.
export async function commitOneProduct(product: UiProduct, deps: CommitDeps) {
  const { mode, catalogs, addLog, ensureTaxonomyLoaded } = deps;
  const useAttach = !!product.attachedTo;
  const tag = mode !== "single" ? `[${product.productName}] ` : "";
  // Custom shared options. Rows with the SAME name → several values of one axis: the variants
  // multiply (a Cartesian product) — every variant × every value (e.g. "Розмір" 190см+200см).
  // One row = a fixed value on all variants. The values go into the sku, so a repeated import
  // with other values creates new variants in the same product instead of matching the old ones.
  const axes: { name: string; values: string[] }[] = [];
  for (const raw of product.customOptions) {
    const name = raw.name.trim();
    const value = raw.value.trim();
    if (!name || !value) continue;
    let axis = axes.find((a) => a.name === name);
    if (!axis) axes.push((axis = { name, values: [] }));
    if (!axis.values.includes(value)) axis.values.push(value);
  }
  // A Cartesian product of the axes → combinations (each one a {name,value}[]). No axes → one empty combination.
  const customCombos = axes.reduce<{ name: string; value: string }[][]>(
    (combos, axis) => combos.flatMap((c) => axis.values.map((value) => [...c, { name: axis.name, value }])),
    [[]]
  );

  type Target = {
    key: string;
    materialValue: string;
    breadcrumb: string; // an intermediate folder level → the product.extraOptionName option (e.g. "Короб" / "Конфігурація")
    colors: DetectedColor[];
    whiteLegs?: boolean; // beds → the "З білими ніжками" checkbox option
    size?: string;
    lamels?: string;
    price: number;
    attachOfferId?: string;
    offer?: any; // temp: store matched offer for rule resolution
    customCombo: { name: string; value: string }[]; // custom options of this variant (one combination)
    extraOptions?: Record<string, string>; // resolved from catalog rules (shared by payload + image grouping)
    files: File[];
    label: string;
  };
  const baseTargets: Omit<Target, "customCombo">[] = [];
  for (const v of product.variants) {
    if (!v.included) continue;
    const colorLabel = v.colors.length ? ` / ${v.colors.map((c) => c.name).join(", ")}` : "";
    const matches = useAttach ? offersFor(product, v) : [];
    if (useAttach && matches.length) {
      for (const o of matches) {
        const size = parseModelSize(o.model) ?? undefined;
        const lamels = parseModelLamels(o.model) ?? undefined;
        baseTargets.push({
          key: `${v.sku}::${o.offer_id}`,
          materialValue: v.materialValue,
          breadcrumb: v.breadcrumb,
          colors: v.colors,
          whiteLegs: v.whiteLegs,
          size,
          lamels,
          price: Number(v.price) > 0 ? Number(v.price) : o.price ?? 0, // manual override → else XML price
          attachOfferId: o.offer_id,
          offer: o, // temp: for rule resolution
          files: v.files,
          label: `${v.materialValue}${size ? ` / ${size}` : ""}${lamels ? ` / ${lamels}` : ""}${colorLabel}`,
        });
      }
    } else {
      baseTargets.push({
        key: v.sku,
        materialValue: v.materialValue,
        breadcrumb: v.breadcrumb,
        colors: v.colors,
        whiteLegs: v.whiteLegs,
        price: Number(v.price) || Number(product.price) || 0,
        files: v.files,
        label: `${v.materialValue || product.productName}${colorLabel}`,
      });
    }
  }
  // Multiplication: every base variant × every combination of custom values.
  const targets: Target[] = baseTargets.flatMap((bt) =>
    customCombos.map((combo) => {
      const suffix = combo.map((c) => c.value).join("::");
      return {
        ...bt,
        key: suffix ? `${bt.key}::${suffix}` : bt.key,
        label: suffix ? `${bt.label} / ${combo.map((c) => c.value).join(" / ")}` : bt.label,
        customCombo: combo,
      };
    })
  );

  // Attach mode: promote the matched XML offers first (idempotent) so their variants
  // (sku = offer_id) exist, then commitFolderImport merges material/size/colours onto them.
  if (useAttach) {
    const offerIds = [...new Set(targets.map((t) => t.attachOfferId).filter(Boolean) as string[])];
    if (offerIds.length) {
      addLog(`${tag}Промоушу ${offerIds.length} XML-варіацій…`);
      await resetEstellaImported(offerIds);
      let done = false;
      while (!done) {
        const res = await post({ action: "promote", scope: "selected", ids: offerIds });
        done = res.done ?? true;
      }
    }
  }

  // Ensure the chosen catalog + the whole subcategory path exist (create missing levels inline),
  // collecting the resolved id chain — the product is linked by id, not by name, because one name
  // can repeat in different branches of the tree.
  const cat = product.catalog.trim();
  const path = product.subcategoryPath.map((s) => s.trim()).filter(Boolean);
  let subcategoryOptionIds: string[] = [];
  if (cat) {
    if (!catalogs.includes(cat)) await saveCatalog({ name: cat });
    if (path.length) subcategoryOptionIds = await ensureSubcategoryPath(cat, path);
    ensureTaxonomyLoaded();
  }

  // Resolve catalog rules for extra options
  addLog(`${tag}Завантажую правила каталогу…`);
  const catalogName = product.catalog.trim();
  const catalogRule = catalogName ? await getCatalogRule(catalogName) : null;

  // Resolve extra options (from catalog rules) per target — shared by the DB payload and image grouping.
  const extraOptionName = product.extraOptionName.trim();
  for (const t of targets) {
    const extraOptions: Record<string, string> = {};
    if (catalogRule && t.offer) {
      for (const optRule of catalogRule.optionRules) {
        const val = resolveOptionValue(optRule, {
          name: product.attachedTo || product.productName,
          model: t.offer.model || "",
          params: t.offer.params || {},
        });
        if (val) extraOptions[`${optRule.optionName}: ${val}`] = val;
      }
    }
    // An intermediate folder level (breadcrumb) → a photo-affecting option (e.g. "Короб" for drawers,
    // "Конфігурація" for beds). Through extraOptions it automatically becomes visual in imageGroupKey.
    if (extraOptionName && t.breadcrumb) {
      extraOptions[`${extraOptionName}: ${t.breadcrumb}`] = t.breadcrumb;
    }
    // Beds: "З білими ніжками" is a checkbox axis (values Так/Ні). Both values are set on every
    // variant of the product, otherwise the axis is unreachable (see parseBedsFolder).
    if (t.whiteLegs !== undefined) {
      const value = t.whiteLegs ? BOOL_YES : BOOL_NO;
      extraOptions[`${WHITE_LEGS_OPTION}: ${value}`] = value;
    }
    // Custom options of this variant (the value combination for this target).
    for (const o of t.customCombo) {
      extraOptions[`${o.name}: ${o.value}`] = o.value;
    }
    t.extraOptions = Object.keys(extraOptions).length > 0 ? extraOptions : undefined;
  }

  addLog(`${tag}Збереження до БД (${targets.length} варіацій)…`);
  const result = await commitFolderImport({
    attachProductName: useAttach ? product.attachedTo! : undefined,
    productName: product.productName,
    catalog: product.catalog.trim(),
    subcategoryOptionIds,
    variants: targets.map((t) => ({
      sku: t.key,
      materialValue: t.materialValue,
      colors: t.colors,
      included: true,
      price: t.price,
      size: t.size,
      lamels: t.lamels,
      extraOptions: t.extraOptions,
      attachOfferId: t.attachOfferId,
      visible: true,
    })),
  });
  if (!result.success) throw new Error(result.error || "Unknown error");
  addLog(`${tag}✓ Товар збережено`);

  // Upload photos ONCE per image-group (Матеріал+Колір+extras — ignores розмір/ламелі). The upload
  // route propagates each image to every sibling variant in the group, so uploading per size/lamels
  // would just re-duplicate. Pick the first created variant of each group as the upload target.
  const seenGroups = new Set<string>();
  const jobs: { variantId: string; files: File[]; label: string }[] = [];
  for (const t of targets) {
    if (t.files.length === 0) continue;
    const variantId = result.variantIdMap[t.key];
    if (!variantId) {
      addLog(`${tag}⚠ ${t.label}: варіація не створена (оффер не промоутнуто?)`);
      continue;
    }
    const groupKey = imageGroupKey([
      t.materialValue ? `Матеріал: ${t.materialValue}` : "",
      ...t.colors.map((c) => `Колір: ${c.name}`),
      ...Object.keys(t.extraOptions ?? {}),
    ].filter(Boolean));
    if (seenGroups.has(groupKey)) continue; // route already spreads this group's photos to the rest
    seenGroups.add(groupKey);
    jobs.push({ variantId, files: t.files, label: t.label });
  }
  // Upload a few variants at once. ponytail: cap at 4 to stay under Worker subrequest/CPU limits.
  const UPLOAD_CONCURRENCY = 4;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        await uploadVariantImages(j.variantId, j.files, j.label, addLog);
      }
    })
  );
}
