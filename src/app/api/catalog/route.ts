import { NextResponse } from "next/server";
import { getFilteredCatalog, paginateCatalog, parseCatalogParams } from "@/lib/supabase/catalog";
import { CATALOG_PAGE_SIZE } from "@/lib/constants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const all = await getFilteredCatalog(await parseCatalogParams(Object.fromEntries(url.searchParams)));
    return NextResponse.json(paginateCatalog(all, url.searchParams.get("cursor"), CATALOG_PAGE_SIZE), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("catalog page error:", error);
    return NextResponse.json({ error: "Catalog failed" }, { status: 500 });
  }
}
