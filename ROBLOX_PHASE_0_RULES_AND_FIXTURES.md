# Roblox Phase 0 — Rules and Fixtures

**Phase:** 0 — Rules and Fixtures
**Audit date:** 2026-11-25
**Repository changes:** this document only. No source code, application configuration, or test implementation was changed. Roblox reference ZIPs were downloaded to a temporary directory for inspection; they are not repository assets.

## 1. Decisions

### First static asset profile: `static_prop_mesh_v1`

Use a **small, closed, stylized wooden crate prop** as the first static validator target. It is representative of a Roblox experience prop while avoiding rigging, cages, accessory attachments, multi-part assembly, and avatar-specific policies. Use a single render mesh and one material for this pilot fixture. This is a test-fixture simplification, not a Roblox rule that every static asset must be one mesh or one material.

- Roblox-grounded constraints for the pilot: individual mesh ≤20,000 triangles; non-zero volume; watertight geometry with no exposed holes/backfaces; quads where practical; one UV set with UV coordinates in `[0,1]`; one assigned material per mesh. Static texture image formats/resolution must be interpreted carefully (see unresolved rules below).
- Internal product target (not a Roblox limit): keep the first crate comfortably below the Roblox ceiling, favoring a few thousand triangles or less and a single 512×512 color map. The specific mesh and texture budgets are fixture choices for repeatable testing, not marketplace acceptance criteria.
- Scale/pivot: record the intended dimensions, units, origin, and resting plane in fixture metadata. Do not claim a universal Roblox “correct prop scale”; Studio insertion/use case determines reasonable scale. Test that the app can compare scene/export bounds with explicit target values.
- Do not test Marketplace policy, rigid accessories, animation, collision quality, or Creator Store package dependencies in this first profile.

### First wearable profile: `layered_tshirt_v1`

Prepare for a **layered T-shirt/top** over Roblox's standard R15 reference. This is a realistic next wearable because Creator Hub gives explicit constraints for geometry, size, attachments, weights, cages and cage naming. It is preparation only; no wearable workflow is implemented in Phase 0.

- Roblox-grounded constraints: one render mesh; ≤4,000 triangles; watertight/no exposed holes or backfaces; maximum dimensions 8×8×8 studs centered on the attachment point for T-shirt/shirt/sweater/jacket/pants/shorts/dress/skirt; Marketplace texture resolution ≤2048×2048; at least one attachment (layered tops use `BodyFrontAttachment`); weighted and bound to R15; no more than four bone influences per vertex; inner and outer cages; cage object names use the primary accessory name plus `_InnerCage` and `_OuterCage`; preserve cage vertices/topology and UVs from the official template.
- Fixture choice: a short-sleeved T-shirt with a single render mesh, one color texture, one official R15 rig reference, and the official full-body clothing inner/outer cage. This defines a validator test target, not an assertion that Mesh Editor can produce it today.
- Initial category is T-shirt only. Do not generalize its constraints to shoes, eyebrow/lash accessories, rigid accessories, avatar body cages, or all UGC categories.

### Official references to use

Use Roblox's current **Standard R15 Rig and Attachments** and **Cages for Clothing** project files from Creator Hub. Keep **Combined Project Files** as a reference cross-check, not a second independent source of template topology. Roblox describes these downloads as project files for third-party applications and says they are not suitable for direct Studio import.

The official resource page also offers **Cages for Bodies** containing 15 body-part cages. That is not required for the first T-shirt accessory validator profile; reserve it for a later avatar-body/WrapTarget profile.

## 2. Creator Hub audit and sourced rules

Pages were re-opened from the official English Roblox Creator Hub on 2026-11-25. They were available and show ©2026 Roblox. The archive links resolve to `prod.docsiteassets.roblox.com`. URLs and facts below should be rechecked when profile rules are implemented because Creator Hub pages and marketplace requirements can change.

