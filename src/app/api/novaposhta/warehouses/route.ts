import { NextRequest, NextResponse } from "next/server";
import { getWarehouses } from "@/lib/novaposhta";

// Proxy route: Nova Poshta warehouses for the selected city (cityRef).
export async function GET(request: NextRequest) {
  const cityRef = request.nextUrl.searchParams.get("cityRef") || "";
  const query = request.nextUrl.searchParams.get("q") || "";
  if (!cityRef) {
    return NextResponse.json({ error: "cityRef є обов'язковим" }, { status: 400 });
  }
  try {
    const warehouses = await getWarehouses(cityRef, query);
    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("Nova Poshta getWarehouses error:", error);
    return NextResponse.json(
      { error: "Не вдалося завантажити відділення" },
      { status: 500 }
    );
  }
}
