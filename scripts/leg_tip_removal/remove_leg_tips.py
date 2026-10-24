#!/usr/bin/env python3
"""Batch-remove black rubber tip caps from white/light chair legs in product photos.

Detection: color-mask a dark blob near the bottom of the frame, score it by
size/compactness/darkness and by whether a light "leg" column sits directly
above it, then inpaint only the accepted blobs. See detect_leg_tips() /
replace_leg_tips() for the two pieces a future ML detector could swap in for
detect_leg_tips() without touching anything else.
"""

import argparse
import csv
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# ============================== CONFIG ===============================
# All tunable knobs live here. Nothing below this block should need editing
# to adjust behavior for a new batch of photos.

INPUT_DIR = "input"
OUTPUT_DIR = "output"
DEBUG_DIR = "debug"
MANUAL_OVERRIDES_PATH = "manual_overrides.json"

DEBUG = False
MIN_CONFIDENCE = 0.75

# Connected-component size gate (px^2). Below MIN = antialiasing speck /
# noise; above MAX = shadow or other large dark object, not a foot cap.
# Expressed against REFERENCE_SIDE and rescaled per image, since the catalogue
# mixes 2048x2048 and 4096x4096 exports.
REFERENCE_SIDE = 2048
MIN_COMPONENT_AREA = 20
MAX_COMPONENT_AREA = 4000

# Reject blobs shaped more like a wide flat shadow than a compact cap.
MAX_ASPECT_RATIO = 4.0

# Tips only ever appear in the lower part of the frame (near the floor).
MIN_Y_FRACTION = 0.45

# "Dark" = both of these hold (HSV V and LAB L, 0-255 each).
DARK_V_THRESHOLD = 70
DARK_L_THRESHOLD = 60

# "Light leg material" = bright (LAB L) and low-saturation (HSV S), which
# separates white/gray metal from the warmer beige background and the
# more saturated upholstery.
LEG_MIN_L = 150
LEG_MAX_SAT = 60

MASK_DILATE_PX = 2          # grow accepted mask this many iterations to cover AA edges

# Attachment test: measure the ring of pixels immediately surrounding a blob
# and ask how much of it is leg-colored. Rotation-invariant on purpose — legs
# are diagonal in three-quarter shots, so "directly above" does not hold.
ATTACH_RING_PX = 10
# A tip sits at the END of a leg, so at best ~half its ring is leg and the
# rest is floor; treat this ring fraction as a full-confidence attachment.
ATTACH_FULL_AT = 0.30

# "extend_leg"  - clone leg material from further up the leg's OWN axis down over
#                 the cap. Keeps the silhouette and shading; cap pixels lying
#                 outside the leg sample floor from beside it and stay floor.
# "sample_leg"  - cv2.inpaint (Telea). At a leg END it averages floor colour
#                 across the leg edge, which visibly erodes tips. Fallback only.
# "pure_white"  - flat fill.
REPLACEMENT_MODE = "extend_leg"

# extend_leg: how far up the leg to sample from, as a multiple of the cap's
# extent along the leg axis, plus how far to look when estimating that axis.
EXTEND_SAMPLE_FACTOR = 1.5
EXTEND_AXIS_WINDOW = 4.0    # x max(cap w,h)
EXTEND_FEATHER_PX = 3       # soft edge so the clone does not show a seam
EXTEND_DILATE_PX = 4        # cloning is safe, so grow wider than inpaint to eat the dark halo
PURE_WHITE_BGR = (250, 250, 248)
INPAINT_RADIUS = 5
INPAINT_PADDING = 12        # crop padding (px) around each bbox for local inpaint

JPEG_QUALITY = 95

# Confidence = weighted blend of these sub-scores (each 0-1); should sum to 1.0.
W_AREA = 0.25
W_COMPACTNESS = 0.20
W_ATTACHMENT = 0.40
W_DARKNESS = 0.15

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")

# =======================================================================


@dataclass
class Candidate:
    x: int
    y: int
    w: int
    h: int
    mask: np.ndarray  # full-image-sized uint8, 0/255
    confidence: float
    accepted: bool
    source: str = "auto"  # "auto" | "manual"


def load_image(path):
    """Load an image, preserving an alpha channel if present."""
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"could not read image: {path}")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return img


def split_alpha(img):
    if img.ndim == 3 and img.shape[2] == 4:
        return img[:, :, :3], img[:, :, 3]
    return img, None


