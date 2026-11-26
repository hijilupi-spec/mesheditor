# Roblox Production Readiness Audit

**Repository:** 3D Mesh Editor
**Audit date:** 2026-11-25
**Scope:** source-code inspection focused on producing Roblox static assets and avatar wearables. No application code was changed. The two project briefs supplied as PDFs were read as target requirements, not as evidence that those features exist. `TECHNICAL_ARCHITECTURE.md` was used as an index and cross-checked against source.

## Status key

- **Implemented** — source contains the described working capability. This does not mean Roblox acceptance or production quality was independently validated.
- **Partially Implemented** — useful related functionality exists, but the complete Roblox production workflow is absent or unverified.
- **Not Found** — no relevant implementation was found in the inspected source.
- **Not Verified** — the repository evidence does not establish that the feature works or preserves required data in a target workflow.

Roblox requirements cited below are from Creator Hub. They are acceptance criteria for the target pipeline, not claims about this app. Roblox's importer accepts FBX, glTF, and OBJ; FBX/glTF can carry hierarchy, PBR textures, cage objects, rigs, avatar components, animation, and vertex colors. Its layered accessory requirements include a single watertight mesh, a 4,000-triangle limit, correctly named cage meshes, matching cage UVs, and attachments. The exact requirements vary by item category and marketplace use. [Importer](https://create.roblox.com/docs/studio/importer), [layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications), [rigging and skinning](https://create.roblox.com/docs/art/modeling/rigging), [character body specifications](https://create.roblox.com/docs/avatar/character-bodies/specifications).

## Executive assessment

This repository is a capable general-purpose, browser-based mesh editor with substantial procedural modeling, mesh editing, UV/material tools, a retopology toolset, and Babylon skeleton/weight-paint support. It can produce useful **static geometry drafts** and export GLB/glTF that Roblox Studio can import. That does not establish a validated Roblox-ready asset pipeline.

**Wearables:** not production-ready based on inspected implementation. The rigging tools create generic humanoid/chibi skeletons and weights, but the humanoid hierarchy and names are not Roblox R15's standard hierarchy. No Roblox accessory/cage/fitting/import validator or FBX export was found. The editor's “cage” features are retopology or texture-baking cages, not Roblox layered-clothing cages.

**Static assets:** partially ready as a modeling/export workbench. Geometry, UV, materials, and GLB/glTF/OBJ export exist, but there is no Roblox-specific scale/pivot/material/export validation pipeline. Topology inspection is general-purpose and does not establish Roblox's per-mesh budgets, watertightness, or final Studio import behavior.

## 1. Roblox wearable assets

