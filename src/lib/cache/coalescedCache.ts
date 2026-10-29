import { unstable_cache } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CacheCoordinator } from "./CacheCoordinator";
import { COALESCED, callContext, type CallState } from "./coalesced";

// unstable_cache, but one rebuild per entry no matter how many requests find it stale or missing.
//
// The stampede this fixes: an admin save purged the tags, the next ~50 visitors of a bed page all
// found the entry gone, and every one of them rebuilt it from Supabase — Supabase spiked and the
// pages hung for seconds. unstable_cache only de-duplicates within ONE request, and isolates share
// no memory, so the rebuild is arbitrated by the CacheCoordinator Durable Object instead:
//
// - stale entry (purge via purgeTags.ts, or the hourly TTL): Next already served the old value and is
//   rebuilding in the background. One request wins the lease and rebuilds; every other one returns
//   the COALESCED placeholder, whose KV write is dropped — no Supabase query, no duplicate write.
// - missing entry (cold key after a deploy): the visitor has nothing to show, so the losers wait
//   for the winner's value instead of querying Supabase themselves. The winner hands that value to
//   the coordinator, which keeps it for RETAIN_MS: for a while after a deploy, other locations'
//   KV still says the key is missing, and those requests get it from there too. A request served
//   that way doesn't write it back to KV (skipWrite, see coalesced.ts): the leader already did.
//
// Each rebuild logs "[cache] rebuilt <key>", each cold request served from the coordinator
// "[cache] reused <key>" — scripts/check-cache-stampede.mjs counts them.
//
// The coordinator only ever ADDS coordination: if it's unreachable, this is plain unstable_cache.

type Options = { revalidate: number; tags: string[] };

// Inside the rebuild callback there is no telling a background revalidation from a foreground miss,
// except by timing: unstable_cache returns the stale value right after kicking off a background
// rebuild, so by the time the coordinator answers, the caller's promise has already settled
// (CallState.settled).

export function coordinator(): DurableObjectStub<CacheCoordinator> | null {
  // next dev / next build: no worker, no Durable Object.
  if (process.env.NODE_ENV !== "production") return null;
  try {
    return getCloudflareContext().env.CACHE_COORDINATOR?.getByName("global") ?? null;
  } catch {
    return null;
  }
}

async function rebuildOnce<R>(key: string, tags: string[], call: CallState, build: () => Promise<R>): Promise<R> {
  const stub = coordinator();
  if (!stub) return build();

  // At most a couple of laps: a lap repeats only when a purge landed while we were building.
  for (let lap = 0; lap < 3; lap++) {
    let lease: number;
    try {
      const acquired = await stub.acquire(key, tags);
      if (acquired.status === "lead") {
        lease = acquired.lease;
      } else {
        if (call.settled) {
          call.skipWrite = true;
          return COALESCED as R;
        }
        // A cold miss: take the value of the running or just-finished rebuild — including one
        // that finished before we got here, while our location's KV still says the key is missing.
        const waited = await stub.wait(key, tags);
        if (waited === null) return build();
        if ("body" in waited) {
          console.log(`[cache] reused ${key}`);
          call.skipWrite = true;
          return JSON.parse(waited.body) as R;
        }
        lease = waited.lease;
      }
    } catch (e) {
      console.error("CacheCoordinator:", e);
      return build();
    }

    let result: R;
    try {
      result = await build();
    } catch (e) {
      await stub.release(key, lease, false, false).catch(() => {});
      throw e;
    }
    const { ok, publish } = await stub
      .release(key, lease, true, !call.settled)
      .catch(() => ({ ok: true, publish: false }));
    if (!ok) continue; // what we read may predate the edit — caching it would undo the purge
    // If this never arrives (we die first), the lease runs out and the key is handed on — see #expire.
    if (publish) await stub.publish(key, lease, JSON.stringify(result)).catch(() => {});
    console.log(`[cache] rebuilt ${key}`);
    return result;
  }
  return build();
}

export function coalescedCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: Options
): T {
  const name = keyParts.join(",");
  return ((...args: Parameters<T>) => {
    const call: CallState = { settled: false, skipWrite: false };
    // The build id is part of the key: a previous deploy's values may have a different shape.
    // Read per call — OpenNext sets it at runtime, possibly after this module loaded.
    const key = `${process.env.OPEN_NEXT_BUILD_ID ?? ""}|${name}|${JSON.stringify(args)}`;
    // A wrapper per call so the callback can see `call` — cheap, it only builds the key prefix.
    // unstable_cache keys on this callback's SOURCE + keyParts + args; the source is the same for
    // every coalescedCache, so keyParts alone must be unique — they all are.
    const cached = () =>
      unstable_cache(
        (..._args: Parameters<T>) => rebuildOnce(key, options.tags, call, () => fn(...args)),
        keyParts,
        options
      )(...args);
    // The context is how the KV write inside unstable_cache finds `call` (see coalesced.ts).
    const context = callContext();
    return (context ? context.run(call, cached) : cached()).finally(() => {
      call.settled = true;
    });
  }) as T;
}
