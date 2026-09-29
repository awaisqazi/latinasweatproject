#!/usr/bin/env python3
"""Pop Up Week 1 instructor avatars (re-runnable).

Source: marketing/popup-week1/instructors/<slug>.png, transparent head-and-
shoulders MarianaTek cutouts named after the FULL names in
src/data/popUpWeek1.js (lowercased, ASCII-folded, spaces -> hyphens). The
slug <-> name mapping is the only identity source; never guess who is in a
photo.

Step 1 (only when <slug>.png is missing but <slug>.jpg exists, e.g.
vero-quinones.jpg, a full studio portrait): remove the backdrop with the
repo's Apple Vision tool (scripts/tools/cutout, build with
`swiftc -O -o scripts/tools/cutout scripts/cutout.swift`), clean the thin
backdrop film Vision leaves along the silhouette (backdrop-coloured pixels
within 10px of transparency lose alpha; semi-transparent pixels are
colour-decontaminated against an inpainted backdrop field), then crop to the
house framing of the other cutouts: 1125x750, face box ~50% of frame height,
face top at ~22%, face centred. No backdrop is ever synthesised.

Step 2: square face-centred avatars via OpenCV YuNet (cv2.FaceDetectorYN).
The crop is the face box grown by a 12% margin on each side, then expanded to
a square sized so the face box (plus margin) fits inside the inscribed circle;
the centre sits slightly below the face centre so a little shoulder shows.
Falls back to an alpha-bounding-box top-centre crop if no face is found.
Writes public/images/popup/instructors/<slug>.webp (320) and <slug>-160.webp.

  python3 scripts/render-popup-instructor-avatars.py
Model: ~/.cache/opencv-zoo/face_detection_yunet_2023mar.onnx (downloaded
from github.com/opencv/opencv_zoo if missing).
"""
import os
import subprocess
import sys
import tempfile
import urllib.request

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "marketing/popup-week1/instructors")
OUT = os.path.join(ROOT, "public/images/popup/instructors")
MODEL = os.path.expanduser("~/.cache/opencv-zoo/face_detection_yunet_2023mar.onnx")
MODEL_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_detection_yunet/face_detection_yunet_2023mar.onnx")
CUTOUT = os.path.join(ROOT, "scripts/tools/cutout")
MARGIN = 0.12  # margin around the face box, as a fraction of the face size


def detector():
    if not os.path.exists(MODEL):
        os.makedirs(os.path.dirname(MODEL), exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, MODEL)
    return cv2.FaceDetectorYN.create(MODEL, "", (0, 0), 0.6)


def detect(det, bgr):
    h, w = bgr.shape[:2]
    det.setInputSize((w, h))
    faces = det.detect(bgr)[1]
    if faces is None or len(faces) == 0:
        return None
    best = faces[faces[:, -1].argsort()[::-1]][0]
    return [float(v) for v in best[:4]]


def flatten(bgra, bg=255):
    a = bgra[:, :, 3:4].astype(np.float32) / 255
    return (bgra[:, :, :3] * a + bg * (1 - a)).astype(np.uint8)


