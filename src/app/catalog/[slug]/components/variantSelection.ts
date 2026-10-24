// Pure variant/option-selection helpers, shared by the main product page and the
// accessory quick-view modal. Parameterized on a VariantSummary[] + the currently active
// variant, rather than closing over a single product — so they work both for the main
// product (summaries, no media) and for accessories (full variants).

import { optionValueRank } from "@/lib/constants";
import { toHue } from "@/lib/utils";
import { Option, OptionGroup, VariantSummary, isHexColor, optKind } from "./types";

// All the numbers in a value: "80x190" → [80,190], "2.5см" → [2.5], "Щит" → []. We compare them in turn,
// so that "160x190" comes before "160x200" instead of ordering by the first number alone.
const numbersIn = (value: string) =>
  (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => parseFloat(n.replace(",", ".")));

// Values without numbers ("Дерев'яні боковини") stay in front, in their original order.
const compareNumerically = (a: string, b: string) => {
  const na = numbersIn(a);
  const nb = numbersIn(b);
  if (!na.length || !nb.length) return na.length - nb.length;
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] ?? -Infinity) - (nb[i] ?? -Infinity);
    if (diff) return diff;
  }
  return 0;
};

// We group the unique options by KIND (Колір / Матеріал …), not by their position in the array.
export function getOptionGroups(variants: VariantSummary[]): OptionGroup[] {
  if (!variants || variants.length === 0) return [];
  const groups = new Map<string, { options: Option[]; seen: Set<string> }>();
  const order: string[] = [];
  for (const v of variants) {
    for (const o of v.options) {
      const key = optKind(o);
      let g = groups.get(key);
      if (!g) {
        g = { options: [], seen: new Set() };
        groups.set(key, g);
        order.push(key);
      }
      if (!g.seen.has(o.value)) {
        g.seen.add(o.value);
        g.options.push(o);
      }
    }
  }
  return order.map((key) => {
    const options = groups.get(key)!.options;
    if (options.every((o) => isHexColor(o.value))) options.sort((a, b) => toHue(b.value) - toHue(a.value));
    // Otherwise: the priority values first (OPTION_VALUE_ORDER), then by the NUMBERS in the value —
    // "70см · 80см · 130см · 140см", not the order in which the variants happened to appear.
    else
      options.sort(
        (a, b) => optionValueRank(a.value) - optionValueRank(b.value) || compareNumerically(a.value, b.value)
      );
    return { key, options };
  });
}

// The current selection as a kind→value map (with an optional override of one kind).
export function selectionByKind(activeVariant: VariantSummary | null, extraKey?: string, extraValue?: string) {
  const m = new Map(activeVariant?.options.map((o) => [optKind(o), o.value]) ?? []);
  if (extraKey !== undefined) m.set(extraKey, extraValue!);
  return m;
}

export function matchesSelection(v: VariantSummary, sel: Map<string, string>) {
  return v.options.every((o) => sel.get(optKind(o)) === o.value);
}

// Finds the variant for the picked option value, taking the current selection of the other options into account.
export function findVariantForOption<V extends VariantSummary>(
  variants: V[],
  activeVariant: VariantSummary | null,
  key: string,
  value: string
): V | undefined {
  const sel = selectionByKind(activeVariant, key, value);
  const exact = variants.find((v) => matchesSelection(v, sel));
  if (exact) return exact;

  // There is no exact match — the axes are tied to each other: for tables every Розмір exists only for its own
  // Тип, so switching the Тип inevitably breaks the picked Розмір. We take not the first variant that happens
  // to carry this option (that would silently reset the colour to the first one), but the one keeping the MOST of the
  // current selection — the colour stays, and only the axis that really is incompatible moves.
  let best: V | undefined;
  let bestScore = -1;
  for (const v of variants) {
    if (!v.options.some((o) => optKind(o) === key && o.value === value)) continue;
    const score = v.options.reduce(
      (n, o) => n + (optKind(o) !== key && sel.get(optKind(o)) === o.value ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

// Whether an option is available (a variant is in stock), taking the current selection of the other options into account.
export function isOptionAvailable(
  variants: VariantSummary[],
  activeVariant: VariantSummary | null,
  key: string,
  value: string
): boolean {
  const sel = selectionByKind(activeVariant, key, value);
  const exact = variants.find((v) => matchesSelection(v, sel));
  if (exact) return Boolean(exact.inStock);
  return variants.some((v) => v.options.some((o) => optKind(o) === key && o.value === value) && v.inStock);
}
