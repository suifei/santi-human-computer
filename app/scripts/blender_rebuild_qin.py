"""按正/背/头像三张原型图在 Blender 里重建秦卒静模。

身高 1.76m，脚底贴地，面朝 -Y（导出 glTF 后面朝 +Z）。
只输出一具网格，点验和列阵共用 UV albedo。

  blender --background --python app/scripts/blender_rebuild_qin.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

APP = Path(__file__).resolve().parent.parent
REF = APP / "public/models/textures/ref"
TMP = APP / "public/models/_tmp"
OUT_GLB = APP / "public/models/qin-soldier.glb"
OUT_ARMY = APP / "public/models/qin-soldier-army.glb"
OUT_JPG = APP / "public/models/textures/qin-albedo.jpg"
OUT_BLEND = TMP / "qin-soldier-rebuild.blend"
FRONT = REF / "qin-proto-front.png"
BACK = REF / "qin-proto-back.png"
HEAD = REF / "qin-proto-head.png"
TEX = 2048
HEIGHT = 1.76

C_SKIN = (0.89, 0.82, 0.70)
C_HAIR = (0.06, 0.05, 0.045)
C_ARMOR = (0.30, 0.45, 0.42)
C_PURPLE = (0.40, 0.32, 0.44)
C_RED = (0.68, 0.27, 0.22)
C_TEAL = (0.30, 0.44, 0.42)
C_BOOT = (0.08, 0.07, 0.06)
C_MUST = (0.04, 0.03, 0.03)
C_LIP = (0.62, 0.45, 0.40)


def log(*a):
    print(*a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def new_mesh_obj(name, bm, color):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    vc = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    r, g, b = color
    for i in range(len(mesh.loops)):
        vc.data[i].color = (r, g, b, 1.0)
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def shade_smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def quat_z_to(direction):
    z = Vector(direction)
    if z.length < 1e-8:
        z = Vector((0, 0, 1))
    return z.normalized().to_track_quat("Z", "Y").to_euler()


def bm_uvsphere(bm, loc, radius, scale=(1, 1, 1), segs=20, rings=12):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    sx, sy, sz = scale
    for v in ret["verts"]:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co += Vector(loc)
    return ret["verts"]


def bm_cone(bm, loc, r1, r2, depth, rot=(0, 0, 0), segs=16):
    ret = bmesh.ops.create_cone(
        bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth
    )
    eul = Euler(rot, "XYZ")
    for v in ret["verts"]:
        v.co.rotate(eul)
        v.co += Vector(loc)
    return ret["verts"]


def bm_bone(bm, a, b, r0, r1, segs=12):
    a = Vector(a)
    b = Vector(b)
    mid = (a + b) * 0.5
    length = max((b - a).length, 1e-4)
    return bm_cone(bm, mid, r0, r1, length, rot=quat_z_to(b - a), segs=segs)


def bm_cube(bm, loc, size, rot=(0, 0, 0)):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    eul = Euler(rot, "XYZ")
    for v in ret["verts"]:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co.rotate(eul)
        v.co += Vector(loc)
    return ret["verts"]


def bm_loft(bm, profile, segs=20, caps=True):
    """profile: (cx, cy, cz, rx, ry) rings, Z up."""
    rings = []
    for cx, cy, cz, rx, ry in profile:
        ring = []
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            ring.append(bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), cz)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(len(rings) - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            bm.faces.new((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]))
    if caps and rings:
        try:
            bm.faces.new(list(reversed(rings[0])))
        except Exception:
            pass
        try:
            bm.faces.new(rings[-1])
        except Exception:
            pass
    return [v for ring in rings for v in ring]


def bm_arc_spheres(bm, pts, radius, segs=8, rings=6):
    for p in pts:
        bm_uvsphere(bm, p, radius, segs=segs, rings=rings)


def join_objects(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def ground_and_scale(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    obj.location.z -= min_z
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    zs = [(obj.matrix_world @ v.co).z for v in obj.data.vertices]
    h = max(zs) - min(zs)
    if h > 1e-4:
        obj.scale = (HEIGHT / h,) * 3
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
        obj.location.z -= min_z
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def unwrap(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0008)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    except Exception:
        bpy.ops.uv.cube_project()
    bpy.ops.object.mode_set(mode="OBJECT")


def deform_head_sphere(bm):
    """局部：原点球，+Z 上、−Y 前、−X 士兵右。正面压扁，方便正交投影。"""
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        if y < 0:
            v.co.y = y * 0.55 - 0.18
            y = v.co.y
        if z < -0.10:
            t = min((-0.10 - z) / 0.9, 1.0)
            v.co.x *= 1.0 - 0.28 * t
            v.co.z -= 0.04 * t
            if y < 0:
                v.co.y -= 0.06 * t
        for sx in (-0.36, 0.36):
            d = math.sqrt((x - sx) ** 2 + (y + 0.55) ** 2 * 1.6 + (z - 0.20) ** 2)
            if d < 0.30:
                v.co.y += 0.08 * (1.0 - d / 0.30)
        dn = (x * x) * 12.0 + (y + 0.55) ** 2 + (z - 0.04) ** 2
        if dn < 0.10 and y < 0:
            v.co.y -= 0.12 * (1.0 - dn / 0.10)
            v.co.z += 0.02 * (1.0 - dn / 0.10)
        if z > 0.38:
            v.co.x *= 0.95
            v.co.y *= 0.90


def mustache_pts(sign):
    """sign=+1 士兵左（+X），−1 士兵右。须从人中向外再上卷。"""
    n = 9
    pts = []
    for i in range(n):
        t = i / (n - 1)
        x = sign * (0.006 + 0.058 * t)
        y = -0.090 - 0.006 * math.sin(t * math.pi)
        z = 1.534 + 0.038 * (t**1.6)
        if t > 0.55:
            curl = (t - 0.55) / 0.45
            y += 0.018 * curl
            z += 0.028 * curl
            x -= sign * 0.012 * curl
        pts.append((x, y, z))
    return pts


def build_head_parts():
    parts = []
    bm = bmesh.new()
    ret = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    deform_head_sphere(bm)
    for v in ret["verts"]:
        v.co.x *= 0.090
        v.co.y *= 0.118
        v.co.z *= 0.112
        v.co += Vector((0.0, 0.018, 1.582))
    parts.append(new_mesh_obj("Head", bm, C_SKIN))

    for side, x in (("L", 0.082), ("R", -0.082)):
        bm = bmesh.new()
        bm_uvsphere(bm, (x, 0.012, 1.572), 0.028, scale=(0.38, 0.62, 1.15), segs=10, rings=8)
        parts.append(new_mesh_obj("Ear" + side, bm, C_SKIN))

    for sign, name in ((-1, "MustR"), (1, "MustL")):
        bm = bmesh.new()
        pts = mustache_pts(sign)
        for i in range(len(pts) - 1):
            r0 = 0.009 if i < 5 else 0.0065
            r1 = 0.0085 if i < 5 else 0.0055
            bm_bone(bm, pts[i], pts[i + 1], r0, r1, segs=8)
        parts.append(new_mesh_obj(name, bm, C_MUST))

    bm = bmesh.new()
    bm_cone(bm, (0.0, -0.082, 1.492), 0.012, 0.004, 0.034, rot=(0.35, 0, 0), segs=8)
    parts.append(new_mesh_obj("Goatee", bm, C_MUST))

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.112)
    kill = [v for v in list(bm.verts) if v.co.y < -0.42]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
    for v in bm.verts:
        v.co.x *= 1.02
        v.co.y *= 1.08
        v.co.z *= 0.78
        v.co += Vector((-0.012, 0.030, 1.640))
    parts.append(new_mesh_obj("HairCap", bm, C_HAIR))

    bun = (-0.052, 0.022, 1.722)
    bm = bmesh.new()
    bm_uvsphere(bm, bun, 0.050, scale=(1.18, 1.08, 0.88), segs=16, rings=10)
    bm_uvsphere(bm, (-0.068, 0.016, 1.734), 0.028, scale=(1.1, 1.0, 0.85), segs=10, rings=8)
    try:
        ret = bmesh.ops.create_torus(
            bm, major_radius=0.038, minor_radius=0.011, major_segments=18, minor_segments=8
        )
        eul = Euler((1.15, 0.2, -0.4), "XYZ")
        for v in ret["verts"]:
            v.co.rotate(eul)
            v.co += Vector(bun)
    except Exception:
        pass
    parts.append(new_mesh_obj("Bun", bm, C_HAIR))
    return parts


def build_body_parts():
    parts = []
    bm = bmesh.new()
    bm_cone(bm, (0.0, 0.012, 1.455), 0.046, 0.050, 0.088, segs=16)
    parts.append(new_mesh_obj("Neck", bm, C_SKIN))

    bm = bmesh.new()
    bm_loft(
        bm,
        [
            (0.0, 0.010, 1.432, 0.070, 0.062),
            (0.0, 0.012, 1.405, 0.078, 0.070),
            (0.0, 0.014, 1.378, 0.074, 0.066),
        ],
        segs=20,
    )
    parts.append(new_mesh_obj("Collar", bm, C_RED))

    bm = bmesh.new()
    bm_uvsphere(bm, (0.0, -0.058, 1.388), 0.026, scale=(1.85, 0.62, 0.72), segs=12, rings=8)
    bm_uvsphere(bm, (-0.028, -0.050, 1.388), 0.016, scale=(1.2, 0.7, 0.55), segs=8, rings=6)
    bm_uvsphere(bm, (0.028, -0.050, 1.388), 0.016, scale=(1.2, 0.7, 0.55), segs=8, rings=6)
    parts.append(new_mesh_obj("Bow", bm, C_PURPLE))

    bm = bmesh.new()
    bm_loft(
        bm,
        [
            (0.0, 0.016, 1.370, 0.165, 0.108),
            (0.0, 0.018, 1.300, 0.188, 0.120),
            (0.0, 0.020, 1.180, 0.182, 0.122),
            (0.0, 0.018, 1.050, 0.170, 0.112),
            (0.0, 0.016, 0.940, 0.168, 0.110),
        ],
        segs=24,
    )
    parts.append(new_mesh_obj("ArmorChest", bm, C_ARMOR))

    bm = bmesh.new()
    bm_loft(
        bm,
        [
            (0.0, 0.016, 0.930, 0.178, 0.118),
            (0.0, 0.018, 0.820, 0.198, 0.128),
            (0.0, 0.020, 0.720, 0.205, 0.132),
            (0.0, 0.018, 0.620, 0.188, 0.124),
        ],
        segs=22,
    )
    parts.append(new_mesh_obj("ArmorSkirt", bm, C_ARMOR))

    for z, rx, ry, sz in (
        (1.368, 0.172, 0.112, 0.018),
        (0.938, 0.176, 0.116, 0.016),
        (0.612, 0.198, 0.130, 0.022),
    ):
        bm = bmesh.new()
        bm_loft(
            bm,
            [
                (0.0, 0.016, z + sz, rx + 0.008, ry + 0.008),
                (0.0, 0.016, z - sz, rx + 0.008, ry + 0.008),
            ],
            segs=22,
        )
        parts.append(new_mesh_obj("Trim", bm, C_RED))

    for x in (-0.205, 0.205):
        bm = bmesh.new()
        bm_uvsphere(bm, (x, 0.020, 1.355), 0.088, scale=(1.12, 0.95, 0.58), segs=14, rings=8)
        parts.append(new_mesh_obj("Pauldron", bm, C_ARMOR))
        bm = bmesh.new()
        bm_loft(
            bm,
            [
                (x, 0.020, 1.395, 0.092, 0.078),
                (x, 0.020, 1.378, 0.096, 0.082),
            ],
            segs=14,
        )
        parts.append(new_mesh_obj("PauldronTrim", bm, C_RED))

    # 正面交握：上臂前收，前臂向腹前会合
    for sign in (-1, 1):
        shoulder = (sign * 0.205, 0.020, 1.330)
        elbow = (sign * 0.118, -0.070, 1.080)
        wrist = (sign * 0.042, -0.165, 0.955)
        bm = bmesh.new()
        bm_bone(bm, shoulder, elbow, 0.058, 0.050, segs=12)
        parts.append(new_mesh_obj("Sleeve", bm, C_PURPLE))
        bm = bmesh.new()
        bm_bone(bm, elbow, wrist, 0.048, 0.042, segs=12)
        parts.append(new_mesh_obj("Forearm", bm, C_PURPLE))
        bm = bmesh.new()
        bm_cone(bm, wrist, 0.046, 0.046, 0.038, rot=quat_z_to((0, -0.4, -0.2)), segs=12)
        parts.append(new_mesh_obj("Cuff", bm, C_RED))

    bm = bmesh.new()
    bm_uvsphere(bm, (0.0, -0.185, 0.938), 0.052, scale=(1.45, 0.95, 0.72), segs=12, rings=8)
    bm_bone(bm, (-0.028, -0.200, 0.938), (0.018, -0.215, 0.930), 0.012, 0.010, segs=8)
    bm_bone(bm, (0.010, -0.198, 0.948), (-0.012, -0.218, 0.928), 0.011, 0.009, segs=8)
    parts.append(new_mesh_obj("Hands", bm, C_SKIN))

    bm = bmesh.new()
    bm_loft(
        bm,
        [
            (0.0, 0.022, 0.600, 0.155, 0.125),
            (0.0, 0.024, 0.500, 0.175, 0.138),
            (0.0, 0.026, 0.410, 0.188, 0.145),
        ],
        segs=20,
    )
    parts.append(new_mesh_obj("Robe", bm, C_PURPLE))
    bm = bmesh.new()
    bm_loft(
        bm,
        [
            (0.0, 0.026, 0.418, 0.192, 0.148),
            (0.0, 0.026, 0.368, 0.198, 0.150),
        ],
        segs=20,
    )
    parts.append(new_mesh_obj("RobeHem", bm, C_RED))

    for x in (-0.088, 0.088):
        bm = bmesh.new()
        bm_loft(
            bm,
            [
                (x, 0.018, 0.360, 0.058, 0.055),
                (x, 0.020, 0.250, 0.062, 0.060),
                (x, 0.016, 0.165, 0.055, 0.052),
            ],
            segs=12,
        )
        parts.append(new_mesh_obj("Pant", bm, C_TEAL))
        bm = bmesh.new()
        bm_loft(
            bm,
            [
                (x, 0.000, 0.155, 0.058, 0.070),
                (x, -0.012, 0.080, 0.062, 0.088),
                (x, -0.020, 0.018, 0.060, 0.095),
                (x, -0.022, 0.004, 0.058, 0.092),
            ],
            segs=12,
        )
        parts.append(new_mesh_obj("Boot", bm, C_BOOT))
    return parts


def build_soldier():
    parts = build_head_parts() + build_body_parts()
    for obj in parts:
        shade_smooth(obj)
    soldier = join_objects(parts, "QinSoldier")
    ground_and_scale(soldier)
    unwrap(soldier)
    return soldier


def add_ref_planes():
    specs = [
        ("REF_front", FRONT, (0.0, -1.15, 0.88), (math.pi / 2, 0, 0), 1.76),
        ("REF_back", BACK, (0.0, 1.15, 0.88), (-math.pi / 2, 0, math.pi), 1.76),
        ("REF_head", HEAD, (0.0, -0.85, 1.58), (math.pi / 2, 0, 0), 0.42),
    ]
    created = []
    for name, path, loc, rot, height in specs:
        img = bpy.data.images.load(str(path))
        aspect = img.size[0] / max(img.size[1], 1)
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
        plane = bpy.context.object
        plane.name = name
        plane.scale = (height * aspect, height, 1)
        mat = bpy.data.materials.new(name + "Mat")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        plane.data.materials.append(mat)
        plane.hide_render = True
        plane.display_type = "TEXTURED"
        created.append(plane.name)
    return created


def extract(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    n = len(mesh.vertices)
    pos = np.empty((n, 3), np.float32)
    for i, v in enumerate(mesh.vertices):
        co = ev.matrix_world @ v.co
        pos[i] = (co.x, co.z, -co.y)
    uv_layer = mesh.uv_layers.active.data
    col_attr = mesh.color_attributes.get("Col")
    ntri = len(mesh.loop_triangles)
    tris = np.empty((ntri, 3), np.int32)
    uvs = np.empty((ntri, 3, 2), np.float32)
    cols = np.empty((ntri, 3, 3), np.float32)
    nrms = np.empty((ntri, 3, 3), np.float32)
    for i, tri in enumerate(mesh.loop_triangles):
        tris[i] = tri.vertices
        p0, p1, p2 = pos[tri.vertices]
        nrm = np.cross(p1 - p0, p2 - p0)
        nrm /= max(float(np.linalg.norm(nrm)), 1e-6)
        for k, li in enumerate(tri.loops):
            uvs[i, k] = uv_layer[li].uv
            if col_attr is not None:
                cols[i, k] = col_attr.data[li].color[:3]
            else:
                cols[i, k] = C_SKIN
            nrms[i, k] = nrm
    try:
        ev.to_mesh_clear()
    except Exception:
        pass
    return pos, tris, uvs, cols, nrms


def load_rgb(path: Path):
    img = bpy.data.images.load(str(path), check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    arr = np.flipud(px.reshape(h, w, 4))[..., :3]
    return np.clip(arr * 255.0, 0, 255).astype(np.uint8)


def figure_mask(rgb, head=False):
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    bg = (chroma < 16) & (luma > 158)
    h = rgb.shape[0]
    if head:
        ys = np.arange(h, dtype=np.float32)[:, None]
        bg |= (luma < 48) & (chroma < 22) & (ys > h * 0.70)
    return ~bg


def row_spans(mask, min_width=4):
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
    y0, y1 = int(yv[0]), int(yv[-1])
    return left, right, y0, y1


def sample_img(img, u, v):
    h, w = img.shape[:2]
    x = np.clip(u, 0, 1) * (w - 1.001)
    y = np.clip(v, 0, 1) * (h - 1.001)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (x - x0)[..., None]
    ty = (y - y0)[..., None]
    c00 = img[y0, x0].astype(np.float32)
    c10 = img[y0, x1].astype(np.float32)
    c01 = img[y1, x0].astype(np.float32)
    c11 = img[y1, x1].astype(np.float32)
    return (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty


def project_sheet(pts, nrm, sheet, front=True):
    rgb, mask, left, right, y0, y1 = sheet
    h, w = rgb.shape[:2]
    py = y0 + (1.0 - np.clip(pts[:, 1] / HEIGHT, 0, 1)) * (y1 - y0)
    py = np.clip(py, 0, h - 1.001)
    yi = np.clip(py.astype(np.int32), 0, h - 1)
    L, R = left[yi], np.maximum(right[yi], left[yi] + 1)
    u_local = (pts[:, 0] + 0.28) / 0.56
    if not front:
        u_local = 1.0 - u_local
    px = L + np.clip(u_local, 0, 1) * (R - L)
    col = sample_img(rgb, px / (w - 1), py / (h - 1))
    a = mask[yi, np.clip(px.astype(np.int32), 0, w - 1)].astype(np.float32)
    facing = np.clip((nrm[:, 2] if front else -nrm[:, 2]), 0.0, 1.0) ** 0.85
    if front:
        facing = facing * np.clip((1.470 - pts[:, 1]) / 0.035, 0.0, 1.0)
    else:
        forward = np.clip((pts[:, 2] - 0.06) / 0.12, 0, 1)
        facing = facing * (1.0 - 0.85 * forward)
        facing = facing * np.clip((1.470 - pts[:, 1]) / 0.035, 0.0, 1.0)
    return col, a * facing


def project_head(pts, nrm, head):
    rgb, mask, left, right, y0, y1 = head
    h, w = rgb.shape[:2]
    # 裁过的头像：顶=发髻，底=下巴。网格 1.47..1.76 对应该段。
    py = y0 + (1.0 - np.clip((pts[:, 1] - 1.470) / 0.290, 0, 1)) * (y1 - y0)
    py = np.clip(py, 0, h - 1.001)
    yi = np.clip(py.astype(np.int32), 0, h - 1)
    L, R = left[yi], np.maximum(right[yi], left[yi] + 1)
    u_local = np.clip((pts[:, 0] + 0.12) / 0.24, 0, 1)
    px = L + u_local * (R - L)
    col = sample_img(rgb, px / (w - 1), py / (h - 1))
    a = mask[yi, np.clip(px.astype(np.int32), 0, w - 1)].astype(np.float32)
    face = np.clip(nrm[:, 2] + 0.15, 0, 1) ** 0.7
    head_w = np.clip((pts[:, 1] - 1.465) / 0.02, 0, 1) * face
    return col, a * head_w


def pack_sheet(path, head=False):
    rgb = load_rgb(path)
    mask = figure_mask(rgb, head=head)
    if head:
        # 头像特写含胸甲；只留发髻到下巴，避免项链/甲片压到脸上。
        y0c, y1c = 12, 410
        rgb = rgb[y0c : y1c + 1]
        mask = mask[y0c : y1c + 1]
    left, right, y0, y1 = row_spans(mask)
    log(path.name, "span", y0, y1, rgb.shape)
    return rgb, mask, left, right, y0, y1


def bake(pos, tris, uvs, cols, nrms, front, back, head):
    out = np.zeros((TEX, TEX, 3), np.float32)
    wgt = np.zeros((TEX, TEX), np.float32)
    ntri = len(tris)
    for t in range(ntri):
        uv = uvs[t]
        px = uv[:, 0] * (TEX - 1)
        py = uv[:, 1] * (TEX - 1)
        minx = int(max(0, np.floor(px.min())))
        maxx = int(min(TEX - 1, np.ceil(px.max())))
        miny = int(max(0, np.floor(py.min())))
        maxy = int(min(TEX - 1, np.ceil(py.max())))
        if maxx < minx or maxy < miny:
            continue
        area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
        if abs(area) < 1e-8:
            continue
        yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        xs, ys = xx.astype(np.float32), yy.astype(np.float32)
        w0 = ((px[1] - xs) * (py[2] - ys) - (px[2] - xs) * (py[1] - ys)) / area
        w1 = ((px[2] - xs) * (py[0] - ys) - (px[0] - xs) * (py[2] - ys)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        P = pos[tris[t]]
        N = nrms[t]
        C = cols[t]
        ww0, ww1, ww2 = w0[inside], w1[inside], w2[inside]
        pts = P[0] * ww0[:, None] + P[1] * ww1[:, None] + P[2] * ww2[:, None]
        nrm = N[0] * ww0[:, None] + N[1] * ww1[:, None] + N[2] * ww2[:, None]
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
        base = (C[0] * ww0[:, None] + C[1] * ww1[:, None] + C[2] * ww2[:, None]) * 255.0
        cf, af = project_sheet(pts, nrm, front, front=True)
        cb, ab = project_sheet(pts, nrm, back, front=False)
        ch, ah = project_head(pts, nrm, head)
        a_f = np.clip(af, 0, 1)
        a_b = np.clip(ab, 0, 1)
        a_h = np.clip(ah, 0, 1)
        # 发/须用顶点色，不把正脸照片再印一层。
        skin = (base.mean(axis=1) > 90).astype(np.float32)
        a_h = a_h * skin * 0.2
        col = base
        col = col * (1 - a_f[:, None]) + cf * a_f[:, None]
        col = col * (1 - a_b[:, None]) + cb * a_b[:, None]
        col = col * (1 - a_h[:, None]) + ch * a_h[:, None]
        hair_back = (pts[:, 1] > 1.52) & (nrm[:, 2] < -0.12)
        col[hair_back] = np.array(C_HAIR, np.float32) * 255.0
        yi = ys[inside].astype(np.int32)
        xi = xs[inside].astype(np.int32)
        out[yi, xi] += col
        wgt[yi, xi] += 1.0
        if t % 2000 == 0:
            log("  bake tri", t, "/", ntri)
    hit = wgt > 0
    out[hit] /= wgt[hit, None]
    for _ in range(14):
        empty = wgt == 0
        if not empty.any():
            break
        acc = np.zeros_like(out)
        cnt = np.zeros_like(wgt)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            src = np.roll(np.roll(out, dy, 0), dx, 1)
            sw = np.roll(np.roll(wgt, dy, 0), dx, 1)
            m = empty & (sw > 0)
            acc[m] += src[m]
            cnt[m] += 1
        m = empty & (cnt > 0)
        out[m] = acc[m] / cnt[m, None]
        wgt[m] = 1
    out[wgt == 0] = 20
    return np.clip(out, 0, 255).astype(np.uint8)


def make_face_card():
    """正脸浮雕板：独立 UV 岛，整张头像贴上去，不跟球面投影打架。"""
    nx, ny = 10, 12
    width, height = 0.170, 0.198
    z0 = 1.476
    bm = bmesh.new()
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            v = j / ny
            x = (u - 0.5) * width
            z = z0 + v * height
            y = -0.072 - 0.030 * math.cos((u - 0.5) * math.pi)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    bm.verts.ensure_lookup_table()
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    obj = new_mesh_obj("FaceCard", bm, C_SKIN)
    mesh = obj.data
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            nu = float(np.clip(co.x / width + 0.5, 0, 1))
            nv = float(np.clip((co.z - z0) / height, 0, 1))
            uv[li].uv = (0.02 + nu * 0.40, 0.50 + nv * 0.48)
    shade_smooth(obj)
    return obj


def paste_face_photo(albedo, head_rgb):
    h, w = albedo.shape[:2]
    u0, u1, v0, v1 = 0.02, 0.42, 0.02, 0.50
    hh = head_rgb.shape[0]
    face = head_rgb[int(hh * 0.28) :]
    r0, r1 = int(v0 * h), int(v1 * h)
    c0, c1 = int(u0 * w), int(u1 * w)
    nh, nw = r1 - r0, c1 - c0
    yy, xx = np.mgrid[0:nh, 0:nw]
    u = (xx.astype(np.float32) + 0.5) / max(nw, 1)
    v = (yy.astype(np.float32) + 0.5) / max(nh, 1)
    albedo[r0:r1, c0:c1] = np.clip(sample_img(face, u, v), 0, 255)
    log("paste face photo", r0, r1, c0, c1)
    return albedo


def save_jpeg(rgb, path: Path):
    h, w = rgb.shape[:2]
    rgba = np.dstack([rgb.astype(np.float32) / 255.0, np.ones((h, w), np.float32)])
    buf = np.flipud(rgba).astype(np.float32).ravel()
    img = bpy.data.images.new("QinAlbedo", w, h, alpha=True)
    img.pixels.foreach_set(buf)
    img.file_format = "JPEG"
    img.filepath_raw = str(path)
    img.save()
    png = bpy.data.images.new("QinAlbedoPng", w, h, alpha=True)
    png.pixels.foreach_set(buf)
    png.file_format = "PNG"
    png.filepath_raw = str(TMP / "qin-albedo-rebuild.png")
    png.save()
    log("wrote", path, path.stat().st_size)


def assign_albedo(obj, path: Path):
    img = bpy.data.images.load(str(path), check_existing=False)
    img.colorspace_settings.name = "sRGB"
    mat = bpy.data.materials.new("QinAlbedo")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    color_in = "Base Color" if "Base Color" in bsdf.inputs else "Base Color"
    try:
        nt.links.new(tex.outputs["Color"], bsdf.inputs[color_in])
    except Exception:
        nt.links.new(tex.outputs["Color"], bsdf.inputs[0])
    bsdf_out = "BSDF" if "BSDF" in bsdf.outputs else bsdf.outputs[0].name
    nt.links.new(bsdf.outputs[bsdf_out], out.inputs["Surface"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.68
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def count_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def export_glb(obj, path: Path, ratio=1.0):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    src = obj
    if ratio < 0.999:
        bpy.ops.object.duplicate()
        src = bpy.context.object
        mod = src.modifiers.new("lod", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    tris = count_tris(src)
    if src != obj:
        bpy.data.objects.remove(src, do_unlink=True)
    log("exported", path, "bytes", path.stat().st_size, "tris", tris)
    return path.stat().st_size, tris


def setup_view(_obj):
    sun = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
    sun.data.energy = 2.8
    sun.data.color = (1, 0.95, 0.88)
    sun.rotation_euler = (0.9, 0.2, 0.4)
    bpy.context.collection.objects.link(sun)
    world = bpy.data.worlds.new("Yard")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.09, 0.09, 0.10, 1)
    bpy.context.scene.world = world
    cam = bpy.data.objects.new("CAM", bpy.data.cameras.new("CAM"))
    cam.location = (0.0, -2.6, 1.1)
    cam.rotation_euler = (math.radians(78), 0, 0)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    for p in (FRONT, BACK, HEAD):
        if not p.exists():
            raise FileNotFoundError(p)
    log("reset")
    reset()
    log("build mesh")
    soldier = build_soldier()
    refs = add_ref_planes()
    zs = [v.co.z for v in soldier.data.vertices]
    log("soldier verts", len(soldier.data.vertices), "faces", len(soldier.data.polygons), "z", min(zs), max(zs))
    log("extract")
    pos, tris, uvs, cols, nrms = extract(soldier)
    uvs_gltf = uvs.copy()
    uvs_gltf[..., 1] = 1.0 - uvs_gltf[..., 1]
    log("load photos")
    front = pack_sheet(FRONT)
    back = pack_sheet(BACK)
    head = pack_sheet(HEAD, head=True)
    log("bake albedo")
    rgb = bake(pos, tris, uvs_gltf, cols, nrms, front, back, head)
    log("face card")
    card = make_face_card()
    soldier = join_objects([soldier, card], "QinSoldier")
    rgb = paste_face_photo(rgb, head[0])
    save_jpeg(rgb, OUT_JPG)
    assign_albedo(soldier, OUT_JPG)
    setup_view(soldier)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    log("export glb")
    b1, t1 = export_glb(soldier, OUT_GLB, 1.0)
    b2, t2 = export_glb(soldier, OUT_ARMY, 0.55)
    result = {
        "verts": int(len(soldier.data.vertices)),
        "faces": int(len(soldier.data.polygons)),
        "showcase_tris": int(t1),
        "army_tris": int(t2),
        "showcase_bytes": int(b1),
        "army_bytes": int(b2),
        "refs": refs,
        "height": float(max(zs) - min(zs)),
    }
    log("RESULT", result)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
