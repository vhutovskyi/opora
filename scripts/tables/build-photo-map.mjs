// Reads the supplier photo dump and works out, for every JPG, WHICH COLOUR COMBINATION it shows —
// writing scripts/tables/photo-map.json, which the import route consumes.
//
// Why this exists: the filenames carry no colour information at all (and in several folders they
// are outright junk — "1.jpg", Cyrillic letters, "EDGAR 1.jpg" next to "EDGAR (1).jpg"), so the
// mapping has to be recovered from the pixels. What makes that tractable is the way the renders
// are laid out:
//
//   • A folder holds 33 photos per rendered VIEW (closed / extended / folded): 11 tabletops × 3
//     leg colours. Nothing about which photo is which comes from the file order — an earlier
//     version assumed 11 consecutive TRIPLETS, and in the folders that mix two or three naming
//     schemes (EDGAR SLIDE/розкладний has four) the sort interleaved the views, which is what put
//     gold legs and the wrong tabletop on розкладний variants.
//   • Views come from the table's filled SHAPE (see `shape`): colour-blind, so all 11 tabletops of
//     one view match each other and the closed/extended renders do not.
//   • Inside a view, LEGS come first (`legCells` + balanced clustering): the three leg colours are
//     far apart, so that split is the reliable one — the most saturated group is Золотий, the
//     darker of the remaining two Чорний, the other Білий.
//   • Only then TRIPLETS: the black-legged photos are matched to the white- and gold-legged ones by
//     tabletop, with the Hungarian algorithm. Photos sharing a leg colour differ ONLY in the top,
//     so the comparison is exact, and every tabletop occurs once per leg colour, so it is a perfect
//     matching rather than 11 independent guesses.
//   • Differencing within/between the resulting triplets then yields exact leg and tabletop pixel
//     masks at full resolution — no hand-tuned crop rectangle, which is what made even earlier
//     attempts misfire on folded views.
//   • Tabletops are named by matching each block's 11 fingerprints against a labelled reference
//     set (ASTON/нерозкладний, named by eye) — again a perfect matching, for the same reason.
//
// Blocks are flagged in `warnings` rather than silently trusted when the matching cost exceeds
// THRESH, the leg colours sit closer than MARGIN, or the dump ships a photo twice (then a
// combination is missing and no grouping can be right). ponytail: no threshold on the tabletop
// matching cost itself — it flagged a fifth of the blocks that eyeballing proved correct (folded
// views legitimately match loosely) and caught nothing these three miss.
// Run with SHEETS=1 for scripts/tables/sheets/*.jpg — contact sheets laid out as rows = blocks,
// columns = materials, where a bad row is obvious at a glance — and block-sheet.mjs for the
// tabletop × legs grid of a single block.
//
// ponytail: flag + eyeball the minority instead of modelling it — a defective block is faster to
// fix by hand than to teach the script about.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.argv[2] || path.join(process.env.HOME, "Downloads/TABLES");
const OUT = path.join(import.meta.dirname, "photo-map.json");
const SHEET_DIR = path.join(import.meta.dirname, "sheets");
const S = +(process.env.RES || 320); // working resolution — the tabletop is a small part of the
// frame on round models, and 192 was too coarse to tell Білий from Мармур Кришталь there.
// ONLY=<substring> limits the run to matching folders (plus the reference) while iterating.
const ONLY = process.env.ONLY;
const THRESH = 30; // matching cost above which a block is flagged for manual review
const MARGIN = 25; // RGB gap between the three leg colours below which the split is suspect

// Reference labelling: ASTON/нерозкладний, triplets in file order, named by looking at them.
const REF_BLOCK = "ASTON/нерозкладний";
const REF = ["Дуб Сонома", "Дуб Ендгрейн", "Білий", "Антрацит", "Камінь П'єтра Гріджіо Чорний",
  "Кашемір", "Ясен Серфсайд", "Бетонний Камінь", "Мармур Кришталь", "Горіх Франклін", "Дуб Крафт Золотий"];
