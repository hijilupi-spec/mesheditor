# Roblox Phase 1 — Asset Validator Foundation

**Implementation date:** 2026-11-25  
**Scope:** Read-only local preflight for `static_prop_mesh_v1`; preparation and explicitly unverified checks for `layered_tshirt_v1`.  
**Roblox Studio / Marketplace validation:** Not performed.

## 1. Repository audit

The implementation was integrated with the existing Babylon.js scene and decentralized editor-tool architecture. No sculpting, UV, material, rigging, generic editor, or AI modeling behavior was replaced.

| Area | Existing API / source | Phase 1 use and boundary |
|---|---|---|
| Scene and mesh lifecycle | `src/MeshEditorService.ts`: public `scene`, `importedMeshes`, `isEditorHelper()`, enabled scene meshes, `scene.onSceneModified` callback | Validator reads enabled non-helper `Mesh` objects from the actual scene. It does not mutate mesh buffers. |
| Sculpt/topology | `src/sculpting/SculptController.ts`: `analyzeTopology()`, `retopologizeMesh()`, `shrinkwrapMesh()`, `generateQuadFlowCage()` | Existing methods are general editing/diagnostic tools; Phase 1 does not invoke repair/retopology. Generic cages are not Roblox cages. |
| UV | `src/uv/UVUnwrapController.ts`: `analyzeUVs()`, `unwrapMesh()` and Babylon UV vertex buffers | Validator reads UV1–UV6 buffers directly. It does not edit UVs. UV-island overlap is not implemented. |
| Material/texture | `MeshEditorService.getActiveMaterialTexturesInfo()` and scene texture scanning; Babylon `StandardMaterial`, `PBRMaterial`, `Texture`; material UI in `src/tools/editor/MaterialEditorTool.ts` | Validator reads material slots, texture references/formats and Babylon-reported dimensions. Pixel channel/color-space correctness is not inferred. |
| Geometry representation | Babylon `Mesh.getVerticesData()`, `getIndices()`, `VertexBuffer` | Indexed triangle-list count is `indices.length / 3`; non-indexed count is `floor(positionVertexCount / 3)`. Incomplete trailing entries are ignored. Babylon mesh render geometry is already represented as triangle lists; strip/fan expansion is not performed here. |
| Project persistence | `src/MeshEditorService.ts`: Babylon `SceneSerializer.Serialize(scene)` for `.babylon`; import paths restore `scene.metadata.meshEditor` | Validator manifest/report are stored in scene metadata and therefore travel with Babylon scene serialization. A downloadable JSON sidecar is also offered. GLB/glTF metadata is not treated as a durable validator project store. |
| GLB export | `MeshEditorService.exportToGLBBlob()` and `GLTF2Export.GLBAsync()` | Postflight reads the emitted GLB v2 container, glTF JSON, primitive/accessor triangle totals and UV0 presence. It does not reopen through the app's loader or prove Roblox Studio compatibility. |
| Undo/history | `MeshEditorService.recordAction()`, `undo()`, `redo()`, `events.onSceneModified` | Validator creates no history action because it is read-only. The tool wraps existing scene/texture notifications while open and invalidates its report; fingerprints detect direct edits to captured scene data. |
| UI/tool registration | `AbstractEditorTool`, `ToolInterface`, `createBuiltinEditorTools()` in `src/tools/editor/index.ts`, EJS views synchronized by `scripts/sync-templates.js` | Added one normal Tools-menu panel. No toolbar quick toggle or duplicate inspector panel was added. |
| Platform/file adapters | `src/adapters/PlatformAdapter.ts`, `BrowserPlatformAdapter.ts`, `ElectronPlatformAdapter.ts`; export delivery event in `src/MeshEditorApp.ts` | GLB file selection and JSON report download use browser file APIs. Native Android/Electron file-provider behavior was not tested; no Roblox-specific platform adapter exists. |
| Tests | Vitest, JSDOM, `vitest.config.ts`, `tests/integration/**/*.test.ts` | Added focused validator integration coverage and fixture factories; the general suite has not yet been run. |

