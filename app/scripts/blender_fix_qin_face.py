"""Blender 5.2：轮廓对齐把正脸照片投到右脸和嘴须。

只改 albedo，不改网格/站姿。锁左脸、双眼、眉毛。
发髻不对称，禁止左右镜像转贴。

运行：
  blender --background --python app/scripts/blender_fix_qin_face.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import math

import bpy
import numpy as np
from mathutils import Vector

APP = Path(__file__).resolve().parent.parent
GLB = APP / "public/models/qin-soldier.glb"
ALBEDO = APP / "public/models/textures/qin-albedo.jpg"
HEAD_PHOTO = APP / "public/models/textures/ref/qin-sheet-head.png"
TMP = APP / "public/models/_tmp"
BLEND = TMP / "qin-soldier-face.blend"
BACKUP = TMP / "qin-albedo-face13.jpg"
PREVIEW_HEAD = TMP / "blender-preview-head.png"
PREVIEW_RIGHT = TMP / "blender-preview-right.png"

FACE_CX = 0.017
FACE_Y0 = 1.418
HAIR_Y0 = 1.618
FACE_MY = np.array([1.452, 1.512, 1.530, 1.545, 1.560, 1.578, 1.635], np.float64)
FACE_PY = np.array([648.0, 618.0, 572.0, 510.0, 440.0, 376.0, 220.0], np.float64)
FACE_PX0 = 433.0
FACE_SX = 105.0 / 0.032
SKIN = np.array([186.0, 172.0, 156.0], np.float32)
HAIR_COL = np.array([22.0, 18.0, 14.0], np.float32)
EAR_COL = np.array([168.0, 148.0, 128.0], np.float32)
LIP_COL = np.array([152.0, 132.0, 120.0], np.float32)
EYE_R = np.array([-0.034, 1.560], np.float32)
EYE_L = np.array([0.068, 1.560], np.float32)
EYE_R2 = 0.026 ** 2


def log(*args):
    print(*args, flush=True)


def load_rgb(path: Path) -> np.ndarray:
    img = bpy.data.images.load(str(path), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    arr = np.flipud(px.reshape(h, w, 4))[..., :3]
    return np.clip(arr * 255.0, 0, 255).astype(np.uint8)


def import_glb(path: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if hasattr(bpy.ops.import_scene, "gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        bpy.ops.wm.gltf_import(filepath=str(path))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("GLB has no mesh")
    meshes.sort(key=lambda o: len(o.data.polygons), reverse=True)
    obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def world_mesh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    mat = ev.matrix_world
    n = len(mesh.vertices)
    pos = np.empty((n, 3), np.float32)
    for i, v in enumerate(mesh.vertices):
        co = mat @ v.co
        # Blender Z-up ← glTF Y-up：app (x,y,z) = (bx, bz, -by)
        pos[i] = (co.x, co.z, -co.y)
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        raise RuntimeError("mesh has no UV")
    ntri = len(mesh.loop_triangles)
    tris = np.empty((ntri, 3), np.int32)
    uvs = np.empty((ntri, 3, 2), np.float32)
    for i, tri in enumerate(mesh.loop_triangles):
        tris[i] = tri.vertices
        for k, loop_i in enumerate(tri.loops):
            uvs[i, k] = uv_layer.data[loop_i].uv
    try:
        ev.to_mesh_clear()
    except Exception:
        pass
    return pos, tris, uvs


def detect_uv_flip(pos, tris, uvs, albedo):
    """glTF v=0 在图顶；Blender v=0 在图底。用左眼暗色判断。"""
    h, w = albedo.shape[:2]
    d2 = (pos[:, 0] - EYE_L[0]) ** 2 + (pos[:, 1] - EYE_L[1]) ** 2
    head = pos[:, 1] > 1.50
    idx = int(np.argmin(np.where(head, d2, 1e9)))
    # 找含该顶点、最靠前的三角
    hits = np.where((tris == idx).any(1))[0]
    if hits.size == 0:
        return True
    zmean = pos[tris[hits]].mean(1)[:, 2]
    ti = int(hits[int(np.argmax(zmean))])
    uv = uvs[ti].mean(0)

    def luma_at(flip):
        u, v = float(uv[0]), float(uv[1])
        if flip:
            v = 1.0 - v
        x = int(np.clip(u, 0, 1) * (w - 1))
        y = int(np.clip(v, 0, 1) * (h - 1))
        p = albedo[y, x].astype(np.float32)
        return float(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]), (x, y)

    a, pa = luma_at(False)
    b, pb = luma_at(True)
    flip = b < a
    log("uv detect left-eye", "raw", round(a, 1), pa, "flipV", round(b, 1), pb, "use_flip", flip)
    return flip


def to_gltf_uv(uvs, flip):
    out = uvs.copy()
    if flip:
        out[..., 1] = 1.0 - out[..., 1]
    return out


def sample_rgb(img, uv):
    h, w = img.shape[:2]
    u = np.clip(uv[:, 0], 0.0, 1.0) * (w - 1.001)
    v = np.clip(uv[:, 1], 0.0, 1.0) * (h - 1.001)
    x0 = np.floor(u).astype(np.int32)
    y0 = np.floor(v).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (u - x0)[..., None]
    ty = (v - y0)[..., None]
    c00 = img[y0, x0].astype(np.float32)
    c10 = img[y0, x1].astype(np.float32)
    c01 = img[y1, x0].astype(np.float32)
    c11 = img[y1, x1].astype(np.float32)
    return (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty


def studio_mask(rgb):
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    return (luma < 158.0) | (sat > 22.0)


def row_spans(mask, min_width=6):
    h = mask.shape[0]
    left = np.full(h, np.nan, np.float32)
    right = np.full(h, np.nan, np.float32)
    for y in range(h):
        xs = np.flatnonzero(mask[y])
        if xs.size >= min_width:
            left[y] = float(xs[0])
            right[y] = float(xs[-1])
    valid = np.isfinite(left)
    ys = np.arange(h, dtype=np.float32)
    yv = ys[valid]
    left = np.interp(ys, yv, left[valid])
    right = np.interp(ys, yv, right[valid])
    return left, right


def mesh_x_spans(pos, tris, y0=1.40, y1=1.76, bins=180):
    left = np.full(bins, np.nan, np.float32)
    right = np.full(bins, np.nan, np.float32)
    for t in tris:
        P = pos[t]
        if P[:, 1].max() < y0 or P[:, 1].min() > y1:
            continue
        if P[:, 2].mean() < -0.04:
            continue
        for p in P:
            if p[1] < y0 or p[1] > y1:
                continue
            bi = int(np.clip((p[1] - y0) / (y1 - y0) * (bins - 1), 0, bins - 1))
            x = p[0]
            left[bi] = x if np.isnan(left[bi]) else min(left[bi], x)
            right[bi] = x if np.isnan(right[bi]) else max(right[bi], x)
    valid = np.isfinite(left) & np.isfinite(right)
    idx = np.arange(bins, dtype=np.float32)
    vi = idx[valid]
    left = np.interp(idx, vi, left[valid])
    right = np.interp(idx, vi, right[valid])
    return y0, y1, left, right


def project_photo(x, y, photo, pL, pR, m_y0, m_y1, mL, mR):
    ph, pw = photo.shape[:2]
    py = np.interp(y, FACE_MY, FACE_PY)
    pyi = np.clip(py, 0, ph - 1.001)
    t = np.clip((y - m_y0) / (m_y1 - m_y0), 0.0, 1.0)
    mi = t * (len(mL) - 1)
    i0 = np.floor(mi).astype(np.int32)
    i1 = np.minimum(i0 + 1, len(mL) - 1)
    ft = (mi - i0)
    ml = mL[i0] * (1 - ft) + mL[i1] * ft
    mr = mR[i0] * (1 - ft) + mR[i1] * ft
    u = (x - ml) / np.maximum(mr - ml, 1e-4)
    u = np.clip(u, 0.0, 1.0)
    yi = np.clip(pyi, 0, ph - 1).astype(np.int32)
    px = pL[yi] + u * (pR[yi] - pL[yi])
    uv = np.stack([px / (pw - 1), pyi / (ph - 1)], 1)
    col = sample_rgb(photo, uv)
    a = studio_alpha(col)
    return col, a


def studio_alpha(rgb):
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    return ((luma < 158.0) | (sat > 22.0)).astype(np.float32)


def barycentric(p, a, b, c):
    v0 = b - a
    v1 = c - a
    v2 = p - a
    d00 = np.einsum("ij,ij->i", v0, v0)
    d01 = np.einsum("ij,ij->i", v0, v1)
    d11 = np.einsum("ij,ij->i", v1, v1)
    d20 = np.einsum("ij,ij->i", v2, v0)
    d21 = np.einsum("ij,ij->i", v2, v1)
    denom = np.maximum(d00 * d11 - d01 * d01, 1e-12)
    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    u = 1.0 - v - w
    return u, v, w


def classify(x, y):
    """lock / mouth / right / skip。向量化。"""
    n = x.shape[0]
    tag = np.full(n, 0, np.int8)  # 0 skip, 1 lock, 2 mouth, 3 right
    head = (y >= FACE_Y0) & (y <= 1.70)
    d_r = (x - EYE_R[0]) ** 2 + (y - EYE_R[1]) ** 2
    d_l = (x - EYE_L[0]) ** 2 + (y - EYE_L[1]) ** 2
    eyes = (d_r < EYE_R2) | (d_l < EYE_R2)
    brows = (y >= 1.568) & (y <= 1.600) & (x > -0.050) & (x < 0.10)
    left = x > 0.012
    mouth = (np.abs(x - FACE_CX) < 0.048) & (y >= 1.448) & (y <= 1.538)
    right = (x < -0.016) & (y >= 1.430) & (y <= 1.670)
    tag[head & left & ~mouth] = 1
    tag[head & (eyes | brows)] = 1
    tag[head & mouth & (tag != 1)] = 2
    tag[head & right & (tag == 0)] = 3
    return tag


def raster_fix(pos, tris, uvs, albedo, photo, pL, pR, mesh_span):
    h, w = albedo.shape[:2]
    out = albedo.astype(np.float32).copy()
    m_y0, m_y1, mL, mR = mesh_span
    ntri = len(tris)
    n_right = n_mouth = n_lock = 0
    for t in range(ntri):
        i0, i1, i2 = tris[t]
        P = pos[[i0, i1, i2]]
        if P[:, 1].max() < 1.40 or P[:, 1].min() > 1.72:
            continue
        uv = uvs[t]
        px = uv[:, 0] * (w - 1)
        py = uv[:, 1] * (h - 1)
        minx = int(max(0, np.floor(px.min())))
        maxx = int(min(w - 1, np.ceil(px.max())))
        miny = int(max(0, np.floor(py.min())))
        maxy = int(min(h - 1, np.ceil(py.max())))
        if maxx < minx or maxy < miny:
            continue
        area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
        if abs(area) < 1e-8:
            continue
        yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        xs = xx.astype(np.float32)
        ys = yy.astype(np.float32)
        w0 = ((px[1] - xs) * (py[2] - ys) - (px[2] - xs) * (py[1] - ys)) / area
        w1 = ((px[2] - xs) * (py[0] - ys) - (px[0] - xs) * (py[2] - ys)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        pts = (
            P[0] * w0[inside, None]
            + P[1] * w1[inside, None]
            + P[2] * w2[inside, None]
        )
        tag = classify(pts[:, 0], pts[:, 1])
        ys_i = ys[inside].astype(np.int32)
        xs_i = xs[inside].astype(np.int32)
        n_lock += int((tag == 1).sum())
        m = (tag == 2) | (tag == 3)
        if m.any():
            cur = out[ys_i[m], xs_i[m]]
            old_luma = 0.2126 * cur[:, 0] + 0.7152 * cur[:, 1] + 0.0722 * cur[:, 2]
            ear = (
                np.clip(1.0 - np.abs(pts[m, 0] + 0.088) / 0.030, 0.0, 1.0)
                * np.clip(1.0 - np.abs(pts[m, 1] - 1.526) / 0.044, 0.0, 1.0)
            )
            fill = HAIR_COL[None, :] * (1.0 - 0.88 * ear[:, None]) + EAR_COL[None, :] * (
                0.88 * ear[:, None]
            )
            use = cur.copy()
            # 右脸：只覆盖已经发白的棚底块，已有鬓发保持
            right = tag[m] == 3
            if right.any():
                pale = np.clip((old_luma[right] - 125.0) / 18.0, 0.0, 1.0)
                side = np.clip((-pts[m, 0][right] - 0.032) / 0.018, 0.0, 1.0)
                amt = np.clip(np.maximum(pale, 0.55 * side * np.clip((old_luma[right] - 95.0) / 40.0, 0.0, 1.0)), 0.0, 1.0)
                use[right] = cur[right] * (1.0 - amt[:, None]) + fill[right] * amt[:, None]
            # 嘴：轮廓对齐的正脸照片，冲淡浓须，边缘柔和
            mouth = tag[m] == 2
            if mouth.any():
                col, a = project_photo(
                    pts[m, 0][mouth],
                    pts[m, 1][mouth],
                    photo,
                    pL,
                    pR,
                    m_y0,
                    m_y1,
                    mL,
                    mR,
                )
                mluma = 0.2126 * col[:, 0] + 0.7152 * col[:, 1] + 0.0722 * col[:, 2]
                crush = np.clip((85.0 - mluma) / 55.0, 0.0, 1.0)
                col = col + (SKIN[None, :] - col) * (0.62 * crush)[:, None]
                lips = np.clip(1.0 - np.abs(pts[m, 1][mouth] - 1.512) / 0.010, 0.0, 1.0)
                lips = lips * np.clip(1.0 - np.abs(pts[m, 0][mouth] - FACE_CX) / 0.028, 0.0, 1.0)
                col = col * (1.0 - 0.32 * lips[:, None]) + LIP_COL * (0.32 * lips[:, None])
                dark = np.clip((95.0 - old_luma[mouth]) / 45.0, 0.0, 1.0)
                wy = np.clip(1.0 - np.abs(pts[m, 1][mouth] - 1.493) / 0.050, 0.0, 1.0)
                wx = np.clip(1.0 - np.abs(pts[m, 0][mouth] - FACE_CX) / 0.050, 0.0, 1.0)
                mw = np.clip(np.maximum(a * (wx * wy) ** 0.7, 0.9 * dark * a), 0.0, 1.0)
                use[mouth] = cur[mouth] * (1.0 - mw[:, None]) + col * mw[:, None]
            out[ys_i[m], xs_i[m]] = use
            n_right += int(right.sum())
            n_mouth += int(mouth.sum())
        if t % 1500 == 0:
            log("  tri", t, "/", ntri)
    if n_right == 0 and n_mouth == 0:
        raise RuntimeError("no face texels classified; abort save")
    log("texels right", n_right, "mouth", n_mouth, "lock_skipped", n_lock)
    return np.clip(out, 0, 255).astype(np.uint8)


def assign_material(obj, image_path: Path):
    img = bpy.data.images.load(str(image_path), check_existing=False)
    img.colorspace_settings.name = "sRGB"
    mat = bpy.data.materials.new("QinAlbedo")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Smart"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.08
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return img


def setup_preview_scene(obj):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    log("render engine", scene.render.engine)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Yard")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.08, 0.08, 0.09, 1)
    bg.inputs[1].default_value = 0.4
    scene.world = world
    sun = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.95, 0.86)
    sun.rotation_euler = (0.7, 0.15, 0.6)
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 0.6
    fill.data.color = (0.78, 0.84, 0.92)
    fill.rotation_euler = (0.9, -0.4, -2.4)
    bpy.context.collection.objects.link(fill)

    def cam(name, loc_app, target_app):
        loc = (loc_app[0], -loc_app[2], loc_app[1])
        target = (target_app[0], -target_app[2], target_app[1])
        c = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        c.location = loc
        bpy.context.collection.objects.link(c)
        direction = Vector(target) - Vector(loc)
        c.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        c.data.lens = 50
        return c

    return (
        cam("CAM_head", (0.0, 1.54, 1.28), (0.017, 1.54, 0.0)),
        cam("CAM_right", (-1.15, 1.56, 1.35), (-0.02, 1.54, 0.0)),
    )


def render_cam(cam, path: Path):
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    log("preview", path)


def save_jpeg(rgb, path: Path):
    h, w = rgb.shape[:2]
    rgba = np.dstack([rgb.astype(np.float32) / 255.0, np.ones((h, w), np.float32)])
    buf = np.flipud(rgba).astype(np.float32).ravel()
    img = bpy.data.images.new("QinOut", w, h, alpha=True)
    img.pixels.foreach_set(buf)
    img.file_format = "JPEG"
    img.filepath_raw = str(path)
    img.save()
    png = bpy.data.images.new("QinOutPng", w, h, alpha=True)
    png.pixels.foreach_set(buf)
    png.file_format = "PNG"
    png.filepath_raw = str(TMP / "qin-albedo-blender.png")
    png.save()
    log("wrote", path, path.stat().st_size)


def apply_vgroups(obj, pos, tris):
    mesh = obj.data
    lock = obj.vertex_groups.new(name="LOCK_LEFT_EYE_BROW")
    right = obj.vertex_groups.new(name="FIX_RIGHT")
    mouth = obj.vertex_groups.new(name="FIX_MOUTH")
    for i, p in enumerate(pos):
        tag = classify(np.array([p[0]]), np.array([p[1]]))[0]
        if tag == 1:
            lock.add([i], 1.0, "REPLACE")
        elif tag == 2:
            mouth.add([i], 1.0, "REPLACE")
        elif tag == 3:
            right.add([i], 1.0, "REPLACE")
    log("vgroups", len(mesh.vertices), "verts")


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists():
        shutil.copy2(ALBEDO, BACKUP)
        log("backup", BACKUP)
    log("import", GLB)
    obj = import_glb(GLB)
    log("mesh", obj.name, "faces", len(obj.data.polygons), "verts", len(obj.data.vertices))
    pos, tris, uvs_raw = world_mesh(obj)
    log("bbox", pos.min(0).tolist(), pos.max(0).tolist(), "tris", len(tris))
    head = pos[:, 1] > 1.4
    nose_i = int(np.argmax(np.where(head, pos[:, 2], -1e9)))
    log("nose", pos[nose_i].tolist())
    src = BACKUP if BACKUP.exists() else ALBEDO
    albedo = load_rgb(src)
    photo = load_rgb(HEAD_PHOTO)
    flip = detect_uv_flip(pos, tris, uvs_raw, albedo)
    uvs = to_gltf_uv(uvs_raw, flip)
    apply_vgroups(obj, pos, tris)
    log("silhouette spans")
    pL, pR = row_spans(studio_mask(photo))
    mesh_span = mesh_x_spans(pos, tris)
    log("project photo onto right face + mouth")
    rgb = raster_fix(pos, tris, uvs, albedo, photo, pL, pR, mesh_span)
    save_jpeg(rgb, ALBEDO)
    assign_material(obj, ALBEDO)
    cam_head, cam_right = setup_preview_scene(obj)
    try:
        render_cam(cam_head, PREVIEW_HEAD)
        render_cam(cam_right, PREVIEW_RIGHT)
    except Exception as ex:
        log("preview render skipped", ex)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    log("saved blend", BLEND)
    # 点验：右脸浅色顶点应减少
    pale = 0
    dark_eye = []
    for i, p in enumerate(pos):
        if p[1] < 1.45 or p[1] > 1.66:
            continue
        # 任取该顶点一个 UV
        hit = np.where((tris == i).any(1))[0]
        if hit.size == 0:
            continue
        uv = uvs[hit[0]].mean(0)
        col = sample_rgb(rgb, uv[None, :])[0]
        luma = float(0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2])
        if p[0] < -0.028 and luma > 155:
            pale += 1
        if (p[0] - EYE_L[0]) ** 2 + (p[1] - EYE_L[1]) ** 2 < 0.018 ** 2:
            dark_eye.append(luma)
    log("qa pale_right_verts", pale, "left_eye_luma_med", float(np.median(dark_eye) if dark_eye else -1))
    result = {"pale_right": pale, "flip": flip, "faces": int(len(tris))}
    log("RESULT", result)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