// Canonical order used by the price list and the contact sheets.
export const MATERIALS = ["Кашемір", "Ясен Серфсайд", "Антрацит", "Білий", "Бетонний Камінь",
  "Горіх Франклін", "Дуб Ендгрейн", "Дуб Крафт Золотий", "Дуб Сонома", "Мармур Кришталь",
  "Камінь П'єтра Гріджіо Чорний"];
export const LEGS = ["Чорний мат", "Білий мат", "Золотий мат"];

const listPhotos = (dir) => {
  const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f));
  const num = (f) => { const m = f.match(/\((\d+)\)/); return m ? +m[1] : 0; };
  const base = (f) => f.replace(/\s*\(\d+\)/, "").replace(/\.jpe?g$/i, "");
  files.sort((a, b) => base(a).localeCompare(base(b), "en") || num(a) - num(b));
  return files;
};

const load = (dir, files) =>
  Promise.all(files.map((f) => sharp(path.join(dir, f)).resize(S, S, { fit: "fill" }).removeAlpha().raw().toBuffer()));

function leafDirs(root) {
  const out = [];
  const walk = (d) => {
    const subs = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (!subs.length) { if (fs.readdirSync(d).some((f) => /\.jpe?g$/i.test(f))) out.push(d); return; }
    subs.forEach((s) => walk(path.join(d, s.name)));
  };
  walk(root);
  return out.sort();
}

// Legs = pixels that move WITHIN a triplet. Tabletop = pixels that move BETWEEN triplets but not
// within one. Taking the masks from the data means nothing depends on where the table sits.
// `tri` is an array of triplets, each three raw RGB buffers.
function masks(tri) {
  const n = S * S, T = tri.length;
  const legVar = new Float64Array(n), topVar = new Float64Array(n), triMean = [];
  for (const t of tri) {
    const m = new Float64Array(n * 3);
    for (let k = 0; k < 3; k++) for (let i = 0; i < n * 3; i++) m[i] += t[k][i] / 3;
    triMean.push(m);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) v += Math.abs(t[k][i * 3 + c] - m[i * 3 + c]);
      legVar[i] += v / T;
    }
  }
  const all = new Float64Array(n * 3);
  for (const m of triMean) for (let i = 0; i < n * 3; i++) all[i] += m[i] / T;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const m of triMean) for (let c = 0; c < 3; c++) v += Math.abs(m[i * 3 + c] - all[i * 3 + c]) / T;
    topVar[i] = v;
  }
  const order = (a) => [...a.keys()].sort((x, y) => a[y] - a[x]);
  const legIdx = order(legVar).slice(0, Math.round(n * 0.04));
  const legCut = legVar[legIdx[legIdx.length - 1]];
  const topIdx = order(topVar).filter((i) => legVar[i] < legCut).slice(0, Math.round(n * 0.04));
  return { legIdx, topIdx };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const pct = (a, ps) => { const s = [...a].sort((x, y) => x - y); return ps.map((p) => s[Math.floor((s.length - 1) * p)]); };
const medianRgb = (img, idx) => [0, 1, 2].map((c) => Math.round(pct(idx.map((i) => img[i * 3 + c]), [0.5])[0]));
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lumOf = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const satOf = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

// Colour percentiles per channel + spread. Percentiles, not averages: they separate veined stone
// from flat white, which have near-identical means.
function feature(img, idx) {
  const ch = [[], [], []], l = [];
  for (const i of idx) {
    for (let c = 0; c < 3; c++) ch[c].push(img[i * 3 + c]);
    l.push(0.299 * img[i * 3] + 0.587 * img[i * 3 + 1] + 0.114 * img[i * 3 + 2]);
  }
  const P = [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98];
  return [...pct(ch[0], P), ...pct(ch[1], P), ...pct(ch[2], P), std(l) * 3, std(ch[0]) * 2, std(ch[2]) * 2]
    .map((v) => Math.round(v * 10) / 10);
}

