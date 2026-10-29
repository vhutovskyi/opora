// Shared between coalescedCache.ts (which decides) and incrementalCache.ts (which writes to KV).
//
// No imports on purpose: open-next.config.ts and client-reachable code both import this.

// One coalescedCache() call. unstable_cache writes whatever the rebuild callback returns to KV, and
// two kinds of callback result must NOT be written:
// - the COALESCED placeholder (a background revalidation another request is already doing);
// - a value handed out by the coordinator (a cold request served from someone else's rebuild):
//   the leader already wrote exactly that, and every such request writing it again blew through
//   KV's limit of one write per second per key ("KV PUT failed: 429 Too Many Requests").
export type CallState = {
  // The caller has been answered — see coalescedCache.ts for why that marks a background rebuild.
  settled: boolean;
  skipWrite: boolean;
};

export const COALESCED = { __coalesced: true } as const;
export const COALESCED_BODY = JSON.stringify(COALESCED);

// How the KV write finds its call: the write happens inside unstable_cache, in the async
// continuation of the coalescedCache() call, so an AsyncLocalStorage entered around that call is
// still current there. globalThis.AsyncLocalStorage — not an import of node:async_hooks, which
// would break the client bundles — is set by OpenNext for Next's own request stores. The instance
// lives on globalThis too: the KV override and the app code may be separate module copies.
type CallContext = { run<T>(state: CallState, fn: () => T): T; getStore(): CallState | undefined };

export function callContext(): CallContext | null {
  const g = globalThis as { AsyncLocalStorage?: new () => CallContext; __oporaCoalescedCall?: CallContext };
  if (!g.AsyncLocalStorage) return null;
  return (g.__oporaCoalescedCall ??= new g.AsyncLocalStorage());
}
