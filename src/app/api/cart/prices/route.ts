import { NextResponse } from "next/server";
import { getCurrentPrices } from "@/lib/supabase/requests";

// Current sale-aware prices of the cart's variants (?ids=a,b,c) — CartDrawer refreshes the
// localStorage cart with them on open, so the total it shows is the total the order is priced at
// (/api/requests reprices on the server with the same getCurrentPrices).
const MAX_IDS = 50;

export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, MAX_IDS);
  try {
    const prices = Object.fromEntries(await getCurrentPrices(ids));
    return NextResponse.json(prices, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("cart prices error:", error);
    return NextResponse.json({ error: "Failed to load prices" }, { status: 500 });
  }
}