function hungarian(cost) {
  const n = cost.length, m = cost[0].length;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1).fill(-1), way = new Int32Array(m + 1);
  for (let i = 0; i < n; i++) {
    p[m] = i; let j0 = m;
    const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = -1;
      for (let j = 0; j < m; j++) if (!used[j]) {
        const cur = cost[i0][j] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== -1);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== m);
  }
  const res = new Int32Array(n);
  for (let j = 0; j < m; j++) if (p[j] >= 0) res[p[j]] = j;
  return res;
}

// ---- structure from pixels: views, then leg colours, then triplets ----

// Coarse RGB grid. Cell statistics over one view are what reveal the structure (see cellRoles).
const POOL = 24;
function coarse(img) {
  const b = S / POOL, out = new Float64Array(POOL * POOL * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (((y / b) | 0) * POOL + ((x / b) | 0)) * 3, i = (y * S + x) * 3;
    for (let c = 0; c < 3; c++) out[o + c] += img[i + c] / (b * b);
  }
  return out;
}
const cellRgb = (f, c) => [f[c * 3], f[c * 3 + 1], f[c * 3 + 2]];
const chDist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cellsDist = (fa, fb, cs) => Math.sqrt(cs.reduce((s, c) => s + [0, 1, 2].reduce((t, k) => t + (fa[c * 3 + k] - fb[c * 3 + k]) ** 2, 0), 0) / (cs.length * 3));
const cellsMean = (f, cs) => [0, 1, 2].map((k) => cs.reduce((s, c) => s + f[c * 3 + k], 0) / cs.length);

// Table shape, filled per ROW between the first and last pixel that differs from that row's own
// background. Per-row, because the backdrop is a gradient; filled, because that makes the mask
// colour-blind — a white tabletop that melts into the backdrop still yields the whole slab. This is
// what separates VIEWS (closed / extended / packed) without reacting to the colours.
function shape(img) {
  const m = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    const side = [];
    for (let x = 0; x < S * 0.08; x++) { side.push((y * S + x) * 3); side.push((y * S + (S - 1 - x)) * 3); }
    const bg = [0, 1, 2].map((c) => pct(side.map((i) => img[i + c]), [0.5])[0]);
    let first = -1, last = -1;
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let c = 0; c < 3; c++) s += Math.abs(img[(y * S + x) * 3 + c] - bg[c]);
      if (s > 14) { if (first < 0) first = x; last = x; }
    }
    if (first >= 0) for (let x = first; x <= last; x++) m[y * S + x] = 1;
  }
  return m;
}
const maskDist = (a, b) => { let diff = 0, uni = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) diff++; if (a[i] || b[i]) uni++; } return uni ? diff / uni : 0; };

// Split the folder into V views of `per` photos: every combination of V medoids is scored and the
// cheapest wins, then photos are assigned to it in balanced fashion. Exhaustive, because seeded
// clustering picked an outlier as its second seed and mixed ASTON/розкладний's two views — which
// then made the tabletop matching below meaningless. ≤ C(99,3) combinations, so it stays cheap.
function splitViews(D, V, per) {
  const n = D.length;
  if (V < 2) return [[...Array(n).keys()]];
  let best = null, bestCost = Infinity;
  const search = (from, chosen) => {
    if (chosen.length === V) {
      let c = 0;
      for (let i = 0; i < n; i++) c += Math.min(...chosen.map((m) => D[i][m]));
      if (c < bestCost) { bestCost = c; best = [...chosen]; }
      return;
    }
    for (let i = from; i <= n - (V - chosen.length); i++) search(i + 1, [...chosen, i]);
  };
  search(0, []);
  const groups = best.map(() => []);
  [...hungarian(D.map((row) => best.flatMap((m) => Array(per).fill(row[m]))))]
    .forEach((slot, i) => groups[(slot / per) | 0].push(i));
  return groups;
}

