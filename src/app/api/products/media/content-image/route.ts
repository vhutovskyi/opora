import { NextRequest, NextResponse } from "next/server";
import { putObject } from "@/lib/r2/objects";

// Inline images for a product's rich "long description". Unlike media/images
// (variant-relational, deduped/compressed), this is a plain one-off upload that
// just returns a public URL for the editor to embed. Admin-gated by middleware.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `content/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const url = await putObject(key, buffer, file.type || "application/octet-stream");

    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error("Content image upload error:", error);
    return NextResponse.json({ error: "Помилка завантаження зображення" }, { status: 500 });
  }
}
