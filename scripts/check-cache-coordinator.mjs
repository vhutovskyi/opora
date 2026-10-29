// Asserts the CacheCoordinator Durable Object's single-flight rules (src/lib/cache/CacheCoordinator.ts)
// without a worker: "cloudflare:workers" is stubbed, the class is driven directly.
// Run: node scripts/check-cache-coordinator.mjs   (esbuild is already in the project: TS is bundled into tmp)
// The end-to-end check against a running worker is scripts/check-cache-stampede.mjs.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-'));
fs.writeFileSync(path.join(dir, 'stub.mjs'), 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
const out = path.join(dir, 'coord.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'src/lib/cache/CacheCoordinator.ts', '--bundle', '--format=esm', '--platform=node',
  `--alias:cloudflare:workers=${path.join(dir, 'stub.mjs')}`, `--outfile=${out}`,
], { stdio: 'inherit' });
const { CacheCoordinator } = await import(out);
const { DatabaseSync } = await import('node:sqlite');

// ctx.storage.sql over a real SQLite (Node's built-in), so the SQL itself is exercised.
const storage = () => {
  const db = new DatabaseSync(':memory:');
  return {
    sql: {
      exec(query, ...bindings) {
        const st = db.prepare(query);
        const rows = /^\s*select/i.test(query) ? st.all(...bindings) : (st.run(...bindings), []);
        return { toArray: () => rows };
      },
    },
  };
};
const fresh = (s = storage()) => new CacheCoordinator({ storage: s }, {});
const K = 'build|product-detail,1|[]', TAGS = ['product', 'product-1'];
const tick = () => new Promise((r) => setTimeout(r, 0));

// 50 requests find the entry stale/missing at once → exactly one leader.
{
  const c = fresh();
  const answers = Array.from({ length: 50 }, () => c.acquire(K, TAGS).status);
  assert.equal(answers.filter((s) => s === 'lead').length, 1);
  assert.equal(answers.filter((s) => s === 'busy').length, 49);
}

// Foreground waiters get the leader's value; late arrivals within the retain window get it too.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const waiting = [c.wait(K, TAGS), c.wait(K, TAGS)];
  // Even a background leader publishes when someone is waiting.
  assert.deepEqual(c.release(K, lease, true, false), { ok: true, publish: true });
  c.publish(K, lease, '{"v":1}');
  assert.deepEqual(await Promise.all(waiting), [{ body: '{"v":1}' }, { body: '{"v":1}' }]);
  assert.equal(c.acquire(K, TAGS).status, 'done');
  assert.deepEqual(await c.wait(K, TAGS), { body: '{"v":1}' });
}

// Cold leader, NOBODY waiting yet (the herd hit other locations later): it still publishes, and
// cold requests arriving after it finished — their KV still says missing — get the value, for the
// whole retain window, with no new lease.
{
  const c = fresh();
  const realNow = Date.now;
  const { lease } = c.acquire(K, TAGS);
  assert.deepEqual(c.release(K, lease, true, true), { ok: true, publish: true });
  c.publish(K, lease, '{"v":"cold"}');
  try {
    for (const later of [1_000, 30_000, 75_000, 89_000]) {
      Date.now = () => realNow() + later;
      assert.equal(c.acquire(K, TAGS).status, 'done', `+${later}ms`);
      assert.deepEqual(await c.wait(K, TAGS), { body: '{"v":"cold"}' }, `+${later}ms`);
    }
    Date.now = () => realNow() + 91_000;
    assert.equal(c.acquire(K, TAGS).status, 'lead', 'past the retain window the entry is genuinely gone');
  } finally {
    Date.now = realNow;
  }
}

// A cold request arriving between release and publish waits for the body.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  c.release(K, lease, true, true);
  const waiting = c.wait(K, TAGS);
  c.publish(K, lease, '{"v":2}');
  assert.deepEqual(await waiting, { body: '{"v":2}' });
}

// Background (stale-path) leader, nobody waiting: no body is shipped; a stale-path follower just
// hears "done". If a cold request does show up, it gets the LEASE — one rebuild, the rest wait on it.
{
  const c = fresh();
  const first = c.acquire(K, TAGS);
  assert.deepEqual(c.release(K, first.lease, true, false), { ok: true, publish: false });
  assert.equal(c.acquire(K, TAGS).status, 'done');
  const cold = await c.wait(K, TAGS);
  assert.ok(cold && 'lease' in cold, 'the first cold request leads');
  const behind = c.wait(K, TAGS);
  assert.deepEqual(c.release(K, cold.lease, true, true), { ok: true, publish: true });
  c.publish(K, cold.lease, '{"v":3}');
  assert.deepEqual(await behind, { body: '{"v":3}' }, 'the next one waits instead of rebuilding');
}