// Balanced k-medoids/k-means: `per` items to each of the k groups, seeded by farthest-point
// sampling and assigned with the Hungarian algorithm (k × per slots). Balanced because the layout
// guarantees it — each view holds every colour once, each leg colour appears once per tabletop.
function balanced(items, k, per, dist, centroid) {
  if (k < 2) return [[...items.keys()]];
  let cen = [items[0]];
  while (cen.length < k) {
    const far = items.reduce((bi, it, i) =>
      Math.min(...cen.map((c) => dist(it, c))) > Math.min(...cen.map((c) => dist(items[bi], c))) ? i : bi, 0);
    cen.push(items[far]);
  }
  let groups = [];
  for (let iter = 0; iter < 4; iter++) {
    const cost = items.map((it) => cen.flatMap((c) => Array(per).fill(dist(it, c))));
    groups = cen.map(() => []);
    [...hungarian(cost)].forEach((slot, i) => groups[(slot / per) | 0].push(i));
    cen = groups.map((g, j) => (g.length ? centroid(g.map((i) => items[i])) : cen[j]));
  }
  return groups;
}
// Which cells show the LEGS, from counting alone: inside one view a leg cell takes 3 values (one per
// leg colour), so each of its values repeats ≈ tops times, while a tabletop cell takes `tops` values
// and each repeats ≈ 3 times. No crop rectangle, no assumption about where the table sits — just
// "how many photos share this cell's colour".
function legCells(f, tops) {
  const out = [];
  for (let c = 0; c < POOL * POOL; c++) {
    const v = f.map((z) => cellRgb(z, c));
    if (varyAt(f, c) < 4) continue; // constant → background
    const biggest = Math.max(...v.map((a) => v.filter((b) => chDist(a, b) < 8).length));
    if (biggest >= tops - 2 && biggest <= tops + 2) out.push(c);
  }
  return out;
}
// Mean absolute deviation of one cell across a set of photos.
const varyAt = (imgs, c) => {
  const mu = [0, 1, 2].map((k) => imgs.reduce((s, z) => s + z[c * 3 + k], 0) / imgs.length);
  return imgs.reduce((s, z) => s + chDist(cellRgb(z, c), mu), 0) / imgs.length;
};
// Tabletop cells, measured inside ONE leg colour: there the legs never move, so whatever varies is
// the tabletop (or its reflection). Counting repeats does not work here — on round models half the
// décors are pale enough to share a cell's colour, which put tabletop cells in the leg bucket and
// left the matching below with nothing to go on.
const topCells = (f, skip) => [...Array(POOL * POOL).keys()].filter((c) => !skip.has(c) && varyAt(f, c) > 6);

