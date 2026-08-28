"""把用户做的 qin-proto.glb 扶成点验/列阵约定。

身高 1.76m，脚底贴地，Blender 面朝 -Y（导出 glTF 后面朝 +Z）。
保留原 UV 与 PBR 贴图，不重焖反照率。

  blender --background --python app/scripts/blender_prepare_user_qin.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

APP = Path(__file__).resolve().parent.parent
SRC = APP / "public/models/qin-proto.glb"
OUT_GLB = APP / "public/models/qin-soldier.glb"
OUT_BLEND = APP / "public/models/_tmp/qin-soldier-user.blend"
HEIGHT = 1.76


def log(*a):
    print(*a, flush=True)


def world_bbox(obj):
    bpy.context.view_layer.update()
    xs, ys, zs = [], [], []
    mw = obj.matrix_world
    for v in obj.data.vertices:
        c = mw @ v.co
        xs.append(c.x)
        ys.append(c.y)
        zs.append(c.z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def apply_all(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def head_face_dir(obj):
    """头上部顶点法线在 XY 上的平均，Blender 里前向应是 -Y。"""
    minx, maxx, miny, maxy, minz, maxz = world_bbox(obj)
    h = maxz - minz
    z0 = minz + 0.72 * h
    acc = Vector((0.0, 0.0, 0.0))
    n = 0
    mw = obj.matrix_world.to_3x3()
    for v in obj.data.vertices:
        co = obj.matrix_world @ v.co
        if co.z < z0:
            continue
        nor = mw @ v.normal
        nor.z = 0.0
        if nor.length < 0.15:
            continue
        acc += nor.normalized()
        n += 1
    if n < 20:
        return Vector((0.0, -1.0, 0.0)), n
    acc.normalize()
    return acc, n


def main():
    if not SRC.exists():
        raise FileNotFoundError(SRC)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("qin-proto.glb 里没有网格")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = "QinSoldier"
    apply_all(obj)

    minx, maxx, miny, maxy, minz, maxz = world_bbox(obj)
    h = maxz - minz
    log("imported bbox xyz", (minx, maxx), (miny, maxy), (minz, maxz), "h", h, "verts", len(obj.data.vertices))
    if h < 1e-4:
        raise RuntimeError("网格高度为 0")
    s = HEIGHT / h
    obj.scale = (s, s, s)
    apply_all(obj)

    face, nface = head_face_dir(obj)
    log("head face dir", tuple(round(x, 4) for x in face), "n", nface)
    target = Vector((0.0, -1.0, 0.0))
    if face.length > 0.2:
        q = face.rotation_difference(target)
        obj.rotation_euler = (obj.matrix_world.to_quaternion() @ q).to_euler()
        apply_all(obj)
        face2, n2 = head_face_dir(obj)
        log("after yaw", tuple(round(x, 4) for x in face2), "n", n2)

    minx, maxx, miny, maxy, minz, maxz = world_bbox(obj)
    obj.location.x -= (minx + maxx) * 0.5
    obj.location.y -= (miny + maxy) * 0.5
    obj.location.z -= minz
    apply_all(obj)

    minx, maxx, miny, maxy, minz, maxz = world_bbox(obj)
    obj.data.calc_loop_triangles()
    tris = len(obj.data.loop_triangles)
    log(
        "fitted",
        "h", round(maxz - minz, 4),
        "z", round(minz, 4), round(maxz, 4),
        "x", round(minx, 4), round(maxx, 4),
        "y", round(miny, 4), round(maxy, 4),
        "tris", tris,
    )

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    log("wrote", OUT_GLB, OUT_GLB.stat().st_size)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
