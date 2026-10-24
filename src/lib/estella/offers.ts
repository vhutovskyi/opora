import { supabaseAdmin } from "@/lib/supabase";

// XML-promoted variants carry sku = estella offer_id. When such a variant is deleted, release the
// offer (clear its «Додано»/imported flag) so it can be re-imported. Non-XML skus match nothing.
export async function releaseEstellaOffers(db: ReturnType<typeof supabaseAdmin>, skus: (string | null)[]) {
  const ids = skus.filter((s): s is string => !!s);
  if (!ids.length) return;
  await db.from("estella_offers").update({ imported: false }).in("offer_id", ids);
}
