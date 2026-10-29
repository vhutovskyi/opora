import { NextRequest, NextResponse } from "next/server";
import { purgeTags } from "@/lib/cache/purgeTags";
import path from "node:path";
import { importTables } from "@/lib/importer/tablesImport";

// One-off import of the Romax tables catalogue. Local only — it reads the photo folder off the
// machine's disk, so it does nothing useful when deployed. Gated by the /api/admin/* auth
// middleware. See TABLES_IMPORT.md.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      photoRoot?: string; only?: string[]; skipPhotos?: boolean;
    };
    const result = await importTables({
      photoRoot: body.photoRoot || path.join(process.env.HOME ?? "", "Downloads/TABLES"),
      photoMapPath: path.join(process.cwd(), "scripts/tables/photo-map.json"),
      only: body.only,
      skipPhotos: body.skipPhotos,
    });
    purgeTags("catalog");
    return NextResponse.json(result);
  } catch (error) {
    console.error("import-tables:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