`/tmp/roblox_phase0_refs/` contains the three Phase 0 official ZIPs, but those files are outside the repository. The archives contain `.blend`, `.ma`, and `.fbx`; there is no verified `.blend`/`.ma` loader, FBX input fidelity has not been verified, and no source-to-GLB conversion path has been validated. No official R15/cage fixture was copied, synthesized, or passed off as verified by this implementation.

## 2. Validator architecture

| Component | Location | Technology | Responsibility | Status |
|---|---|---|---|---|
| Typed profiles and rules | `src/robloxAssetValidator/RobloxRequirementProfiles.ts` | TypeScript | Versioned asset profiles, stable rule IDs, category, expected value, severity, Creator Hub URL, review date, and rule classification | **Implemented** |
| Read-only scene validator | `src/robloxAssetValidator/RobloxAssetValidator.ts` | TypeScript + Babylon.js scene/mesh buffers | Geometry, transform, UV, material, texture, layered-profile checks, report generation, fingerprint, GLB postflight | **Partially Implemented** |
| Static test fixture builders | `tests/fixtures/robloxStaticFixtures.ts` | Babylon.js + Vitest | Builds named in-memory positive and negative mesh data | **Partially Implemented** |
| Validator UI | `src/tools/editor/RobloxAssetValidatorEditorTool.ts` and `.ejs` | Existing `AbstractEditorTool`, EJS, browser file APIs | Profile selector, counts, result/source detail, revalidate, GLB postflight upload, JSON download | **Implemented** |
| Report persistence | `scene.metadata.robloxAssetManifest`, `scene.metadata.robloxAssetValidation` | Babylon scene metadata; JSON sidecar | Project-local metadata persistence in `.babylon` scene serialization and manual JSON download | **Partially Implemented** |

Unknown profile IDs throw an explicit error. No generic fallback profile exists. `RobloxRequirementProfiles` carries separate `OFFICIAL_HARD_RULE`, `OFFICIAL_GUIDANCE`, `INTERNAL_TARGET`, and `UNRESOLVED` classifications. A static fixture's requested dimensions are labeled internal fixture metadata, not a universal Roblox prop size.

## 3. Implemented static checks

`RobloxAssetValidator.validate()` reports checks per mesh and retains local preflight as a distinct stage. Check results contain a stable check ID, profile ID/version and validation timestamp on each result, status, severity, actual and expected values, source URL, mesh/node identifier (null for scene-wide checks), explanation, and a suggested action including defaults for pass/not-tested results.

| Check | Behavior |
|---|---|
| Scene/empty mesh | Detects absence of enabled render meshes, zero vertices, and zero complete triangles. |
| Triangle budget | Counts indexed triangles or sequential non-indexed triples per mesh. `20,000` passes and `20,001` fails for static props; layered T-shirt uses `4,000`. |
| Vertex/position integrity | Reports vertex count and fails missing/non-finite position buffers. |
| Degenerate triangles | Flags zero-area/non-finite triangles and invalid triangle indices. |
| Edge topology | Counts boundary and greater-than-two-use non-manifold edges. For this diagnostic only, positions rounded to `1e-6` are treated as coincident to reduce false seams from split UV vertices. |
| Volume | Computes signed tetrahedron sum magnitude in local mesh coordinates. It does not establish closedness; open/inconsistently-oriented surfaces can make this estimate misleading. |
| Watertight claim | Always `NOT_TESTED`: boundary/non-manifold checks alone do not prove watertightness. Self-intersection and duplicate-face checks are also `NOT_TESTED`. |
| Dimensions/transforms | Reports world-space bounds, position, Euler rotation/quaternion, scale, pivot, unit metadata and intended resting-plane metadata. Static dimensions compare to explicit `mesh.metadata.targetDimensions` if provided. No Babylon-unit-to-stud assumption is made. |
| UV sets/range | Reads populated UV1–UV6 buffers; one populated set passes, multiple fail; UV1 coordinates outside `[0,1]` fail. Missing UV data is `NOT_TESTED`. |
| UV area/overlap | Zero-area UV triangles are diagnostic. UV overlap is `NOT_TESTED` and does not fail by itself. |
| Material | Checks material presence and one material slot per mesh for these two profile targets. |
| Texture | Lists texture references, extension/data-MIME-derived format and Babylon-reported image dimensions. Unknown formats fail the supported separate-image format check. Static resolution is reported separately and has no encoded hard maximum. |
| Normal map | Reports whether a PBR normal/bump texture exists and available metadata; source pixel convention is not inferred. Present normal-map format is `NOT_TESTED`. |

