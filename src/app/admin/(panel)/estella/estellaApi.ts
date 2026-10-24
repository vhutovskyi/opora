import type { ApiResp, Offer } from "./estellaTypes";

export const STAGE_BATCH = 500;

const numOrNull = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Parse an Estella feed in-browser via native DOMParser (zero deps).
// ponytail: holds the whole file in a DOM — fine for tens of MB on a desktop;
// if the feed outgrows browser memory, switch to a streaming SAX parser.
export function parseOffers(xml: string): Offer[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const offers: Offer[] = [];
  for (const el of Array.from(doc.querySelectorAll("offer"))) {
    const offer_id = el.getAttribute("Id") ?? el.getAttribute("id") ?? "";
    if (!offer_id) continue;
    const child = (tag: string) => el.querySelector(tag)?.textContent?.trim() ?? "";
    const params: Record<string, string> = {};
    let color_code: string | null = null;
    for (const p of Array.from(el.querySelectorAll("param"))) {
      const name = p.getAttribute("name")?.trim();
      if (!name) continue;
      const value = p.textContent?.trim() ?? "";
      params[name] = value;
      if (name === "Колір") color_code = value || null;
    }
    offers.push({
      offer_id,
      name: child("name"),
      model: child("model"),
      price: numOrNull(child("price")),
      quantity: numOrNull(child("quantity")),
      vendor: child("vendor") || null,
      color_code,
      params,
    });
  }
  return offers;
}

export async function postEstella(body: unknown): Promise<ApiResp> {
  const res = await fetch("/api/admin/estella", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResp;
  if (!res.ok) throw new Error(json.error || "Помилка");
  return json;
}
