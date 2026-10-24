import { parseModelSize } from "./folderImport";

export const ESTELLA_CATALOGS = ["Ліжка", "Шухляди", "Комоди", "Стільці", "Столи", "Тумби"] as const;
// Catalog names are free-form: the 6 above are built-in, but admins can add their own
// (each with a nameMatch regex) via the Rules Manager. Kept as `string` so custom names typecheck.
export type EstellaCatalog = string;

// Built-in name→catalog detection for the 6 hardcoded catalogs (fallback when no DB nameMatch hits).
export function detectCatalog(name: string): EstellaCatalog | null {
  const lower = name.toLowerCase();
  if (/^ліж/i.test(lower)) return "Ліжка";
  if (/^шухляд/i.test(lower)) return "Шухляди";
  if (/^комод/i.test(lower)) return "Комоди";
  if (/^стільц/i.test(lower)) return "Стільці";
  if (/^стол/i.test(lower)) return "Столи";
  if (/^тумб/i.test(lower)) return "Тумби";
  return null;
}

// Data-driven detection: try each catalog's own nameMatch regex first (admin-defined), then the
// hardcoded built-ins. Lets custom catalogs like «Планки безпеки» route their offers to their rules.
export function detectCatalogFromRules(
  name: string,
  rules: { catalog: string; nameMatch?: string | null }[]
): string | null {
  for (const r of rules) {
    if (!r.nameMatch) continue;
    try {
      if (new RegExp(r.nameMatch, "i").test(name)) return r.catalog;
    } catch {
      // invalid admin regex → skip, fall through to built-ins
    }
  }
  return detectCatalog(name);
}

// Option extraction rule — evaluates to 0 or 1 option values per rule.
export type OptionRule = {
  id: string;
  source: "name" | "model" | "param";
  paramKey?: string; // when source === "param"
  match: string; // regex tested against the source text
  optionName: string; // e.g. "Коліщатка", "Відстань між ламелями"
  valueMode: "capture" | "conditional";
  captureTemplate?: string; // e.g. "${1}см" (capture group 1, comma→dot normalised)
  conditionalMatch?: string; // regex re-tested against the same source text
  trueValue?: string; // e.g. "Резинові"
  falseValue?: string; // e.g. "Пластикові"
};

// Split rule — optional catalog-wide rule that groups offers into variants by width.
export type SplitRule = { maxWidth: number; overLabel: string; underLabel: string };

// All rules for one catalog.
export type CatalogRule = {
  id: string;
  catalog: EstellaCatalog;
  nameMatch?: string | null; // regex detecting this catalog from the product name (custom catalogs)
  optionRules: OptionRule[];
  splitRule: SplitRule | null;
};

// Resolves ONE option rule against an offer's fields. Returns null if `match` doesn't hit.
export function resolveOptionValue(
  rule: OptionRule,
  offer: { name: string; model: string; params: Record<string, string> }
): string | null {
  const sourceText = (() => {
    if (rule.source === "name") return offer.name;
    if (rule.source === "model") return offer.model;
    if (rule.source === "param" && rule.paramKey) return offer.params?.[rule.paramKey] || "";
    return "";
  })();

  // Conditional: the option ALWAYS applies — the regex only picks true- vs false-value. The outer
  // `match` must NOT gate it, else non-matching offers get no option at all (falseValue never fires).
  if (rule.valueMode === "conditional") {
    const condRegex = new RegExp(rule.conditionalMatch || rule.match, "i");
    return condRegex.test(sourceText) ? rule.trueValue ?? null : rule.falseValue ?? null;
  }

  // Capture: only extract when `match` hits and a group template exists.
  const m = sourceText.match(new RegExp(rule.match, "i"));
  if (!m || !rule.captureTemplate) return null;
  // Replace ${1}, ${2}, etc. with capture groups; normalize comma decimals to dots.
  let result = rule.captureTemplate;
  for (let i = 1; i < m.length; i++) {
    const groupVal = (m[i] || "").replace(",", ".");
    result = result.replace(`$\{${i}}`, groupVal);
  }
  return result;
}

// Extracts width from a size string like "80x200" and compares against maxWidth.
// Width is the first number (matches parseModelSize output convention).
export function resolveSplitGroup(rule: SplitRule, model: string): { label: string; width: number | null } {
  const sizeStr = parseModelSize(model);
  if (!sizeStr) return { label: rule.underLabel, width: null };

  const [widthStr] = sizeStr.split("x");
  const width = parseInt(widthStr, 10);
  if (!Number.isFinite(width)) return { label: rule.underLabel, width: null };

  return width > rule.maxWidth ? { label: rule.overLabel, width } : { label: rule.underLabel, width };
}