def build_masks(bgr):
    """Return (dark_mask, light_leg_mask), both uint8 0/255, image-sized."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)

    v = hsv[:, :, 2]
    s = hsv[:, :, 1]
    l = lab[:, :, 0]

    dark_mask = ((v < DARK_V_THRESHOLD) & (l < DARK_L_THRESHOLD)).astype(np.uint8) * 255
    light_leg_mask = ((l > LEG_MIN_L) & (s < LEG_MAX_SAT)).astype(np.uint8) * 255
    return dark_mask, light_leg_mask


def attachment_score(light_leg_mask, blob_mask, x, y, w, h, scale):
    """How much of the ring hugging the blob is leg-colored.

    Rotation-invariant, so it works on the diagonal legs of three-quarter
    shots as well as on straight-on ones. A floor shadow scores ~0 here
    because it is ringed by floor, not by white metal.
    """
    img_h, img_w = light_leg_mask.shape[:2]
    pad = max(int(round(ATTACH_RING_PX * scale)), 2)
    x0, y0 = max(x - pad, 0), max(y - pad, 0)
    x1, y1 = min(x + w + pad, img_w), min(y + h + pad, img_h)

    blob = blob_mask[y0:y1, x0:x1]
    k = np.ones((2 * pad + 1, 2 * pad + 1), np.uint8)
    ring = cv2.bitwise_and(cv2.dilate(blob, k), cv2.bitwise_not(blob))
    total = np.count_nonzero(ring)
    if total == 0:
        return 0.0
    leg_in_ring = np.count_nonzero(cv2.bitwise_and(ring, light_leg_mask[y0:y1, x0:x1]))
    return min((leg_in_ring / total) / ATTACH_FULL_AT, 1.0)


def compactness_score(contour, w, h):
    bbox_area = max(w * h, 1)
    contour_area = cv2.contourArea(contour)
    return min(contour_area / bbox_area, 1.0)


def area_score(area, scale2):
    lo, hi = MIN_COMPONENT_AREA * scale2, MAX_COMPONENT_AREA * scale2
    return max(0.0, 1.0 - (area - lo) / max(hi - lo, 1))


def darkness_score(mean_v):
    return max(0.0, min(1.0, (DARK_V_THRESHOLD - mean_v) / DARK_V_THRESHOLD))


def score_candidate(area, contour, w, h, attach, mean_v, scale2):
    a = area_score(area, scale2)
    c = compactness_score(contour, w, h)
    d = darkness_score(mean_v)
    return round(W_AREA * a + W_COMPACTNESS * c + W_ATTACHMENT * attach + W_DARKNESS * d, 4)


def detect_leg_tips(bgr, manual_boxes=None):
    """Detect candidate black leg-tip caps.

    Returns every candidate examined (accepted and rejected) so callers can
    report/debug-draw both. Only `accepted` ones should be passed on to
    replace_leg_tips(). This is the one function to swap out for an ML
    segmentation model later; replace_leg_tips() would not need to change.
    """
    h_img, w_img = bgr.shape[:2]
    # Thresholds are authored against REFERENCE_SIDE; rescale for 4096px exports.
    scale = ((h_img * w_img) ** 0.5) / REFERENCE_SIDE
    scale2 = scale * scale

    dark_mask, light_leg_mask = build_masks(bgr)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2]

    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(dark_mask, connectivity=8)

    candidates = []
    for label in range(1, n_labels):  # label 0 is background
        x, y, w, h, area = stats[label]
        if area < MIN_COMPONENT_AREA * scale2 or area > MAX_COMPONENT_AREA * scale2:
            continue
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect > MAX_ASPECT_RATIO:
            continue
        if (y + h) < MIN_Y_FRACTION * h_img:
            continue

        component_mask = (labels[y:y + h, x:x + w] == label).astype(np.uint8) * 255
        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)

        full_mask = np.zeros((h_img, w_img), dtype=np.uint8)
        full_mask[y:y + h, x:x + w] = component_mask

        attach = attachment_score(light_leg_mask, full_mask, x, y, w, h, scale)
        region_v = v_channel[y:y + h, x:x + w]
        mean_v = float(region_v[component_mask > 0].mean())

        confidence = score_candidate(area, contour, w, h, attach, mean_v, scale2)
        accepted = confidence >= MIN_CONFIDENCE

        candidates.append(Candidate(x=int(x), y=int(y), w=int(w), h=int(h),
                                     mask=full_mask, confidence=confidence, accepted=accepted))

    for box in (manual_boxes or []):
        mx, my, mw, mh = box["x"], box["y"], box["w"], box["h"]
        full_mask = np.zeros((h_img, w_img), dtype=np.uint8)
        full_mask[my:my + mh, mx:mx + mw] = 255
        candidates.append(Candidate(x=mx, y=my, w=mw, h=mh, mask=full_mask,
                                     confidence=1.0, accepted=True, source="manual"))

    return candidates


def leg_direction(light_leg_mask, x, y, w, h, scale):
    """Unit vector pointing UP the leg, away from the cap.

    Taken as (centroid of nearby leg pixels) - (cap centre). Legs are diagonal
    in three-quarter shots, so assuming "straight up" tears the silhouette.
    Falls back to straight up when there is not enough leg in view.
    """
    img_h, img_w = light_leg_mask.shape[:2]
    cx, cy = x + w / 2.0, y + h / 2.0
    r = int(max(max(w, h) * EXTEND_AXIS_WINDOW, 40 * scale))
    x0, y0 = max(int(cx) - r, 0), max(int(cy) - r, 0)
    x1, y1 = min(int(cx) + r, img_w), min(int(cy) + r, img_h)

    ys, xs = np.nonzero(light_leg_mask[y0:y1, x0:x1])
    if len(xs) < 10:
        return 0.0, -1.0
    vx, vy = (xs.mean() + x0) - cx, (ys.mean() + y0) - cy
    norm = (vx * vx + vy * vy) ** 0.5
    if norm < 1e-3:
        return 0.0, -1.0
    return vx / norm, vy / norm


def replace_leg_tips(bgr, candidates, light_leg_mask=None):
    """Paint over accepted candidates. Returns a modified copy; input is untouched."""
    result = bgr.copy()
    accepted = [c for c in candidates if c.accepted]
    if not accepted:
        return result

    h_img, w_img = bgr.shape[:2]
    scale = ((h_img * w_img) ** 0.5) / REFERENCE_SIDE
    if light_leg_mask is None:
        _, light_leg_mask = build_masks(bgr)

    grow = EXTEND_DILATE_PX if REPLACEMENT_MODE == "extend_leg" else MASK_DILATE_PX
    kernel = np.ones((3, 3), np.uint8)
    combined_mask = np.zeros((h_img, w_img), dtype=np.uint8)
    for c in accepted:
        combined_mask = cv2.bitwise_or(combined_mask, c.mask)
    combined_mask = cv2.dilate(combined_mask, kernel,
                                iterations=max(int(round(grow * scale)), 1))

    if REPLACEMENT_MODE == "pure_white":
        result[combined_mask > 0] = PURE_WHITE_BGR
        return result

    pad = max(int(round(INPAINT_PADDING * scale)), 4)

    if REPLACEMENT_MODE == "sample_leg":
        radius = max(int(round(INPAINT_RADIUS * scale)), 3)
        for c in accepted:
            x0, y0 = max(c.x - pad, 0), max(c.y - pad, 0)
            x1, y1 = min(c.x + c.w + pad, w_img), min(c.y + c.h + pad, h_img)
            local_mask = combined_mask[y0:y1, x0:x1]
            if not np.any(local_mask):
                continue
            patch = cv2.inpaint(result[y0:y1, x0:x1], local_mask, radius, cv2.INPAINT_TELEA)
            result[y0:y1, x0:x1] = patch
        return result

    # extend_leg: slide a copy of the leg down its own axis and composite it
    # over the cap through a feathered mask.
    feather = max(int(round(EXTEND_FEATHER_PX * scale)), 1) * 2 + 1
    for c in accepted:
        ux, uy = leg_direction(light_leg_mask, c.x, c.y, c.w, c.h, scale)
        # how far along the axis the cap reaches, then sample from beyond it
        extent = abs(ux) * c.w + abs(uy) * c.h
        dist = extent * EXTEND_SAMPLE_FACTOR + 3 * scale

        margin = int(dist) + pad
        x0, y0 = max(c.x - margin, 0), max(c.y - margin, 0)
        x1, y1 = min(c.x + c.w + margin, w_img), min(c.y + c.h + margin, h_img)

        local_mask = combined_mask[y0:y1, x0:x1]
        if not np.any(local_mask):
            continue
        patch = result[y0:y1, x0:x1]

        # dst(p) = src(p + u*dist)  ->  translate by -u*dist
        M = np.float32([[1, 0, -ux * dist], [0, 1, -uy * dist]])
        donor = cv2.warpAffine(patch, M, (patch.shape[1], patch.shape[0]),
                               flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

        alpha = cv2.GaussianBlur(local_mask.astype(np.float32) / 255.0, (feather, feather), 0)
        alpha = alpha[:, :, None]
        result[y0:y1, x0:x1] = (patch * (1 - alpha) + donor * alpha).astype(np.uint8)

    return result


def draw_debug(bgr, candidates):
    debug_img = bgr.copy()
    for c in candidates:
        color = (0, 200, 0) if c.accepted else (0, 210, 255)  # green vs yellow, BGR
        cv2.rectangle(debug_img, (c.x, c.y), (c.x + c.w, c.y + c.h), color, 2)
        label = f"{c.confidence:.2f}" + (" M" if c.source == "manual" else "")
        cv2.putText(debug_img, label, (c.x, max(c.y - 6, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    return debug_img


def process_image(path, output_dir, debug_dir, manual_boxes):
    start = time.time()
    bgr_full = load_image(path)
    bgr, alpha = split_alpha(bgr_full)

    candidates = detect_leg_tips(bgr, manual_boxes=manual_boxes)
    result_bgr = replace_leg_tips(bgr, candidates)

    if alpha is not None:
        result = cv2.merge([result_bgr[:, :, 0], result_bgr[:, :, 1], result_bgr[:, :, 2], alpha])
    else:
        result = result_bgr

    out_path = Path(output_dir) / path.name
    if path.suffix.lower() in (".jpg", ".jpeg"):
        cv2.imwrite(str(out_path), result, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    else:
        cv2.imwrite(str(out_path), result, [cv2.IMWRITE_PNG_COMPRESSION, 3])

    if DEBUG:
        Path(debug_dir, "masks").mkdir(parents=True, exist_ok=True)
        debug_img = draw_debug(bgr, candidates)
        cv2.imwrite(str(Path(debug_dir) / f"{path.stem}_debug.png"), debug_img)

        combined_mask = np.zeros(bgr.shape[:2], dtype=np.uint8)
        for c in candidates:
            if c.accepted:
                combined_mask = cv2.bitwise_or(combined_mask, c.mask)
        cv2.imwrite(str(Path(debug_dir) / "masks" / f"{path.stem}_mask.png"), combined_mask)

    modified = [c for c in candidates if c.accepted]
    low_conf = [c for c in candidates if not c.accepted]
    elapsed = time.time() - start

    return {
        "filename": path.name,
        "candidate_count": len(candidates),
        "modified_count": len(modified),
        "low_confidence_count": len(low_conf),
        "processing_time": round(elapsed, 4),
        "status": "ok",
    }


def load_manual_overrides(path):
    p = Path(path)
    if not p.exists():
        return {}
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def run(input_dir, output_dir, debug_dir, manual_overrides_path):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    if DEBUG:
        Path(debug_dir).mkdir(parents=True, exist_ok=True)

    overrides = load_manual_overrides(manual_overrides_path)
    paths = sorted(
        p for p in Path(input_dir).iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not paths:
        print(f"No images found in {input_dir}")
        return

    results = []
    errors = 0
    for path in paths:
        try:
            r = process_image(path, output_dir, debug_dir, overrides.get(path.name))
        except Exception as exc:  # noqa: BLE001 - report and keep going
            errors += 1
            r = {
                "filename": path.name, "candidate_count": 0, "modified_count": 0,
                "low_confidence_count": 0, "processing_time": 0.0,
                "status": f"error: {exc}",
            }
        results.append(r)
        print(f"{r['filename']}\n"
              f"    candidates: {r['candidate_count']}\n"
              f"    modified: {r['modified_count']}")

    report_path = Path(output_dir).parent / "processing_report.csv"
    with report_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "filename", "candidate_count", "modified_count",
            "low_confidence_count", "processing_time", "status",
        ])
        writer.writeheader()
        writer.writerows(results)

    modified_total = sum(1 for r in results if r["modified_count"] > 0)
    none_found = sum(1 for r in results if r["candidate_count"] == 0)
    low_conf_total = sum(1 for r in results if r["low_confidence_count"] > 0 and r["modified_count"] == 0)

    print("\n--- Summary ---")
    print(f"Processed: {len(results)}")
    print(f"Successfully modified: {modified_total}")
    print(f"No candidates found: {none_found}")
    print(f"Low-confidence candidates only: {low_conf_total}")
    print(f"Errors: {errors}")
    print(f"Report written to: {report_path}")


def _selftest():
    """Smallest possible check that the scoring logic tells a real tip from a shadow."""
    # Canvas is 1024^2 so the resolution-scaled area gate behaves as it does
    # on the real 2048/4096 exports.
    def canvas():
        return np.full((1024, 1024, 3), 226, dtype=np.uint8)  # beige-ish floor

    def top(img):
        cands = detect_leg_tips(img)
        return max((c.confidence for c in cands), default=0.0), cands

    # 1. vertical white leg ending in a compact black cap -> accept
    a = canvas()
    a[300:840, 500:520] = (245, 245, 245)
    a[840:853, 498:522] = (12, 12, 12)
    conf_a, _ = top(a)
    assert conf_a >= MIN_CONFIDENCE, f"cap under a vertical leg must be accepted (got {conf_a})"

    # 2. same cap on a DIAGONAL leg -> must still be accepted (the ring-based
    #    attachment test exists for exactly this; a "look straight up" test failed here)
    b = canvas()
    cv2.line(b, (430, 300), (610, 842), (245, 245, 245), 20)
    b[840:853, 601:625] = (12, 12, 12)
    conf_b, _ = top(b)
    assert conf_b >= MIN_CONFIDENCE, f"cap on a diagonal leg must be accepted (got {conf_b})"

    # 3. wide diffuse floor shadow, no leg touching it -> reject
    c = canvas()
    cv2.ellipse(c, (512, 900), (300, 40), 0, 0, 360, (60, 58, 55), -1)
    assert not any(x.accepted for x in detect_leg_tips(c)), "floor shadow must not be accepted"

    # 4. dark upholstery block far from any white leg -> reject
    d = canvas()
    d[560:900, 300:700] = (20, 20, 22)
    assert not any(x.accepted for x in detect_leg_tips(d)), "upholstery must not be accepted"

    # 5. the replacement must leave LEG material where the cap was, not a
    #    floor/leg average. Telea used to fail this by eroding the tip.
    for name, img in (("vertical", a), ("diagonal", b)):
        cands = detect_leg_tips(img)
        out = replace_leg_tips(img, cands)
        cap = next(c for c in cands if c.accepted)
        # sample the middle of the cap, inset so feathering does not dominate
        iy = cap.y + cap.h // 2
        ix = cap.x + cap.w // 2
        before_v = int(cv2.cvtColor(img[iy:iy + 1, ix:ix + 1], cv2.COLOR_BGR2HSV)[0, 0, 2])
        after_v = int(cv2.cvtColor(out[iy:iy + 1, ix:ix + 1], cv2.COLOR_BGR2HSV)[0, 0, 2])
        assert before_v < DARK_V_THRESHOLD, f"{name}: cap should start dark (got {before_v})"
        assert after_v > LEG_MIN_L, f"{name}: cap should end up leg-bright (got {after_v})"
        # and nothing outside the cap neighbourhood may change
        untouched = np.array_equal(img[:200], out[:200])
        assert untouched, f"{name}: pixels far from the cap must not change"

    print("selftest OK")


def main():
    global DEBUG, MIN_CONFIDENCE

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=INPUT_DIR)
    parser.add_argument("--output", default=OUTPUT_DIR)
    parser.add_argument("--debug-dir", default=DEBUG_DIR)
    parser.add_argument("--debug", action="store_true", default=DEBUG)
    parser.add_argument("--min-confidence", type=float, default=MIN_CONFIDENCE)
    parser.add_argument("--manual-overrides", default=MANUAL_OVERRIDES_PATH)
    parser.add_argument("--selftest", action="store_true",
                         help="run the built-in scoring self-check and exit")
    args = parser.parse_args()

    if args.selftest:
        _selftest()
        return

    DEBUG = args.debug
    MIN_CONFIDENCE = args.min_confidence

    run(args.input, args.output, args.debug_dir, args.manual_overrides)


if __name__ == "__main__":
    sys.exit(main())
