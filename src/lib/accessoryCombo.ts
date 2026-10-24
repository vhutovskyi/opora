// Canonical key for "which accessory upgrades are currently selected" — the axis the bed's
// combo photo sets are stored under. Colour is deliberately excluded: an accessory's colour
// never changes how the bed looks in these photos, only its non-colour axes do (rail length,
// drawer side material). Shared by the storefront lookup and the admin upload grid.

import { isHexColor, optKind } from "@/app/catalog/[slug]/components/types";

type Opt = { name: string; value: string };

// The accessory's upgrade value = the value on its `combo_axis` axis (products.combo_axis), e.g.
// «Короб» for Шухляда or «Розмір» for Планка безпеки. Everything else about the accessory — its
// colour, its material, its own size — deliberately does NOT affect the host product's photos.
export function axisValue(options: Opt[], axis: string | null | undefined): string {
  if (!axis) return "";
  const hit = options.find((o) => optKind(o) === axis);
  return hit && hit.value && !isHexColor(hit.value) ? hit.value : "";
}

// Keyed by the accessory PRODUCT id, not the product_accessories link id: the same «Планка
// безпеки» serves many beds, so a combo resolved once (e.g. by the folder importer) is valid for
// every bed, and re-linking an accessory doesn't orphan its uploaded photos.
// Quantity is part of the key because it changes the photo: «Нота Бене» ships 1-, 2- and 4-drawer
// shots of the same drawer option, which would otherwise collapse onto one set.
// Parts of the SAME accessory product (and quantity) merge into one entry with their values
// "+"-joined: Лаос links «Планка безпеки» TWICE — a small one and a large one — and its
// «з одинарною малою та великою планками» folder is a single photo set, so both the storefront's
// two selections and the importer's two pattern matches must produce the identical key.
export function comboKeyOf(parts: { accessoryProductId: string; qty?: number; sig: string }[]): string {
  const merged = new Map<string, { id: string; qty: number; sigs: Set<string> }>();
  for (const p of parts) {
    if (!p.sig) continue;
    // `|| 1` not just Math.max: a missing/NaN qty must fall back to 1, not poison the key.
    const qty = Math.max(1, Number(p.qty) || 1);
    const key = `${p.accessoryProductId}:${qty}`;
    const entry = merged.get(key) ?? { id: p.accessoryProductId, qty, sigs: new Set<string>() };
    for (const s of p.sig.split("+")) entry.sigs.add(s); // idempotent on already-merged sigs
    merged.set(key, entry);
  }
  return [...merged.values()]
    .map((e) => `${e.id}:${e.qty}:${[...e.sigs].sort().join("+")}`)
    .sort()
    .join("|");
}

// The same key with the quantity dropped. Most beds are photographed with ONE of an accessory
// («З дерев'яними шухлядами», no count), so asking for 2 would find nothing; falling back to the
// quantity-agnostic key keeps those photos on screen. Beds shot per count («Нота Бене» 1/2/4)
// still win on the exact key, which is tried first.
export function comboKeyIgnoringQty(key: string): string {
  return key
    .split("|")
    .map((part) => {
      const [accessoryProductId, , ...sig] = part.split(":");
      return `${accessoryProductId}:${sig.join(":")}`; // a value may itself contain ":"
    })
    .sort()
    .join("|");
}

export function accessoryComboKey(
  parts: { accessoryProductId: string; qty?: number; comboAxis?: string | null; options: Opt[] }[]
): string {
  return comboKeyOf(
    parts.map((p) => ({
      accessoryProductId: p.accessoryProductId,
      qty: p.qty,
      sig: axisValue(p.options, p.comboAxis),
    }))
  );
}

// Every combination the admin can upload photos for: each accessory either off or set to one of
// its values (× each allowed quantity), minus the all-off case — that's the plain bed gallery.
export function enumerateCombos(
  accessories: { accessoryProductId: string; label: string; values: string[]; maxQty?: number }[]
): { comboKey: string; label: string }[] {
  let acc: { accessoryProductId: string; qty: number; sig: string; label: string }[][] = [[]];
  for (const a of accessories) {
    const quantities = Array.from({ length: Math.max(1, a.maxQty ?? 1) }, (_, i) => i + 1);
    const picks = a.values.flatMap((v) =>
      quantities.map((qty) => ({
        accessoryProductId: a.accessoryProductId,
        qty,
        sig: v,
        label: `${a.label}${qty > 1 ? ` ×${qty}` : ""}: ${v}`,
      }))
    );
    acc = acc.flatMap((row) => [row, ...picks.map((p) => [...row, p])]);
  }
  const seen = new Set<string>();
  return acc
    .filter((row) => row.length > 0)
    .map((row) => ({ comboKey: comboKeyOf(row), label: row.map((p) => p.label).join(" + ") }))
    // Two links to the same accessory with the same value give one key — we don't duplicate the entry.
    .filter((c) => c.comboKey && !seen.has(c.comboKey) && seen.add(c.comboKey));
}
