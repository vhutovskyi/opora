// Estella «Колір» code → { name, hex }.
// Hexes sampled from the «Кольорова гама» swatch sheet — approximate, tune against the real image.
export const ESTELLA_COLORS: Record<string, { name: string; hex: string }> = {
  "101": { name: "Горіх темний", hex: "#6B4423" },
  "102": { name: "Бук", hex: "#E4C9A0" },
  "103": { name: "Горіх світлий", hex: "#B0702F" },
  "104": { name: "Червоне дерево", hex: "#7A2318" },
  "105": { name: "Вільха", hex: "#C46A2E" },
  "106": { name: "Венге", hex: "#2B211C" },
  "107": { name: "Білий", hex: "#F2EFEA" },
  "108": { name: "Каштан", hex: "#9C3B24" },
  "109": { name: "Сірий", hex: "#9A9A9A" },
  "110": { name: "Рожевий", hex: "#E6D2D0" },
};

// Two-tone finishes = base wood + Білий (107). Code = 170 + (base − 100).
const ESTELLA_TWO_TONE: Record<string, string> = {
  "171": "101",
  "172": "102",
  "173": "103",
  "174": "104",
  "175": "105",
  "176": "106",
  "177": "107",
  "178": "108",
  "179": "109",
  "180": "110",
};

// Component colours for a «Колір» code: one entry for a solid finish, two for a
// two-tone (base + Білий), [] if unknown. Promotion links one option per entry,
// so the storefront renders a solid or split swatch automatically.
export function estellaColorParts(code: string): { name: string; hex: string }[] {
  if (ESTELLA_COLORS[code]) return [ESTELLA_COLORS[code]];
  const base = ESTELLA_TWO_TONE[code];
  return base ? [ESTELLA_COLORS[base], ESTELLA_COLORS["107"]] : [];
}
