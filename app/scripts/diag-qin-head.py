"""诊断头部几何：前视渲染 + 五官候选点，给视觉对齐用。"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

TMP = Path(__file__).resolve().parent.parent / "public/models/_tmp"
OUT = TMP
W, H = 768, 1024


def load_dump():
    meta = json.loads((TMP / "paint-mesh.json").read_text(encoding="utf-8"))
    n = meta["verts"]
    pos = np.frombuffer((TMP / meta["pos"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    nrm = np.frombuffer((TMP / meta["nrm"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    idx = np.frombuffer((TMP / meta["idx"]).read_bytes(), dtype=np.uint32)
    pmin = np.array(meta["bbox"]["min"], np.float32)
    pmax = np.array(meta["bbox"]["max"], np.float32)
    return pos, nrm, idx, pmin, pmax


def y_hist(pos):
    ys = pos[:, 1]
    bins = np.linspace(ys.min(), ys.max(), 37)
    print("Y histogram (head is top bins):")
    for i in range(len(bins) - 1):
        m = (ys >= bins[i]) & (ys < bins[i + 1])
        if not m.any():
            continue
        sl = pos[m]
        print(
            f"  y {bins[i]:.3f}-{bins[i+1]:.3f} n={int(m.sum()):5d} "
            f"x {sl[:,0].min():.3f}..{sl[:,0].max():.3f} z {sl[:,2].min():.3f}..{sl[:,2].max():.3f} "
            f"zmax@{sl[sl[:,2].argmax(),0]:.3f},{sl[sl[:,2].argmax(),1]:.3f}"
        )


def raster_head(pos, nrm, idx, y_cut, pmin, pmax):
    """正交 +Z 看头部，Lambert + 深度。"""
    span = np.maximum(pmax - pmin, 1e-5)
    # 头围：用头部点收紧 XY
    head_v = pos[:, 1] >= y_cut
    hp = pos[head_v]
    xmin, xmax = hp[:, 0].min(), hp[:, 0].max()
    ymin, ymax = hp[:, 1].min(), hp[:, 1].max()
    pad = 0.02
    xmin -= pad
    xmax += pad
    ymin -= pad
    ymax += pad
    zbuf = np.full((H, W), -1e9, np.float32)
    shade = np.zeros((H, W, 3), np.float32)
    ntri = idx.size // 3
    light = np.array([0.25, 0.35, 1.0], np.float32)
    light /= np.linalg.norm(light)
    for t in range(ntri):
        i0, i1, i2 = int(idx[t * 3]), int(idx[t * 3 + 1]), int(idx[t * 3 + 2])
        if pos[i0, 1] < y_cut - 0.04 and pos[i1, 1] < y_cut - 0.04 and pos[i2, 1] < y_cut - 0.04:
            continue
        P = pos[[i0, i1, i2]]
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
        lambert = np.clip(n @ light, 0.0, 1.0)
        ndotz = np.clip(n[..., 2], 0.0, 1.0)
        col = np.stack([0.55 + 0.45 * lambert, 0.48 + 0.42 * lambert, 0.40 + 0.35 * lambert], -1)
        # 眼窝：朝里的法线偏暗
        col *= (0.55 + 0.45 * ndotz)[..., None]
        sub_z = zbuf[miny : maxy + 1, minx : maxx + 1]
        sub_s = shade[miny : maxy + 1, minx : maxx + 1]
        vis = inside & (z > sub_z)
        sub_z[vis] = z[vis]
        sub_s[vis] = col[vis]
        zbuf[miny : maxy + 1, minx : maxx + 1] = sub_z
        shade[miny : maxy + 1, minx : maxx + 1] = sub_s
        if t % 4000 == 0:
            print("  tri", t, "/", ntri)
    img = np.clip(shade * 255, 0, 255).astype(np.uint8)
    hit = zbuf > -1e8
    img[~hit] = 20
    return img, zbuf, (xmin, xmax, ymin, ymax)


def world_to_px(x, y, box):
    xmin, xmax, ymin, ymax = box
    px = (x - xmin) / (xmax - xmin) * (W - 1)
    py = (1.0 - (y - ymin) / (ymax - ymin)) * (H - 1)
    return float(px), float(py)


def find_landmarks(pos, nrm, y_cut):
    head = pos[:, 1] >= y_cut
    hp = pos[head]
    hn = nrm[head]
    print("head verts", int(head.sum()), "y", hp[:, 1].min(), hp[:, 1].max())

    # 鼻尖：头前半球、靠近中线、z 最大
    front = hn[:, 2] > 0.15
    mid = np.abs(hp[:, 0]) < 0.06
    cand = hp[front & mid]
    if len(cand) < 10:
        cand = hp[front]
    nose = cand[cand[:, 2].argmax()]
    print("nose tip", nose)

    # 眉弓/眼：鼻尖下方一点到上方一点的高度带，左右两窝（局部 z 小或法线朝上/朝里）
    eye_y0, eye_y1 = nose[1] + 0.01, nose[1] + 0.055
    brow_y0, brow_y1 = nose[1] + 0.045, nose[1] + 0.09
    eye_band = (hp[:, 1] >= eye_y0) & (hp[:, 1] <= eye_y1) & (hn[:, 2] > 0.0)
    left = eye_band & (hp[:, 0] < -0.015) & (hp[:, 0] > -0.09)
    right = eye_band & (hp[:, 0] > 0.015) & (hp[:, 0] < 0.09)

    def socket(mask):
        sl = hp[mask]
        sn = hn[mask]
        if len(sl) < 5:
            return None
        # 眼窝：z 较小且法线不太朝 +Z（凹）
        score = sl[:, 2] - 0.15 * sn[:, 2]
        return sl[score.argmin()]

    eye_l = socket(left)
    eye_r = socket(right)
    print("eye L", eye_l, "eye R", eye_r)

    # 嘴：鼻尖下方
    mouth_band = (hp[:, 1] < nose[1] - 0.02) & (hp[:, 1] > nose[1] - 0.08) & (np.abs(hp[:, 0]) < 0.04) & (hn[:, 2] > 0.2)
    mouth = hp[mouth_band][hp[mouth_band][:, 2].argmax()] if mouth_band.sum() > 5 else nose - np.array([0, 0.05, 0])
    print("mouth", mouth)

    # 发髻：最高的一簇
    top = hp[:, 1] > np.percentile(hp[:, 1], 92)
    bun = hp[top].mean(axis=0)
    bun_peak = hp[hp[:, 1].argmax()]
    print("bun mean", bun, "bun peak", bun_peak)

    # 下巴
    chin_band = (hp[:, 1] < mouth[1]) & (hp[:, 1] > y_cut) & (np.abs(hp[:, 0]) < 0.05) & (hn[:, 2] > 0.15)
    chin = hp[chin_band][hp[chin_band][:, 1].argmin()] if chin_band.sum() > 5 else hp[hp[:, 1].argmin()]
    print("chin", chin)

    # 额头发际：鼻以上、中线、y 较高且开始变黑几何（法线朝上）
    hairline_band = (hp[:, 1] > nose[1] + 0.08) & (hp[:, 1] < bun_peak[1] - 0.04) & (np.abs(hp[:, 0]) < 0.04)
    hairline = hp[hairline_band][hp[hairline_band][:, 1].argmax()] if hairline_band.sum() > 5 else nose + np.array([0, 0.12, 0])
    print("hairline", hairline)

    return {
        "nose": nose,
        "eye_l": eye_l,
        "eye_r": eye_r,
        "mouth": mouth,
        "chin": chin,
        "bun": bun_peak,
        "hairline": hairline,
    }


def main():
    pos, nrm, idx, pmin, pmax = load_dump()
    print("bbox", pmin, pmax)
    y_hist(pos)
    y_cut = pmin[1] + 0.78 * (pmax[1] - pmin[1])
    print("y_cut", y_cut)
    lm = find_landmarks(pos, nrm, y_cut)
    print("render head")
    img, zbuf, box = raster_head(pos, nrm, idx, y_cut, pmin, pmax)
    im = Image.fromarray(img)
    draw = ImageDraw.Draw(im)
    colors = {
        "nose": (255, 40, 40),
        "eye_l": (40, 220, 80),
        "eye_r": (40, 220, 80),
        "mouth": (80, 160, 255),
        "chin": (255, 180, 40),
        "bun": (200, 80, 255),
        "hairline": (255, 255, 80),
    }
    for k, p in lm.items():
        if p is None:
            continue
        px, py = world_to_px(p[0], p[1], box)
        r = 6
        draw.ellipse((px - r, py - r, px + r, py + r), outline=colors[k], width=2)
        draw.text((px + 8, py - 8), k, fill=colors[k])
    im.save(OUT / "head-geom.png")
    print("wrote", OUT / "head-geom.png", "box", box)
    (OUT / "head-landmarks.json").write_text(
        json.dumps({k: (None if v is None else v.tolist()) for k, v in lm.items()} | {"y_cut": float(y_cut), "box": box}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