// ---- pass 1: split every folder into views and triplets, detect legs, fingerprint tabletops ----
const report = [];
for (const dir of leafDirs(ROOT)) {
  const rel = path.relative(ROOT, dir).normalize("NFC");
  if (ONLY && !rel.includes(ONLY) && rel !== REF_BLOCK.normalize("NFC")) continue;
  const all = listPhotos(dir);
  const out = [];
  const imgsAll = await load(dir, all);
  const V = Math.max(1, Math.round(all.length / (REF.length * 3)));
  const perView = Math.round(all.length / V);
  if (all.length % (V * 3)) {
    out.push({ view: 0, error: `${all.length} photos is not ${V} view(s) of whole triplets`, files: all });
    report.push({ rel, files: all.length, blocks: out });
    continue;
  }
  const shapes = imgsAll.map(shape);
  const views = splitViews(shapes.map((a) => shapes.map((b) => maskDist(a, b))), V, perView)
    // Views keep FILE order where the names allow it, so the reference labelling below (and the
    // photo order in the gallery) stays what a human reading the folder would expect.
    .map((g) => g.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
  for (const [view, group] of views.entries()) {
    const files = group.map((i) => all[i]);
    const tops = group.length / 3;
    if (group.length !== perView) { out.push({ view, error: `view of ${group.length} photos, expected ${perView}`, files }); continue; }
    const f = group.map((i) => coarse(imgsAll[i]));
    // Duplicate renders mean a combination is MISSING from the dump (ASTON/розкладний ships
    // EDGAR (33).jpg twice), and the 11 × 3 grid then cannot come out right whatever we do here.
    const all2 = [...Array(POOL * POOL).keys()];
    const dups = f.filter((z, i) => f.slice(0, i).some((y) => cellsDist(z, y, all2) < 0.5)).length;
    const legIdxCells = legCells(f, tops);
    if (legIdxCells.length < 5) {
      out.push({ view, error: `cannot find the legs (${legIdxCells.length} cells)`, files });
      continue;
    }
    // Legs first: the three leg colours are far apart, so this split is the reliable one — and it
    // makes the tabletop comparison exact, because photos sharing a leg colour differ ONLY in the
    // top (no leg reflections or shadows moving around to confuse the match).
    const legCols = f.map((z) => cellsMean(z, legIdxCells));
    const legGroups = balanced(legCols, 3, tops, rgbDist, (g) => [0, 1, 2].map((k) => g.reduce((s, x) => s + x[k], 0) / g.length));
    const cen = legGroups.map((g) => [0, 1, 2].map((k) => g.reduce((s, i) => s + legCols[i][k], 0) / g.length));
    const sats = cen.map(satOf), lums = cen.map(lumOf);
    const gi = sats.indexOf(Math.max(...sats));
    const restI = [0, 1, 2].filter((i) => i !== gi);
    const bi = lums[restI[0]] < lums[restI[1]] ? restI[0] : restI[1];
    const wi = restI.find((i) => i !== bi);
    const legMargin = Math.min(rgbDist(cen[0], cen[1]), rgbDist(cen[0], cen[2]), rgbDist(cen[1], cen[2]));
    // Then triplets: match the black-legged photos to the white- and gold-legged ones by tabletop.
    // Two Hungarian matchings, not a greedy nearest neighbour — every tabletop occurs exactly once
    // per leg colour, which is a perfect matching, and two near-identical décors (Мармур / Білий)
    // only get told apart by solving them together.
    const tc = topCells(legGroups[bi].map((i) => f[i]), new Set(legIdxCells));
    if (tc.length < 5) { out.push({ view, error: `cannot find the tabletop (${tc.length} cells)`, files }); continue; }
    const matchTo = (other) => {
      const cost = legGroups[bi].map((i) => legGroups[other].map((j) => cellsDist(f[i], f[j], tc)));
      const asg = [...hungarian(cost)];
      return { pick: asg.map((j) => legGroups[other][j]), cost: asg.map((j, i) => cost[i][j]) };
    };
    const mw = matchTo(wi), mg = matchTo(gi);
    const order = legGroups[bi].map((_, i) => i).sort((a, b) => group[legGroups[bi][a]] - group[legGroups[bi][b]]);
    const tri = order.map((i) => [legGroups[bi][i], mw.pick[i], mg.pick[i]].map((j) => imgsAll[group[j]]));
    const triFiles = order.map((i) => [legGroups[bi][i], mw.pick[i], mg.pick[i]].map((j) => all[group[j]]));
    const { legIdx, topIdx } = masks(tri);
    const ys = topIdx.map((i) => (i / S) | 0), xs = topIdx.map((i) => i % S);
    const box = {
      l: pct(xs, [0.12])[0] / S, r: (pct(xs, [0.88])[0] + 1) / S,
      t: pct(ys, [0.15])[0] / S, b: (pct(ys, [0.7])[0] + 1) / S,
    };
    // tri/triFiles are ordered [black, white, gold] legs by construction.
    const triplets = tri.map((three, t) => ({
      legs: { "Чорний мат": triFiles[t][0], "Білий мат": triFiles[t][1], "Золотий мат": triFiles[t][2] },
      feat: feature(three[0], topIdx),
      // Median over the mask, not the mean: robust to the highlight and the shadowed edge.
      swatch: medianRgb(three[0], topIdx),
      legSwatch: {
        "Чорний мат": medianRgb(three[0], legIdx),
        "Білий мат": medianRgb(three[1], legIdx),
        "Золотий мат": medianRgb(three[2], legIdx),
      },
      legMargin,
    }));
    out.push({ view, files: files.length, box, triplets, dups });
  }
  report.push({ rel, files: all.length, blocks: out });
}

// ---- pass 2: name the tabletops, refining the reference from the blocks that match best ----
const rows = [];
for (const r of report) for (const b of r.blocks) if (b.triplets) rows.push({ key: `${r.rel}|${b.view}`, f: b.triplets.map((t) => t.feat) });
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); };

