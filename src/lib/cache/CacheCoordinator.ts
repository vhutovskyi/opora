import { DurableObject } from "cloudflare:workers";

// Single-flight for cache rebuilds, across every isolate of the worker. See coalescedCache.ts.
//
// Next's unstable_cache only de-duplicates a rebuild WITHIN one request, so after a purge the first
// 50 visitors of a bed page each rebuilt the same entry from Supabase. Isolates share no memory, so
// the only place they can agree on "who rebuilds" is a Durable Object: one instance, single-threaded,
// every method below runs to completion without interleaving (none of them await).
//
// Running rebuilds (leases, waiters) live in memory — losing them to an eviction costs at most one
// extra rebuild. FINISHED rebuilds live in the object's SQLite storage, because they are needed
// precisely when the object is idle: a cold request from a location whose KV hasn't caught up can
// arrive tens of seconds after the leader's write, and an idle object is evicted from memory.
//
// ponytail: ONE instance for the whole site. It is only consulted on a stale/missing entry, not on
// every request, which is far below a single object's throughput. Shard by key if that ever changes.

const LEASE_MS = 30_000; // a leader that hasn't reported back by then is presumed dead
// A leader told to publish keeps its lease until the value arrives, for at least this long after
// release() — even if the build itself used up most of LEASE_MS.
const PUBLISH_MS = 10_000;
// Safety net only: a lease that ends without a value is handed to the first waiter, so a waiter only
// gets here behind a chain of failing rebuilds — then it builds on its own.
const WAIT_MS = LEASE_MS + PUBLISH_MS + 5_000;
// How long a finished rebuild keeps answering for the entry. KV caches a read — including "no such
// key" — for up to 60s from the READ, and a location may have read just before the leader wrote; so
// right after a deploy, other locations keep reporting the key missing for up to ~60s after the
// rebuild. 90s covers that plus the rebuild itself.
const RETAIN_MS = 90_000;

