"""把网格头、参考正脸、3D 截图裁切并排，并在网格上打厘米格。"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "public/models/_tmp"
REF = ROOT / "public/models/textures/ref"
SHOT = ROOT.parent / "docs/screenshots"
ALBEDO = TMP / "qin-albedo.png"

MESH_FACE = np.array(
    [
        [-0.018, 1.552],
        [0.052, 1.552],
        [-0.015, 1.532],
        [0.049, 1.532],
        [0.017, 1.502],
        [0.010, 1.462],
        [0.010, 1.408],
        [0.010, 1.578],
    ],
    np.float64,
)
NAMES = ["browL", "browR", "eyeL", "eyeR", "nose", "mouth", "chin", "hair"]


def load_dump():
    meta = json.loads((TMP / "paint-mesh.json").read_text(encoding="utf-8"))
    n = meta["verts"]
    pos = np.frombuffer((TMP / meta["pos"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    nrm = np.frombuffer((TMP / meta["nrm"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    uv = np.frombuffer((TMP / meta["uv"]).read_bytes(), dtype=np.float32).reshape(n, 2)
    idx = np.frombuffer((TMP / meta["idx"]).read_bytes(), dtype=np.uint32)
    return pos, nrm, uv, idx


def analyze(pos, nrm, uv):
    y0, y1 = 1.37, 1.76
    head = (pos[:, 1] >= y0) & (pos[:, 1] <= y1)
    front = head & (nrm[:, 2] > 0.35) & (pos[:, 2] > 0.04)
    print("head verts", int(head.sum()), "front-face verts", int(front.sum()))
    hp = pos[front]
    print("front bbox x", hp[:, 0].min(), hp[:, 0].max(), "y", hp[:, 1].min(), hp[:, 1].max(), "z", hp[:, 2].min(), hp[:, 2].max())

    # 鼻尖：前脸中带 z 最大
    mid = front & (np.abs(pos[:, 0]) < 0.05) & (pos[:, 1] > 1.46) & (pos[:, 1] < 1.62)
    nose = pos[mid][pos[mid][:, 2].argmax()]
    print("nose maxZ", nose)

    # 每 1cm 高度带：前脸 x 中位数、z 最大点
    print("y-bands (front nz>0.35 z>0.04):")
    for y in np.arange(1.40, 1.73, 0.01):
        band = front & (pos[:, 1] >= y) & (pos[:, 1] < y + 0.01)
        if band.sum() < 4:
            continue
        sl = pos[band]
        zmax = sl[sl[:, 2].argmax()]
        print(
            f"  y {y:.2f}-{y+0.01:.2f} n={int(band.sum()):3d} "
            f"xmed={np.median(sl[:,0]):+.3f} xr={sl[:,0].min():+.3f}..{sl[:,0].max():+.3f} "
            f"zmax=({zmax[0]:+.3f},{zmax[1]:.3f},{zmax[2]:.3f})"
        )

    albedo = np.asarray(Image.open(ALBEDO).convert("RGB"))
    h, w = albedo.shape[:2]
    print("albedo sample at MESH_FACE nearest verts:")
    for name, xy in zip(NAMES, MESH_FACE):
        d = np.hypot(pos[:, 0] - xy[0], pos[:, 1] - xy[1])
        d = np.where((nrm[:, 2] > 0.1) & (pos[:, 2] > 0.0), d, 9)
        i = int(d.argmin())
        u, v = uv[i]
        px = int(np.clip(u * (w - 1), 0, w - 1))
        py = int(np.clip(v * (h - 1), 0, h - 1))
        col = albedo[py, px]
        print(f"  {name:6s} mesh({xy[0]:+.3f},{xy[1]:.3f}) vert({pos[i,0]:+.3f},{pos[i,1]:.3f},{pos[i,2]:+.3f}) uv({u:.3f},{v:.3f}) rgb{tuple(col)}")


def raster(pos, nrm, idx, box, W, H):
    xmin, xmax, ymin, ymax = box
    zbuf = np.full((H, W), -1e9, np.float32)
    shade = np.zeros((H, W, 3), np.float32)
    light = np.array([0.2, 0.25, 1.0], np.float32)
    light /= np.linalg.norm(light)
    ntri = idx.size // 3
    for t in range(ntri):
        i0, i1, i2 = int(idx[t * 3]), int(idx[t * 3 + 1]), int(idx[t * 3 + 2])
        P = pos[[i0, i1, i2]]
        if (P[:, 1] < ymin - 0.02).all():
            continue
        N = nrm[[i0, i1, i2]]
        xs = (P[:, 0] - xmin) / (xmax - xmin) * (W - 1)
        ys = (1.0 - (P[:, 1] - ymin) / (ymax - ymin)) * (H - 1)
        minx = int(max(0, math.floor(xs.min())))
        maxx = int(min(W - 1, math.ceil(xs.max())))
        miny = int(max(0, math.floor(ys.min())))
        maxy = int(min(H - 1, math.ceil(ys.max())))
        if maxx < minx or maxy < miny:
            continue
        area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])
        if abs(area) < 1e-8:
            continue
        yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        w0 = ((xs[1] - xx) * (ys[2] - yy) - (xs[2] - xx) * (ys[1] - yy)) / area
        w1 = ((xs[2] - xx) * (ys[0] - yy) - (xs[0] - xx) * (ys[2] - yy)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        z = P[0, 2] * w0 + P[1, 2] * w1 + P[2, 2] * w2
        n = N[0] * w0[..., None] + N[1] * w1[..., None] + N[2] * w2[..., None]
        n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        lambert = np.clip(n @ light, 0.15, 1.0)
        col = np.stack([0.62 * lambert, 0.54 * lambert, 0.46 * lambert], -1)
        vis = inside & (z > zbuf[miny : maxy + 1, minx : maxx + 1])
        zbuf[miny : maxy + 1, minx : maxx + 1][vis] = z[vis]
        shade[miny : maxy + 1, minx : maxx + 1][vis] = col[vis]
    img = np.clip(shade * 255, 0, 255).astype(np.uint8)
    img[zbuf < -1e8] = 18
    return img, zbuf


def world_to_px(x, y, box, W, H):
    xmin, xmax, ymin, ymax = box
    px = (x - xmin) / (xmax - xmin) * (W - 1)
    py = (1.0 - (y - ymin) / (ymax - ymin)) * (H - 1)
    return px, py


def labeled_head(pos, nrm, idx):
    box = (-0.14, 0.12, 1.36, 1.78)
    W, H = 700, 1100
    img, _ = raster(pos, nrm, idx, box, W, H)
    im = Image.fromarray(img)
    draw = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
        font_s = ImageFont.truetype("arial.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
        font_s = font

    for x in np.arange(-0.12, 0.11, 0.02):
        px0, py0 = world_to_px(x, box[2], box, W, H)
        px1, py1 = world_to_px(x, box[3], box, W, H)
        draw.line([(px0, py0), (px1, py1)], fill=(40, 90, 40), width=1)
        draw.text((px0 + 2, 4), f"{x:+.2f}", fill=(120, 220, 120), font=font_s)
    for y in np.arange(1.38, 1.77, 0.02):
        px0, py0 = world_to_px(box[0], y, box, W, H)
        px1, py1 = world_to_px(box[1], y, box, W, H)
        draw.line([(px0, py0), (px1, py1)], fill=(40, 90, 40), width=1)
        draw.text((4, py0 - 8), f"{y:.2f}", fill=(120, 220, 120), font=font_s)

    colors = [
        (255, 80, 80),
        (255, 140, 80),
        (80, 255, 80),
        (80, 255, 180),
        (80, 160, 255),
        (180, 80, 255),
        (255, 255, 80),
        (255, 80, 255),
    ]
    for i, ((x, y), name, col) in enumerate(zip(MESH_FACE, NAMES, colors)):
        px, py = world_to_px(x, y, box, W, H)
        r = 7
        draw.ellipse((px - r, py - r, px + r, py + r), outline=col, width=3)
        draw.text((px + 10, py - 8), f"{i}:{name}", fill=col, font=font)

    im.save(TMP / "face-grid.png")
    print("wrote face-grid.png")


def crop_shots():
    # 1440x900 viewport * 1.25 dpr = 1800x1125. 中间画布大约去掉左右面板。
    specs = {
        "qin-head.png": (620, 80, 1180, 980),
        "qin-front.png": (700, 40, 1120, 1080),
        "qin-three-quarter.png": (640, 40, 1180, 1080),
        "qin-side.png": (700, 40, 1180, 1080),
    }
    for name, box in specs.items():
        p = SHOT / name
        if not p.exists():
            continue
        im = Image.open(p).convert("RGB")
        crop = im.crop(box)
        crop.save(TMP / f"crop-{name}")
        print("crop", name, crop.size, "from", im.size)


def photo_grid():
    im = Image.open(REF / "qin-sheet-head.png").convert("RGB")
    draw = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    w, h = im.size
    for x in range(0, w, 64):
        draw.line([(x, 0), (x, h)], fill=(0, 180, 0), width=1)
        draw.text((x + 2, 2), str(x), fill=(0, 255, 0), font=font)
    for y in range(0, h, 64):
        draw.line([(0, y), (w, y)], fill=(0, 180, 0), width=1)
        draw.text((2, y + 2), str(y), fill=(0, 255, 0), font=font)
    pts = [
        (288, 320, "bL"),
        (544, 320, "bR"),
        (288, 384, "eL"),
        (544, 384, "eR"),
        (416, 448, "nose"),
        (416, 576, "mouth"),
        (416, 690, "chin"),
        (416, 192, "hair"),
        (360, 40, "bun"),
    ]
    for x, y, name in pts:
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), outline=(255, 40, 40), width=3)
        draw.text((x + 8, y - 10), name, fill=(255, 40, 40), font=font)
    im.save(TMP / "photo-grid.png")
    print("wrote photo-grid.png")


def main():
    pos, nrm, uv, idx = load_dump()
    analyze(pos, nrm, uv)
    labeled_head(pos, nrm, idx)
    crop_shots()
    photo_grid()


if __name__ == "__main__":
    main()
