---
id: image-to-mesh
name: Image to 3D Mesh Vision Analyzer & Procedural Sculptor
description: Guidance for reconstructing clean, 360-degree 3D Babylon.js models from reference images, concept art, and screenshots.
enabled: true
---

# Image to 3D Mesh Vision & Procedural Sculpting Skill

Use this skill whenever a user provides a reference image (photograph, concept art, product render, 2D game sprite, or viewport screenshot) and requests creating, reconstructing, or updating a 3D model.

## Core Principles

1. **Build Efficiently (Batch or Script-First)**:
   - Prefer building the complete 3D model in **1–2 turns** using `modeler_execute_babylon_code` (or a single batched turn of `modeler_*` tool calls), rather than splitting every single part into separate round-trips.
2. **Ground & Seam Overlap (No Floating Parts)**:
   - Ground standing objects at `Y = 0` (`Y` is up).
   - Adjacent components must physically intersect by `0.02–0.05` units so there are no hairline gaps.
3. **Anti-Slab Rule (True 3D Volume)**:
   - Never produce a flat 2.5D cardboard cutout. Give meshes rounded cross-sections, bevels (`modeler_create_rounded_box` / `bevelWidth`), tapered sweeps (`modeler_create_tube`), rotational profiles (`modeler_create_lathe`), or smooth organic SDF blends (`modeler_create_sdf_mesh`).
4. **Color Sampling & PBR Materials**:
   - Sample realistic desaturated median colors from the reference image (avoiding blown-out white `> 240` or crushed black `< 30` albedo).
   - Differentiate roughness and metallic values across functional parts (e.g. matte rubber/wood vs. brushed metal/glass).
   - Always set `backFaceCulling = false` and `twoSidedLighting = true` on materials (and use `Mesh.DEFAULTSIDE` on closed solids to avoid self-Z-fighting).
   - **Smooth Cartoon / Stylized Surfaces**: When the reference is a clean cartoon, mascot, or vinyl-toy character, keep surfaces silky smooth (`roughness: 0.35–0.55`) and **avoid** noisy procedural normal/bump maps (`bumpLevel: 0.05–0.15` or omit `withProceduralMaps` bump relief) so smooth heads, helmets, and suits never look like dented clay.
5. **Stylized Character & Organic Geometry Rules (No Bumps, No Stiff Pegs, No Broken Fins)**:
   - **Smooth Heads, Helmets & Bodies**: Prefer parametric spheres/lathes + `modeler_subd_smooth`, or `modeler_create_sdf_mesh` with `subdivide: 1` and `smoothIterations: 4..5` so curved shells and visor cutouts are clean and bump-free.
   - **Thin Fins, Crests, Visors & Straps**: NEVER build thin fins, helmet crests, or straps as thin SDF parts (they tear or vanish in the voxel grid) or single-sided planes. Build head fins/crests using `modeler_create_tube` (elliptical `rx`/`rz` stations along a curved spine, tapering to a clean tip and embedded `>= 0.04m` into the helmet) or a thick `modeler_extrude_polygon` + `modeler_subd_smooth`.
   - **Natural Articulated Limbs**: NEVER stick straight 2-point cylinders into a torso with visible gaps. Either blend torso + shoulders + arms + hips + legs in ONE unified `modeler_create_sdf_mesh` (`round_cone` primitives with `blend: 0.04..0.08`, `symmetryX: true`, `subdivide: 1`), OR use `modeler_create_tube` with 4–5 curved anatomical stations (shoulder → deltoid → elbow/knee bend → forearm/shin → wrist/ankle) with `smoothPath: true` and `0.03–0.05m` overlap into torso, gloves, and boots.
6. **Domain Tool Selection**:
   - **Hard-Surface / Props**: `modeler_execute_babylon_code`, `modeler_create_rounded_box`, `modeler_boolean_operation`, `modeler_create_lathe`.
   - **Organic / Characters**: `modeler_create_sdf_mesh`, `modeler_create_tube`, `modeler_subd_smooth`, or `modeler_generate_neural_mesh` (when a Neural 3D provider is active).
   - **Architecture**: `modeler_create_wall`, `modeler_create_arch`, `modeler_create_column`, `modeler_create_roof`, `modeler_create_stairs`.