Static source rules come from Roblox [general modeling specifications](https://create.roblox.com/docs/art/modeling/specifications) and [texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications), re-opened on 2026-11-25. The texture page currently states 4096×4096 supported image resolution and also a maximum 1024×1024 texture-map space. In keeping with Phase 0, this implementation reports actual image dimensions and encodes no static PBR hard cap. UV overlap remains allowed.

## 4. Layered T-shirt profile preparation

`layered_tshirt_v1` is versioned and uses separate 4,000-triangle, single-render-mesh, 8×8×8-stud, Marketplace texture, `BodyFrontAttachment`, R15, influence, cage-name, cage-topology, cage-UV and transform rules from current [layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications), [general specifications](https://create.roblox.com/docs/art/modeling/specifications), and [caging best practices](https://create.roblox.com/docs/avatar/layered-accessories/caging-best-practices).

The validator measures render mesh count/triangle count, required attachment/cage node names, image dimensions, and skin influence buffers when available. A name check is only a name check: it is not equivalent to Studio importer recognition or proof of official cage identity. It deliberately returns **`NOT_TESTED`** for official R15 hierarchy/bind mapping, unavailable weight semantics/root mapping, official cage topology/UV correspondence, and stud/attachment-relative dimensions. A Babylon generic skeleton or quad-flow cage cannot satisfy those reference checks. Roblox Studio fitting, import warnings, UGC/Marketplace validation and approval are outside the app-only report.

| Layered check | Status |
|---|---|
| Render mesh count and 4,000 triangle budget | **Implemented** from current scene data |
| `BodyFrontAttachment` candidate node name | **Implemented** as a name-presence check; importer recognition/behavior remains unverified |
| 8-stud dimensions | **NOT_TESTED** until unit conversion and attachment-relative measurement are verified |
| R15 hierarchy/bind pose | **NOT_TESTED**; official reference conversion path unavailable |
| Four influences/root restriction | **Partially Implemented**; positive weights, indices and influence count are checked when Babylon buffers/skeleton exist; official R15 bone identity is unverified |
| Inner/outer cage names | **Implemented** as exact expected-name check based on render mesh name; official cage identity is not proven |
| Official cage topology and UV correspondence | **NOT_TESTED**; source archive conversion/fidelity is unverified |
| Roblox Studio/Marketplace result | **NOT_TESTED** |

## 5. Reports, persistence and invalidation

Reports contain `schemaVersion`, `profileId`, `profileVersion`, the full typed requirement rule snapshot (including classification/source/review date), `stage`, `generatedAt`, a scene fingerprint, a `stale` flag, individual checks, optional `exportPostflight`, and an explicit `robloxStudioVerification` record. Current scene validation always has `stage: local_preflight`; the export check is kept as a separate postflight record, and Studio verification is `NOT_TESTED` with no timestamp. These separate fields do not erase local checks or imply Studio verification.

The fingerprint is a deterministic compact digest of mesh vertex buffers (positions, normals, tangents, UV sets, weights/indices), index buffers, transform/pivot, selected Roblox fixture metadata, material fields/identity, texture identity/URL/dimensions/normal-map metadata, and skeleton/bind-pose names and matrices. The report stores the digest, not mesh/material/texture objects or full geometry arrays. The panel marks reports stale when the editor emits scene or texture change notifications and also compares fingerprints on refresh/download. A stale report is not accepted for GLB postflight; the UI requires a revalidation first. Because direct in-place pixel mutation under the same texture identity and dimensions may not change the fingerprint, editor texture-change events also invalidate the report.

Persistence decision:

- **Project metadata:** manifest and latest report are stored in `scene.metadata.robloxAssetManifest` and `scene.metadata.robloxAssetValidation`; Babylon `.babylon` serialization serializes scene metadata. Importing into another project or exporting GLB/glTF is not claimed to preserve this project record.
- **Sidecar:** the user may download a JSON copy from the panel. This is a snapshot and is never a live reference to scene objects.
- **Not stored:** Babylon `Mesh`, `Material`, or `Texture` object references are not serialized into the report. Node identifiers are human-readable mesh name plus Babylon `uniqueId`.
- **Export postflight:** user selects an already exported GLB; the report records container integrity and geometry/accessor findings separately. It does not mutate meshes or create a GLB automatically.

## 6. Fixtures and tests

Fixture definitions are in `tests/fixtures/robloxStaticFixtures.ts`. All variants are generated in memory; the “valid crate” is currently a closed box-shaped proxy with target dimensions/material metadata, not a production-authored beveled wooden crate or a fidelity/quality benchmark.

| Phase 0 ID | Current fixture implementation |
|---|---|
| `S-STATIC-VALID-CRATE` | Closed box mesh proxy with one PBR material and target dimension metadata |
| `S-STATIC-TRI-OVER` | Indexed mesh with 20,001 explicit triangles |
| `S-STATIC-OPEN-BOUNDARY` | Box with one face removed from triangle indices |
| `S-STATIC-ZERO-THICKNESS` | Plane geometry applied to the fixture mesh |
| `S-STATIC-NONFINITE` | One NaN position component |
| `S-STATIC-UV-OOB` | UV coordinate exceeds 1 |
| `S-STATIC-UV-OVERLAP` | In-memory UV variant; overlap detection itself remains unsupported |
| `S-STATIC-MULTI-UV` | Additional UV2 vertex buffer |
| `S-STATIC-TEXTURE-FORMAT` | PNG data texture assignment |
| `S-STATIC-EXPORT-ROUNDTRIP` | Named closed mesh exported to GLB and inspected by GLB JSON/accessors |

Test file: `tests/integration/roblox-asset-validator.test.ts`. Coverage includes profile isolation/no fallback, static/layered budgets, exactly 20,000 vs. 20,001 triangles, open boundary, zero volume, non-finite positions, UV range/overlap policy/multiple sets, material and PNG format, layered `NOT_TESTED` states, deterministic checks, fingerprint invalidation, GLB container/accessor postflight and stage separation. Although the Phase 0 fixture ID retains “ROUNDTRIP”, present coverage parses the exported GLB and compares accessor triangle counts; it does not re-import the GLB through `MeshEditorService` and compare all metadata/texture/material state.

No dummy R15 or cage fixtures were generated. The official archives from Phase 0 remain outside the repo, and the converter/source comparison is still a blocker.

## 7. Test results

**Focused validator test:** `npx vitest run tests/integration/roblox-asset-validator.test.ts` — **12 passed, 0 failed, 0 skipped** on the final run (including report requirement snapshots, per-check metadata, layered name/influence checks, GLB postflight, and explicit Studio `NOT_TESTED`).

**Type check:** `npm run type-check` — **passed** (exit code 0). `git diff --check` completed without output. No full test suite or Playwright E2E run has been claimed.

## 8. Phase 0 acceptance review

| Phase 0 acceptance criterion | Result | Evidence / gap |
|---|---|---|
| Separate versioned profiles, sourced rules/classifications | **Met** | `RobloxRequirementProfiles.ts`, source URLs/review date and no generic fallback |
| Static boundary budget, non-zero volume, watertight diagnostics, UV, material and texture coverage | **Partially met** | Budget/material/UV/format/volume implemented; full watertight proof and UV overlap are explicitly `NOT_TESTED`; dimensions/format actual-data edge cases remain |
| Layered 4k, 8-stud, R15, weights, attachment and official cage checks | **Partially met** | Profile and scene interfaces prepared; only counts and candidate attachment name can be inspected; critical reference-dependent checks are `NOT_TESTED` |
| No false pass for unavailable importer semantics/texture resolution policy/integrity | **Met** | Distinct statuses; unresolved and unsupported checks remain not tested/warning |
| Official archives pinned in-repo and conversion provenance/source comparison | **Not met** | Source ZIPs remain outside repository; no verified conversion or derived official fixture |
| GLB/glTF export postflight plus separate Roblox Studio gate | **Partially met** | GLB v2/accessor postflight exists; no full loader roundtrip or Studio manual test |
| Deterministic report and stale invalidation | **Partially met** | Deterministic check data and geometry/material/skeleton fingerprint; notification-based invalidation; limits for pixel mutation noted |
| Existing generic systems retained; no duplicate mesh editor | **Met** | Read-only validator consumes Babylon scene buffers; existing generic editing systems are unchanged |

**Phase 1 acceptance as a whole: not complete.** The static validator foundation is implemented, but not every Phase 0 acceptance criterion can be claimed: official R15/cage conversion is unavailable, full watertight proof is beyond this implementation, export coverage is postflight inspection rather than full editor-loader roundtrip, and Studio import remains unverified.

## 9. Known limitations and risks

- This is a local preflight and diagnostic, not Roblox's own importer, UGC validator, Studio verification, or Marketplace approval.
- Boundary/non-manifold edges, volume estimate, and degenerate triangles do not detect all internal shells, duplicate faces, inconsistent closed components, or self-intersections.
- Rounded-position edge welding uses a fixed `1e-6` local tolerance; unusually tiny or very large meshes may need a scale-aware policy.
- PBR image resolution guidance remains unresolved in Phase 0; the app reports whatever dimensions Babylon exposes and no static maximum is encoded.
- Texture extension inference can be `unknown` for blob URLs or references without a recognizable extension/MIME. Unloaded textures may not expose dimensions.
- Image pixel channel depth, color-space conversion, normal-map orientation, and final Studio material fidelity are not verified.
- The static crate test is a geometric proxy, not the intended stylized asset quality fixture.
- The layered profile does not verify R15/cage requirements until official fixture ingestion and conversion fidelity are demonstrated.
- GLB postflight checks container/JSON/accessor data only; no GLB roundtrip through the app loader yet.
- UI/browser file APIs have not been manually tested on Android WebView or Electron adapters.
- Source scene/report snapshot is stored in Babylon scene metadata; JSON sidecar is manually downloaded and can become stale after the user downloads it.

## 10. Manual test steps

1. Open **Tools → Optimization → Roblox Asset Validator**.
2. Select `Static Prop Mesh v1`; create/select a closed solid mesh and run **Revalidate**.
3. Review per-mesh triangle count, bounds, transform/pivot, UV, material/texture diagnostics and all `NOT_TESTED` rows. Confirm no Roblox Studio verification is implied.
4. Change a mesh/UV/material/texture in the editor. Confirm the panel marks the report `STALE`, then revalidate before using the report.
5. Export a GLB through the existing application export command. In the panel choose **Check Exported GLB** and select that file. Review the independent GLB postflight result; this is not Studio verification.
6. Download the JSON report and verify the profile/version, timestamp, mesh IDs, source URLs, expected/actual values and statuses.
7. Select `Layered T-Shirt v1`; verify the profile remains independent and R15, weight, official cage, stud conversion and Studio checks remain `NOT_TESTED` without verified source fixtures.
8. Save a `.babylon` project, reopen it, and inspect the report metadata persistence. This manual persistence path has not yet been executed in this implementation run.

## 11. Files created or modified

**Created:**

- `src/robloxAssetValidator/RobloxRequirementProfiles.ts`
- `src/robloxAssetValidator/RobloxAssetValidator.ts`
- `src/tools/editor/RobloxAssetValidatorEditorTool.ts`
- `src/tools/editor/RobloxAssetValidatorEditorTool.ejs`
- `tests/fixtures/robloxStaticFixtures.ts`
- `tests/integration/roblox-asset-validator.test.ts`
- `ROBLOX_PHASE_1_IMPLEMENTATION.md`

**Modified:**

- `src/tools/editor/index.ts` — registration.
- `src/mesheditor.ejs` — panel inclusion.
- `scripts/sync-templates.js` — generated template registry.
- `src/tools/editor/toolViews.ts` and `src/template.ts` — generated by template synchronization.
