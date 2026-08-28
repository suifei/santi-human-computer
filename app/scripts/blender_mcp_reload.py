from blmcp.tools_helpers.connection import send_code

code = r'''
import bpy
n = 0
for img in bpy.data.images:
    try:
        img.reload()
        n += 1
    except Exception:
        pass
result = {"reloaded": n, "images": [i.name for i in bpy.data.images]}
'''
print(send_code(code, True))
