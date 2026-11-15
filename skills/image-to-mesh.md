---
id: image-to-mesh
name: Image to 3D Mesh Vision Analyzer & Procedural Sculptor
description: Comprehensive analysis-by-synthesis pipeline for reconstructing production-ready, animation-capable 3D Babylon.js models from single reference images, concept art, and screenshots.
enabled: true
---

# Image to 3D Mesh Vision & Procedural Sculpting Skill

Use this skill whenever a user provides a reference image (photograph, concept art, product render, 2D game sprite, or viewport screenshot) and requests creating, reconstructing, or updating a 3D model.

---

## 1. Core Philosophy: Analysis-by-Synthesis Procedural Reconstruction

Do **NOT** treat image-to-3D as single-shot guesswork, and do **NOT** generate opaque, low-fidelity neural mesh blobs when clean geometric structure is required. 

Instead, execute an **Analysis-by-Synthesis** workflow:
1. **Deconstruct** the reference into structural components, cross-sectional profiles, and physical materials.
2. **Synthesize** clean procedural geometry using Babylon.js primitives, CSG2 with bevels, facet box-modeling, lathes, sweeps, and SDF clay.
3. **Verify & Self-Correct** against the reference image (silhouette, cross-section, catch-lights, and color fidelity).

The resulting model must be **fully inspectable, animation-ready, explodable, and visually convincing from all 360 degrees of rotation**—never a flat 2.5D cardboard cutout.

---

## 2. The 6-Pass Staged Sculpting Pipeline

Never generate an entire complex model in a single unverified step. Execute in distinct, methodical passes:

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

Before generating geometry or code, perform a structured visual audit of the reference image:

1. **Bounding Volume**:
   - Estimate true real-world dimensions: Width ($X$), Height ($Y$), Depth ($Z$).
   - Determine primary symmetry axis (sagittal mirror symmetry, rotational symmetry, or asymmetric).

2. **Structured Detail Inventory**:
   Itemize all identity-defining visual traits into structured categories:
   - **Gloss**: Localized low-roughness hotspots, clearcoat lacquer, or metallic anisotropy.
   - **Bevels**: Chamfered/filleted edges that catch specular light rims under grazing angles.
   - **Fasteners**: Screws, rivets, bolts, lugs (pattern spacing: linear, radial, or grid).
   - **Linework**: Categorize as:
     - *Engraved Groove*: Real recessed 3D geometry catching shadows (`modeler_facet_inset` with negative depth or CSG subtraction).
     - *Painted Decal*: Color contrast without depth (`modeler_decal`).
     - *Panel Seam*: Darkened ambient occlusion contact line.
   - **Wear & Stains**: Edge wear, cavity grime (accumulating in crevices), patina, or heat oxidation.

3. **Colors & Materials**:
   - **Sample, Don't Guess**: NEVER eyeball or hallucinate hex colors from memory (which leads to overly saturated, cartoonish tones).
   - Sample median RGB values directly from cropped zones of the image:
     - Gunmetal / Dark steel: `#474a4f`
     - Neutral mechanical frame: `#2b2d31`
     - Weathered wood: `#5c4033`
     - Aged brass: `#b59449` (metallic: `0.85`, roughness: `0.3`)
     - Flesh / Organic skin: Warm desaturated peach (e.g. `#d9a07a`, roughness: `0.4`)
   - Document sampled hex values in code comments for traceability.

---

### Pass 2: Macro Blockout & Vertical Grounding

1. **Establish Primary Masses**:
   - Decompose the subject into its primary macro bounding volumes (boxes, cylinders, spheres, capsules, cones).
   - All free-standing objects **MUST be grounded at $Y = 0$** (Base bottom sits on the ground plane; center pivot or bottom alignment).
2. **Root Container & Hierarchy**:
   - Keep root container scale strictly at `(1, 1, 1)` (never scale root down to hide or adjust).
   - Establish parent-child pivot groups (`chassisGroup`, `bladeAssembly`, `headPivot`, `wheelAxis`).
3. **Broadside Silhouette Validation**:
   - Compare the combined macro blockout silhouette against the 2D reference outline. Proportions, aspect ratios, and major joint locations must match before adding secondary forms.

---

### Pass 3: Structural Network & Seam Overlap (Anti-Floating Rule)

1. **Tube-Network vs Single Curves**:
   - For tubular frames, bicycles, railings, weapon guards, or branching limbs: **model each member as an oriented cylinder or tube segment**.
   - Do not rely on a single closed spline sweep, which Catmull-Rom smoothing often turns into an amorphous teardrop blob.
