import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import { COALESCED_BODY, callContext } from "./coalesced";

// OpenNext's KV incremental cache, minus the writes coalescedCache marks as redundant (see
// coalesced.ts): the "someone else is rebuilding" placeholder, and a value the coordinator handed
// out, which its leader has already written. The body check stays as a backstop for the
// placeholder — writing THAT to KV would replace a real cached value.
export const coalescingKvIncrementalCache: IncrementalCache = {
  name: kvIncrementalCache.name,
  get: (key, cacheType) => kvIncrementalCache.get(key, cacheType),
  set: async (key, value, cacheType) => {
    if (cacheType === "fetch") {
      if (callContext()?.getStore()?.skipWrite) return;
      if ((value as { data?: { body?: unknown } }).data?.body === COALESCED_BODY) return;
    }
    return kvIncrementalCache.set(key, value, cacheType);
  },
  delete: (key) => kvIncrementalCache.delete(key),
};