| Topic | Source-grounded rule | Status for Phase 0 |
|---|---|---|
| General geometry | Each individual mesh ≤20,000 triangles; watertight with no exposed holes/backfaces; use quads where possible; non-zero volume. | **Sourced** in [General specifications](https://create.roblox.com/docs/art/modeling/specifications). Apply only to static mesh profile unless a more specific category rule overrides it. |
| Static model import | Studio importer accepts `.fbx`, `.obj`, `.gltf` and `.glb` (glTF documentation covers GLB); FBX/glTF support hierarchies, PBR textures, cages, rigs, avatar components, animation and vertex colors. | **Sourced** in [Importer](https://create.roblox.com/docs/studio/importer). Import success still requires a Studio test. |
| Static texture basics | Separately uploaded images can be PNG, JPG, TGA, BMP; the general page says up to 4096×4096 and one material assigned per mesh. | **Sourced**, but the same page has a separate UV/map resolution statement that conflicts; do not encode a static PBR maximum until resolved. [Texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications). |
| UV | One UV set per component; coordinates in 0:1; UV overlap is allowed. | **Sourced** in [Texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications). An app may flag overlap diagnostically but must not call overlap alone a Roblox failure. |
| PBR normal map | Roblox specifies OpenGL tangent-space normal maps; Albedo RGB 24-bit, Normal RGB 24-bit, Roughness/Metalness/Emissive grayscale 8-bit. | **Sourced** in [Texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications). App's final channel/color-space conversion remains unverified. |
| General rig/skinning | Root joint at (0,0,0); ≤4 influences; no Root influences; bone transforms frozen/identity scale and rotation; symmetry when possible. | **Sourced** in [General specifications](https://create.roblox.com/docs/art/modeling/specifications). Character-body-specific rules may add more constraints. |
| Standard R15 | Standard R15 uses a specific hierarchy/naming; reference files include the standard R15 rig and attachments. | **Sourced** in [Character body specifications](https://create.roblox.com/docs/avatar/character-bodies/specifications) and [Avatar resources](https://create.roblox.com/docs/avatar/resources). Use the official rig file as fixture truth for the actual file structure; do not infer transforms from a generic rig. |
| Layered T-shirt geometry | Single render mesh; ≤4k triangles; watertight; quads where possible; T-shirt class max size 8×8×8 studs, centered on attachment point. | **Sourced** in [Layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications). The category is intentionally narrow. |
| Layered wearable rig/cage | Weighted/bound to R15; max four influences; inner and outer cages required; names append `_InnerCage`/`_OuterCage`; preserve cage vertices and UVs. | **Sourced** in [Layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications) and [caging best practices](https://create.roblox.com/docs/avatar/layered-accessories/caging-best-practices). |
| Layered top attachment | At least one attachment; a layered top maps to `BodyFrontAttachment`; importer can recognize `_Att` mesh naming when importing caged data. | **Sourced** in [Layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications). Verify exact importer behavior with fixture in Studio. |
| Layered Marketplace texture | Layered accessory Marketplace assets ≤2048×2048. | **Sourced** in [Layered accessory specifications](https://create.roblox.com/docs/avatar/layered-accessories/specifications). This is not a universal cap for every Roblox texture use. |
| Layered fit | Clothing mesh should sit between inner/outer cages; cages should remain template-derived; outer cage should encompass the item without broken topology/UV mapping. | **Sourced as best practice** in [caging best practices](https://create.roblox.com/docs/avatar/layered-accessories/caging-best-practices). Geometry-distance thresholds need category-specific verification. |
| Platform validation | Roblox UGC checks include cage/mesh distance, cage UV validity/count, and category-dependent fit conditions. | **Examples sourced** in [UGC validation system](https://create.roblox.com/docs/marketplace/validation-system). Published examples do not prove an app can reproduce Roblox's complete validator. |
| Reference file availability | Official downloads exist for Standard R15 Rig and Attachments, Cages for Clothing, Cages for Bodies, and Combined Project Files. Project files are not intended for direct Studio import. | **Sourced** in [Avatar resources](https://create.roblox.com/docs/avatar/resources). |

### Contradictory or profile-dependent requirements

1. **Static texture-size wording:** the Texture Specifications page says general image textures may reach 4096×4096, then says texture-map UV spaces support up to 1024×1024. Roblox's Creator Store guidance and asset-category pages may impose other budgets. Phase 1 must not create a single hard static PBR cap from these statements; record image pixel dimensions and UV set/resolution separately, surface a policy warning, and resolve against the current texture budget documentation and Studio importer for the chosen publishing use case.
2. **“Quads where possible” is guidance, not a deterministic pass/fail threshold.** A validator may report n-gons/triangulation for review but should not fail a static prop based only on the word “possible.” For layered items, check the category's explicit requirements and report any heuristic separately.
3. **Watertightness test semantics:** docs state the outcome (no holes/exposed backfaces), but not a complete algorithm for all non-manifold geometry. Implementing a boundary-edge test alone is not enough to prove a mesh is watertight if non-manifold edges, duplicate shells, or self-intersections remain.
4. **Scale/orientation/pivot:** the official docs give category-specific measured dimensions and attachment centering for avatar accessories, and general guidance that a model be reasonably scaled/oriented. They do not define one universal scene-unit conversion or pivot for all static props.
5. **Fit/cage thresholds:** UGC validation docs expose examples and some dynamic/configured threshold values, but a local checker must not claim exact Roblox pass/fail equivalence unless the rule and threshold are explicit, stable, and independently validated.
6. **Normal/material import:** an image's channel format can be checked locally; the exact final appearance after Babylon glTF serialization and Studio import needs a real import/visual check.

## 3. Official reference archives prepared

The following official downloads were retrieved into `/tmp/roblox_phase0_refs/` on the audit date and inspected as ZIP archives. Their source and checksums are recorded to make later fixture ingestion reproducible. These are **not** generated templates and are **not committed to the repository** in this phase.

| Official archive | Contents observed | SHA-256 |
|---|---|---|
| [Rig and Attachments Templates](https://prod.docsiteassets.roblox.com/assets/modeling/meshes/reference-files/Rig_and_Attachments_Templates.zip) | `Rig_and_Attachments_Template.blend`, `.ma`, `.fbx` | `e96e8483143716b49369e8692f2c2c2c7ae0d3a3d936b58cf3b5dae73148ff7b` |
| [Clothing Cage Templates](https://prod.docsiteassets.roblox.com/assets/modeling/meshes/reference-files/Clothing_Cage_Templates.zip) | `Clothing_Cage_Template.blend`, `.ma`, `.fbx` | `7a23dc3dbbfa4a2fe72383a4f59a6abd1f701aabcecad0072e91809ac6742e4b` |
| [Combined Templates](https://prod.docsiteassets.roblox.com/assets/modeling/meshes/reference-files/Combined_Templates.zip) | `Combined-Template.blend`, `.ma`, `.fbx` | `14bb469916d34cb68abc75b4c08eed54f826e4ba8af6e4bc4808fbeb3250d3bc` |

**Recommended fixture sourcing:** use the first two archives as the primary references and the combined archive only to compare expected rig/cage/attachment relationships. Before adding the ZIPs to version control, check Roblox's terms for redistribution and agree whether the project keeps binary files or retrieves them by pinned URL/checksum. Preserve original archive bytes; store any conversion as a derived fixture with the conversion tool/version and a hash. Never overwrite the official source with a converted file.

**Import-path finding:** archive files are `.blend`, `.ma`, and `.fbx`; this repo has no native `.blend`/`.ma` importer, and `TECHNICAL_ARCHITECTURE.md` records FBX loading as unverified. The current UI's `.fbx` allowlist is not proof that FBX can be loaded. Existing GLB/glTF loading is available. Thus Phase 1 can test generic static validation now, but cage/R15 fixtures need a verified conversion/import path that preserves names, mesh topology, UVs, transforms, joints and weights. The safest fixture strategy is: retain official archives untouched; independently export a derived GLB/glTF from the official source in a supported DCC tool; compare the derived artifact against the source in that DCC; then import and inspect the derived file in Mesh Editor and Studio. Do not use a converted file as the sole source of truth for cage topology.

## 4. Fixture set for Phase 1 — Roblox Asset Validator

No application fixtures or tests are implemented by Phase 0. The following are specifications for the Phase 1 fixture set.

### 4.1 Static fixture set

| Fixture ID | Fixture | Purpose / expected result |
|---|---|---|
| `S-STATIC-VALID-CRATE` | Closed, beveled low-poly crate, one render mesh, one material, one 512×512 PNG color texture, one UV set in 0:1, authored dimensions/origin recorded in fixture metadata. | Pass source-grounded static geometry/UV/texture checks. 512×512 is the pilot fixture choice, not Roblox's upper bound. |
| `S-STATIC-TRI-OVER` | Same crate with a controlled mesh copy over 20,000 triangles. | Fail static geometry budget, measured per individual mesh. |
| `S-STATIC-OPEN-BOUNDARY` | Crate copy with one face removed. | Fail watertightness/boundary diagnostic. |
| `S-STATIC-ZERO-THICKNESS` | Single plane used as a supposed solid prop. | Fail non-zero-volume requirement. |
| `S-STATIC-NONFINITE` | Mesh data fixture with NaN/Infinity position. | Fail local data-integrity check; this is an app robustness test, not a stated Roblox-specific numeric limit. |
| `S-STATIC-UV-OOB` | Crate copy with one UV coordinate outside 0:1. | Fail UV coordinates rule. |
| `S-STATIC-UV-OVERLAP` | Crate with intentionally overlapping mirrored UV islands inside 0:1. | Do not fail solely for overlap; report overlap as informational because Creator Hub permits overlap. |
| `S-STATIC-MULTI-UV` | Crate with more than one UV set. | Fail Studio UV-set compatibility check. |
| `S-STATIC-TEXTURE-FORMAT` | Separate texture assets for PNG/JPG/TGA/BMP and an unsupported extension. | Accept the documented separate image formats; reject or warn on unsupported format. Embedded glTF image handling needs its own test. |
| `S-STATIC-EXPORT-ROUNDTRIP` | Valid crate exported to GLB and reopened using editor loader; compare bounds, triangle count, UV count, texture references, material and node names. | Pass file-integrity comparison; explicitly does **not** equal Roblox Studio verification. |

### 4.2 Official wearable reference fixture set

| Fixture ID | Fixture | Purpose / expected result |
|---|---|---|
| `W-R15-OFFICIAL-SOURCE` | Untouched `Rig_and_Attachments_Template` from official archive, with source ZIP checksum recorded. | Reference for R15 hierarchy/names, attachment positions, bind pose and source node structure. Do not fail it for unrelated finished-avatar content. |
| `W-CLOTHING-CAGE-OFFICIAL-SOURCE` | Untouched `Clothing_Cage_Template` from official archive. | Canonical source for full-body inner/outer cage geometry/topology/UV matching. No mesh generated by the app may replace this fixture. |
| `W-COMBINED-OFFICIAL-CROSSCHECK` | Untouched `Combined-Template` from official archive. | Secondary reference to compare rig/cage/attachment placement. Not a substitute for the dedicated sources. |
| `W-TShirt-VALID-DERIVED` | Derived, documented T-shirt + official R15/cage GLB/glTF fixture, converted from the official source using a recorded DCC and settings. | Pass sourced checks: ≤4,000 render triangles, size ≤8×8×8 studs centered on attachment, one render mesh, required R15/weight/cage/attachment metadata, cage source topology/UV preserved. Exact native parse may be Not Tested until conversion path verified. |
| `W-TShirt-CAGE-TOPOLOGY` | Derived cage with a vertex/face removed or indices altered relative to official source. | Fail topology correspondence. |
| `W-TShirt-CAGE-UV` | Derived cage with a changed UV coordinate/value while all else fixed. | Fail immutable template UV correspondence. |
| `W-TShirt-CAGE-NAME` | Same cage geometry with missing/wrong `_InnerCage` or `_OuterCage` name. | Fail importer recognition/naming rule. |
| `W-TShirt-TRI-OVER` | T-shirt render mesh just above 4,000 triangles. | Fail layered accessory category budget (do not use static 20,000 ceiling here). |
| `W-TShirt-SIZE-OVER` | Fixture exceeds one or more 8-stud category extents relative to attachment origin. | Fail layered T-shirt size rule. Requires verified unit conversion and attachment-space measurement; otherwise Not Tested. |
| `W-TShirt-WEIGHTS` | Vertices with 5 influences, an out-of-range joint index, non-normalized weights, and root influence variants. | Fail the relevant sourced R15 checks, individually reported. |
| `W-TShirt-STUDIO-IMPORT` | Valid derived wearable imported through Roblox Studio Importer with Uses Cage enabled. | Human/manual acceptance fixture: record warnings, detected WrapLayer/cage hierarchy, and fitting outcome. Cannot be passed by the app-only test runner. |

**Fixture hygiene:** fixtures must be read-only source copies. Invalid fixture variants should be generated in test memory or from disposable copies and clearly named; never mutate the official ZIP contents. Keep source ZIP SHA-256, extracted-file names, derived file hash, DCC version, export settings, and Studio version together in future fixture metadata.

## 5. Test cases and Phase 1 expectations

1. **Profile isolation:** a valid crate is evaluated only against `static_prop_mesh_v1`; the T-shirt is evaluated only against `layered_tshirt_v1`. Wrong/missing category yields a blocking profile error, not fallback to generic defaults.
2. **Triangle counts:** exact-boundary static 20,000 passes and 20,001 fails; layered 4,000 passes and 4,001 fails. Count triangles from actual indexed/non-indexed geometry, per mesh; document how strips/fans are triangulated. Use boundary fixtures to detect off-by-one errors.
3. **Geometry:** valid closed crate passes; removed face and zero-thickness mesh fail; nonfinite values fail; non-manifold and self-intersection cases receive distinct diagnostic coverage or `NOT_TESTED` until supported. A boundary-edge-only implementation may not claim complete watertightness.
4. **UV:** one UV set in `[0,1]` passes; out-of-range coordinate and second UV set fail; overlapping UV islands do not fail by themselves; zero-area UV triangles are checked for cages and reported using sourced UGC validation examples.
5. **Textures/material:** check actual image dimensions/format and references, one material per mesh, normal-map channel/orientation metadata when available. Do not hardcode the conflicting static PBR max until clarified. Verify final channel interpretation via Studio import, not a file-level check alone.
6. **R15 hierarchy:** compare derived glTF bones/names/parents/transform data with the official reference fixture; generic `WeightPaintController.createAutoRig()` is not an acceptable expected result. Any unparseable or unverified field returns `NOT_TESTED`, never pass.
7. **Weight constraints:** test max four influences, valid joint indices, finite nonnegative values, normalized weight sums, and root influence restriction. The relevant checks are independently reported.
8. **Cage integrity:** compare cage vertex counts, face/index topology, and UV arrays with the exact matching source template; confirm node naming and distinct inner/outer roles. Check that geometry edits don't silently alter the protected source.
9. **Scale/attachment:** compare in attachment-relative coordinates and explicit unit metadata. No pass until unit conversion is known. For T-shirt, test 8-stud maximum extents and `BodyFrontAttachment` per the category profile.
10. **Export preflight / postflight:** reject missing required nodes, missing texture dependencies, stale report, unsupported format, or invalid data; GLB/glTF should reopen and preserve measured data within a documented floating-point tolerance. Test both serializer output and Studio Importer separately.
11. **Report integrity:** each rule has a stable check ID, measured value, expected sourced/profile value, source URL, severity, mesh ID, and `PASS`/`FAIL`/`WARNING`/`NOT_TESTED`. Editing any dependent mesh/UV/material/rig/cage invalidates affected results.
12. **Studio acceptance:** a local validator pass must show a distinct `Studio import not tested` state until the T-shirt is manually imported with Uses Cage enabled and its cage/wrap and fit are inspected. Marketplace acceptance remains outside local acceptance.

## 6. Repository fit and readiness

### Reusable as-is

- `src/MeshEditorService.ts`: Babylon scene, mesh lifecycle, transforms, selection, action history, and GLB/glTF export/import. `exportCurrentModel()` supports GLB, glTF, OBJ, STL, and Babylon serialization; no FBX export branch exists.
- `src/sculpting/SculptController.ts`: `analyzeTopology()`, `retopologizeMesh()`, `shrinkwrapMesh()`, `generateQuadFlowCage()`. These are general mesh tools; `generateQuadFlowCage()` is not an official Roblox cage.
- `src/uv/UVUnwrapController.ts`: `analyzeUVs()`, `unwrapMesh()`, packing, seam and texel-density operations. Its general analysis is a base, not Roblox policy validation.
- Existing material/texture systems (`src/materials/`, `src/painting/`, `src/textures/`, `src/baking/`) can supply asset data; Roblox SurfaceAppearance conversion is unverified.
- `src/rigging/WeightPaintController.ts`: generic Babylon skeleton and weight arrays, painting, heatmap, pose, and glTF export preparation. `createAutoRig()` emits generic `Root/Hips/Spine/UpperArm_L` style names; do not treat it as an R15 rig.
- `src/tools/ToolRegistry.ts`, `src/AIAgentService.ts`: tool dispatch and scene context can later expose validator calls; no Roblox-specific tools exist.
- `src/adapters/BrowserPlatformAdapter.ts` and `ElectronPlatformAdapter.ts`: file delivery mechanisms exist, but no special Roblox integration is present. Android resolves through browser behavior in WebView.

### Missing or insufficient for Phase 1

- No typed Roblox requirement profiles, `RobloxAssetValidator`, categorized export-readiness report, mesh integrity/watertightness proof, scale-unit convention, R15 rule module, cage template catalog, cage correspondence validator, Roblox attachment/wrap model, or Studio import result record.
- No native `.blend` or `.ma` loader; FBX remains unverified despite extension allowlisting. Existing GLB/glTF is a feasible interchange format, but derived official templates need fidelity checks.
- Existing `analyzeTopology()` and `analyzeUVs()` are generic; Phase 1 must compose their useful results and add Roblox-specific checks instead of replacing either subsystem.
- Babylon metadata can carry editor annotations, but no Roblox asset manifest type or persistence contract is established. Before implementation, decide whether the profile/validation report belongs in project metadata, a sidecar JSON, or both.
- Existing undo/history and AI action grouping can support safe repairs, but a validation result must be invalidated after any dependent edit. Existing AI error handling can leave earlier tool mutations in the scene, so validator execution should remain read-only and later repairs must be separate, undoable actions.

## 7. Phase 1 — Roblox Asset Validator acceptance criteria

Phase 1 is acceptable when all of the following are true:

1. `static_prop_mesh_v1` and `layered_tshirt_v1` are distinct, versioned profiles with each rule linked to its Creator Hub source and identified as a hard rule, guidance, internal fixture choice, or unresolved.
2. Static tests pass/fail the sourced 20,000-triangle ceiling, non-zero thickness, watertightness diagnostics, one UV set, UV 0:1, documented texture file formats, and one material per mesh without falsely failing UV overlap alone.
3. Layered T-shirt tests separately verify the 4,000-triangle ceiling, 8-stud extents in known units, R15 mapping, max-four influences/root constraint, attachment rule, cage naming, cage template topology and UV preservation.
4. Test output explicitly returns `NOT_TESTED` for rules needing unavailable importer semantics, unresolved texture max, or unsupported mesh integrity algorithms; it never upgrades those to pass based on absence of an error.
5. The official source archives remain immutable and pinned by source URL/checksum. Any derived GLB/glTF fixture records its conversion provenance and has been compared back to the source.
6. Export postflight checks data in the generated file; Roblox Studio import/fitting is tracked as a separate manual integration gate with recorded Studio version and importer results.
7. Reports are deterministic for unchanged input, diagnostics identify the responsible mesh/attribute, and edits invalidate stale checks.
8. Existing generic mesh editors, UV tools, rigging and retopology remain intact; validator consumes their outputs and does not duplicate or replace them.

## 8. Risks and open questions

- **Static PBR resolution conflict:** Roblox's Texture Specifications page has 4096×4096 image support but also a 1024×1024 texture-map-space statement. Need current PBR texture budget details and a Studio test before selecting a hard static profile cap.
- **Template distribution rights:** source URLs are official, but repository redistribution terms for binary archives were not assessed. Keep temporary downloads untracked until terms are checked and team chooses pin-vs-fetch policy.
- **Loader fidelity:** official templates are primarily Blend/Maya/FBX. This application currently has no verified FBX reader. Conversion may alter names, transforms, skin weights, index topology, or UV values; need a reproducible path and source comparison.
- **No direct Roblox validator API:** Creator Hub's public examples do not establish that Roblox's full UGC validator is exposed to this app. Local report must be described as preflight only.
- **Scale semantics:** app source uses scene dimensions but no verified Roblox-stud convention or import scale mapping. A false unit assumption would make size reports unreliable.
- **Watertightness complexity:** closed boundary edges are necessary but may not cover self-intersection, internal shells, duplicate faces, or all backface conditions. Use separate findings and avoid overclaiming.
- **R15 rig truth:** textual docs establish names/hierarchy constraints; actual transforms and all attachment coordinates should be read from the pinned official rig file, not reconstructed from memory.
- **Marketplace vs in-experience use:** Marketplace clothing caps/policies and general in-experience meshes differ. Keep profile named and scoped; do not reuse UGC requirements for every imported game prop.
- **Reference drift:** Roblox archives can change at stable URLs. Re-fetch hashes only as an explicit profile update, compare archive contents, and rerun fixtures before changing a pinned profile version.

## 9. Recommended next implementation step

Proceed to **Phase 1 — Roblox Asset Validator** with the static prop profile first. Begin with read-only geometry/UV/transform/texture inspection and reports; add static profile tests before implementing repairs or AI production automation. In parallel, validate a reproducible conversion of the official R15 and Clothing Cage source archives into test-readable GLB/glTF artifacts without modifying the official source files. Keep the layered T-shirt profile in a “reference fixture prepared / Studio check pending” state until the conversion and manual Studio import are demonstrated.
