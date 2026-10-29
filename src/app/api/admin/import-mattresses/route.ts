import { NextRequest, NextResponse } from "next/server";
import { purgeTags } from "@/lib/cache/purgeTags";
import path from "node:path";
import { importMattresses } from "@/lib/importer/mattressesImport";

// One-off import of the Матраци catalogue from mattressesData.ts. Local only — it reads
// matrases/photos/ off the machine's disk. Products are created hidden (visible: false).
// Gated by the /api/admin/* auth middleware. Idempotent: re-running skips products that
// already exist. Pass { only: ["Adormo ESSENTIAL HARD"] } to test a single product first.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      photoRoot?: string; only?: string[]; skipPhotos?: boolean;
    };
    const result = await importMattresses({
      photoRoot: body.photoRoot || path.join(process.cwd(), "matrases/photos"),
      only: body.only,
      skipPhotos: body.skipPhotos,
    });
    purgeTags("catalog");
    return NextResponse.json(result);
  } catch (error) {
    console.error("import-mattresses:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
