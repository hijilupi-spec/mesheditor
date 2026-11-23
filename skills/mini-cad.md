---
id: mini-cad
name: MiniCAD Precision Modeling (3D Print, Woodwork & Mechanics)
description: Precision millimeter CAD modeling with non-destructive parametric recipes, hardware hole presets (M2-M6, countersunk, dowels), shells, edge bevels, smart alignment guides, printability checks, and woodwork cut lists.
enabled: true
---

# MiniCAD Precision Modeling Skill

Use this skill whenever the user asks for precision CAD parts, 3D-printable enclosures/brackets/adapters, woodwork/furniture panels & shelves, mechanical plates, mounting holes, wall thickness shells, exact millimeter gaps, or cut lists.

## Why Prefer `cad_*` Tools Over Raw Mesh Editing
Unlike destructive polygon editing, `cad_create_part` and `cad_modify_part` store a live **non-destructive parametric recipe** (`MiniCadRecipe`) on each part. The user can immediately tweak widths, heights, hole patterns, wall shells, or bevels interactively in **MiniCAD Studio** without rebuilding from scratch.

## Profile & Real-World Engineering Rules

1. **Choose the Right Profile (`3d_print`, `woodwork`, `mechanics`)**:
   - **`3d_print`**: Default tolerance/clearance for interlocking parts is **0.20–0.30 mm** per side. Keep minimum wall thickness **>= 1.2 mm** (at least 0.8 mm for 2 FDM perimeters). Always rest parts flat on `Y = 0` (`groundToFloor: true`).
   - **`woodwork`**: Use standard panel thicknesses (**18 mm**, **15 mm**, **12 mm**, **24 mm**) and always verify or provide a **Woodwork Cut List** via `cad_inspect_and_cutlist` (`includeCutList: true`).
   - **`mechanics`**: Use standard metric fastener clearances (`M3` = `3.2 mm`, `M4` = `4.3 mm`, `M5` = `5.3 mm`, `M6` = `6.4 mm`, or `countersunk_m3` / `countersunk_m4` presets).

2. **Recommended Non-Destructive Construction Order**:
   1. **Base Solid (`cad_create_part`)**: Create `box`, `rounded_box`, `cylinder`, `tube`, `l_bracket`, or `plate` with exact `widthMm`, `heightMm`, `depthMm`.
   2. **Hollow / Shell (`cad_modify_part` with `shellWallMm` & `shellOpenFace`)**: Hollow out enclosures before drilling ports/holes.
   3. **Holes, Cutouts & Bosses (`cad_modify_part` with `addHole`, `addCutout`, `addBoss`)**:
      - Use `symmetricCornerInsetMm` inside `addHole` for fast 4-corner mounting holes on any face (`top`, `front`, `bottom`, `back`, `left`, `right`).
      - Use `patternCols` / `patternRows` + `spacingUMm` / `spacingVMm` for linear or grid hole arrays.
   4. **Edge Bevel / Fillet (`cad_modify_part` with `bevelWidthMm`)**: Apply subtle edge rounding (`0.5–1.5 mm`) last.
   5. **Align & Verify (`cad_align_and_measure` + `cad_inspect_and_cutlist`)**:
      - Position lids, brackets, or shelf boards using `center_xz`, `stack_on_top`, `flush_left`, `gap_x`, `gap_y`, or `gap_z` with exact `gapMm`.
      - Run `cad_inspect_and_cutlist` to verify `isWatertight: true`, zero floating warnings, and clean cut-list dimensions.
