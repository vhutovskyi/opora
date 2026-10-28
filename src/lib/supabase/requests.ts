import type { CartItem } from "@/store/cartStore";
import { ClientRequest } from "./types";
import { supabaseAdmin, UUID_RE } from "./client";
import { variantPricing, type PricedVariant } from "./variantRules";

// A client helper — POSTs to /api/requests (the server writes to Supabase).
export async function createRequest(request: ClientRequest) {
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Failed to create request");
  return response.json();
}

type RequestFields = {
  name: string;
  phone_number: string;
  order_number: string;
  delivery: string | null;
  delivery_city: string | null;
  delivery_warehouse: string | null;
  orders: unknown[] | null;
};

// The server-side write of a request into Supabase (the cart goes into the orders jsonb column).
export async function insertRequest(fields: RequestFields): Promise<{ id: string; name: string }> {
  const { data, error } = await supabaseAdmin()
    .from("requests")
    .insert(fields)
    .select("id, name")
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}

// variant id → what it costs right now (sale-aware, variantPricing). The cart lives in localStorage,
// so its prices are whatever the product page showed when the item was added — a discount set
// afterwards never reached it. Ids that aren't uuids are dropped (Postgres would reject the whole
// .in() with 22P02), and unknown ids are simply absent from the map.
export async function getCurrentPrices(variantIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(variantIds)].filter((id) => UUID_RE.test(id));
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin().from("variants").select("id, price, discounted_price").in("id", ids);
  if (error) throw error;
  return new Map(
    ((data || []) as ({ id: string } & PricedVariant)[])
      .map((v) => [v.id, variantPricing(v).effective] as const)
      .filter(([, price]) => price > 0)
  );
}

// The order is priced by the server, not by the browser: the request row and the Telegram message
// carry the current effective price of every line. Best effort — if the lookup fails, the order still
// goes through with the cart's own prices rather than losing the lead.
export async function repriceCartItems(items: CartItem[]): Promise<CartItem[]> {
  try {
    const prices = await getCurrentPrices(items.map((i) => i.id));
    return items.map((i) => (prices.has(i.id) ? { ...i, price: prices.get(i.id)! } : i));
  } catch (error) {
    console.error("repriceCartItems error:", error);
    return items;
  }
}
