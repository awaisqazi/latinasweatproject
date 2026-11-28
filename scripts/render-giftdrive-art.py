# Holiday Gift Drive: the flyer's own art, made usable at web sizes.
#
#   public/images/giftdrive/lockup.svg      the title lockup ("THE LATINA SWEAT
#                                           PROJECT'S" / HOLIDAY / GIFT DRIVE and the
#                                           four sparkles), a true vector trace
#   public/images/giftdrive/gifts.webp      the gifts illustration from the foot of
#   public/images/giftdrive/gifts-2x.webp   page 1, a raster (see below), transparent
#                                           outside the drawing
#
# Source: the Community Impact Team's flyer as it is on the site,
# public/images/giftdrive/flyer-1.jpg and flyer-2.jpg (989x1280; no larger original
# exists). Nothing is redrawn: every shape comes from the flyer's pixels.
#
# Lockup recipe: crop (both pages carry the same lockup, so the two JPEG decodes are
# averaged, except around the right-hand sparkles, which sit a few px apart on the
# two pages: page 1 wins there), upscale 4x (Lanczos), soften the JPEG noise (Gaussian
# sigma 1.6), then label every pixel with the nearest flyer colour by projecting it
# onto the segment between each pair of palette colours (so an anti-aliased edge
# between ink and paper is never mistaken for a third colour). Each colour layer is
# grown by 4 px under the ink only, the ink is drawn last, so no seam can open between
# a fill and its outline. Each layer is traced with potrace (-t 24 -a 1.1 -O 0.6) and
# the paths are stacked: yellow, pink, green, ink. The letter counters stay holes
# (transparent).
#
# Gifts: the same trace was tried (with an enclosed-paper layer and sliver clean-up)
# and rejected: the brushes and pencils in the two cups merge into blobs and the thin
# book and ribbon lines thicken or break. So the illustration ships as the flyer's own
# pixels: page 1 cropped at native size, the paper outside the drawing made
# transparent (flood fill from the crop edge), plus a 2x Lanczos copy for dense
# screens. Never show it wider than about 330 CSS px.
#
# Palette sampled from the flyer (medians of each colour's pixels):
#   paper #fef9e6  ink #040501  pink #fb0b57  green #04b17a  yellow #fde511
#   illustration only: blue #1f7bdd  red #fa5758  light pink #f99cbf  tag paper #fdefce
#
# Needs: python3 with numpy, opencv-python and Pillow; potrace (brew install potrace).
# Usage: python3 scripts/render-giftdrive-art.py
import itertools, os, re, subprocess, tempfile
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIR = os.path.join(ROOT, "public/images/giftdrive")
S = 4  # trace scale

PAL = {"paper": (254, 249, 230), "ink": (4, 5, 1), "pink": (251, 11, 87), "green": (4, 177, 122), "yellow": (253, 229, 17)}


def rgb(name):
    return cv2.imread(os.path.join(DIR, name)).astype(np.float32)[..., ::-1]


def trace_lockup():
    f1, f2 = rgb("flyer-1.jpg"), rgb("flyer-2.jpg")
    x0, y0, x1, y1 = 180, 14, 796, 340
    a1, a2 = f1[y0:y1, x0:x1], f2[y0:y1, x0:x1]
    same = np.abs(a1 - a2).sum(2) < 60
    same = cv2.erode(same.astype(np.uint8), np.ones((15, 15), np.uint8))[..., None] > 0
    src = np.where(same, (a1 + a2) / 2, a1)
    H, W = src.shape[:2]
    up = cv2.resize(src, (W * S, H * S), interpolation=cv2.INTER_LANCZOS4)
    up = cv2.GaussianBlur(up, (0, 0), 1.6)

    names = list(PAL)
    P = np.array([PAL[n] for n in names], np.float32)
    px = up.reshape(-1, 3)
    best = np.full(px.shape[0], 1e9, np.float32)
    label = np.zeros(px.shape[0], np.int32)
    for i, j in itertools.combinations(range(len(names)), 2):
        a, d = P[i], P[j] - P[i]
        t = np.clip(((px - a) @ d) / (d @ d), 0, 1)
        r = np.linalg.norm(px - (a + t[:, None] * d), axis=1)
        b = r < best
        best = np.where(b, r, best)
        label = np.where(b, np.where(t < 0.5, i, j), label)
    label = label.reshape(H * S, W * S)

    def clean(m):
        return cv2.medianBlur(m.astype(np.uint8) * 255, 5) > 127

    ink = clean(label == names.index("ink"))
    grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    layers = []
    for n in ["yellow", "pink", "green"]:
        m = clean(label == names.index(n))
        m = m | ((cv2.dilate(m.astype(np.uint8), grow) > 0) & ink)
        layers.append((n, m))
    layers.append(("ink", ink))

    paths = []
    with tempfile.TemporaryDirectory() as tmp:
        for n, m in layers:
            pbm = os.path.join(tmp, f"{n}.pbm")
            cv2.imwrite(pbm, np.where(m, 0, 255).astype(np.uint8))
            svg = subprocess.run(
                ["potrace", "-b", "svg", "--flat", "-t", "24", "-a", "1.1", "-O", "0.6", "-u", "10", pbm, "-o", "-"],
                capture_output=True, text=True, check=True,
            ).stdout
            g = re.search(r'<g transform="([^"]+)"', svg).group(1)
            g = re.sub(r"(\d+)\.000000", r"\1", g).replace("0.100000", "0.1")
            d = " ".join(re.findall(r'<path d="([^"]+)"', svg))
            d = re.sub(r"\s+", " ", d)
            hexc = "#%02x%02x%02x" % PAL[n]
            paths.append(f'<path fill="{hexc}" transform="{g}" d="{d}"/>')
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W * S} {H * S}" width="{W}" height="{H}">'
        + "".join(paths)
        + "</svg>\n"
    )
    with open(os.path.join(DIR, "lockup.svg"), "w") as fh:
        fh.write(out)
    print(f"lockup.svg {W}x{H} {len(out) // 1024} KB")


def gifts():
    f = cv2.imread(os.path.join(DIR, "flyer-1.jpg"))
    x0, y0, x1, y1 = 244, 946, 742, 1236
    c = f[y0:y1, x0:x1].copy()
    paper = np.array(PAL["paper"][::-1])
    for scale, name, q in [(1, "gifts.webp", 90), (2, "gifts-2x.webp", 86)]:
        img = c if scale == 1 else cv2.resize(c, (c.shape[1] * 2, c.shape[0] * 2), interpolation=cv2.INTER_LANCZOS4)
        near = (np.abs(img.astype(int) - paper).sum(2) < 40).astype(np.uint8)
        n, cc = cv2.connectedComponents(near, connectivity=4)
        border = np.unique(np.concatenate([cc[0], cc[-1], cc[:, 0], cc[:, -1]]))
        border = border[border > 0]
        outside = np.isin(cc, border)
        alpha = np.where(outside, 0, 255).astype(np.uint8)
        rgba = np.dstack([img[..., ::-1], alpha])
        Image.fromarray(rgba, "RGBA").save(os.path.join(DIR, name), "WEBP", quality=q, alpha_quality=100, exact=True, method=6)
        print(name, img.shape[1], "x", img.shape[0])


trace_lockup()
gifts()
