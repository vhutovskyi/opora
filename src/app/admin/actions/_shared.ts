import { revalidatePath } from "next/cache";
import { purgeTags } from "@/lib/cache/purgeTags";
import { supabaseAdmin } from "@/lib/supabase";
import { VARIANT_MEDIA_TAG } from "@/lib/supabase/products";

export const db = () => supabaseAdmin();

// The blanket purge: catalog listing + every product page + articles. Same net effect as before the
// tags were split, so any action that doesn't know exactly what it touched stays correct by default.
// Stale-while-revalidate with one rebuild per entry — see purgeTags.
export function bump() {
  purgeTags("catalog", "product", VARIANT_MEDIA_TAG, "posts");
  revalidatePath("/admin");
}

// Purge for an edit to ONE product: the catalog listing (its card shows price/photos/visibility) plus
// that product's own page — and nothing else. bump() used to cold-start all ~4000 product pages at
// once, so the next visitors all hit the most CPU-expensive path in the app simultaneously; on the
// Workers free plan (10ms CPU/request) that is what took the worker down after an admin edit.
//
// Also purges the pages of every product that offers this one as an accessory: a bed's cached payload
// EMBEDS its accessories' variants (ACCESSORY_SELECT in supabase/products.ts), so editing a drawer's
// price has to invalidate the beds showing it — otherwise they'd serve the old price until the TTL.
// ponytail: only wired where the productId is already in hand; everything else keeps bump().
export async function bumpProduct(productId: string) {
  const { data } = await db()
    .from("product_accessories")
    .select("product_id")
    .eq("accessory_product_id", productId);
  const hostTags = [...new Set((data ?? []).map((r) => `product-${r.product_id as string}`))];

  // VARIANT_MEDIA_TAG: cheap to rebuild and not keyed by product, so it goes wholesale — a variant's
  // specs/photos would otherwise stay stale here for the TTL after an edit.
  purgeTags("catalog", `product-${productId}`, VARIANT_MEDIA_TAG, ...hostTags);
  revalidatePath("/admin");
}
