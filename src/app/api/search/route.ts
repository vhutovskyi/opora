import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/supabase/search";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    return NextResponse.json(await searchProducts(q), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
