// Cache-stampede check: fire N parallel requests at each page (once, or in waves for --duration
// seconds) and count rebuilds from the worker's own log. Every rebuild logs "[cache] rebuilt <key>",
// every cold request served from the coordinator logs "[cache] reused <key>"
// (src/lib/cache/coalescedCache.ts). Expected: ONE rebuild per cache entry, however many requests,
// and no "KV PUT failed: 429 Too Many Requests" (KV allows one write per second per key, so only
// the leader may write; a request served from the coordinator must not write the value back).
// KV writes themselves are only logged with NEXT_PRIVATE_DEBUG_CACHE=1 (OpenNext's cache debug
// log) — locally: `npx wrangler dev --var NEXT_PRIVATE_DEBUG_CACHE:1`; then expect one per entry.
// Local KV doesn't enforce the write limit, so a 429 can only show up against the deployed worker.
//
//   node scripts/check-cache-stampede.mjs <baseUrl> [options] [paths...]     (default paths: /catalog /catalog/VeneciaLux)
//
//   --n 50                  parallel requests per page per wave
//   --duration 60           keep sending waves for this many seconds (default: one wave)
//   --interval 2000         ms between waves
//   --purge local|remote    before the first wave, mark the tags stale like purgeTags() /
//                           revalidateTag(tag,"max") does (NEXT_TAG_CACHE_KV, no admin login needed).
//                           It can't reach the coordinator's invalidate(), so within 90s (RETAIN_MS)
//                           of a previous rebuild the coordinator still calls the entry done and
//                           nothing rebuilds until that window passes — wait it out between purges.
//   --evict local|remote    after the first wave, delete this build's cache entries from
//                           NEXT_INC_CACHE_KV — what another location sees right after a deploy,
//                           while its KV hasn't caught up with the leader's write: the key is missing.
//                           Every request after that is such a late cold request. Exact locally;
//                           remotely the edge keeps serving its cached read for up to 60s, so it
//                           only bites once that expires.
//   --log <file>            count the log lines appended to this file during the run (local: the
//                           `wrangler dev` output)
//   --tail                  count them from `wrangler tail` (deployed worker)
//
// --purge/--evict need the DEPLOYED build id: they read .next/BUILD_ID, so run from the tree that
// was built/deployed.
//
// Fresh-deploy check (the case that used to rebuild once per location for a minute):
//   local:    build, `npx wrangler dev`, then
//             node scripts/check-cache-stampede.mjs http://localhost:8787 --duration 60 --evict local --log /tmp/preview.log
//   deployed: right after `npm run deploy`, from the same tree:
//             node scripts/check-cache-stampede.mjs https://opora-furniture.com --duration 60 --tail
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const base = argv.shift()?.replace(/\/$/, "");
if (!base) throw new Error("usage: check-cache-stampede.mjs <baseUrl> [options] [paths...] — see the header");
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const [, v] = argv.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i >= 0) argv.splice(i, 1);
  return i >= 0;
};
const n = Number(opt("--n", 50));
const duration = Number(opt("--duration", 0)) * 1000;
const interval = Number(opt("--interval", 2000));
const purge = opt("--purge", null);
const evict = opt("--evict", null);
const logFile = opt("--log", null);
const tail = flag("--tail");
const paths = argv.length ? argv : ["/catalog", "/catalog/VeneciaLux"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrangler = (args, input) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "ignore"] });
const buildId = () => fs.readFileSync(".next/BUILD_ID", "utf8").trim();

// ── log capture ──────────────────────────────────────────────────────────────
let logText = "";
let stopLog = () => {};
if (logFile) {
  const start = fs.statSync(logFile).size;
  stopLog = async () => {
    await sleep(5000); // background rebuilds finish after their response
    const fd = fs.openSync(logFile, "r");
    const buf = Buffer.alloc(fs.statSync(logFile).size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    logText = buf.toString("utf8");
  };
} else if (tail) {
  const proc = spawn("npx", ["wrangler", "tail", "--format", "pretty"], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d) => (logText += d));
  proc.stderr.on("data", (d) => (logText += d));
  for (let i = 0; i < 60 && !/Connected to/i.test(logText); i++) await sleep(500);
  if (!/Connected to/i.test(logText)) throw new Error(`wrangler tail did not connect:\n${logText}`);
  stopLog = async () => {
    await sleep(10000); // tail delivers with a lag; background rebuilds finish after their response
    proc.kill();
  };
}

// ── purge / evict ────────────────────────────────────────────────────────────
if (purge) {
  const now = Date.now();
  const value = JSON.stringify({ revalidatedAt: now, stale: now, expire: now + 365 * 24 * 3600 * 1000 });
  for (const tag of ["catalog", "product", "variant-media", "posts"]) {
    wrangler(["kv", "key", "put", `--${purge}`, "--binding", "NEXT_TAG_CACHE_KV", `${buildId()}/${tag}`, value]);
  }
  console.log(`purged (stale) catalog/product/variant-media/posts for build ${buildId()} [${purge}]`);
}