| Component | Location and evidence | Technology and responsibility | Status |
|---|---|---|---|
| Generic skeleton creation | `src/rigging/WeightPaintController.ts`: `createAutoRig()` | Babylon.js `Skeleton`, `Bone`, and linked `TransformNode`s; derives bone locations from mesh bounds and builds `humanoid`, `chibi`, `quadruped`, or `spine_chain` presets. | **Implemented** |
| Roblox R15 skeleton | Same `createAutoRig()`; humanoid names include `Root`, `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `Shoulder_L`, `UpperArm_L`, `ForeArm_L`, `UpLeg_L`, etc. | Generic game skeleton. This is not Roblox's required R15 bone hierarchy/naming such as `HumanoidRootNode`, `LowerTorso`, `UpperTorso`, `LeftUpperArm`, `LeftLowerArm`, `LeftHand`, and so on. | **Not Found** |
| Automatic skinning | `WeightPaintController.autoBindSkinWeights()` and `bindSingleMeshSkinWeights()` | Computes inverse-distance weights to bone segments; selects the four strongest influences and normalizes their weights. | **Implemented**, but **Partially Implemented** for Roblox: max-four influences matches one Roblox constraint, but no R15-specific bind rules, no exclusion of root influences, and no Roblox deformation validation. |
| Manual weight painting | `WeightPaintController.applyWeightBrushStroke()`, `paintSingleMesh()`; UI in `src/rigging/RiggingUIService.ts`; AI wrapper `src/tools/builtin/RigWeightTool.ts` | Interactive add/subtract/smooth/replace painting, optional X symmetry, heatmap, pose testing, and undoable weight changes. | **Implemented** as generic skinning tools; **Partially Implemented** for Roblox due to missing R15 mapping and target validation. |
| Rig pose testing | `WeightPaintController.poseActiveBone()`, `resetBindPose()`; `RiggingUIService` | Rotates a selected joint and restores bind pose to inspect generic deformation. | **Implemented**; Roblox animation/pose conformance is **Not Verified**. |
| Rigid accessories and attachments | Search of `src/` for Roblox accessory types, attachment naming/creation, and Roblox import types | No workflow creating standardized Roblox `Attachment` objects or assembling an `Accessory` object was found. | **Not Found** |
| Layered clothing cages | Search of `src/` for `WrapLayer`, `WrapTarget`, `_InnerCage`, `_OuterCage`, Roblox cage templates; `src/sculpting/SculptController.ts` has `generateQuadFlowCage()`, and `src/baking/TextureBaker.ts` has a projection cage preview. | Existing cage features create a generic quad retopology cage or a temporary normal/AO bake projection cage. Neither implements Roblox's canonical layered clothing cage topology, naming, matching cage UVs, or WrapLayer/WrapTarget setup. | **Not Found** for Roblox cages; generic cages are **Implemented** for their separate purposes. |
| Fitting and avatar preview | Search of `src/` for Roblox Avatar Fitting Tool, avatar body templates, R15 fitting, and layered accessory preview | No Roblox body-template fitting, multiple-avatar fitting, accessory fitting, or Roblox Studio integration was found. | **Not Found** |
| Wearable quality validation | `src/sculpting/SculptController.ts`: `analyzeTopology()`; general UV and geometry tools | Generic topology statistics/analysis exist; no checks for Roblox item category, R15 naming, required attachments, cages, cage UV correspondence, or Roblox marketplace/import constraints. | **Not Found** as a Roblox validator |

**Assessment:** the app can create generic skeletal meshes and skin weights, but those outputs cannot be represented as R15-ready wearables just because they have bones and four influences. Roblox's standard R15 hierarchy, attachment/cage structures and item-specific checks are separate requirements. The project's own asset guidelines correctly identify those as a dedicated workflow.

## 2. Static game assets

| Component | Location and evidence | Technology and responsibility | Status |
|---|---|---|---|
| Procedural modeling | `src/tools/ToolRegistry.ts`: `createDefaultToolRegistry()`; tools under `src/tools/builtin/` including `CreatePrimitiveTool`, `CreateSdfMeshTool`, `ExtrudePolygonTool`, `CreateLatheTool`, `CreateTubeTool`, architecture, voxel, and CAD tools | Tool registry exposes live-scene mesh creation and editing. `src/MeshEditorService.ts` owns scene operations. | **Implemented** |
| Sculpting and retopology | `src/sculpting/SculptController.ts`: `retopologizeMesh()`, `shrinkwrapMesh()`, `generateQuadFlowCage()`, `drawQuadStripOnMesh()`, `analyzeTopology()`; `src/tools/builtin/RetopologizeMeshTool.ts` | Sculpting, decimation, shrinkwrap, quad-cage generation, quad-strip drawing, and topology reporting. | **Implemented**, but Roblox-specific topology constraints/automatic cleanup are **Not Found**. Quad cage is not Roblox layered cage. |
| UV tools | `src/uv/UVUnwrapController.ts`: `unwrapMesh()`, `markSmartSeams()`, `normalizeTexelDensity()`, `packUVIslands()`, `analyzeUVs()`; `src/tools/builtin/UVUnwrapTool.ts` | Custom smart seams, projection/unwrap methods, texel-density normalization, and island packing/analysis. | **Implemented**; Roblox-specific UV validation is **Not Found**. |
| Material and texture editing | `src/materials/`, `src/painting/TexturePaintController.ts`, `src/textures/AITextureGenerator.ts`, `src/baking/TextureBaker.ts`; AI tools `CreateMaterialTool`, `GenerateTextureTool`, `BakeTexturesTool`, `PaintTextureTool` | Babylon materials and PBR workflows; texture generation/painting and normal/AO baking exist. | **Implemented** generally. Roblox SurfaceAppearance export fidelity and final appearance in Studio are **Not Verified**. |
| Mesh optimization | `src/compression/ModelCompressor.ts`; `SculptController.retopologizeMesh()` | Compression/export and decimation tools are available. | **Partially Implemented**: no Roblox per-category budget report or guaranteed budget pass. |
| Pivot, scale, orientation | `src/MeshEditorService.ts`: transform/scene editing functions; generic gizmos | Generic object transforms exist. No Roblox-specific attachment-centered origin, unit conversion, orientation preset, or export validation was found. | **Partially Implemented** |
| Static-asset checks | `src/tools/builtin/CheckZFightingTool.ts`; topology/UV analysis functions above | Z-fighting, topology and UV diagnostics provide some useful checks. | **Partially Implemented**; no combined Roblox import-readiness report, watertight/manifold guarantee, or Studio re-import check. |

**Assessment:** static props, furniture, and environment models are the best-fit use case today. However, “model looks correct in the viewport” and “GLB exported” do not prove correct scale, clean topology, single-material behavior, texture interpretation, or final Roblox Studio appearance. Roblox allows mesh assets through its importer but applies its own geometry/material constraints; one mesh has a single assigned material, and PBR surface details rely on Roblox's material workflow. [Meshes](https://create.roblox.com/docs/parts/meshes), [texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications).

## 3. Export and data preservation

| Format / component | Location and evidence | Roblox workflow assessment | Status |
|---|---|---|---|
| GLB | `src/MeshEditorService.ts`: `exportCurrentModel()` branch `format === 'glb'`; `exportToGLBBlob()` | Roblox Studio importer accepts GLB/glTF. Export invokes `WeightPaintController.prepareMeshesForExport()` which restores temporary heatmaps and ensures linked bone transform nodes/joint indices. Direct workflow path exists. | **Implemented**; successful Roblox Studio import and fidelity **Not Verified**. |
| glTF | `MeshEditorService.exportCurrentModel()` branch `format === 'gltf'` | Roblox importer accepts glTF; data may be delivered as multiple files. | **Implemented**; target import **Not Verified**. |
| OBJ | `MeshEditorService.exportCurrentModel()` branch `format === 'obj'` using Babylon `OBJExport.OBJ()` | Roblox importer accepts OBJ for meshes; this branch exports mesh geometry, and is not a skeletal/cage wearable pipeline. | **Implemented** for static geometry; wearable data **Not Supported/Not Verified**. |
| STL | `MeshEditorService.exportCurrentModel()` branch `format === 'stl'` using Babylon `STLExport.CreateSTL()` | Roblox Studio's documented mesh import list does not include STL. STL is not a suitable Roblox production interchange format here. | **Implemented** export, Roblox workflow **Not Found**. |
| Babylon project serialization | `MeshEditorService.exportCurrentModel()` branch `format === 'babylon'` | Native/editor-oriented serialization, not listed as an accepted Roblox Studio model-import format. | **Implemented**; Roblox import **Not Found**. |
| FBX | `src/services/InputAndFileService.ts` and `MeshEditorService.ts` allowlisted extension mentions; no FBX export branch in `exportCurrentModel()` | Roblox accepts FBX; this repo does not show an FBX exporter. An import extension or loader does not establish export. | **Not Found** for export; import handling **Not Verified** by this audit. |
| Project/asset packaging | `MeshEditorService` has native project data and export paths; `src/adapters/BrowserPlatformAdapter.ts` uses browser file inputs/downloads | No Roblox delivery folder, companion texture manifest, wearables package, or validation report generation was found. | **Partially Implemented** for editor project save; Roblox package **Not Found**. |

**Likely loss/translation risks:** OBJ and STL cannot represent the full rigged wearable data expected by Roblox. GLB/glTF can represent skeletons/skin attributes and are accepted by Roblox, but this app's generated generic rig is not R15-conformant and no evidence confirms that Roblox-specific accessory/cage semantics are generated. Blender/Babylon material properties may not translate one-to-one to Roblox's SurfaceAppearance material channels; no Roblox export adapter or round-trip verification exists. `prepareMeshesForExport()` specifically prepares for Babylon's glTF serializer, not for Roblox semantics.

## 4. AI modeling and repairability

`src/tools/ToolRegistry.ts` registers **53** instantiated built-in tools in `createDefaultToolRegistry()` (despite its stale factory comment saying “37”). The list covers scene inspection/planning; primitives, SDF, extrusion, lathe/tube, architecture and CAD; booleans, voxel and sculpting; decimation/shrinkwrap/quad tools; UVs, texture/material/baking; rig-weight actions; import-adjacent and scene transforms; and Gaussian splat tools.

- **Tool breadth:** **Implemented** for broad general-purpose procedural modeling. 53 tools are not 53 Roblox production steps: the registry contains no Roblox R15 conversion, attachment/cage construction, avatar fitting, Roblox limits validator, FBX export, or Studio round-trip validator.
- **AI execution:** tools in `src/tools/builtin/` execute against a `ToolExecutionContext` tied to the current `MeshEditorService` scene; `ToolRegistry.execute()` dispatches an individual call. This creates actual scene geometry rather than only returning a text description.
- **Iteration and repair:** **Partially Implemented.** Mesh edits, weight edits, undo, and scene inspection permit manual/AI iteration. No transaction around a whole AI request or Roblox-specific quality gates were found. A multi-call attempt can leave earlier successful changes in the scene if a later tool call errors; inspect and undo/revise rather than assume automatic rollback.
- **Repeatability:** **Partially Implemented.** Procedural functions/structured parameters help repeat operations, but no Roblox garment template pipeline, deterministic project recipe/asset validation report, or visual regression against reference avatars was found. Results remain dependent on prompts and chosen operations.
- **Reference-image modeling:** image attachment/analysis can inform requests, but source evidence does not show a deterministic image-to-geometry reconstruction and Roblox-ready result pipeline. Treat as **Partially Implemented / Not Verified** for production fidelity.

Relevant locations: `src/tools/ToolRegistry.ts`; `src/tools/builtin/`; `src/AIAgentService.ts`; `src/tools/ToolExecutionContext.ts`; mesh edit and undo handling in `src/MeshEditorService.ts`.

## 5. Android / mobile production constraints

| Component | Location and evidence | Assessment | Status |
|---|---|---|---|
| Android wrapper | `capacitor.config.ts`; `android/`; app `webDir: 'dist'`; `@capacitor/android` / `@capacitor/core` in `package.json` | Android hosts the same web editor in a Capacitor WebView. No mobile-specific modeling engine or Roblox bridge is declared. | **Implemented** |
| Touch input | `src/styles.ts` responsive rules (including toolbar collapse below 768 px) and `#renderCanvas { touch-action: none; }`; Babylon pointer handling | Basic touch-compatible canvas and responsive CSS exist. The desktop-style toolbar/panels/dialogs remain dense, so precision selections, UV work, weight painting, and multi-panel tasks are difficult on a phone. | **Partially Implemented** |
| File handling | `src/adapters/BrowserPlatformAdapter.ts`; `MeshEditorApp.triggerDownloadBlob()`; `src/services/InputAndFileService.ts` | Uses browser `<input type=file>` and Blob download fallback. No native Android Storage Access Framework/document provider adapter or Roblox Studio handoff was found. User must manage downloaded/exported files through Android file picker/downloads. | **Partially Implemented** |
| Performance | Babylon scene and CPU mesh algorithms, including synchronous geometry/weight loops in `WeightPaintController.bindSingleMeshSkinWeights()`; mobile build includes same app | Heavy sculpt/boolean/baking/high-resolution textures and large scenes can be constrained by phone RAM/GPU/thermal limits. No device-tier budgets or mobile profiling/benchmarks were verified. Exact limits depend on device and are **Not Verified**. | **Partially Implemented** |
| Mobile-specific asset pipeline | Search of `src/` and `android/` | No Roblox-specific mobile workflow or native model-export bridge found. | **Not Found** |

