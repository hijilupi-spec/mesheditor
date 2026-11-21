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
5. **Domain Tool Selection**:
   - **Hard-Surface / Props**: `modeler_execute_babylon_code`, `modeler_create_rounded_box`, `modeler_boolean_operation`, `modeler_create_lathe`.
   - **Organic / Characters**: `modeler_create_sdf_mesh`, `modeler_create_tube`, or `modeler_generate_neural_mesh` (when a Neural 3D provider is active).
   - **Architecture**: `modeler_create_wall`, `modeler_create_arch`, `modeler_create_column`, `modeler_create_roof`, `modeler_create_stairs`.
