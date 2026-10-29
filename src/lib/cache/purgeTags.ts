import { revalidateTag } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { coordinator } from "./coalescedCache";

// Not in coalescedCache.ts: that one is reachable from client bundles (via the lib/supabase barrel),
// where Next refuses revalidateTag at build time.
//
// Every storefront purge goes through here. Stale-while-revalidate ("max"), not updateTag's
// immediate expiry: after a save visitors keep getting the previous version instantly while ONE
// request rebuilds in the background, instead of all of them waiting on Supabase. Edits still show
// up within KV's ~60s, same as before.
//
// Also tells the coordinator, so a rebuild that was already running when the edit landed isn't
// cached as if it were fresh (plain Next has that race), and a just-finished one doesn't suppress
// the next rebuild. Fire-and-forget: losing that call costs at most RETAIN_MS of delay, plus the
// race plain Next always had.
export function purgeTags(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag, "max");
  const stub = coordinator();
  if (!stub) return;
  getCloudflareContext().ctx.waitUntil(
    stub.invalidate(tags).catch((e: unknown) => console.error("CacheCoordinator.invalidate:", e))
  );
}