## 6. Testing and validation evidence

There are integration tests in `tests/integration/gaming-pipeline-tools.test.ts` for generic auto-rigging, skinning, GLB export, and GLB re-import. These establish intended general capability in tests, not R15 or Roblox Studio compatibility. No Roblox-specific automated test suite, Studio-import round trip, avatar fitting/cage test, or marketplace validation was found in `tests/`. Tests were inspected but not run for this documentation-only audit.

## 7. Five most important technical gaps

1. **No Roblox wearable data model/pipeline:** no R15-named rig export, required accessory attachments, layered clothing cages, WrapLayer/WrapTarget representation, or Roblox wearable assembly.
2. **Generic rig presets are not R15:** `createAutoRig()` emits generic `Root/Hips/Spine/UpperArm_L` names and computes bounds-based bone placement; it does not produce Roblox's standard hierarchy and constraints.
3. **No Roblox validation and fitting loop:** no avatar template fitting, multi-avatar/pose preview, item category checks, cage correspondence validation, Roblox triangle/size budgets, or Studio import/re-import report.
4. **Incomplete export options and uncertain translation:** no FBX exporter, no Roblox-specific GLB/glTF export profile, no guaranteed preservation of required Roblox accessory/cage semantics, and no verified Studio round trip.
5. **Static quality pipeline lacks enforced acceptance criteria:** decimation/UV/PBR exist, but there is no integrated topology/manifold, scale/pivot, material-slot, texture-size, and target-budget pass/fail gate. Phone workflows also make detailed manual repair less precise.

