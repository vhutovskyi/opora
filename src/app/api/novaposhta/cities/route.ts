import { NextRequest, NextResponse } from "next/server";
import { searchCities } from "@/lib/novaposhta";

// Proxy route: Nova Poshta city search. The API key stays on the server.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  try {
    const cities = await searchCities(query);
    return NextResponse.json(cities);
  } catch (error) {
    console.error("Nova Poshta getCities error:", error);
    return NextResponse.json(
      { error: "Не вдалося завантажити міста" },
      { status: 500 }
    );
  }
}
