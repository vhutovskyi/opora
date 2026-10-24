// Merged table cells with no new fields in the schema: a `<` cell merges with the neighbour
// to its LEFT (colspan), `^` — with the cell ABOVE (rowspan). That is how the admin draws
// "Відстань між ламелями" across two columns and "Довжина спального місця" across two rows,
// while `rows: string[][]` stays the same.

export type TableCell = { text: string; rowSpan: number; colSpan: number; show: boolean };

export function tableSpans(rows: string[][]): TableCell[][] {
  const grid: TableCell[][] = rows.map((r) => r.map((text) => ({ text, rowSpan: 1, colSpan: 1, show: true })));

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const mark = grid[i][j].text.trim();
      if (mark === "<") {
        // The nearest visible cell to the left — that is the one that stretches.
        let k = j - 1;
        while (k >= 0 && !grid[i][k].show) k--;
        if (k >= 0) {
          grid[i][k].colSpan++;
          grid[i][j].show = false;
        }
      } else if (mark === "^") {
        let k = i - 1;
        while (k >= 0 && !grid[k][j]?.show) k--;
        if (k >= 0 && grid[k][j]) {
          grid[k][j].rowSpan++;
          grid[i][j].show = false;
        }
      }
    }
  }
  return grid;
}