# ---------------------------------------------------------------- step 1
def cut_out_portrait(jpg, png, det):
    if not os.path.exists(CUTOUT):
        subprocess.check_call(["swiftc", "-O", "-o", CUTOUT,
                               os.path.join(ROOT, "scripts/cutout.swift")])
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, "raw.png")
        subprocess.check_call([CUTOUT, jpg, raw], stdout=subprocess.DEVNULL)
        a = cv2.imread(raw, cv2.IMREAD_UNCHANGED)[:, :, 3].astype(np.float32) / 255
    src = cv2.imread(jpg)
    C = src.astype(np.float32)
    h, w = a.shape
    # Backdrop field: inpaint the subject out of a 1/8 downscale.
    k = 8
    sm = cv2.resize(src, (w // k, h // k), interpolation=cv2.INTER_AREA)
    fm = cv2.resize((a > 0.01).astype(np.uint8) * 255, (w // k, h // k),
                    interpolation=cv2.INTER_AREA)
    fm = cv2.dilate((fm > 0).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    B = cv2.resize(cv2.inpaint(sm, fm, 5, cv2.INPAINT_TELEA), (w, h),
                   interpolation=cv2.INTER_CUBIC).astype(np.float32)
    diff = np.abs(C - B).max(axis=2)
    # Film along the silhouette: backdrop-coloured pixels near transparency.
    trans = (a < 0.02).astype(np.uint8)
    dist = cv2.distanceTransform(1 - trans, cv2.DIST_L2, 3)
    band = (dist < 10) & (a > 0.02)
    fac = np.clip((diff - 6) / 30, 0, 1)
    a2 = a.copy()
    a2[band] = np.minimum(a[band], fac[band])
    # Shadowed backdrop showing through hair gaps near the edge reads as
    # neutral grey (sat < 24, lum 120+); luminance-matte it against the dark
    # hair rather than deleting it (deleting leaves a ragged web).
    wide = (dist < 36) & (a2 > 0.02)
    sat = C.max(axis=2) - C.min(axis=2)
    lum = C @ np.array([0.114, 0.587, 0.299], np.float32)
    grey = wide & (sat < 24) & (lum > 120)
    a2[grey] = np.minimum(a2[grey], np.clip((185 - lum[grey]) / 125, 0, 1))
    a2 = cv2.GaussianBlur(a2, (0, 0), 0.7)
    a2[a < 0.02] = 0
    # Drop specks disconnected from the main body.
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a2 > 0.1).astype(np.uint8), 8)
    if n > 2:
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        a2[(lab != keep) & (lab != 0)] = 0
    # Colour decontamination against the backdrop field.
    aa = np.clip(a2, 1e-3, 1)[..., None]
    F = np.where(aa < 0.98, (C - (1 - aa) * B) / aa, C)
    F = np.clip(F, 0, 255).astype(np.uint8)
    rgba = np.dstack([F, (a2 * 255).astype(np.uint8)])
    rgba[a2 == 0, :3] = 0

    # House framing (matches the other 1125x750 cutouts).
    face = detect(det, src)
    if face is None:
        sys.exit(f"no face found in {jpg}; frame it by hand")
    fx, fy, fw, fh = face
    ch = fh / 0.50
    cw = ch * 1125 / 750
    if cw > w:  # not enough width: shrink the crop, face gets a bit bigger
        cw = w
        ch = cw * 750 / 1125
    top = fy - 0.22 * ch
    left = fx + fw / 2 - cw / 2
    left = min(max(left, 0), w - cw)
    top = min(max(top, 0), h - ch)
    crop = rgba[int(round(top)):int(round(top + ch)), int(round(left)):int(round(left + cw))]
    crop = cv2.resize(crop, (1125, 750), interpolation=cv2.INTER_AREA)
    cv2.imwrite(png, crop)
    print(f"  cutout {os.path.basename(png)} from {os.path.basename(jpg)}")


# ---------------------------------------------------------------- step 2
def square_crop(bgra, face):
    h, w = bgra.shape[:2]
    if face:
        fx, fy, fw, fh = face
        m = MARGIN * max(fw, fh)
        bw, bh = fw + 2 * m, fh + 2 * m
        # Box (with margin) inside the inscribed circle: diameter >= diagonal.
        side = max(np.hypot(bw, bh), 1.0)
        cx = fx + fw / 2
        cy = fy + fh / 2 + 0.06 * fh  # nudge down so shoulders show a little
        # Keep the face box inside the circle after the nudge.
        side = max(side, 2 * np.hypot(bw / 2, bh / 2 + 0.06 * fh))
    else:
        ys, xs = np.where(bgra[:, :, 3] > 40)
        x0, x1, y0 = xs.min(), xs.max(), ys.min()
        side = min(x1 - x0, h - y0) * 0.9
        cx = (x0 + x1) / 2
        cy = y0 + side / 2
    # Pad (transparent) so the square never has to shift off-centre.
    pad = int(side)
    padded = cv2.copyMakeBorder(bgra, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0))
    x0 = int(round(cx - side / 2)) + pad
    y0 = int(round(cy - side / 2)) + pad
    s = int(round(side))
    return padded[y0:y0 + s, x0:x0 + s]


def save_webp(bgra, path, size):
    img = cv2.resize(bgra, (size, size), interpolation=cv2.INTER_AREA)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=84, alpha_quality=90, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    det = detector()
    for f in sorted(os.listdir(SRC)):
        slug, ext = os.path.splitext(f)
        if ext.lower() in (".jpg", ".jpeg") and not os.path.exists(os.path.join(SRC, slug + ".png")):
            cut_out_portrait(os.path.join(SRC, f), os.path.join(SRC, slug + ".png"), det)
    fell_back = []
    slugs = sorted(os.path.splitext(f)[0] for f in os.listdir(SRC) if f.endswith(".png"))
    for slug in slugs:
        bgra = cv2.imread(os.path.join(SRC, slug + ".png"), cv2.IMREAD_UNCHANGED)
        face = detect(det, flatten(bgra))
        if face is None:
            fell_back.append(slug)
        sq = square_crop(bgra, face)
        save_webp(sq, os.path.join(OUT, f"{slug}.webp"), 320)
        save_webp(sq, os.path.join(OUT, f"{slug}-160.webp"), 160)
        print(f"  {slug:22s} {'face' if face else 'FALLBACK (alpha bbox)'}")
    print(f"{len(slugs)} avatars; fallbacks: {fell_back or 'none'}")


if __name__ == "__main__":
    main()
