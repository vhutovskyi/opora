#!/usr/bin/env python3
"""Build before/after contact sheets of the pixels the batch actually changed.

Reviewing 2048px full frames to judge a 30px edit does not work. This diffs
input vs output, crops each changed region from both, and tiles them
before|after so a whole batch can be eyeballed in a few sheets.
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

CROP = 220          # size of the square crop taken around each change, in source px
CELL = 190          # size each crop is drawn at in the sheet
COLS = 6            # before|after pairs per row
PAD = 8
LABEL_H = 18


def changed_regions(before, after):
    """Bounding boxes of every region that differs between the two images."""
    diff = cv2.cvtColor(cv2.absdiff(before, after), cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(diff, 12, 255, cv2.THRESH_BINARY)
    if not np.any(mask):
        return []
    # merge nearby pixels so one cap is one box, not fifty
    mask = cv2.dilate(mask, np.ones((15, 15), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return [tuple(stats[i][:4]) for i in range(1, n)]


def crop_around(img, x, y, w, h, size):
    cy, cx = y + h // 2, x + w // 2
    half = size // 2
    y1 = min(max(cy - half, 0) + size, img.shape[0])
    x1 = min(max(cx - half, 0) + size, img.shape[1])
    y0, x0 = max(y1 - size, 0), max(x1 - size, 0)
    return img[y0:y1, x0:x1]


def build(input_dir, output_dir, sheet_dir, limit):
    Path(sheet_dir).mkdir(parents=True, exist_ok=True)
    pairs = []
    for out_path in sorted(Path(output_dir).iterdir()):
        if not out_path.is_file() or out_path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        in_path = Path(input_dir) / out_path.name
        if not in_path.exists():
            continue
        before, after = cv2.imread(str(in_path)), cv2.imread(str(out_path))
        if before is None or after is None or before.shape != after.shape:
            continue
        for (x, y, w, h) in changed_regions(before, after):
            scale = ((before.shape[0] * before.shape[1]) ** 0.5) / 2048
            size = max(int(CROP * scale), 60)
            b = crop_around(before, x, y, w, h, size)
            a = crop_around(after, x, y, w, h, size)
            if b.size == 0 or a.size == 0:
                continue
            pairs.append((out_path.name, b, a))

    print(f"{len(pairs)} changed regions found")
    if limit:
        pairs = pairs[:limit]

    per_sheet = COLS * 5
    sheets = []
    for s in range(0, len(pairs), per_sheet):
        chunk = pairs[s:s + per_sheet]
        rows = (len(chunk) + COLS - 1) // COLS
        cell_w = CELL * 2 + PAD
        sheet = np.full((rows * (CELL + LABEL_H + PAD) + PAD,
                         COLS * (cell_w + PAD) + PAD, 3), 32, dtype=np.uint8)
        for i, (name, b, a) in enumerate(chunk):
            r, c = divmod(i, COLS)
            oy = PAD + r * (CELL + LABEL_H + PAD)
            ox = PAD + c * (cell_w + PAD)
            sheet[oy:oy + CELL, ox:ox + CELL] = cv2.resize(b, (CELL, CELL))
            sheet[oy:oy + CELL, ox + CELL + PAD:ox + CELL + PAD + CELL] = cv2.resize(a, (CELL, CELL))
            cv2.putText(sheet, name[-26:], (ox, oy + CELL + 13),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.34, (200, 200, 200), 1, cv2.LINE_AA)
            cv2.putText(sheet, "before", (ox + 4, oy + 14), cv2.FONT_HERSHEY_SIMPLEX,
                        0.38, (0, 220, 255), 1, cv2.LINE_AA)
            cv2.putText(sheet, "after", (ox + CELL + PAD + 4, oy + 14), cv2.FONT_HERSHEY_SIMPLEX,
                        0.38, (0, 255, 120), 1, cv2.LINE_AA)
        p = Path(sheet_dir) / f"review_{s // per_sheet + 1:02d}.png"
        cv2.imwrite(str(p), sheet)
        sheets.append(str(p))
        print("wrote", p)
    return sheets


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="input")
    ap.add_argument("--output", default="output")
    ap.add_argument("--sheets", default="review")
    ap.add_argument("--limit", type=int, default=0, help="max regions to include (0 = all)")
    a = ap.parse_args()
    build(a.input, a.output, a.sheets, a.limit)


if __name__ == "__main__":
    sys.exit(main())
