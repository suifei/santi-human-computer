"""在头上画世界 XY 厘米格，用来对照 3D 截图读真实五官坐标。"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "public/models/_tmp"
OUT_JPG = ROOT / "public/models/textures/qin-albedo.jpg"
TEX = 2048


def load_dump():
    meta = json.loads((TMP / "paint-mesh.json").read_text(encoding="utf-8"))
    n = meta["verts"]
    pos = np.frombuffer((TMP / meta["pos"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    nrm = np.frombuffer((TMP / meta["nrm"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    uv = np.frombuffer((TMP / meta["uv"]).read_bytes(), dtype=np.float32).reshape(n, 2)
    idx = np.frombuffer((TMP / meta["idx"]).read_bytes(), dtype=np.uint32)
    return pos, nrm, uv, idx


def color_of(P, N):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    nz = N[:, 2]
    # 身体：素灰，只把头画成坐标格
    col = np.full((len(P), 3), 90.0, np.float32)
    head = y > 1.36
    # 厘米格：x、y 各 2cm 一条深线
    gx = np.abs((x * 50) % 1 - 0.5)
    gy = np.abs((y * 50) % 1 - 0.5)
    line = (gx < 0.08) | (gy < 0.08)
    # 底色随 x/y 变化，便于读象限
    u = np.clip((x + 0.12) / 0.24, 0, 1)
    v = np.clip((y - 1.38) / 0.38, 0, 1)
    base = np.stack([40 + 180 * u, 40 + 180 * v, 80 + 80 * np.clip(z, 0, 0.2) / 0.2], 1)
    dark = np.array([20, 20, 20], np.float32)
    head_col = np.where(line[:, None], dark, base)
    col = np.where(head[:, None], head_col, col)
    # 鼻尖十字：y=1.545 x=0.017
    nose = (np.abs(x - 0.017) < 0.006) | (np.abs(y - 1.545) < 0.004)
    col = np.where((head & nose)[:, None], np.array([255, 0, 255], np.float32), col)
    # 只给前半球上色格，后脑变暗蓝
    back = head & (nz < -0.15)
    col = np.where(back[:, None], np.array([20, 30, 70], np.float32), col)
    return col


def rasterize(pos, nrm, uv, idx):
    rgb = np.zeros((TEX, TEX, 3), dtype=np.float32)
    wgt = np.zeros((TEX, TEX), dtype=np.float32)
    ntri = idx.size // 3
    for t in range(ntri):
        i0, i1, i2 = int(idx[t * 3]), int(idx[t * 3 + 1]), int(idx[t * 3 + 2])
        uvs = uv[[i0, i1, i2]]
        if not np.isfinite(uvs).all():
            continue
        px = uvs[:, 0] * (TEX - 1)
        py = uvs[:, 1] * (TEX - 1)
        minx = int(max(0, math.floor(px.min())))
        maxx = int(min(TEX - 1, math.ceil(px.max())))
        miny = int(max(0, math.floor(py.min())))
        maxy = int(min(TEX - 1, math.ceil(py.max())))
        if maxx < minx or maxy < miny:
            continue
        area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
        if abs(area) < 1e-8:
            continue
        ys, xs = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        xs = xs.astype(np.float32)
        ys = ys.astype(np.float32)
        w0 = ((px[1] - xs) * (py[2] - ys) - (px[2] - xs) * (py[1] - ys)) / area
        w1 = ((px[2] - xs) * (py[0] - ys) - (px[0] - xs) * (py[2] - ys)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        ww0, ww1, ww2 = w0[inside], w1[inside], w2[inside]
        P = pos[i0] * ww0[:, None] + pos[i1] * ww1[:, None] + pos[i2] * ww2[:, None]
        N = nrm[i0] * ww0[:, None] + nrm[i1] * ww1[:, None] + nrm[i2] * ww2[:, None]
        N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
        col = color_of(P, N)
        rgb[ys[inside].astype(np.int32), xs[inside].astype(np.int32)] += col
        wgt[ys[inside].astype(np.int32), xs[inside].astype(np.int32)] += 1.0
        if t % 4000 == 0:
            print("tri", t, "/", ntri, flush=True)
    hit = wgt > 0
    rgb[hit] /= wgt[hit, None]
    rgb[wgt == 0] = 30
    return rgb


def main():
    pos, nrm, uv, idx = load_dump()
    print("bake debug grid")
    rgb = rasterize(pos, nrm, uv, idx)
    img = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGB").save(OUT_JPG, quality=92)
    Image.fromarray(img, "RGB").save(TMP / "debug-grid-albedo.png")
    print("wrote", OUT_JPG)


if __name__ == "__main__":
    main()
