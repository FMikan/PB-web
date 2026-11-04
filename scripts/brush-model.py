"""Prepares the paint brush model for the page: public/brush.glb from
docs/3D ass/paint_brush.glb.

    blender -b -P scripts/brush-model.py
    npx gltfpack@1.3.0 -i /tmp/brush-raw.glb -o public/brush.glb -cc

Decimated to 10% (the bristles' ~37k of 40k vertices are far more than a head ~40px
wide on screen needs), moved so the bristles' tip is at the origin with the handle down
-Y (the tip is where it paints, so the page places and turns it about there), and saved
without its material (the page lights it itself) to /tmp/brush-raw.glb. gltfpack then
packs it: meshopt compression and quantized vertices, which three.js reads with its own
small decoder (about 55 KB, against 250 KB unpacked). It keeps the quantized positions'
scale and offset on the node; the page bakes them back in.

Its parts, along Y from the tip: bristles 0 to -0.114, metal ferrule to -0.174, handle
to -1.008; 0.092 wide (X) at the bristles, 0.026 thick (Z).
"""

from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent.parent
RATIO = 0.1  # of the faces kept: looks the same as all of them even at 3x its size on screen; 0.05 creases the ferrule

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "docs/3D ass/paint_brush.glb"))
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

mod = obj.modifiers.new("decimate", "DECIMATE")
mod.ratio = RATIO
bpy.ops.object.modifier_apply(modifier=mod.name)

# Blender is Z up (glTF's Y): put the top of the bristles at the origin.
top = max((obj.matrix_world @ v.co).z for v in obj.data.vertices)
obj.location.z -= top
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bpy.ops.export_scene.gltf(
    filepath="/tmp/brush-raw.glb",
    export_format="GLB",
    use_selection=True,
    export_draco_mesh_compression_enable=False,
    export_materials="NONE",
    export_normals=True,
    export_texcoords=False,
)
print("faces", len(obj.data.polygons), "verts", len(obj.data.vertices))
