// Renders ONE block of photo-map.json as an 11 × 3 grid — rows = tabletop, columns = legs — so a
// flagged block can be checked at a glance: every row must show one tabletop and every column one
// leg colour. This is the decisive check that the contact sheets from build-photo-map.mjs (SHEETS=1)
// cannot give, because those crop the tabletop only and say nothing about the legs.
//
//   node scripts/tables/block-sheet.mjs "EDGAR SLIDE/розкладний" 0 [out.jpg]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.env.TABLES_ROOT || path.join(process.env.HOME, "Downloads/TABLES");
const MAP = path.join(import.meta.dirname, "photo-map.json");
const MATERIALS = ["Кашемір", "Ясен Серфсайд", "Антрацит", "Білий", "Бетонний Камінь",
  "Горіх Франклін", "Дуб Ендгрейн", "Дуб Крафт Золотий", "Дуб Сонома", "Мармур Кришталь",
  "Камінь П'єтра Гріджіо Чорний"];
const LEGS = ["Чорний мат", "Білий мат", "Золотий мат"];

const [rel, view, out = "/tmp/block.jpg"] = [process.argv[2].normalize("NFC"), +process.argv[3], process.argv[4]];
const photos = JSON.parse(fs.readFileSync(MAP, "utf8"))[rel].photos.filter((p) => p.view === view);

const CW = 200, CH = 130, LW = 190, HDR = 22;
const W = LW + LEGS.length * (CW + 3), H = HDR + MATERIALS.length * (CH + 3);
const tiles = [], svg = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
LEGS.forEach((l, c) => svg.push(`<text x="${LW + c * (CW + 3)}" y="15" font-size="13" font-family="sans-serif">${l}</text>`));
for (const [r, mat] of MATERIALS.entries()) {
  const y = HDR + r * (CH + 3);
  svg.push(`<text x="2" y="${y + CH / 2}" font-size="12" font-family="sans-serif">${esc(mat)}</text>`);
  for (const [c, legs] of LEGS.entries()) {
    const p = photos.find((x) => x.top === mat && x.legs === legs);
    if (!p) continue;
    tiles.push({ input: await sharp(path.join(ROOT, rel, p.file)).resize(CW, CH, { fit: "cover" }).toBuffer(), left: LW + c * (CW + 3), top: y });
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
  .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), top: 0, left: 0 }, ...tiles])
  .jpeg({ quality: 82 }).toFile(out);
console.log(out);
