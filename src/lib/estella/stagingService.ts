import { supabaseAdmin } from "@/lib/supabase";

type Offer = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  vendor: string | null;
  color_code: string | null;
  params: Record<string, string>;
};

export async function stageOffers(db: ReturnType<typeof supabaseAdmin>, offers: Offer[], reset: boolean): Promise<number> {
  if (reset) await db.from("estella_offers").delete().neq("offer_id", "");
  if (offers.length) {
    const { error } = await db.from("estella_offers").upsert(
      offers.map((o) => ({
        offer_id: o.offer_id,
        name: o.name,
        model: o.model,
        price: o.price,
        quantity: o.quantity,
        vendor: o.vendor,
        color_code: o.color_code,
        params: o.params ?? {},
      })),
      { onConflict: "offer_id" }
    );
    if (error) throw error;
  }
  return offers.length;
}

export async function markAvailability(
  db: ReturnType<typeof supabaseAdmin>,
  offers: { offer_id: string; price: number | null; quantity: number | null }[],
  reset: boolean
): Promise<number> {
  if (reset) await db.from("estella_offers").update({ available: false }).neq("offer_id", "");
  // Group by identical price+quantity so each distinct combo is one bulk update.
  const groups = new Map<string, { price: number | null; quantity: number | null; ids: string[] }>();
  for (const o of offers) {
    const k = `${o.price}|${o.quantity}`;
    if (!groups.has(k)) groups.set(k, { price: o.price, quantity: o.quantity, ids: [] });
    groups.get(k)!.ids.push(o.offer_id);
  }
  for (const g of groups.values()) {
    const { error } = await db
      .from("estella_offers")
      .update({ available: true, price: g.price, quantity: g.quantity })
      .in("offer_id", g.ids);
    if (error) throw error;
  }
  return offers.length;
}