let ref = report.find((r) => r.rel === REF_BLOCK.normalize("NFC")).blocks[0].triplets.map((t) => t.feat);
let match = {};
for (let iter = 0; iter < 4; iter++) {
  match = {};
  for (const row of rows) {
    const cost = row.f.map((f) => ref.map((rf) => dist(f, rf)));
    const asg = hungarian(cost);
    match[row.key] = [...asg].map((j, i) => ({ mat: REF[j], j, cost: +cost[i][j].toFixed(1) }));
  }
  const scored = rows.map((r) => ({ r, max: Math.max(...match[r.key].map((x) => x.cost)) })).sort((a, b) => a.max - b.max);
  const acc = REF.map(() => null);
  for (const { r } of scored.slice(0, Math.round(scored.length * 0.6))) {
    match[r.key].forEach((x, i) => {
      if (!acc[x.j]) acc[x.j] = { s: r.f[i].map(() => 0), n: 0 };
      r.f[i].forEach((v, k) => (acc[x.j].s[k] += v));
      acc[x.j].n++;
    });
  }
  ref = acc.map((a, j) => (a ? a.s.map((v) => v / a.n) : ref[j]));
}

// ---- output ----
// Colour swatches, averaged over the blocks that matched confidently — every render is lit the
// same way, so the median tabletop/leg colour is a fair chip for the option value.
const swatchAcc = new Map();
const addSwatch = (name, rgb) => {
  const a = swatchAcc.get(name) ?? { s: [0, 0, 0], n: 0 };
  rgb.forEach((v, i) => (a.s[i] += v));
  a.n++;
  swatchAcc.set(name, a);
};

const map = {};
let flaggedBlocks = 0;
for (const r of report) {
  const photos = [], warnings = [];
  for (const b of r.blocks) {
    const before = warnings.length;
    if (b.error) { warnings.push(`v${b.view}: ${b.error}`); flaggedBlocks++; continue; }
    const asg = match[`${r.rel}|${b.view}`];
    const worst = Math.max(...asg.map((x) => x.cost));
    if (b.dups) warnings.push(`v${b.view}: ${b.dups} duplicate render(s) — a combination is missing from the dump`);
    const margin = Math.min(...b.triplets.map((t) => t.legMargin));
    if (margin < MARGIN) warnings.push(`v${b.view}: leg colours barely separable (${margin.toFixed(2)})`);
    if (worst > THRESH) warnings.push(`v${b.view}: low confidence (${worst.toFixed(0)}) — verify by eye`);
    if (warnings.length > before) flaggedBlocks++;
    b.triplets.forEach((t, i) => {
      for (const [legs, file] of Object.entries(t.legs)) photos.push({ file, view: b.view, top: asg[i].mat, legs, cost: asg[i].cost });
      if (worst <= THRESH) {
        addSwatch(asg[i].mat, t.swatch);
        for (const [legs, rgb] of Object.entries(t.legSwatch)) addSwatch(legs, rgb);
      }
    });
  }
  map[r.rel] = { photos, warnings };
}
// The renders are lit, and the two surfaces are lit differently — tabletops face the key light,
// legs are side-lit, so raw samples read as greys (white legs sample at ~#c2c2c2). Each surface is
// therefore scaled by its own gain, chosen so the member that IS white ("Білий" décor, "Білий мат"
// legs) lands on near-white; everything else keeps its relative tone. Clamped, so no channel wraps.
const avg = (name) => { const a = swatchAcc.get(name); return a ? a.s.map((v) => v / a.n) : null; };
const gainFor = (whiteName, target) => { const w = avg(whiteName); return w ? target / (w.reduce((x, y) => x + y, 0) / 3) : 1; };
const topGain = gainFor("Білий", 242);
const legGain = gainFor("Білий мат", 240);