2. **Physical Seam Overlap (No Floating Parts)**:
   - Adjacent components (e.g. handle to guard, guard to blade, arm to torso) **MUST physically intersect by at least $0.02\text{ to }0.05$ world units**.
   - **Never leave hairline gaps** where parts almost touch. Hairline gaps create jarring black cracks and read as broken, floating geometry in 3D.
   - Verify that `partA.max >= partB.min` along the joining axis.

---

### Pass 4: Form Refinement & The Anti-Slab Rule (The `distinctZ` Principle)

> **CRITICAL FAILURE MODE TO AVOID: The 2.5D Slab Trap**  
> A planar 2D extrusion (`ExtrudeShape`/`ExtrudePolygon`) with constant depth may achieve a 99% silhouette match from the front view, but as soon as the camera orbits $45^\circ$, it immediately reveals itself as a lifeless cardboard cutout!

#### The `distinctZ` Test:
- If a mesh's vertices only occupy 6 to 10 discrete depth planes, **it is a flat slab, not a 3D solid**.
- A genuine 3D model features continuous depth curvature, rounded cross-sections, and variable thickness.

#### Techniques for True 3D Form:
1. **Variable-Thickness Cross-Sections & Grinds**:
   - **Blades & Knives**: A constant-thickness slab looks like a toy. Model a wedge cross-section that tapers from full stock at the spine down to zero at the cutting edge (*distal taper* and *blade grind*).
   - **Weapon Slides & Frames**: Taper dust covers thinner than receivers; add palm swells and flared magazine wells.
2. **Continuous Rotational & Swept Bodies**:
   - Use `modeler_create_lathe` for rotational bodies (bottles, goblets, vases, bowls, wheels, pillars).
   - Use `modeler_create_tube` with variable `radiusFunction` for tapering tentacles, horns, branches, or organic limbs.
3. **Smooth Organic Blends (`modeler_create_sdf_mesh`)**:
   - When modeling organic creatures, mascots, or clay characters, use Signed Distance Field metaball primitives (`sphere`, `ellipsoid`, `round_cone`, `capsule`) with polynomial smooth blending (`blend: 0.05 - 0.12`).
   - SDF clay eliminates robotic ball-joint seams entirely.

---

### Pass 5: Surface Detailing, Bevel Catch-Lights & Fasteners

1. **Bevels Create Realism (Catch-Lights)**:
   - In the real world, no edge is an infinitely sharp $90^\circ$ mathematical angle. Sharp computer edges reflect zero specular light and scream "fake CGI".
   - **Always apply beveled edges** to hard surfaces:
     - Use `modeler_create_rounded_box` with `radius: 0.02 - 0.06` and `segments: 2` or `3`.
     - In CSG operations (`modeler_boolean_operation`), pass `bevelWidth: 0.03`, `bevelSegments: 2`, and `bevelProfile: "chamfer"` or `"fillet"`.
     - When grazing light hits a chamfer, it produces a crisp specular highlight (*catch-light rim*) that immediately defines the object's form.
2. **Fasteners & Repeated Hardware**:
   - Use `modeler_clone_array` (linear or radial) for bolt rings, rivets, gear teeth, and screws.
   - Model the screw head as a slightly raised hemisphere or flat hex cap with a low-roughness metallic finish (`roughness: 0.2`, `metallic: 0.9`).
3. **Grips, Ridges & Serrations**:
   - For knurled or grooved grips, model raised geometric bands: a core cylinder plus multiple thin ring segments just proud of the core.
   - Textures alone cannot replace silhouette ridges; tactile ridges must have real geometry.
4. **Surface Decals & Relief**:
   - Stamp surface emblems, battle damage, cracks, or hazard stripes using `modeler_decal` (`mergeIntoMesh: true`).

---

### Pass 6: PBR Material Calibration & De-Lighting

1. **The De-Lighting Rule**:
   - Reference photos contain **pre-baked shadows, ambient occlusion, and flash reflections**.
   - If you copy shaded photo colors directly into the albedo, the 3D model will render with conflicting "double shadows" when illuminated in the scene.
   - **Neutralize the albedo**: Extract the base unshaded hue. Let the 3D engine's physical lights and ambient occlusion handle illumination dynamically.
2. **Physically-Based Roughness & Metallic Calibration**:
   - Never leave models with uniform default roughness. Apply calibrated PBR values:

