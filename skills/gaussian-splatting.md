---
id: gaussian-splatting
name: Gaussian Splatting Studio & Hybrid Scene Composition
description: Workflows for working with 3D Gaussian Splatting clouds (GaussianSplattingMesh), crisp procedural foliage/nature splats, floater cleanup, and hybrid splat + polygon scenes.
enabled: true
---

# Gaussian Splatting Skill (Babylon.js Live Scene)

Use this skill whenever the scene contains a `GaussianSplattingMesh` (`.splat`, `.ply`, `.spz`, `.sog`), or when the user asks to create, clean up, crop, merge, or combine Gaussian Splats with procedural polygon geometry.

## 1. Gaussian Splats vs. Triangle Meshes (Critical Rules)

1. **Never apply polygon/topology tools to a `GaussianSplattingMesh`**:
   - A `GaussianSplattingMesh` renders oriented 3D Gaussian ellipsoids rather than indexed triangles (`triangles: 0`, `isGaussianSplat: true`).
   - Do **NOT** call `modeler_boolean_operation`, `modeler_sculpt_mesh`, `modeler_retopologize_mesh`, `modeler_solidify_mesh`, `modeler_subd_smooth`, `modeler_uv_unwrap`, `modeler_bake_textures`, `modeler_facet_*`, or `modeler_merge_meshes` on a `GaussianSplattingMesh`.
   - Use **`modeler_gaussian_splat`** to inspect, clean, crop, adjust scale/opacity/color, bake transforms, or merge splat clouds, and use **`modeler_transform_mesh`** for standard position/rotation/scale placement.

## 2. Art-Directing Crisp Organic & Environment Splat Scenes (Anti-Blob Rules)

When building natural environments (forests, rainforests, trees, ferns, moss, bushes, clouds, or scenes from reference photos):

1. **NEVER build fog or mist from large transparent white/pale splats**:
   - Stacking large semi-transparent light splats (`mist_splats`, `fog_splats`, `opacity: 0.1–0.3`) causes alpha-blending over-brightening into an opaque white cloud that hides the scene.
   - For atmospheric depth and hazy light in forests or landscapes, use Babylon exponential scene fog inside `modeler_execute_babylon_code` instead:
     `scene.fogMode = BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity = 0.03; scene.fogColor = new BABYLON.Color3(0.75, 0.82, 0.78);`
2. **NEVER convert giant coarse spheres/boxes into blurry canopies**:
   - Sampling 3,000–5,000 splats across a huge sphere produces blurry cotton-ball blobs.
   - Keep `splatScale` crisp (`0.015` to `0.05` m) and use `splatStyle: "foliage"` (elongated oriented leaf blades with color variation) or `"moss"` (dense fuzzy tufts) with `targetSplatCount: 10000`–`30000` on actual branched/frond geometry.
3. **Best Quality for Complex Nature Scenes (`modeler_execute_babylon_code` + `createFromSplatsBuffer`)**:
   - Combine polygon/tube trunks, branches, lianas, and terrain (`Y >= 0.03` above the `Y=0` editor grid to prevent floor Z-fighting) with **custom procedural Gaussian Splats** built directly via `service.gaussianSplatController.createFromSplatsBuffer(name, buffer, { alignToGround: false })`!
   - Preserve open sightlines in the foreground so the camera looks into layered depth (foreground ferns & moss -> mid-ground trunks & lianas -> background canopy), rather than blocking the camera with a solid foliage wall.
   - Exact 32-byte `.splat` record layout for `createFromSplatsBuffer`:
     ```js
     const buf = new ArrayBuffer(count * 32);
     const f = new Float32Array(buf);
     const u = new Uint8Array(buf);
     // For each splat i:
     const fo = i * 8, uo = i * 32;
     f[fo] = x; f[fo+1] = y; f[fo+2] = z;
     f[fo+3] = sx; f[fo+4] = sy; f[fo+5] = sz; // e.g. leaf blade: sx=0.09, sy=0.03, sz=0.008
     u[uo+24] = r; u[uo+25] = g; u[uo+26] = b; u[uo+27] = a; // 0..255
     // Normalized quaternion q (note negated qw for Babylon's _makeSplat convention):
     u[uo+28] = Math.max(0, Math.min(255, Math.round(-q.w * 127.5 + 127.5)));
     u[uo+29] = Math.max(0, Math.min(255, Math.round(q.x * 127.5 + 127.5)));
     u[uo+30] = Math.max(0, Math.min(255, Math.round(q.y * 127.5 + 127.5)));
     u[uo+31] = Math.max(0, Math.min(255, Math.round(q.z * 127.5 + 127.5)));
     const splatMesh = service.gaussianSplatController.createFromSplatsBuffer('foliage_splats', buf);
     ```

## 3. Volumetric Presets & Mesh-to-Splats

- **Volumetric Presets (`modeler_gaussian_splat` with `action: "create_preset"`)**:
  - `cloud`: Fluffy multi-lobe cumulus clouds
  - `foliage` / `bush`: Layered crisp leaf-blade canopies and shrubs
  - `fire`: Soft glowing flame plumes
  - `galaxy` / `nebula`: Cosmic dust & star-field volumes
- **Mesh-to-Splats (`modeler_mesh_to_splats`)**:
  - Use `splatStyle: "foliage"` for leaves/ferns/hedges, `"moss"` for fuzzy bark moss, `"fuzzy"` for smoke/clouds, and explicit small `splatScale` (`0.02`–`0.05`) for sharp detail.
  - Set `removeSource: true` when replacing the polygon blockout with the splat cloud, or keep it `false` when using the polygon mesh as a solid core/collider.

## 4. Hybrid Scene Composition (Scans + Procedural Geometry)

When combining a scanned/imported Gaussian Splat environment or hero object with procedural 3D meshes:
1. Call `modeler_get_scene_info` or `modeler_gaussian_splat` (`action: "inspect"`) to read the splat's exact `worldBounds` (`min`, `max`, `size`, `center`).
2. Ground the splat if floating (`action: "bake_transform"` with `alignToGround: true` or adjust `position.y` so `min.y = 0`).
3. Build architectural pedestals, floors, walls, furniture, or props with standard `modeler_*` tools aligned directly to the splat's `worldBounds`.

## 5. Cleanup & Optimization Workflows

When a scanned or imported Gaussian Splat contains stray noise ("floaters") or excess density:
- Call `modeler_gaussian_splat` with `action: "cleanup"`:
  - Set `minOpacity: 0.05` to `0.15` to strip near-invisible haze floaters.
  - Set `maxScale` to remove huge stretched background artifacts.
  - Use `cropBoxMin`/`cropBoxMax` or `cropCenter` + `cropRadius` to isolate the subject.
  - Use `sampleStep: 2` (50%) or `3` (33%) to reduce splat count on dense scans.
- Tune runtime rendering via `action: "adjust"` with `minPixelSize` (e.g. `1.5`) to discard sub-pixel noise in real time, or adjust `shDegree` (`0`–`3`).
