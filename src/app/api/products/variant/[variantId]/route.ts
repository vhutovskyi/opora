import { NextRequest, NextResponse } from "next/server";
import { getVariantMedia } from "@/lib/supabase";

// Public data: the photos + specs of one variant. The product page pulls them when an option is
// picked instead of receiving the media of all 1000 variants at once inside the HTML.
// Not under /api/products/media/* — that prefix is gated by the middleware behind an admin session.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _: NextRequest,
  { params: paramsPromise }: { params: Promise<{ variantId: string }> }
) {
  const { variantId } = await paramsPromise;
  if (!UUID.test(variantId)) {
    return NextResponse.json({ error: "Bad variant id" }, { status: 400 });
  }

  try {
    const media = await getVariantMedia(variantId);
    if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // A minute in the browser: enough that clicking through options within a session makes no repeated
    // requests, but a photo just uploaded in the admin panel doesn't stay stuck in the client cache for an hour
    // (the server cache is purged by purgeTags in the upload route). A miss = a cheap read from KV.
    // s-maxage lets Cloudflare's edge absorb the same variant across DIFFERENT visitors, not just repeat
    // hovers in one browser — kept at 60s too, so an admin upload isn't hidden behind a long edge TTL.
    return NextResponse.json(media, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    console.error("Variant media error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