| Material Type | Albedo Hue / Base | Roughness | Metallic | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Machined Steel / Chrome** | `#e0e0e5` | 0.15 – 0.25 | 0.90 – 1.00 | Crisp anisotropic reflections |
| **Gunmetal / Anodized Aluminum** | `#3a3d42` | 0.30 – 0.40 | 0.70 – 0.85 | Satin metallic sheen |
| **Painted Metal (Car / Weapon)** | Desaturated base | 0.35 – 0.50 | 0.05 – 0.15 | Clearcoat effect over base |
| **Hard Plastic / Composite Polymer**| Sampled tone | 0.40 – 0.55 | 0.00 – 0.05 | Subtle bevel catch-lights |
| **Natural Wood** | Warm brown / ochre| 0.65 – 0.80 | 0.00 | Directional grain normal map |
| **Stone / Concrete / Plaster** | Neutral gray/sand | 0.80 – 0.95 | 0.00 | Micro-surface bump noise |
| **Stylized / Organic Skin** | Warm peach/coral | 0.35 – 0.45 | 0.00 – 0.02 | Satin specular rim highlight |
| **Polished Glass / Visor** | Tinted / clear | 0.05 – 0.10 | 0.10 | Transparency + refraction |

3. **Multi-Materials**:
   - A single object must have distinct materials for different functional parts (e.g. rubber grip, steel slide, polymer frame, brass pins).
   - Apply distinct PBR materials to individual meshes before fusing with `modeler_merge_meshes` to preserve unified multi-material sub-meshes.

4. **Mandatory Double-Sided Materials & Geometries**:
   - Single-sided materials (`backFaceCulling = true`) are a frequent cause of broken 3D visual rendering in image reconstructions. Thin surfaces (such as knife blade edges, vehicle body panels, clothing, wings, open hollow cavities, or cockpit interiors) completely vanish when viewed from back or side angles.
   - **Always enforce double-sided rendering**:
     - All materials MUST have `backFaceCulling = false` and `twoSidedLighting = true`.
     - All custom open meshes, ribbons, cards, or thin walls MUST pass `sideOrientation: Mesh.DOUBLESIDE`.

---

## 3. Domain-Specific Reconstruction Strategies

### A. Hard-Surface & Mechanical Props (Weapons, Tools, Sci-Fi)
- **Cutouts & Ports**: Use `modeler_facet_cut_through` for hollow through-holes or CSG `subtract` with `bevelWidth: 0.02` for chamfered ejection ports and chambers.
- **Internals & Cavities**: If a cavity or port is open, provide real internal geometry (recessed floor, barrel breech) or seal it cleanly. Never leave backface-culling black voids.
- **Assembly Contract**: Name every sub-mesh semantically (`blade`, `guard`, `handle_grip`, `pommel`, `barrel`, `trigger`). Ensure parts can be exploded along their assembly axes without tearing.

### B. Architecture & Environments (Buildings, Rooms, Bridges)
- Prefer specialized architectural parametric tools over stacking raw boxes:
  - Walls with doors/windows: `modeler_create_wall` (bottom-grounded, beveled frames).
  - Portals & Archways: `modeler_create_arch` (`"round"`, `"pointed"`, `"segmental"`).
  - Classical fluted columns: `modeler_create_column` (`"doric"`, `"ionic"`, `"corinthian"` with entasis).
  - Cornices, trims & moldings: `modeler_create_molding` (45° mitered sweeps).
  - Roof structures: `modeler_create_roof` (`"gable"`, `"hip"`, `"dome"` with fascia overhang).
  - Stairs: `modeler_create_stairs` (`"straight"` or `"spiral"` with beveled treads and handrails).

### C. Organic Figures & Characters
- Cross-reference `skills/figure-sculptor.md` for full human/creature anatomical proportions.
- **Cartoon / Chibi Canon (3.5 – 4 Heads)**:
  - For mascots, toons, and stylized heroes (e.g. Mario-style characters): spawn `modeler_spawn_base_mesh` (`type: "chibi"`, `style: "organic"`).
  - Limbs must be continuous curved tubes (`MeshBuilder.CreateTube`) rather than segmented robotic sphere-joint cylinders.
- **Organic Pear Volume**: Unite head and potbelly into a continuous soft volume.
- **Sub-D Smoothing (`modeler_subd_smooth`)**: Apply 1–2 iterations of subdivision smoothing to low-poly blockouts to eliminate hard faceted seams.

---

## 4. Verification & Self-Correction Checklist

After each build pass, audit the model against these four diagnostic criteria:

1. **Broadside Silhouette Match**:
   - Does the silhouette line up with the 2D reference in key proportions and silhouette anchor points?
2. **Cross-Section & 3D Volume Audit (Orbit $45^\circ$ & Top-Down)**:
   - Does the model have convincing physical volume when viewed from an angle?
   - Did we avoid the 2.5D slab trap? Are edges rounded and cross-sections tapered?
3. **Grazing-Light Catch-Light Audit**:
   - Are specular highlights visible along beveled edges and contours?
   - If an edge looks razor-sharp and dark, add a bevel (`bevelWidth` or `rounded_box`).
4. **Color & Contrast Match**:
   - Do material albedos match the sampled median values from the image?
   - Is roughness differentiated across materials rather than globally uniform?
