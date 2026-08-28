"""Ping the running Blender MCP add-on on localhost:9876."""
from blmcp.tools_helpers.connection import send_code

code = """
import bpy
result = {
    "file": bpy.data.filepath,
    "objects": [o.name for o in bpy.data.objects],
    "engine": bpy.context.scene.render.engine,
}
"""
print(send_code(code, True))
