"""Render orthographic-ish plates of the rebuilt Qin soldier."""
import math
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent.parent / "public/models/_tmp"
BLEND = OUT / "qin-soldier-rebuild.blend"

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 1024
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
try:
    scene.eevee.taa_render_samples = 8
except Exception:
    pass

for ob in list(scene.objects):
    if ob.name.startswith("REF_"):
        ob.hide_render = True
        ob.hide_set(True)

cam = scene.camera
if cam is None:
    cam = bpy.data.objects.new("CAM", bpy.data.cameras.new("CAM"))
    scene.collection.objects.link(cam)
    scene.camera = cam
cam.data.lens = 85


def look_at(loc, target):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


shots = {
    "rebuild-front.png": ((0.0, -3.15, 0.88), (0.0, 0.0, 0.88)),
    "rebuild-tq.png": ((1.9, -2.4, 0.95), (0.0, 0.0, 0.90)),
    "rebuild-head.png": ((0.02, -1.15, 1.56), (0.017, 0.0, 1.54)),
    "rebuild-back.png": ((0.0, 3.15, 0.88), (0.0, 0.0, 0.88)),
    "rebuild-right.png": ((-1.2, -1.25, 1.56), (-0.02, 0.0, 1.54)),
}

world = scene.world
if world and world.node_tree and "Background" in world.node_tree.nodes:
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.55, 0.56, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8

for name, (loc, tgt) in shots.items():
    look_at(loc, tgt)
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)
    print("wrote", name, flush=True)
