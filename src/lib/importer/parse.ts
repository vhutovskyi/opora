// Small helpers for parsing the CSV export rows (a one-off migration from Airtable).

export const s = (v: unknown) => (v == null ? "" : String(v).trim());
export const bool = (v: unknown) => s(v).toLowerCase() === "checked" || s(v).toLowerCase() === "true";
export const num = (v: unknown) => {
  const n = parseFloat(s(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const urls = (v: unknown) => s(v).split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
export const optionNames = (v: unknown) => s(v).split(",").map((n) => n.trim()).filter(Boolean);
// "19.5.2026" (D.M.YYYY) → "2026-05-19"; anything unparseable → null.
export const isoDate = (v: unknown) => {
  const parts = s(v).split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