// The coordinator was evicted while idle — the normal case for a late cold request, which comes from
// a location whose KV lags by up to a minute. The finished rebuild survives in storage.
{
  const s = storage();
  const before = fresh(s);
  const { lease } = before.acquire(K, TAGS);
  before.release(K, lease, true, true);
  before.publish(K, lease, '{"v":"persisted"}');
  const after = fresh(s); // new instance, same storage = evicted and woken up
  assert.equal(after.acquire(K, TAGS).status, 'done');
  assert.deepEqual(await after.wait(K, TAGS), { body: '{"v":"persisted"}' });
  after.invalidate(['product-1']); // and a purge still reaches what was persisted
  const cold = await after.wait(K, TAGS);
  assert.ok(cold && 'lease' in cold);
  // A leader from before the eviction can't release the lease handed out after it.
  assert.equal(after.release(K, lease, true, true).ok, false);
}

// Evicted with nothing finished: a cold request leads, it doesn't build blind.
{
  const c = fresh();
  const cold = await c.wait(K, TAGS);
  assert.ok(cold && 'lease' in cold);
}

// A purge mid-build: the leader must not cache what it read. Nobody waiting → it laps and rebuilds.
{
  const c = fresh();
  const first = c.acquire(K, TAGS);
  c.invalidate(['product-1']);
  assert.equal(c.acquire(K, TAGS).status, 'busy', 'still building — no second concurrent build');
  assert.deepEqual(c.release(K, first.lease, true, true), { ok: false, publish: false });
  const second = c.acquire(K, TAGS);
  assert.equal(second.status, 'lead', 'the old leader laps and rebuilds');
}

// A purge mid-build WITH waiters: the first waiter takes over the rebuild; the old leader, lapping,
// finds it busy and waits like everyone else — one fresh rebuild, not one per waiter.
{
  const c = fresh();
  const first = c.acquire(K, TAGS);
  const waiters = Array.from({ length: 50 }, () => c.wait(K, TAGS));
  c.invalidate(['product-1']);
  assert.deepEqual(c.release(K, first.lease, true, true), { ok: false, publish: false });
  const heir = await waiters[0];
  assert.ok(heir && 'lease' in heir, 'the first waiter inherits the lease');
  assert.equal(c.acquire(K, TAGS).status, 'busy', 'the lapping old leader does not start a second rebuild');
  c.release(K, heir.lease, true, true);
  c.publish(K, heir.lease, '{"v":"fresh"}');
  assert.ok((await Promise.all(waiters.slice(1))).every((v) => v?.body === '{"v":"fresh"}'), 'the other 49 get the fresh value');
}

// A purge also drops a retained body: a late cold request must not get pre-edit data.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  c.release(K, lease, true, true);
  c.publish(K, lease, '{"v":"old"}');
  c.invalidate(['product']);
  const cold = await c.wait(K, TAGS);
  assert.ok(cold && 'lease' in cold);
}

// A purge after a finished rebuild: the next stale request rebuilds now, not after RETAIN_MS.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  c.release(K, lease, true, false);
  c.invalidate(['product']);
  assert.equal(c.acquire(K, TAGS).status, 'lead');
}

// An unrelated tag doesn't touch the entry.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  c.release(K, lease, true, false);
  c.invalidate(['posts']);
  assert.equal(c.acquire(K, TAGS).status, 'done');
}

// A failed build (a Supabase hiccup) with 50 waiters: exactly ONE more rebuild. The first waiter
// gets the lease, the other 49 keep waiting and get its value. No "done" is left behind by the failure.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const waiters = Array.from({ length: 50 }, () => c.wait(K, TAGS));
  const answers = new Map();
  waiters.forEach((w, i) => w.then((v) => answers.set(i, v)));
  assert.deepEqual(c.release(K, lease, false, true), { ok: false, publish: false });
  await tick();
  const leases = [...answers.values()].filter((v) => v && 'lease' in v);
  assert.equal(leases.length, 1, 'one waiter rebuilds');
  assert.equal(answers.size, 1, 'the other 49 are still waiting — none was sent to Supabase');
  c.release(K, leases[0].lease, true, true);
  c.publish(K, leases[0].lease, '{"v":"retried"}');
  const rest = await Promise.all(waiters.slice(1));
  assert.ok(rest.every((v) => v?.body === '{"v":"retried"}'), 'all 49 get the retry\'s value');
}

// The retry fails too: the NEXT waiter takes over — retries go one at a time, never all at once.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const waiters = Array.from({ length: 5 }, () => c.wait(K, TAGS));
  c.release(K, lease, false, true);
  const first = await waiters[0];
  c.release(K, first.lease, false, true);
  const second = await waiters[1];
  assert.ok(second && 'lease' in second, 'the second waiter inherits after the first retry fails');
  c.release(K, second.lease, true, true);
  c.publish(K, second.lease, '{"v":"third time"}');
  assert.ok((await Promise.all(waiters.slice(2))).every((v) => v?.body === '{"v":"third time"}'));
}

