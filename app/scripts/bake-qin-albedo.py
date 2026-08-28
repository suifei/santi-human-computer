"""把正/背/侧参考图按身高扫描行对齐后，焖到 UV albedo。"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "public/models/_tmp"
REF = ROOT / "public/models/textures/ref"
OUT_JPG = ROOT / "public/models/textures/qin-albedo.jpg"
OUT_PNG = TMP / "qin-albedo.png"
TEX = 2048
SIL_W, SIL_H = 512, 1024


def load_dump():
    meta = json.loads((TMP / "paint-mesh.json").read_text(encoding="utf-8"))
    n = meta["verts"]
    pos = np.frombuffer((TMP / meta["pos"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    nrm = np.frombuffer((TMP / meta["nrm"]).read_bytes(), dtype=np.float32).reshape(n, 3)
    uv = np.frombuffer((TMP / meta["uv"]).read_bytes(), dtype=np.float32).reshape(n, 2)
    idx = np.frombuffer((TMP / meta["idx"]).read_bytes(), dtype=np.uint32)
    return pos, nrm, uv, idx, np.array(meta["bbox"]["min"], np.float32), np.array(meta["bbox"]["max"], np.float32)


def studio_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    # 浅灰棚底：又亮又灰。头发/靴虽不饱和但暗，要留下。
    bg = (luma > 158) & (sat < 22)
    return ~bg


def row_spans(mask: np.ndarray, min_width: int = 6):
    h, w = mask.shape
    left = np.full(h, np.nan, np.float32)
    right = np.full(h, np.nan, np.float32)
    for y in range(h):
        xs = np.flatnonzero(mask[y])
        if xs.size >= min_width:
            left[y] = float(xs[0])
            right[y] = float(xs[-1])
    valid = np.isfinite(left)
    if valid.sum() < 8:
        raise RuntimeError("figure mask too empty")
    ys = np.arange(h, dtype=np.float32)
    yv = ys[valid]
    left = np.interp(ys, yv, left[valid])
    right = np.interp(ys, yv, right[valid])
    y0 = int(yv[0])
    y1 = int(yv[-1])
    return left, right, y0, y1


def raster_sil(pos, idx, pmin, pmax, mode: str):
    span = np.maximum(pmax - pmin, 1e-5)
    sil = np.zeros((SIL_H, SIL_W), np.uint8)
    if mode == "front":
        u = (pos[:, 0] - pmin[0]) / span[0]
        v = 1.0 - (pos[:, 1] - pmin[1]) / span[1]
    elif mode == "back":
        u = 1.0 - (pos[:, 0] - pmin[0]) / span[0]
        v = 1.0 - (pos[:, 1] - pmin[1]) / span[1]
    else:
        u = (pos[:, 2] - pmin[2]) / span[2]
        v = 1.0 - (pos[:, 1] - pmin[1]) / span[1]
    px = u * (SIL_W - 1)
    py = v * (SIL_H - 1)
    ntri = idx.size // 3
    for t in range(ntri):
        i0, i1, i2 = int(idx[t * 3]), int(idx[t * 3 + 1]), int(idx[t * 3 + 2])
        xs = np.array([px[i0], px[i1], px[i2]], np.float32)
        ys = np.array([py[i0], py[i1], py[i2]], np.float32)
        minx = int(max(0, math.floor(xs.min())))
        maxx = int(min(SIL_W - 1, math.ceil(xs.max())))
        miny = int(max(0, math.floor(ys.min())))
        maxy = int(min(SIL_H - 1, math.ceil(ys.max())))
        if maxx < minx or maxy < miny:
            continue
        area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])
        if abs(area) < 1e-8:
            continue
        yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        w0 = ((xs[1] - xx) * (ys[2] - yy) - (xs[2] - xx) * (ys[1] - yy)) / area
        w1 = ((xs[2] - xx) * (ys[0] - yy) - (xs[0] - xx) * (ys[2] - yy)) / area
        w2 = 1.0 - w0 - w1
        sil[miny : maxy + 1, minx : maxx + 1] |= ((w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)).astype(np.uint8)
    return sil.astype(bool)


def load_sheet(path: Path):
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)
    mask = studio_mask(rgb)
    left, right, y0, y1 = row_spans(mask)
    return rgb, mask, left, right, y0, y1


def palette_from_front(sheet):
    rgb, mask, left, right, y0, y1 = sheet
    hspan = max(y1 - y0, 1)
    ya, yb = int(y0 + 0.14 * hspan), int(y0 + 0.34 * hspan)
    band = rgb[ya:yb].astype(np.float32)
    m = mask[ya:yb]
    luma = 0.2126 * band[..., 0] + 0.7152 * band[..., 1] + 0.0722 * band[..., 2]
    sat = band.max(-1) - band.min(-1)
    skin_m = m & (luma > 125) & (luma < 215) & (sat > 6) & (sat < 80)
    skin = np.median(band[skin_m], axis=0) if skin_m.sum() > 20 else np.array([222, 194, 168], np.float32)
    if not (skin[0] > skin[1] + 6 and skin[0] > 170):
        skin = np.array([222.0, 194.0, 168.0], np.float32)
    yt, yu = int(y0 + 0.02 * hspan), int(y0 + 0.13 * hspan)
    top = rgb[yt:yu].astype(np.float32)
    tm = mask[yt:yu]
    tluma = 0.2126 * top[..., 0] + 0.7152 * top[..., 1] + 0.0722 * top[..., 2]
    hair_m = tm & (tluma < 70)
    hair = np.median(top[hair_m], axis=0) if hair_m.sum() > 10 else np.array([28.0, 22.0, 18.0], np.float32)
    if hair.mean() > 80:
        hair = np.array([28.0, 22.0, 18.0], np.float32)
    print("palette skin", skin, "hair", hair)
    return skin.astype(np.float32), hair.astype(np.float32)


def sample_scan(sheet, u_local: np.ndarray, v_body: np.ndarray):
    rgb, _mask, left, right, y0, y1 = sheet
    h, w = rgb.shape[:2]
    v = np.clip(v_body, 0.0, 1.0)
    y = y0 + v * (y1 - y0)
    y = np.clip(y, 0, h - 1.001)
    yi = np.clip(np.round(y).astype(np.int32), 0, h - 1)
    L = left[yi]
    R = np.maximum(right[yi], L + 1.0)
    x = L + np.clip(u_local, 0.0, 1.0) * (R - L)
    x = np.clip(x, 0, w - 1.001)
    x0 = np.floor(x).astype(np.int32)
    y0i = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1i = np.minimum(y0i + 1, h - 1)
    tx = (x - x0)[..., None]
    ty = (y - y0i)[..., None]
    c00 = rgb[y0i, x0].astype(np.float32)
    c10 = rgb[y0i, x1].astype(np.float32)
    c01 = rgb[y1i, x0].astype(np.float32)
    c11 = rgb[y1i, x1].astype(np.float32)
    col = (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty
    a00 = _mask[y0i, x0].astype(np.float32)
    a10 = _mask[y0i, x1].astype(np.float32)
    a01 = _mask[y1i, x0].astype(np.float32)
    a11 = _mask[y1i, x1].astype(np.float32)
    alpha = (a00 * (1 - tx[..., 0]) + a10 * tx[..., 0]) * (1 - ty[..., 0]) + (
        a01 * (1 - tx[..., 0]) + a11 * tx[..., 0]
    ) * ty[..., 0]
    return col, alpha


def local_u(x_or_z, row_left, row_right, yi, sil_w):
    L = row_left[yi]
    R = np.maximum(row_right[yi], L + 1.0)
    s = np.clip(x_or_z, 0.0, sil_w - 1.001)
    return (s - L) / (R - L)


# 正脸：按网格鼻尖 max-Z 对齐，Y 分段对应参考图，禁止全身扫描行叠第二张脸。
FACE_CX = 0.017
FACE_Y0 = 1.418
HAIR_Y0 = 1.618
# mesh y 低→高：下巴、嘴、须、鼻尖、眼、眉、发际
FACE_MY = np.array([1.452, 1.512, 1.530, 1.545, 1.560, 1.578, 1.635], np.float64)
FACE_PY = np.array([648.0, 618.0, 572.0, 510.0, 440.0, 376.0, 220.0], np.float64)
FACE_PX0 = 433.0
FACE_SX = 105.0 / 0.032
SKIN = np.array([186.0, 172.0, 156.0], np.float32)
HAIR_COL = np.array([22.0, 18.0, 14.0], np.float32)
EAR_COL = np.array([168.0, 148.0, 128.0], np.float32)
MESH_HAIR = np.array(
    [
        [0.017, 1.635],
        [-0.076, 1.740],
        [-0.040, 1.710],
        [0.030, 1.690],
        [-0.095, 1.650],
    ],
    np.float64,
)
PHOTO_HAIR = np.array(
    [
        [433.0, 220.0],
        [350.0, 64.0],
        [340.0, 100.0],
        [500.0, 140.0],
        [270.0, 200.0],
    ],
    np.float64,
)


def soften_lower_face(rgb: np.ndarray) -> np.ndarray:
    """压淡浓密八字胡和下巴须，留淡影和唇线。眉眼（y<500）不动。"""
    out = rgb.astype(np.float32)
    h, w = rgb.shape[:2]
    luma = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
    yy = np.arange(h, dtype=np.float32)[:, None]
    xx = np.arange(w, dtype=np.float32)[None, :]
    dark = np.clip((115.0 - luma) / 70.0, 0.0, 1.0)
    stache = np.clip((yy - 525.0) / 18.0, 0.0, 1.0) * np.clip((650.0 - yy) / 18.0, 0.0, 1.0)
    goatee = np.clip((yy - 628.0) / 12.0, 0.0, 1.0) * np.clip((790.0 - yy) / 28.0, 0.0, 1.0)
    wings = np.clip((np.abs(xx - FACE_PX0) - 22.0) / 16.0, 0.0, 1.0)
    remnant = np.clip(1.0 - np.abs(xx - FACE_PX0) / 18.0, 0.0, 1.0) * np.clip(
        1.0 - np.abs(yy - 572.0) / 9.0, 0.0, 1.0
    )
    lips = np.clip(1.0 - np.abs(yy - 618.0) / 11.0, 0.0, 1.0) * np.clip(
        1.0 - np.abs(xx - FACE_PX0) / 36.0, 0.0, 1.0
    )
    amt = dark * stache * (0.96 * (0.50 + 0.50 * wings) + 0.72 * (1.0 - wings) * (1.0 - remnant))
    amt = np.maximum(amt, dark * goatee * 0.92)
    amt = np.maximum(amt, dark * lips * 0.78)
    amt = amt * np.clip((yy - 500.0) / 12.0, 0.0, 1.0)
    out += (SKIN[None, None, :] - out) * amt[..., None]
    lip_col = np.array([158.0, 136.0, 124.0], np.float32)
    out = out * (1.0 - 0.28 * lips[..., None]) + lip_col * (0.28 * lips[..., None])
    return np.clip(out, 0, 255).astype(np.uint8)


def tps_fit(src: np.ndarray, dst: np.ndarray):
    n = len(src)
    d = src[:, None, :] - src[None, :, :]
    r2 = np.sum(d * d, axis=-1)
    K = np.zeros_like(r2)
    m = r2 > 1e-12
    K[m] = r2[m] * np.log(r2[m])
    P = np.hstack([np.ones((n, 1)), src])
    L = np.zeros((n + 3, n + 3))
    L[:n, :n] = K
    L[:n, n:] = P
    L[n:, :n] = P.T
    Y = np.vstack([dst, np.zeros((3, 2))])
    W = np.linalg.lstsq(L, Y, rcond=None)[0]
    return W[:n], W[n:], src


def tps_eval(query: np.ndarray, src: np.ndarray, weights: np.ndarray, affine: np.ndarray):
    d = query[:, None, :] - src[None, :, :]
    r2 = np.sum(d * d, axis=-1)
    U = np.zeros_like(r2)
    m = r2 > 1e-12
    U[m] = r2[m] * np.log(r2[m])
    return U @ weights + affine[0] + query @ affine[1:]


def load_face_photo(path: Path):
    rgb = soften_lower_face(np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8))
    mask = studio_mask(rgb).astype(np.float32)
    h, w = mask.shape
    xs = np.arange(w, dtype=np.float32)[None, :]
    ys = np.arange(h, dtype=np.float32)[:, None]
    # 正脸保留耳朵；发区加宽，士兵右脸（照片左侧）不再裁掉
    face_x = np.abs(xs - FACE_PX0) < 320
    hair_x = (xs > 80) & (xs < 760)
    mask = mask * np.where(ys > 180, face_x, hair_x | face_x).astype(np.float32)
    hw, ha, hs = tps_fit(MESH_HAIR, PHOTO_HAIR)
    return rgb, mask, (hw, ha, hs)


def sample_photo(rgb, mask, uv):
    h, w = rgb.shape[:2]
    x = np.clip(uv[:, 0], 0.0, w - 1.001)
    y = np.clip(uv[:, 1], 0.0, h - 1.001)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (x - x0)[..., None]
    ty = (y - y0)[..., None]
    c00 = rgb[y0, x0].astype(np.float32)
    c10 = rgb[y0, x1].astype(np.float32)
    c01 = rgb[y1, x0].astype(np.float32)
    c11 = rgb[y1, x1].astype(np.float32)
    col = (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty
    a00 = mask[y0, x0]
    a10 = mask[y0, x1]
    a01 = mask[y1, x0]
    a11 = mask[y1, x1]
    alpha = (a00 * (1 - tx[..., 0]) + a10 * tx[..., 0]) * (1 - ty[..., 0]) + (
        a01 * (1 - tx[..., 0]) + a11 * tx[..., 0]
    ) * ty[..., 0]
    return col, np.clip(alpha, 0.0, 1.0)


def sample_face(face, xy: np.ndarray, y: np.ndarray):
    rgb, mask, hair_tps = face
    hw, ha, hs = hair_tps
    x = xy[:, 0]
    px = FACE_PX0 + (x - FACE_CX) * FACE_SX
    py = np.interp(y, FACE_MY, FACE_PY)
    # 正脸图左缘是棚底/高光。士兵右脸改采已对准的左半张（镜像），眉眼仍是对称深色。
    px_m = FACE_PX0 - (x - FACE_CX) * FACE_SX
    px = np.where((x < FACE_CX) & (y < HAIR_Y0), px_m, px)
    px_edge = np.interp(
        py,
        [180.0, 360.0, 440.0, 520.0, 600.0, 640.0, 700.0],
        [195.0, 175.0, 185.0, 200.0, 255.0, 275.0, 285.0],
    )
    px = np.clip(px, px_edge, 753.0)
    uv_f = np.stack([px, py], 1)
    uv_h = tps_eval(xy.astype(np.float64), hs, hw, ha)
    col_f, a_f = sample_photo(rgb, mask, uv_f)
    col_h, a_h = sample_photo(rgb, mask, uv_h)
    hair_w = np.clip((y - HAIR_Y0) / 0.035, 0.0, 1.0)
    dx = np.abs(x - FACE_CX)
    # 鼻尖偏 +X，右侧 dx 先到阈值；右颊加宽，否则正脸图被切掉后平涂成白块
    front_lim = np.where(x < FACE_CX, 0.062, 0.044)
    front_keep = np.clip(1.0 - (dx - front_lim) / 0.030, 0.0, 1.0)
    col_mid = col_f * (1.0 - hair_w[:, None]) + col_h * hair_w[:, None]
    # 士兵右脸：鬓发从右眼外侧开始，不要盖住正脸皮肤
    right = np.clip((-x - 0.052) / 0.028, 0.0, 1.0)
    py_r = np.interp(y, [1.430, 1.500, 1.540, 1.600, 1.680], [500.0, 430.0, 360.0, 240.0, 100.0])
    px_lo = np.interp(
        py_r,
        [100.0, 180.0, 280.0, 360.0, 430.0, 500.0, 580.0],
        [215.0, 198.0, 185.0, 175.0, 185.0, 180.0, 215.0],
    )
    px_r = np.clip(np.interp(x, [-0.125, -0.048], [220.0, 255.0]), 175.0, 280.0)
    px_r = np.maximum(px_r, px_lo)
    col_r, a_r = sample_photo(rgb, mask, np.stack([px_r, py_r], 1))
    luma_r = 0.2126 * col_r[:, 0] + 0.7152 * col_r[:, 1] + 0.0722 * col_r[:, 2]
    a_r = a_r * np.clip((155.0 - luma_r) / 30.0, 0.0, 1.0)
    temple = np.clip((dx - 0.044) / 0.030, 0.0, 1.0) * np.clip((y - 1.488) / 0.022, 0.0, 1.0)
    ear = np.clip(1.0 - np.abs(dx - 0.090) / 0.026, 0.0, 1.0) * np.clip(1.0 - np.abs(y - 1.530) / 0.036, 0.0, 1.0)
    ear_r = np.clip(1.0 - np.abs(x + 0.088) / 0.028, 0.0, 1.0) * np.clip(
        1.0 - np.abs(y - 1.526) / 0.042, 0.0, 1.0
    )
    ear = np.maximum(ear, ear_r)
    sideburn = right * np.clip((y - 1.432) / 0.016, 0.0, 1.0) * np.clip((1.640 - y) / 0.04, 0.0, 1.0)
    hair_amt = np.clip(hair_w + temple * 0.95 + sideburn * 0.92, 0.0, 1.0)
    fill = SKIN[None, :] * (1.0 - hair_amt[:, None]) + HAIR_COL[None, :] * hair_amt[:, None]
    fill = fill * (1.0 - 0.86 * ear[:, None]) + EAR_COL[None, :] * (0.86 * ear[:, None])
    w_front = (a_f * (1.0 - hair_w) + a_h * hair_w) * front_keep * (1.0 - 0.75 * right)
    w_side = right * a_r
    w_fill = np.clip(1.0 - w_front - w_side, 0.0, 1.0)
    col = col_mid * w_front[:, None] + col_r * w_side[:, None] + fill * w_fill[:, None]
    alpha = np.clip(w_front + w_side + hair_amt + ear, 0.0, 1.0)
    # 嘴须：只冲掉最黑的须块，留唇线；不动眉眼
    luma = 0.2126 * col[:, 0] + 0.7152 * col[:, 1] + 0.0722 * col[:, 2]
    mouth = np.clip(1.0 - np.abs(y - 1.518) / 0.026, 0.0, 1.0) * np.clip(1.0 - dx / 0.042, 0.0, 1.0)
    mouth = mouth * np.clip((1.544 - y) / 0.006, 0.0, 1.0)
    crush = np.clip((70.0 - luma) / 50.0, 0.0, 1.0)
    col = col + (SKIN[None, :] - col) * (0.55 * crush * mouth)[:, None]
    lips = np.clip(1.0 - np.abs(y - 1.512) / 0.010, 0.0, 1.0) * np.clip(1.0 - dx / 0.028, 0.0, 1.0)
    lip_col = np.array([152.0, 132.0, 120.0], np.float32)
    col = col * (1.0 - 0.32 * lips[:, None]) + lip_col * (0.32 * lips[:, None])
    # 右脸侧仍过浅的块（棚底/高光）改发+耳，躲开眉眼
    luma2 = 0.2126 * col[:, 0] + 0.7152 * col[:, 1] + 0.0722 * col[:, 2]
    too_pale = (x < -0.028) & (y > 1.445) & (y < 1.642) & (luma2 > 142.0)
    too_pale = too_pale & ~((np.abs(y - 1.560) < 0.020) & (x > -0.050))
    too_pale = too_pale & ~(np.abs(y - 1.578) < 0.015)
    tp = too_pale.astype(np.float32)
    replace = HAIR_COL[None, :] * (1.0 - 0.86 * ear[:, None]) + EAR_COL[None, :] * (0.86 * ear[:, None])
    col = col * (1.0 - tp[:, None]) + replace * tp[:, None]
    return col, np.clip(np.maximum(alpha, 0.8), 0.0, 1.0)


def rasterize(pos, nrm, uv, idx, sheets, mesh_spans, pmin, pmax, face):
    rgb = np.zeros((TEX, TEX, 3), dtype=np.float32)
    wgt = np.zeros((TEX, TEX), dtype=np.float32)
    span = np.maximum(pmax - pmin, 1e-5)
    front, back, side = sheets
    face_pack = face
    m_front, m_back, m_side = mesh_spans
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

        v_body = 1.0 - (P[:, 1] - pmin[1]) / span[1]
        yi = np.clip(np.round(v_body * (SIL_H - 1)).astype(np.int32), 0, SIL_H - 1)

        sx_f = (P[:, 0] - pmin[0]) / span[0] * (SIL_W - 1)
        sx_b = (1.0 - (P[:, 0] - pmin[0]) / span[0]) * (SIL_W - 1)
        sz = (P[:, 2] - pmin[2]) / span[2] * (SIL_W - 1)

        u_f = local_u(sx_f, m_front[0], m_front[1], yi, SIL_W)
        u_b = local_u(sx_b, m_back[0], m_back[1], yi, SIL_W)
        u_s = local_u(sz, m_side[0], m_side[1], yi, SIL_W)
        u_s = np.where(N[:, 0] < 0.0, u_s, 1.0 - u_s)

        c_f, a_f = sample_scan(front, u_f, v_body)
        c_b, a_b = sample_scan(back, u_b, v_body)
        c_s, a_s = sample_scan(side, u_s, v_body)

        nz, nx = N[:, 2], N[:, 0]
        wf = np.clip(nz, 0.0, 1.0) ** 1.6 * np.clip(a_f, 0.2, 1.0)
        wb = np.clip(-nz, 0.0, 1.0) ** 1.6 * np.clip(a_b, 0.2, 1.0)
        ws = (np.abs(nx) ** 1.7) * np.clip(a_s, 0.2, 1.0)
        wsum = wf + wb + ws + 1e-5
        col = (c_f * wf[:, None] + c_b * wb[:, None] + c_s * ws[:, None]) / wsum[:, None]

        y = P[:, 1]
        head_w = np.clip((y - FACE_Y0) / 0.012, 0.0, 1.0)
        if head_w.max() > 0.01:
            c_face, _a_face = sample_face(face_pack, P[:, :2], y)
            # 正面仍用正脸图（眉眼已对准）；侧面用侧图，浅棚底改发色
            side_luma = 0.2126 * c_s[:, 0] + 0.7152 * c_s[:, 1] + 0.0722 * c_s[:, 2]
            side_ok = np.clip(a_s, 0.0, 1.0) * np.clip((165.0 - side_luma) / 25.0, 0.0, 1.0)
            side_col = c_s * side_ok[:, None] + HAIR_COL[None, :] * (1.0 - side_ok[:, None])
            side_w = head_w * np.clip((np.abs(nx) - 0.16) / 0.38, 0.0, 1.0)
            side_w = side_w * np.clip((0.72 - nz) / 0.50, 0.0, 1.0)
            lat_r = head_w * np.clip((-P[:, 0] - 0.058) / 0.030, 0.0, 1.0)
            side_w = np.maximum(side_w, lat_r * 0.92)
            back_w = head_w * np.clip((-nz) / 0.28, 0.0, 1.0)
            head_col = c_face * (1.0 - side_w[:, None]) + side_col * side_w[:, None]
            head_col = head_col * (1.0 - back_w[:, None]) + HAIR_COL[None, :] * back_w[:, None]
            # 侧图混发色会盖掉右耳，再把耳廓填回去
            ear_r = np.clip(1.0 - np.abs(P[:, 0] + 0.088) / 0.028, 0.0, 1.0) * np.clip(
                1.0 - np.abs(y - 1.526) / 0.042, 0.0, 1.0
            )
            ear_r = ear_r * head_w * np.clip((-P[:, 0] - 0.058) / 0.018, 0.0, 1.0)
            face_luma = 0.2126 * head_col[:, 0] + 0.7152 * head_col[:, 1] + 0.0722 * head_col[:, 2]
            pale_r = head_w * np.clip((-P[:, 0] - 0.028) / 0.018, 0.0, 1.0) * np.clip(
                (face_luma - 142.0) / 18.0, 0.0, 1.0
            )
            pale_r = pale_r * (
                1.0
                - np.clip(1.0 - np.abs(y - 1.560) / 0.020, 0.0, 1.0)
                * np.clip((P[:, 0] + 0.050) / 0.012, 0.0, 1.0)
            )
            pale_r = pale_r * (1.0 - np.clip(1.0 - np.abs(y - 1.578) / 0.015, 0.0, 1.0))
            head_col = head_col * (1.0 - 0.92 * pale_r[:, None]) + HAIR_COL[None, :] * (0.92 * pale_r[:, None])
            head_col = head_col * (1.0 - 0.90 * ear_r[:, None]) + EAR_COL[None, :] * (0.90 * ear_r[:, None])
            col = col * (1.0 - head_w[:, None]) + head_col * head_w[:, None]

        rgb[ys[inside].astype(np.int32), xs[inside].astype(np.int32)] += col
        wgt[ys[inside].astype(np.int32), xs[inside].astype(np.int32)] += 1.0
        if t % 2000 == 0:
            print(f"  tri {t}/{ntri}", flush=True)

    hit = wgt > 0
    rgb[hit] /= wgt[hit, None]
    return rgb, wgt


def dilate(rgb, wgt, steps=16):
    for _ in range(steps):
        empty = wgt == 0
        if not empty.any():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros_like(wgt)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            src_c = np.roll(np.roll(rgb, dy, 0), dx, 1)
            src_w = np.roll(np.roll(wgt, dy, 0), dx, 1)
            m = empty & (src_w > 0)
            acc[m] += src_c[m]
            cnt[m] += 1
        hit = empty & (cnt > 0)
        rgb[hit] = acc[hit] / cnt[hit, None]
        wgt[hit] = 1
    rgb[wgt == 0] = 32.0
    return rgb


def debug_warp(pos, idx, pmin, pmax, front, m_front):
    sil = raster_sil(pos, idx, pmin, pmax, "front")
    span = np.maximum(pmax - pmin, 1e-5)
    out = np.zeros((SIL_H, SIL_W, 3), np.uint8)
    ys, xs = np.where(sil)
    v_body = ys / (SIL_H - 1)
    u_f = local_u(xs.astype(np.float32), m_front[0], m_front[1], ys, SIL_W)
    col, _ = sample_scan(front, u_f, v_body)
    out[ys, xs] = np.clip(col, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(TMP / "warp-front-debug.png")
    print("wrote warp-front-debug.png")


def debug_face_warp(pos, idx, pmin, pmax, face):
    y_cut = FACE_Y0
    hp = pos[pos[:, 1] >= y_cut]
    xmin, xmax = float(hp[:, 0].min() - 0.02), float(hp[:, 0].max() + 0.02)
    ymin, ymax = float(hp[:, 1].min() - 0.02), float(hp[:, 1].max() + 0.02)
    W, H = 640, 860
    zbuf = np.full((H, W), -1e9, np.float32)
    out = np.zeros((H, W, 3), np.float32)
    face_pack = face
    ntri = idx.size // 3
    for t in range(ntri):
        i0, i1, i2 = int(idx[t * 3]), int(idx[t * 3 + 1]), int(idx[t * 3 + 2])
        if pos[i0, 1] < y_cut - 0.05 and pos[i1, 1] < y_cut - 0.05 and pos[i2, 1] < y_cut - 0.05:
            continue
        P = pos[[i0, i1, i2]]
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
        xy = np.stack(
            [
                P[0, 0] * w0[inside] + P[1, 0] * w1[inside] + P[2, 0] * w2[inside],
                P[0, 1] * w0[inside] + P[1, 1] * w1[inside] + P[2, 1] * w2[inside],
            ],
            1,
        )
        col, _ = sample_face(face_pack, xy, xy[:, 1])
        sub_z = zbuf[miny : maxy + 1, minx : maxx + 1]
        vis = inside & (z > sub_z)
        packed = np.zeros((*inside.shape, 3), np.float32)
        packed[inside] = col
        sub_z[vis] = z[vis]
        pix = out[miny : maxy + 1, minx : maxx + 1]
        pix[vis] = packed[vis]
        zbuf[miny : maxy + 1, minx : maxx + 1] = sub_z
        out[miny : maxy + 1, minx : maxx + 1] = pix
    img = np.clip(out, 0, 255).astype(np.uint8)
    Image.fromarray(img).save(TMP / "head-warp-preview.png")
    print("wrote head-warp-preview.png")


def main():
    print("load mesh")
    pos, nrm, uv, idx, pmin, pmax = load_dump()
    print("bbox", pmin, pmax, "tris", len(idx) // 3)

    print("load sheets")
    front = load_sheet(REF / "qin-sheet-front.png")
    back = load_sheet(REF / "qin-sheet-back.png")
    side = load_sheet(REF / "qin-sheet-side.png")
    face = load_face_photo(REF / "qin-sheet-head.png")
    print("front y", front[4], front[5], "face photo", face[0].shape)

    print("mesh silhouettes")
    sil_f = raster_sil(pos, idx, pmin, pmax, "front")
    sil_b = raster_sil(pos, idx, pmin, pmax, "back")
    sil_s = raster_sil(pos, idx, pmin, pmax, "side")
    m_front = row_spans(sil_f, min_width=2)
    m_back = row_spans(sil_b, min_width=2)
    m_side = row_spans(sil_s, min_width=2)
    debug_warp(pos, idx, pmin, pmax, front, m_front)
    debug_face_warp(pos, idx, pmin, pmax, face)

    print("bake", TEX)
    rgb, wgt = rasterize(pos, nrm, uv, idx, (front, back, side), (m_front, m_back, m_side), pmin, pmax, face)
    print("dilate", int((wgt == 0).sum()), "empty")
    rgb = dilate(rgb, wgt)
    img = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGB").save(OUT_PNG)
    Image.fromarray(img, "RGB").save(OUT_JPG, quality=90, optimize=True)
    print("wrote", OUT_JPG, OUT_JPG.stat().st_size)


if __name__ == "__main__":
    main()