## 8. Recommended development priorities (ranked by asset-quality impact)

1. **Build and test the Roblox static-asset export/validation path first.** Define unit/orientation/pivot conventions; validate geometry, triangle/size budgets, UVs, material/texture maps, and file presence; add automated GLB/glTF export then import the artifact in Roblox Studio and record warnings/results.
2. **Add a distinct Roblox wearable pipeline using official rig/cage templates.** Implement the actual R15 bone hierarchy and attachment conventions, plus layered clothing inner/outer cages with official topology and names; keep these separate from general retopo and bake cages.
3. **Add wearable deformation/fitting validation.** Preview on standard R15 bodies and poses; check weight sums/influences, cage UV correspondence and required parts; export/re-import into Studio and verify its WrapLayer/WrapTarget result. Marketplace readiness remains a separate Roblox moderation/publishing decision.
4. **Improve topology/material quality gates and repair loops.** Surface actionable defects, tie AI-generated edits to checks, and make each stage inspectable/reversible; verify results after each operation instead of treating an AI response or successful export as completion.
5. **Improve Android usability and file delivery for the above workflows.** Add an input/selection workflow optimized for touch, clear export destination handling, and device-aware performance budgets. Prioritize mesh correctness and wearable compatibility before platform-specific convenience.

## 9. Existing features that should not be rebuilt