// A failure with nobody waiting leaves the key free (no "done"): the next request rebuilds.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  c.release(K, lease, false, true);
  assert.equal(c.acquire(K, TAGS).status, 'lead');
}

// A purge while the leader is PUBLISHING: its pre-purge value is dropped, and one waiter rebuilds.
{
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const waiters = Array.from({ length: 50 }, () => c.wait(K, TAGS));
  c.release(K, lease, true, true); // publishing...
  c.invalidate(['product']);
  const heir = await waiters[0];
  assert.ok(heir && 'lease' in heir, 'the first waiter inherits the lease');
  c.publish(K, lease, '{"v":"pre-purge"}'); // arrives late: ignored
  c.release(K, heir.lease, true, true);
  c.publish(K, heir.lease, '{"v":"post-purge"}');
  assert.ok((await Promise.all(waiters.slice(1))).every((v) => v?.body === '{"v":"post-purge"}'));
}

// A leader whose lease expired and went to someone else can't release the new lease.
{
  const c = fresh();
  const realNow = Date.now;
  const first = c.acquire(K, TAGS);
  Date.now = () => realNow() + 31_000;
  try {
    const second = c.acquire(K, TAGS);
    assert.equal(second.status, 'lead');
    assert.deepEqual(c.release(K, first.lease, true, true), { ok: false, publish: false });
    assert.equal(c.acquire(K, TAGS).status, 'busy', 'the second lease is intact');
    assert.equal(c.release(K, second.lease, true, true).ok, true);
  } finally {
    Date.now = realNow;
  }
}

// ── A leader that never publishes (a cold visitor closed the tab, the worker cancelled the request) ──
// Runs on mocked timers + clock: the coordinator's lease expiry is a real setTimeout.
const LEASE_MS = 30_000, PUBLISH_MS = 10_000;
async function withClock(fn) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  try {
    await fn();
  } finally {
    mock.timers.reset();
  }
}

// Nobody waiting: the key is blocked only until the lease runs out — and then it is NOT "done"
// (the value never landed in KV), so a stale request rebuilds instead of being told to stand down.
await withClock(async () => {
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  assert.deepEqual(c.release(K, lease, true, true), { ok: true, publish: true });
  // ...and the leader dies here, before publish().
  mock.timers.tick(PUBLISH_MS - 1);
  assert.equal(c.acquire(K, TAGS).status, 'busy', 'still within the lease: it may yet publish');
  mock.timers.tick(LEASE_MS);
  const next = c.acquire(K, TAGS);
  assert.equal(next.status, 'lead', 'lease ran out: the key is free, and not claimed done');
  // A publish arriving after all that is ignored — it can't settle or mark the new lease's key done.
  c.publish(K, lease, '{"v":"late"}');
  assert.equal(c.acquire(K, TAGS).status, 'busy', 'the new leader still owns the key');
});

// Requests waiting on a dead leader: at expiry the FIRST waiter gets the lease (one rebuild), the
// others keep waiting on it and get its value — nobody sits out the safety net, nobody builds blind.
await withClock(async () => {
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const first = c.wait(K, TAGS);
  const second = c.wait(K, TAGS);
  c.release(K, lease, true, true); // told to publish, then dies
  mock.timers.tick(LEASE_MS);
  const handedOver = await first;
  assert.ok(handedOver && 'lease' in handedOver, 'the first waiter inherits the lease');
  assert.deepEqual(c.release(K, handedOver.lease, true, true), { ok: true, publish: true });
  c.publish(K, handedOver.lease, '{"v":"rescued"}');
  assert.deepEqual(await second, { body: '{"v":"rescued"}' });
  assert.equal(c.acquire(K, TAGS).status, 'done');
});

// Same for a leader that dies mid-BUILD with waiters: the lease is handed over at expiry.
await withClock(async () => {
  const c = fresh();
  c.acquire(K, TAGS);
  const waiting = c.wait(K, TAGS);
  mock.timers.tick(LEASE_MS);
  const w = await waiting;
  assert.ok(w && 'lease' in w);
});

// A build that used most of its lease still gets PUBLISH_MS to deliver the value.
await withClock(async () => {
  const c = fresh();
  const { lease } = c.acquire(K, TAGS);
  const waiting = c.wait(K, TAGS);
  mock.timers.tick(LEASE_MS - 1_000);
  c.release(K, lease, true, true);
  mock.timers.tick(PUBLISH_MS - 1_000);
  c.publish(K, lease, '{"v":"slow"}');
  assert.deepEqual(await waiting, { body: '{"v":"slow"}' });
});

await tick();
console.log('✓ CacheCoordinator: single leader, waiters served, late cold requests served for the retain window, purge mid-build re-runs, a failed/stale/dead leader hands the lease to ONE waiter, stale leases rejected');
process.exit(0); // waiters' WAIT_MS timers would otherwise keep node alive