function evictEntries() {
  const keys = JSON.parse(
    wrangler(["kv", "key", "list", `--${evict}`, "--binding", "NEXT_INC_CACHE_KV", "--prefix", `incremental-cache/${buildId()}/`])
  ).map((k) => k.name);
  if (!keys.length) return console.log("evict: nothing cached for this build yet");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "evict-")), "keys.json");
  fs.writeFileSync(file, JSON.stringify(keys));
  wrangler(["kv", "bulk", "delete", file, `--${evict}`, "--binding", "NEXT_INC_CACHE_KV", "--force"]);
  console.log(`evicted ${keys.length} cache entries of build ${buildId()} [${evict}] — every request from here on is a late cold one`);
}

// ── load ─────────────────────────────────────────────────────────────────────
async function wave(path) {
  const results = await Promise.all(
    Array.from({ length: n }, async () => {
      const t = performance.now();
      try {
        const res = await fetch(`${base}${path}`, { headers: { "cache-control": "no-cache" } });
        await res.arrayBuffer();
        return { status: res.status, ms: performance.now() - t };
      } catch {
        return { status: "fetch-error", ms: performance.now() - t };
      }
    })
  );
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const statuses = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  return { statuses, p50: ms[Math.floor(n / 2)], max: ms[n - 1] };
}

const t0 = Date.now();
let waves = 0;
const totals = {};
do {
  const at = ((Date.now() - t0) / 1000).toFixed(0).padStart(3);
  const results = await Promise.all(paths.map(wave));
  results.forEach((r, i) => {
    for (const [s, c] of Object.entries(r.statuses)) totals[s] = (totals[s] || 0) + c;
    const st = Object.entries(r.statuses).map(([s, c]) => `${s}×${c}`).join(" ");
    console.log(`+${at}s ${paths[i]}: ${st}, p50 ${r.p50.toFixed(0)}ms, max ${r.max.toFixed(0)}ms`);
  });
  if (evict && waves === 0) {
    // Let the first wave's background work (KV writes, the coordinator handoff) land first — it is
    // the leader's write that other locations haven't seen yet. Locally it also matters: wrangler
    // deleting from the local KV store while workerd still writes to it crashed `wrangler dev`.
    await sleep(5000);
    evictEntries();
  }
  waves++;
  if (duration && Date.now() - t0 < duration) await sleep(interval);
} while (duration && Date.now() - t0 < duration);
console.log(`${waves} wave(s), ${waves * n * paths.length} requests — ${Object.entries(totals).map(([s, c]) => `${s}×${c}`).join(" ")}`);

// ── summary ──────────────────────────────────────────────────────────────────
if (!logFile && !tail) process.exit(0);
await stopLog();
const per = new Map();
for (const [, kind, key] of logText.matchAll(/\[cache\] (rebuilt|reused) (\S+)/g)) {
  const entry = key.split("|").slice(1).join("|"); // drop the build id
  const c = per.get(entry) ?? { rebuilt: 0, reused: 0 };
  c[kind]++;
  per.set(entry, c);
}
console.log("\ncache entry                                                   rebuilt  reused");
for (const [entry, c] of [...per].sort()) {
  console.log(`${entry.padEnd(60).slice(0, 60)}  ${String(c.rebuilt).padStart(7)}  ${String(c.reused).padStart(6)}`);
}
const extra = [...per].filter(([, c]) => c.rebuilt > 1);
const kv429 = (logText.match(/429 Too Many Requests/g) || []).length;
const kvWrites = (logText.match(/\[KVIncrementalCache\]\s+set /g) || []).length;
const errors = (logText.match(/Error|exception|\(error\)/gi) || []).length - kv429;
console.log(
  extra.length
    ? `\n✗ ${extra.length} entr${extra.length === 1 ? "y" : "ies"} rebuilt more than once`
    : per.size
      ? `\n✓ one rebuild per cache entry (${per.size} entries)`
      : "\n· no rebuilds logged (everything was already cached?)"
);
if (kvWrites) console.log(`${kvWrites === per.size ? "✓" : "✗"} ${kvWrites} KV write(s) for ${per.size} rebuilt entr${per.size === 1 ? "y" : "ies"}`);
console.log(kv429 ? `✗ ${kv429} × KV PUT 429 Too Many Requests` : "✓ no KV 429s");
if (errors > 0) console.log(`! ${errors} other error-looking log line(s) — check the log`);
process.exit(extra.length || kv429 || (kvWrites && kvWrites !== per.size) ? 1 : 0);