type Lead = {
  id: number;
  until: number;
  // The entry's tags were purged while this build was running, so what it read may predate the
  // edit — its result must not be handed out, and its leader has to build again.
  stale: boolean;
  // Built, and told to publish: the requests waiting on it get the value from publish(). Still the
  // lease — if the leader dies before publishing (a cold visitor closed the tab and the worker
  // cancelled the request), it simply runs out like any other.
  publishing: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

type Slot = {
  tags: string[];
  lead: Lead | null;
  waiters: Set<(waited: Waited) => void>;
};

export type Acquired = { status: "lead"; lease: number } | { status: "busy" | "done" };
// body → the value; lease → nothing to hand out, or the leader died / failed / went stale, so the
// caller rebuilds it as the only one; null → only the safety net (WAIT_MS): the caller builds alone.
export type Waited = { body: string } | { lease: number } | null;

export class CacheCoordinator extends DurableObject {
  #slots = new Map<string, Slot>();
  #lastSweep = 0;
  // Random start, not 0: ids must not repeat across an eviction, or a leader from before it could
  // release a lease handed out after it.
  #leases = Math.floor(Math.random() * 2 ** 40);
  #sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.#sql = ctx.storage.sql;
    // A row = a rebuild whose result has landed. body is NULL for a background rebuild (nobody
    // needs the value) or one too big for a row.
    this.#sql.exec(`CREATE TABLE IF NOT EXISTS done (
      key TEXT PRIMARY KEY, until INTEGER NOT NULL, tags TEXT NOT NULL, body TEXT
    )`);
  }

  // "lead" → the caller rebuilds and must call release(). "busy" → someone else is rebuilding.
  // "done" → rebuilt within RETAIN_MS; the caller's KV view just hasn't caught up yet.
  acquire(key: string, tags: string[]): Acquired {
    const now = Date.now();
    this.#sweep(now);
    const slot = this.#slot(key, tags);
    if (slot.lead && slot.lead.until > now) return { status: "busy" };
    if (this.#done(key, now)) return { status: "done" };
    return { status: "lead", lease: this.#grant(slot, key, now) };
  }

  // ok=false → don't use what you built: the build failed, a purge landed mid-build, or the lease
  // expired and went to someone else. publish → send the value with publish(): requests are waiting
  // for it, or the leader was a cold miss (foreground) — then the key is missing everywhere and more
  // cold requests will follow from locations whose KV hasn't seen the leader's write yet. A
  // background (stale) rebuild skips it: there the entry exists, so latecomers never need the value.
  release(key: string, lease: number, built: boolean, foreground: boolean): { ok: boolean; publish: boolean } {
    const slot = this.#slots.get(key);
    if (!slot) return { ok: built, publish: false }; // evicted mid-build — nothing to coordinate
    const lead = slot.lead;
    if (lead?.id !== lease || lead.publishing) return { ok: false, publish: false };
    if (!built || lead.stale) {
      // Failed (a Supabase hiccup), or read pre-purge data: no value. The next waiter rebuilds; the
      // rest keep waiting on it — releasing them all would stampede Supabase exactly when it's
      // struggling. A stale leader then laps into acquire() and, if anyone took over, waits too.
      this.#handOver(slot, key);
      return { ok: false, publish: false };
    }
    const now = Date.now();
    if (foreground || slot.waiters.size > 0) {
      lead.publishing = true;
      this.#extend(slot, key, Math.max(lead.until, now + PUBLISH_MS));
      return { ok: true, publish: true };
    }
    this.#endLead(slot);
    this.#markDone(key, slot.tags, now, null);
    return { ok: true, publish: false };
  }

  // Only now is the rebuild done: if the leader dies before this, there is no row claiming it is.
  publish(key: string, lease: number, body: string): void {
    const slot = this.#slots.get(key);
    // Its lease ran out (or a purge dropped it) before the value arrived — someone else has the key.
    if (slot?.lead?.id !== lease || !slot.lead.publishing) return;
    this.#endLead(slot);
    try {
      this.#markDone(key, slot.tags, Date.now(), body);
    } catch (e) {
      // Over SQLite's 2MB row limit: the waiters still get it, a later cold request gets the lease.
      console.error("CacheCoordinator.publish:", key, e);
      this.#markDone(key, slot.tags, Date.now(), null);
    }
    this.#settle(slot, { body });
  }

  // For a cold request (it has nothing to show): the value of the current or a just-finished rebuild.
  // When there is none to hand out — the rebuild was a background one, or its value didn't fit a
  // row — the caller gets the lease, so even then only ONE rebuilds and the requests behind it wait.
  wait(key: string, tags: string[]): Promise<Waited> {
    const now = Date.now();
    const slot = this.#slot(key, tags);
    if (slot.lead && slot.lead.until > now) {
      return new Promise((resolve) => {
        const done = (waited: Waited) => {
          clearTimeout(timer);
          slot.waiters.delete(done);
          resolve(waited);
        };
        const timer = setTimeout(() => done(null), WAIT_MS);
        slot.waiters.add(done);
      });
    }
    const body = this.#done(key, now)?.body ?? null;
    return Promise.resolve(body !== null ? { body } : { lease: this.#grant(slot, key, now) });
  }

  // Called by every purge. Forgets finished rebuilds of these tags (so the next request rebuilds
  // immediately, and no cold request is handed pre-edit data) and flags running ones as stale.
  invalidate(tags: string[]): void {
    for (const [key, slot] of this.#slots) {
      if (!slot.lead || !slot.tags.some((t) => tags.includes(t))) continue;
      if (slot.lead.publishing) {
        // A pre-purge value is on its way: drop it, and let ONE waiter rebuild from fresh data.
        this.#handOver(slot, key);
      } else {
        slot.lead.stale = true;
      }
    }
    this.#sql.exec(
      "DELETE FROM done WHERE EXISTS (SELECT 1 FROM json_each(done.tags) WHERE value IN (SELECT value FROM json_each(?)))",
      JSON.stringify(tags)
    );
  }

  #done(key: string, now: number): { body: string | null } | undefined {
    return this.#sql.exec<{ body: string | null }>("SELECT body FROM done WHERE key = ? AND until > ?", key, now).toArray()[0];
  }

  #markDone(key: string, tags: string[], now: number, body: string | null) {
    this.#sql.exec(
      "INSERT OR REPLACE INTO done (key, until, tags, body) VALUES (?, ?, ?, ?)",
      key,
      now + RETAIN_MS,
      JSON.stringify(tags),
      body
    );
  }

  #slot(key: string, tags: string[]): Slot {
    let slot = this.#slots.get(key);
    if (!slot) this.#slots.set(key, (slot = { tags, lead: null, waiters: new Set() }));
    return slot;
  }

  #grant(slot: Slot, key: string, now: number): number {
    this.#sql.exec("DELETE FROM done WHERE key = ?", key);
    this.#endLead(slot);
    const id = ++this.#leases;
    slot.lead = { id, until: 0, stale: false, publishing: false };
    this.#extend(slot, key, now + LEASE_MS);
    return id;
  }

  // (Re)arms the lease's expiry. The timer is what un-wedges the key when a leader dies with
  // requests waiting on it; with nobody waiting, acquire() would replace the expired lease anyway.
  #extend(slot: Slot, key: string, until: number) {
    const lead = slot.lead!;
    clearTimeout(lead.timer);
    lead.until = until;
    lead.timer = setTimeout(() => this.#expire(key, lead.id), until - Date.now());
  }

  // The leader never reported back.
  #expire(key: string, id: number) {
    const slot = this.#slots.get(key);
    if (slot?.lead?.id === id) this.#handOver(slot, key);
  }

  // A lease ended without a value (expired, failed, stale): hand it to the first waiter — it
  // rebuilds, the rest keep waiting on it — instead of every waiter rebuilding on its own. If the
  // new leader fails too, the next one takes over: retries happen one at a time.
  #handOver(slot: Slot, key: string) {
    this.#endLead(slot);
    const [next] = slot.waiters;
    if (next) next({ lease: this.#grant(slot, key, Date.now()) });
  }

  #endLead(slot: Slot) {
    if (slot.lead) clearTimeout(slot.lead.timer);
    slot.lead = null;
  }

  #settle(slot: Slot, waited: Waited) {
    for (const resolve of [...slot.waiters]) resolve(waited);
  }

  #sweep(now: number) {
    if (now - this.#lastSweep < RETAIN_MS) return;
    this.#lastSweep = now;
    this.#sql.exec("DELETE FROM done WHERE until <= ?", now);
    for (const [key, slot] of this.#slots) {
      if ((slot.lead && slot.lead.until > now) || slot.waiters.size) continue;
      this.#endLead(slot);
      this.#slots.delete(key);
    }
  }
}
