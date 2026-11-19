---
id: mesh-updater
name: Mesh Updater & Scene Sculptor (Text/Image to Mesh Update)
description: Guidance for inspecting, modifying, transforming, carving, extending, recoloring, or restructuring existing meshes in the active 3D scene.
enabled: true
---

# Mesh Updater & Scene Sculptor Skill

Use this skill when meshes already exist in the scene and the user wants to adapt, extend, repair, recolor, hollow out, or rebuild an existing model ("Text to Mesh Update" / "Image to Mesh Update").

## Rules for Updating Existing Meshes
1. **Check Scene & Selection**:
   - Inspect active meshes via context or `modeler_get_scene_info` for exact bounding boxes (`min`, `max`, `center`, `size`).
2. **Accurate Placement relative to existing meshes**:
   - Use the bounding box of existing meshes to accurately position additions (e.g. roof on a house, handle on a cup, wheels on a vehicle, battlements on a tower).
3. **Modifying Existing Meshes**:
   - **Transform**: Use `modeler_transform_mesh` to move, rotate, scale, rename, snap to ground (`snapToGround: true`), or center pivot (`centerPivot: true`).
   - **Carve / Bore Holes / Fuse & Bevel**: Create a cutter tool mesh and call `modeler_boolean_operation` (`subtract`, `union`, `intersect`, `nonDestructive: true`, `bevelWidth`, `bevelProfile`) with the target mesh as `baseMeshName`.
   - **Retopologize, Shrinkwrap & Quad-Draw**: Use `modeler_retopologize_mesh` (`mode: "decimate" | "shrinkwrap" | "quad_cage" | "quad_strip"`) to simplify dense meshes, wrap low-poly meshes onto high-poly targets, or draw quad-flow strips.
   - **UV Unwrap, Texel Density & Island Packing**: Use `modeler_uv_unwrap` to mark smart seams, unfold UV charts, normalize Texel Density (`px/m`), and pack islands cleanly into `[0, 1]` UV space.
   - **High-to-Low-Poly Baking**: Use `modeler_bake_textures` to project high-poly surface detail onto low-poly Tangent-Space Normal and Ambient Occlusion maps using a smooth Projection Cage.
   - **Rigging, Skinning & Weight Painting**: Use `modeler_rig_and_weight` (`action: "auto_rig" | "paint_weights" | "pose_bone" | "reset_pose"`) to generate a `humanoid`, `quadruped`, or `spine` skeleton, bind normalized 4-bone skin weights, paint influence zones, and test joint bending.
   - **Change Material & Texture**: Use `modeler_generate_texture` (`prompt`, `useAI: true`, `applyToMesh`, `uvScale`) to synthesize AI Albedo and Normal maps via external AI image engines or procedural synthesis, or `modeler_create_material` / `modeler_apply_material`. Always ensure materials are double-sided (`backFaceCulling: false`, `twoSidedLighting: true`) so surfaces and interior faces never disappear when orbiting the camera.
   - **3D Hand-Painted UV Textures**: Use `modeler_paint_texture` (`action: "init" | "stylized_base" | "gradient" | "stroke" | "stamp" | "fill" | "layer" | "project_stencil"`) to hand-paint stylized Nintendo-style gradients, AO shading, edge highlights, symmetrical eyes/emblems (`mirrorX: true`), painterly 3D strokes, multi-layer PBR roughness/metallic/emissive maps, or projected stencils directly into the mesh's UV texture.
   - **Patterns & Repetition**: Use `modeler_clone_array` (`linear` or `radial`) to repeat parts along an axis or in a circle (pillars, gear teeth, fence posts, stairs).
   - **Separate / Merge**: Use `modeler_separate_mesh` to break loose parts into separate meshes or `modeler_merge_meshes` to fuse parts.
   - **Z-Fighting & Texture Bleeding Repair**: Call `modeler_check_z_fighting` to detect coplanar overlapping faces. Fix reported overlaps by extruding (`modeler_facet_extrude`) or insetting with non-zero depth (`modeler_facet_inset`, e.g. `depth: -0.02` or `0.02`) on the affected face, or offsetting one mesh along the plane normal with `modeler_transform_mesh`.

