// A short label for an option value: in the DB it can look like "Група: Значення".
export const shortValue = (v: string) => (v.includes(':') ? v.split(':').pop()!.trim() : v);

// "80x190" → [80, 190], so that sizes are sorted as numbers rather than as strings
// (otherwise "120x190" would end up before "80x190").
const parseSizeParts = (v: string): [number, number] | null => {
  const m = v.match(/(\d+)\D+(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

export const sortSizeValues = (vals: string[]) =>
  [...vals].sort((a, b) => {
    const pa = parseSizeParts(a);
    const pb = parseSizeParts(b);
    return pa && pb ? pa[0] - pb[0] || pa[1] - pb[1] : a.localeCompare(b);
  });
