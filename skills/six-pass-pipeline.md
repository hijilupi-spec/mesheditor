---
id: six-pass-pipeline
name: 6-Pass Staged Sculpting Pipeline (Deep Refinement)
description: Optional multi-pass workflow for complex image-to-3D reconstructions (Detail Inventory, Blockout, Structural Network, Form Refinement, Detailing, PBR Calibration). Enable only when deep multi-turn refinement is desired.
enabled: false
---

# 6-Pass Staged Sculpting Pipeline

Use this staged workflow when maximum geometric fidelity is prioritized over generation speed. Execute in distinct, methodical passes rather than a single step:

```
Pass 1: Detail Inventory & Color Sampling
   ↓
Pass 2: Macro Blockout & Vertical Grounding (Y = 0)
   ↓
Pass 3: Structural Network & Seam Overlap
   ↓
Pass 4: Form Refinement & The Anti-Slab Rule (Distinct Z / 3D Cross-Sections)
   ↓
Pass 5: Surface Detailing, Bevel Catch-Lights & Fasteners
   ↓
Pass 6: PBR Material Calibration & De-Lighting
```

---

### Pass 1: Detail Inventory & Exact Color Sampling
1. **Bounding Volume**: Estimate real-world Width ($X$), Height ($Y$), Depth ($Z$) and primary symmetry axis.
2. **Structured Detail Inventory**: Categorize gloss hotspots, chamfered bevels, fasteners (linear/radial/grid), linework (engraved grooves, painted decals, panel seams), and wear/stains.
3. **Sample, Don't Guess**: Sample median RGB hex values directly from the reference (avoiding oversaturated cartoon colors).

### Pass 2: Macro Blockout & Vertical Grounding
- Decompose into primary macro bounding volumes grounded at $Y = 0$, with root scale `(1, 1, 1)` and semantic parent-child groups.
- Validate broadside silhouette proportions before adding secondary forms.

### Pass 3: Structural Network & Seam Overlap (Anti-Floating Rule)
- Model tubular frames/limbs as oriented cylinder or tube segments.
- Adjacent components **MUST physically intersect by at least $0.02\text{ to }0.05$ world units** (never leave hairline gaps).

### Pass 4: Form Refinement & The Anti-Slab Rule (`distinctZ`)
- Avoid flat 2.5D extruded slabs: use variable-thickness cross-sections, `modeler_create_lathe` for rotational bodies, `modeler_create_tube` with tapered radii, and `modeler_create_sdf_mesh` for smooth organic blends.

### Pass 5: Surface Detailing, Bevel Catch-Lights & Fasteners
- Apply beveled edges (`modeler_create_rounded_box` or `bevelWidth` on booleans) for specular catch-light rims.
- Use `modeler_clone_array` for bolts/rivets/teeth and `modeler_decal` (`mergeIntoMesh: true`) for surface emblems/damage.

### Pass 6: PBR Material Calibration & De-Lighting
- Neutralize pre-baked photo shadows (`[30, 240]` sRGB albedo clamping), apply `materialPreset` or tuned roughness/metallic per part, and ensure `backFaceCulling = false` and `twoSidedLighting = true` on all materials.

### Verification Checklist After Each Pass
1. **Broadside Silhouette Match** against the 2D reference.
2. **Cross-Section & 3D Volume Audit** ($45^\circ$ orbit & top-down).
3. **Grazing-Light Catch-Light Audit** on beveled edges.
4. **Color & Contrast Match** with differentiated roughness across materials.