- General Babylon.js scene editing, transforms, selection, object hierarchy, undo/redo, and import/export orchestration: `src/MeshEditorService.ts`.
- Existing procedural modeling and architectural/CAD generation: registered built-ins under `src/tools/builtin/` and `src/tools/ToolRegistry.ts`.
- Existing sculpt, decimation, shrinkwrap, quad-strip, quad-flow cage, and topology inspection: `src/sculpting/SculptController.ts`.
- Existing UV unwrap, smart seam, texel-density, packing, and UV analysis: `src/uv/UVUnwrapController.ts`.
- Existing PBR/material, texture paint/generation, and normal/AO baking: `src/materials/`, `src/painting/`, `src/textures/`, and `src/baking/`.
- Existing generic skeleton creation, normalized four-influence skin binding, weight painting, heatmap, pose testing, and GLB skin preparation: `src/rigging/WeightPaintController.ts`.
- Existing AI scene-tool registry and execution context: `src/tools/ToolRegistry.ts`, `src/tools/ToolExecutionContext.ts`, and `src/AIAgentService.ts`.

Extend these capabilities with Roblox-specific adapters, data conventions, and validators. Do not mislabel their existing generic functionality as Roblox support.

## VERIFIED_CAPABILITIES_AND_LIMITATIONS

### Verified capabilities

- Builds and edits real Babylon.js meshes in a live scene.
- Provides a broad set of 53 registered AI-callable modeling/editing tools.
- Supports generic sculpting, mesh operations, decimation/retopology helpers, UV workflows, PBR/material/texture workflows, and texture baking.
- Creates generic skeletons, assigns up to four normalized bone influences, supports weight painting and pose inspection.
- Exports GLB, glTF, OBJ, STL, and Babylon project serialization; Roblox Studio officially supports glTF/GLB, OBJ, and FBX import.
- Has integration tests for generic rigged GLB export/re-import (tests not run during this audit).
- Provides an Android Capacitor/WebView wrapper with basic responsive/touch support and browser-style file selection/download.

### Limitations

- No verified Roblox R15-compatible skeleton generation or Roblox attachment objects.
- No Roblox layered-clothing inner/outer cage generation, official template support, WrapLayer/WrapTarget configuration, or cage UV matching.
- No Roblox avatar fitting, Roblox Studio round-trip, or wearable/static Roblox readiness validator.
- No FBX exporter. Generic FBX file-extension acceptance/import mention is not proof of export capability.
- GLB/glTF acceptance by Roblox does not by itself prove this app's assets import with the intended Roblox avatar semantics, materials, scale, or appearance.
- General topology, UV, retopology, PBR, and bake tools do not guarantee production-ready or marketplace-accepted assets.
- Android performance on any particular phone and large-scene limits were not measured; mobile controls and file delivery are browser-oriented.
- Marketplace moderation and publishing acceptance cannot be concluded from repository code or successful export.
