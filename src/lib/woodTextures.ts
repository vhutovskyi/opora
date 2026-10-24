// Wood texture photos for the "Масив vs Щит" comparison in the "Матеріал" axis modal.
//
// The supplier gave one photo per colour code in each finish: solid wood is one continuous
// lamella over the whole length (20000×2000), the panel is short slats glued "brickwork style"
// (2428×1200). Both are centre-cropped to 4:1 and reduced to a 1200×300 webp, so that
// the difference (continuous grain versus visible joints) reads at first glance.
// ponytail: the same framing instead of matching the real physical scale — the supplier gave no
// exact texture dimensions, and comparing the joints doesn't need them.
import { ESTELLA_COLORS } from "@/lib/estella/colors";

// The codes the supplier gave textures for (107 Білий, 109 Сірий, 110 Рожевий are missing —
// those are painted rather than natural finishes).
const TEXTURE_CODES = new Set(["101", "102", "103", "104", "105", "106", "108"]);

// The value of the "Колір" option in the DB is a hex from ESTELLA_COLORS, so we recover the code by a reverse
// mapping (see src/lib/estella/colors.ts).
const CODE_BY_HEX = new Map(
  Object.entries(ESTELLA_COLORS).map(([code, { hex }]) => [hex.toLowerCase(), code])
);

const DEFAULT_CODE = "101"; // Горіх темний — the joints are most visible on it

export type WoodComparison = {
  masyv: string;
  shchyt: string;
  colorName: string;
  // false → the selected colour has no texture, we show an example on another one
  exact: boolean;
};

// A "solid wood / panel" photo pair for the selected colour (the hex value of the "Колір" option).
export function woodComparison(hex: string | null | undefined): WoodComparison {
  const code = hex ? CODE_BY_HEX.get(hex.trim().toLowerCase()) : undefined;
  const exact = !!code && TEXTURE_CODES.has(code);
  const used = exact ? code! : DEFAULT_CODE;
  return {
    masyv: `/textures/wood/masyv-${used}.webp`,
    shchyt: `/textures/wood/shchyt-${used}.webp`,
    colorName: ESTELLA_COLORS[used]?.name ?? "",
    exact,
  };
}