const swatches = {};
for (const name of [...MATERIALS, ...LEGS]) {
  const a = avg(name);
  if (!a) continue;
  const g = LEGS.includes(name) ? legGain : topGain;
  swatches[name] = toHex(a.map((v) => v * g));
}
fs.writeFileSync(OUT, JSON.stringify({ ...map, _swatches: swatches }, null, 1));
console.log("swatches:", swatches);
const total = Object.values(map).reduce((n, v) => n + v.photos.length, 0);
console.log(`${total} photos across ${Object.keys(map).length} folders → ${path.relative(process.cwd(), OUT)}`);
console.log(`${rows.length - flaggedBlocks}/${rows.length} blocks confident; flagged:`);
for (const [k, v] of Object.entries(map)) if (v.warnings.length) console.log(`  ${k} — ${v.warnings.join("; ")}`);

if (process.env.SHEETS) {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  const CW = 96, CH = 54, LW = 260, HDR = 60, PER = 10;
  const all = [];
  for (const r of report) for (const b of r.blocks) if (b.triplets) all.push({ rel: r.rel, b });
  const crop = async (file, box) => {
    const m = await sharp(file).metadata();
    const l = Math.round(box.l * m.width), w = Math.max(8, Math.round((box.r - box.l) * m.width));
    const t = Math.round(box.t * m.height), h = Math.max(8, Math.round((box.b - box.t) * m.height));
    return sharp(file).extract({ left: l, top: t + Math.round(h * 0.12), width: w, height: Math.max(4, Math.round(h * 0.55)) })
      .resize(CW, CH, { fit: "cover" }).toBuffer();
  };
  for (let s = 0; s * PER < all.length; s++) {
    const chunk = all.slice(s * PER, s * PER + PER);
    const W = LW + MATERIALS.length * (CW + 4) + 8, H = HDR + chunk.length * (CH + 6) + 8;
    const tiles = [], svg = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
    MATERIALS.forEach((m, c) => svg.push(`<text transform="translate(${LW + c * (CW + 4) + CW / 2},${HDR - 6}) rotate(-32)" font-size="13" font-family="sans-serif">${esc(m)}</text>`));
    for (const [ri, row] of chunk.entries()) {
      const y = HDR + ri * (CH + 6);
      svg.push(`<text x="4" y="${y + CH / 2 + 4}" font-size="12" font-family="sans-serif">${esc(row.rel)} v${row.b.view}</text>`);
      const asg = match[`${row.rel}|${row.b.view}`];
      for (const [ti, tr] of row.b.triplets.entries()) {
        const c = MATERIALS.indexOf(asg[ti].mat);
        if (c < 0) continue;
        tiles.push({ input: await crop(path.join(ROOT, row.rel, tr.legs["Чорний мат"]), row.b.box), left: LW + c * (CW + 4), top: y });
      }
    }
    await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), top: 0, left: 0 }, ...tiles])
      .jpeg({ quality: 90 }).toFile(path.join(SHEET_DIR, `sheet${s}.jpg`));
  }
  console.log(`contact sheets → ${path.relative(process.cwd(), SHEET_DIR)}/`);
}
