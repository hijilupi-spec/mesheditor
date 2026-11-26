import { AbstractMesh, Mesh, MultiMaterial, PBRMaterial, StandardMaterial, Texture, VertexBuffer } from '@babylonjs/core';
import { getRobloxRequirementProfile, RobloxAssetProfileId, RobloxRequirementRule } from './RobloxRequirementProfiles';

export type RobloxValidationStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_TESTED';
export type RobloxValidationStage = 'local_preflight' | 'export_verified' | 'roblox_studio_verified';

export interface RobloxCheckResult {
  checkId: string;
  profileId: RobloxAssetProfileId | 'pending';
  profileVersion: string;
  validatedAt: string;
  status: RobloxValidationStatus;
  severity: 'error' | 'warning' | 'info';
  actual: unknown;
  expected: unknown;
  sourceUrl: string;
  meshNodeId: string | null;
  explanation: string;
  suggestedAction: string;
}

export interface RobloxValidationReport {
  schemaVersion: 1;
  profileId: RobloxAssetProfileId;
  profileVersion: string;
  stage: RobloxValidationStage;
  generatedAt: string;
  sceneFingerprint: string;
  stale: boolean;
  requirements: RobloxRequirementRule[];
  checks: RobloxCheckResult[];
  exportPostflight?: { checkedAt: string; profileId: RobloxAssetProfileId; profileVersion: string; status: RobloxValidationStatus; filename: string; checks: RobloxCheckResult[] };
  robloxStudioVerification: { status: 'NOT_TESTED'; verifiedAt: null; explanation: string };
}

const GENERAL = 'https://create.roblox.com/docs/art/modeling/specifications';
const TEXTURE_DOC = 'https://create.roblox.com/docs/art/modeling/texture-specifications';
const LAYERED = 'https://create.roblox.com/docs/avatar/layered-accessories/specifications';
const CAGES = 'https://create.roblox.com/docs/avatar/layered-accessories/caging-best-practices';

function round(value: number): number { return Number.isFinite(value) ? Number(value.toFixed(6)) : value; }
function materialSlots(mesh: Mesh): any[] {
  if (!mesh.material) return [];
  return mesh.material instanceof MultiMaterial ? mesh.material.subMaterials.filter(Boolean) : [mesh.material];
}
function meshName(mesh: Mesh): string { return mesh.uniqueId !== undefined ? `${mesh.name}#${mesh.uniqueId}` : mesh.name; }
function textureList(material: any): Texture[] {
  const fields = ['albedoTexture', 'diffuseTexture', 'ambientTexture', 'bumpTexture', 'metallicTexture', 'roughnessTexture', 'emissiveTexture', 'opacityTexture', 'specularTexture'];
  const values: Texture[] = [];
  for (const field of fields) if (material?.[field] instanceof Texture && !values.includes(material[field])) values.push(material[field]);
  return values;
}
function textureFormat(texture: Texture): string {
  const source = `${texture.name || ''} ${texture.url || ''}`.toLowerCase();
  const match = source.match(/\.(png|jpe?g|tga|bmp)(?:[?#]|$)/);
  if (match) return match[1];
  if (source.includes('data:image/png')) return 'png';
  if (source.includes('data:image/jpeg')) return 'jpg';
  if (source.includes('data:image/bmp')) return 'bmp';
  if (source.includes('data:image/tga')) return 'tga';
  return 'unknown';
}
function result(checkId: string, status: RobloxValidationStatus, severity: RobloxCheckResult['severity'], actual: unknown, expected: unknown, sourceUrl: string, mesh: Mesh | undefined, explanation: string, suggestedAction?: string): RobloxCheckResult {
  const action = suggestedAction || (status === 'PASS' ? 'No action required.' : status === 'NOT_TESTED' ? 'Provide verified reference data or run the relevant external validation.' : 'Review this finding and address it before relying on the asset.');
  return { checkId, profileId: 'pending', profileVersion: 'pending', validatedAt: new Date().toISOString(), status, severity, actual, expected, sourceUrl, meshNodeId: mesh ? meshName(mesh) : null, explanation, suggestedAction: action };
}

function stampChecks(checks: RobloxCheckResult[], profileId: RobloxAssetProfileId, profileVersion: string, validatedAt: string): RobloxCheckResult[] {
  return checks.map((check) => ({ ...check, profileId, profileVersion, validatedAt }));
}

/** Stable, read-only local preflight over current Babylon scene state. */
export class RobloxAssetValidator {
  public static fingerprint(meshes: Mesh[]): string {
    const stable = meshes.filter((m) => !m.isDisposed()).slice().sort((a, b) => meshName(a).localeCompare(meshName(b))).map((mesh) => {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind) || [];
      const indices = mesh.getIndices() || [];
      const uvs = mesh.getVerticesData(VertexBuffer.UVKind) || [];
      const mat = materialSlots(mesh).map((m) => ({
        name: m?.name, id: m?.uniqueId, type: m?.getClassName?.(), alpha: m?.alpha, roughness: m?.roughness, metallic: m?.metallic,
        albedoColor: m?.albedoColor?.asArray?.() || m?.diffuseColor?.asArray?.(),
        textures: textureList(m).map((t) => ({ name: t.name, url: t.url, id: t.uniqueId, size: (() => { try { return t.getSize(); } catch { return null; } })(), normalMapFormat: t.metadata?.normalMapFormat || null })),
      }));
      const vertexBuffers = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.TangentKind, VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.UV3Kind, VertexBuffer.UV4Kind, VertexBuffer.UV5Kind, VertexBuffer.UV6Kind, VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesWeightsKind, VertexBuffer.MatricesIndicesExtraKind, VertexBuffer.MatricesWeightsExtraKind];
      const attributes = vertexBuffers.map((kind) => [kind, Array.from(mesh.getVerticesData(kind) || [])]);
      const skeleton = mesh.skeleton ? { name: mesh.skeleton.name, bones: mesh.skeleton.bones.map((bone) => ({ name: bone.name, parent: bone.getParent()?.name || null, matrix: bone.getBindPose().asArray() })) } : null;
      const meshMetadata = mesh.metadata || {};
      const relevantMetadata = { unit: meshMetadata.unit, targetDimensions: meshMetadata.targetDimensions, intendedRestingPlane: meshMetadata.intendedRestingPlane, robloxAssetType: meshMetadata.robloxAssetType, robloxCageRole: meshMetadata.robloxCageRole, robloxSourceFixtureHash: meshMetadata.robloxSourceFixtureHash };
      return { id: meshName(mesh), attributes, indices: Array.from(indices), position: mesh.position.asArray(), rotation: mesh.rotation.asArray(), quaternion: mesh.rotationQuaternion?.asArray(), scale: mesh.scaling.asArray(), pivot: mesh.getPivotPoint().asArray(), metadata: relevantMetadata, material: mat, skeleton };
    });
    const content = JSON.stringify(stable);
    let hashA = 0x811c9dc5, hashB = 0x9e3779b9;
    for (let i = 0; i < content.length; i++) { const code = content.charCodeAt(i); hashA = Math.imul(hashA ^ code, 0x01000193); hashB = Math.imul(hashB ^ (code + i), 0x85ebca6b); }
    return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
  }

  public static validate(sceneMeshes: Mesh[], profileId: string, metadata: Record<string, unknown> = {}): RobloxValidationReport {
    const profile = getRobloxRequirementProfile(profileId);
    const meshes = sceneMeshes.filter((m) => m instanceof Mesh && !m.isDisposed() && m.isEnabled() && !m.metadata?.isEditorHelper);
    const renderMeshes = profile.id === 'layered_tshirt_v1' ? meshes.filter((m) => !m.name.endsWith('_InnerCage') && !m.name.endsWith('_OuterCage') && m.metadata?.robloxCageRole !== 'cage') : meshes;
    const checks: RobloxCheckResult[] = [];
    if (!renderMeshes.length) checks.push(result('SCENE.MESH.PRESENT', 'FAIL', 'error', 0, 'at least one render mesh', GENERAL, undefined, 'The scene contains no enabled render meshes.', 'Create or import a render mesh.'));
    else checks.push(result('SCENE.MESH.PRESENT', 'PASS', 'info', renderMeshes.length, 'at least one render mesh', GENERAL, undefined, 'Enabled candidate render meshes were found.'));
    if (profile.id === 'layered_tshirt_v1') checks.push(result('LAYERED.MESH.SINGLE', renderMeshes.length === 1 ? 'PASS' : 'FAIL', 'error', renderMeshes.length, 1, LAYERED, undefined, 'Render mesh count excludes candidate cage nodes identified by standard suffix or explicit cage metadata. This does not verify the cage is official.'));

    const allUVKinds = [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.UV3Kind, VertexBuffer.UV4Kind, VertexBuffer.UV5Kind, VertexBuffer.UV6Kind];
    for (const mesh of renderMeshes) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      const vertexCount = positions ? Math.floor(positions.length / 3) : 0;
      const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
      const expectedLimit = profile.id === 'static_prop_mesh_v1' ? 20000 : 4000;
      checks.push(result(`${profile.category.toUpperCase()}.MESH.TRIANGLES`, triangleCount <= expectedLimit ? 'PASS' : 'FAIL', 'error', triangleCount, `<= ${expectedLimit} triangles per mesh`, profile.id === 'static_prop_mesh_v1' ? GENERAL : LAYERED, mesh, indices ? 'Triangle count uses the indexed triangle list.' : 'Triangle count uses non-indexed sequential triples; incomplete trailing vertices are ignored.', 'Reduce triangle count if it exceeds the profile budget.'));
      checks.push(result(`${profile.category.toUpperCase()}.MESH.VERTICES`, vertexCount > 0 ? 'PASS' : 'FAIL', 'error', vertexCount, '> 0 vertices', GENERAL, mesh, 'Vertex count is read from the position vertex buffer.'));
      if (!vertexCount || triangleCount === 0) checks.push(result('MESH.GEOMETRY.EMPTY', 'FAIL', 'error', { vertexCount, triangleCount }, 'non-empty triangle mesh', GENERAL, mesh, 'The mesh has no complete triangles.', 'Create or import valid triangle geometry.'));
      const nonFinite = positions ? Array.from(positions).filter((v) => !Number.isFinite(v)).length : 0;
      checks.push(result('MESH.POSITION.FINITE', nonFinite === 0 && !!positions ? 'PASS' : 'FAIL', 'error', { invalidComponents: nonFinite }, 'all finite position values', GENERAL, mesh, nonFinite ? 'Position data contains NaN or Infinity values.' : positions ? 'All position components are finite.' : 'Position buffer is missing.', 'Remove invalid vertex values.'));

      const triIndices = indices ? Array.from(indices) : Array.from({ length: vertexCount }, (_, i) => i);
      let degenerate = 0; let signedVolume = 0;
      const edgeUses = new Map<string, number>();
      const canonical = new Map<string, number>();
      const canonicalIndex = (idx: number): number => {
        const x = positions?.[idx * 3], y = positions?.[idx * 3 + 1], z = positions?.[idx * 3 + 2];
        const key = `${round(x)}|${round(y)}|${round(z)}`;
        if (!canonical.has(key)) canonical.set(key, canonical.size);
        return canonical.get(key)!;
      };
      const edge = (a: number, b: number) => { const ca = canonicalIndex(a), cb = canonicalIndex(b); const key = ca < cb ? `${ca}:${cb}` : `${cb}:${ca}`; edgeUses.set(key, (edgeUses.get(key) || 0) + 1); };
      for (let i = 0; positions && i + 2 < triIndices.length; i += 3) {
        const a = triIndices[i], b = triIndices[i + 1], c = triIndices[i + 2];
        if (a >= vertexCount || b >= vertexCount || c >= vertexCount || a < 0 || b < 0 || c < 0) { degenerate++; continue; }
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
        const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
        const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
        const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
        const cxv = aby * acz - abz * acy, cyv = abz * acx - abx * acz, czv = abx * acy - aby * acx;
        if (!Number.isFinite(cxv * cxv + cyv * cyv + czv * czv) || cxv * cxv + cyv * cyv + czv * czv <= 1e-20) degenerate++;
        signedVolume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
        edge(a, b); edge(b, c); edge(c, a);
      }
      checks.push(result('MESH.TRIANGLES.DEGENERATE', degenerate === 0 ? 'PASS' : 'FAIL', 'error', degenerate, 0, GENERAL, mesh, 'Degenerate/invalid-index triangles are counted from actual triangle-list geometry.', 'Remove zero-area triangles or fix invalid indices.'));
      const boundary = Array.from(edgeUses.values()).filter((count) => count === 1).length;
      const nonManifold = Array.from(edgeUses.values()).filter((count) => count > 2).length;
      checks.push(result('MESH.INTEGRITY.BOUNDARY_EDGES', boundary === 0 ? 'PASS' : 'FAIL', 'error', boundary, 0, GENERAL, mesh, 'Geometrically coincident vertices are welded for this edge diagnostic; zero boundary edges alone does not prove watertightness.', 'Inspect boundary edges and disconnected/internal shells.'));
      checks.push(result('MESH.INTEGRITY.NON_MANIFOLD_EDGES', nonManifold === 0 ? 'PASS' : 'FAIL', 'error', nonManifold, 0, GENERAL, mesh, 'Edges used by more than two triangles are reported as non-manifold.', 'Repair non-manifold edge neighborhoods.'));
      checks.push(result('MESH.INTEGRITY.SELF_INTERSECTION', 'NOT_TESTED', 'warning', null, 'no self-intersections', GENERAL, mesh, 'Self-intersection testing is not implemented.'));
      checks.push(result('MESH.INTEGRITY.DUPLICATE_FACES', 'NOT_TESTED', 'warning', null, 'no duplicate faces', GENERAL, mesh, 'Duplicate-face detection is not implemented.'));
      checks.push(result('MESH.INTEGRITY.WATERTIGHT_CLAIM', 'NOT_TESTED', 'warning', { boundaryEdges: boundary, nonManifoldEdges: nonManifold }, 'full watertightness proof', GENERAL, mesh, 'Boundary and non-manifold diagnostics are partial; internal shells, face orientation and self-intersection are not fully proven.'));
      checks.push(result('MESH.GEOMETRY.NONZERO_VOLUME', Math.abs(signedVolume) > 1e-12 ? 'PASS' : 'FAIL', 'error', round(Math.abs(signedVolume)), '> 0 local signed volume magnitude', GENERAL, mesh, 'Volume is estimated using the signed tetrahedron sum; open meshes can yield misleading values.', 'Use a closed, consistently oriented mesh with non-zero volume.'));

      mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo();
      const box = mesh.getBoundingInfo().boundingBox;
      const dims = box.maximumWorld.subtract(box.minimumWorld);
      const actualDimensions = dims.asArray().map(round);
      const fixtureTarget = mesh.metadata?.targetDimensions || metadata.targetDimensions;
      const matchesFixture = Array.isArray(fixtureTarget) && fixtureTarget.length === 3 && actualDimensions.every((value, index) => Math.abs(value - fixtureTarget[index]) <= 1e-4);
      checks.push(result('MESH.BOUNDS.DIMENSIONS', profile.id === 'static_prop_mesh_v1' ? (fixtureTarget ? (matchesFixture ? 'PASS' : 'FAIL') : 'NOT_TESTED') : 'NOT_TESTED', 'info', actualDimensions, profile.id === 'static_prop_mesh_v1' ? (fixtureTarget || 'fixture target dimensions required') : [8, 8, 8], profile.id === 'static_prop_mesh_v1' ? GENERAL : LAYERED, mesh, profile.id === 'static_prop_mesh_v1' ? (fixtureTarget ? (matchesFixture ? 'World-space dimensions match this fixture\'s explicit target. The target is internal fixture metadata, not a universal Roblox prop size.' : 'World-space dimensions differ from the explicit fixture target.') : 'World-space dimensions are reported, but no fixture target dimensions are attached.') : 'World-space dimensions are reported. Babylon scene units are not assumed to equal Roblox studs.'));
      const transform = { position: mesh.position.asArray().map(round), rotation: mesh.rotation.asArray().map(round), rotationQuaternion: mesh.rotationQuaternion?.asArray().map(round) ?? null, scale: mesh.scaling.asArray().map(round), pivot: mesh.getPivotPoint().asArray().map(round), unitMetadata: mesh.metadata?.unit ?? metadata.unit ?? null, intendedRestingPlane: metadata.intendedRestingPlane ?? null };
      checks.push(result('MESH.TRANSFORM.REVIEW', 'WARNING', 'info', transform, profile.id === 'static_prop_mesh_v1' ? 'fixture metadata target' : 'attachment-relative dimensions in verified studs', GENERAL, mesh, 'Transform, pivot, unit metadata, and any intended resting plane are recorded for review; no universal unit/pivot rule is inferred.'));

      const uvSets = allUVKinds.filter((kind) => (mesh.getVerticesData(kind)?.length || 0) > 0);
      checks.push(result('MESH.UV.SET_COUNT', uvSets.length === 1 ? 'PASS' : uvSets.length > 1 ? 'FAIL' : 'NOT_TESTED', uvSets.length > 1 ? 'error' : 'warning', uvSets.length, 1, TEXTURE_DOC, mesh, uvSets.length ? 'UV set count is based on populated Babylon UV1-UV6 vertex buffers.' : 'No populated UV buffer is present.', 'Create one UV set and remove additional sets.'));
      const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
      const uvFinite = !!uvs && Array.from(uvs).every(Number.isFinite);
      const uvOut = uvs ? Array.from({ length: Math.floor(uvs.length / 2) }, (_, i) => [uvs[i * 2], uvs[i * 2 + 1]]).filter(([u, v]) => u < 0 || u > 1 || v < 0 || v > 1).length : 0;
      checks.push(result('MESH.UV.RANGE', !uvs ? 'NOT_TESTED' : uvFinite && uvOut === 0 ? 'PASS' : 'FAIL', 'error', { coordinates: uvs ? uvs.length / 2 : 0, outOfRange: uvOut, finite: uvFinite }, '[0,1] on both axes', TEXTURE_DOC, mesh, !uvs ? 'UV1 is not present; range cannot be checked.' : `Found ${uvOut} coordinates outside the 0:1 range.`, 'Move UV coordinates into the 0:1 range.'));
      let zeroAreaUV = 0;
      if (uvs) for (let i = 0; i + 2 < triIndices.length; i += 3) { const a = triIndices[i], b = triIndices[i + 1], c = triIndices[i + 2]; const area = Math.abs((uvs[b * 2] - uvs[a * 2]) * (uvs[c * 2 + 1] - uvs[a * 2 + 1]) - (uvs[c * 2] - uvs[a * 2]) * (uvs[b * 2 + 1] - uvs[a * 2 + 1])); if (area <= 1e-12) zeroAreaUV++; }
      checks.push(result('MESH.UV.ZERO_AREA_TRIANGLES', uvs ? (zeroAreaUV ? 'WARNING' : 'PASS') : 'NOT_TESTED', 'warning', uvs ? zeroAreaUV : null, 0, CAGES, mesh, uvs ? 'Zero-area UV triangles are diagnostic and do not independently fail the static profile.' : 'UV data is unavailable.'));
      checks.push(result('MESH.UV.OVERLAP', 'NOT_TESTED', 'info', null, 'diagnostic only; overlap is allowed', TEXTURE_DOC, mesh, 'UV island overlap detection is not implemented; overlapping UVs are not failed.'));

      const slots = materialSlots(mesh);
      const materialCount = slots.length;
      const requiredMaterialCount = profile.id === 'static_prop_mesh_v1' ? 1 : 1;
      checks.push(result('MESH.MATERIAL.ASSIGNMENT', materialCount ? 'PASS' : 'FAIL', 'error', materialCount, 'at least one assigned material', TEXTURE_DOC, mesh, materialCount ? 'A material or sub-material assignment exists.' : 'No material is assigned.', 'Assign a material.'));
      checks.push(result('MESH.MATERIAL.COUNT', materialCount === requiredMaterialCount ? 'PASS' : 'FAIL', 'error', materialCount, requiredMaterialCount, TEXTURE_DOC, mesh, 'Material slots are counted per render mesh.', 'Use one material per mesh for this profile.'));
      const tex = slots.flatMap(textureList);
      const textureSummary = tex.map((t) => ({ name: t.name, format: textureFormat(t), size: (() => { try { return t.getSize(); } catch { return null; } })(), url: t.url || null }));
      checks.push(result('MESH.TEXTURE.REFERENCES', tex.every((t) => !!t.url) ? 'PASS' : tex.length ? 'WARNING' : 'PASS', 'warning', textureSummary, 'referenced texture dependencies', TEXTURE_DOC, mesh, tex.length ? 'Texture references and actual Babylon-reported dimensions are listed; unloaded image dimensions may be unavailable.' : 'No texture references are assigned.'));
      const unsupported = tex.filter((t) => !['png', 'jpg', 'jpeg', 'tga', 'bmp'].includes(textureFormat(t)));
      checks.push(result('MESH.TEXTURE.FORMAT', unsupported.length ? 'FAIL' : 'PASS', 'error', textureSummary.map((t) => t.format), ['png', 'jpg', 'jpeg', 'tga', 'bmp'], TEXTURE_DOC, mesh, unsupported.length ? 'At least one texture format is unsupported or unknown from its reference.' : 'All referenced texture formats match the documented separate-image formats.', 'Use PNG, JPG, TGA, or BMP images.'));
      checks.push(result('MESH.TEXTURE.DIMENSIONS', 'WARNING', 'info', textureSummary.map((t) => t.size), 'reported; no static maximum encoded', TEXTURE_DOC, mesh, 'Actual dimensions are shown independently from policy; the static profile encodes no hard PBR maximum.'));
      if (profile.id === 'layered_tshirt_v1') {
        const knownDimensions = textureSummary.filter((t) => t.size && t.size.width > 0 && t.size.height > 0);
        const tooLarge = knownDimensions.filter((t) => t.size.width > 2048 || t.size.height > 2048);
        checks.push(result('LAYERED.TEXTURE.MARKETPLACE_MAX', !tex.length || knownDimensions.length !== tex.length ? 'NOT_TESTED' : tooLarge.length ? 'FAIL' : 'PASS', 'error', textureSummary.map((t) => t.size), '<= 2048x2048 per Marketplace layered texture', LAYERED, mesh, !tex.length ? 'No texture image is assigned to inspect.' : knownDimensions.length !== tex.length ? 'At least one texture dimension is unavailable.' : 'Image dimensions are compared with the Marketplace layered accessory cap.', 'Resize Marketplace layered accessory textures to at most 2048x2048.'));
      }
      const pbr = slots.filter((m) => m instanceof PBRMaterial);
      checks.push(result('MESH.MATERIAL.NORMAL_MAP_METADATA', pbr.some((m) => !!m.bumpTexture) ? 'NOT_TESTED' : 'PASS', 'info', pbr.map((m) => ({ name: m.name, normalMap: m.bumpTexture?.name || null, openGLMetadata: m.bumpTexture?.metadata?.normalMapFormat || null })), 'OpenGL tangent-space normal map when present', TEXTURE_DOC, mesh, pbr.some((m) => !!m.bumpTexture) ? 'Normal texture exists, but its pixel channel convention is not inferred from metadata.' : 'No normal map is assigned.'));

      if (profile.id === 'layered_tshirt_v1') {
        const names = mesh.getScene().transformNodes.concat(mesh.getScene().meshes).map((node) => node.name);
        const hasFrontAttachment = names.some((n) => n === 'BodyFrontAttachment' || n === 'BodyFrontAttachment_Att');
        checks.push(result('LAYERED.ATTACHMENT.BODY_FRONT', hasFrontAttachment ? 'PASS' : 'FAIL', 'error', names.filter((n) => n.includes('Attachment') || n.endsWith('_Att')), 'BodyFrontAttachment', LAYERED, mesh, 'The expected attachment node name is checked from the actual scene hierarchy; importer recognition/attachment behavior is not verified.', 'Add a BodyFrontAttachment node or the supported caged-import `_Att` name.'));
        checks.push(result('LAYERED.RIG.R15', 'NOT_TESTED', 'error', { skeletons: mesh.getScene().skeletons.map((s) => s.name) }, 'official R15 hierarchy and bind data', LAYERED, mesh, 'Official reference conversion and source-to-import integrity have not been verified.'));
        const matrixIndices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
        const matrixWeights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
        const matrixIndicesExtra = mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind);
        const matrixWeightsExtra = mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind);
        const hasSkinBuffers = !!(matrixIndices && matrixWeights && mesh.skeleton);
        let maxInfluences = 0; let rootWeightCount = 0; let weightValuesValid = true;
        const rootIndex = mesh.skeleton?.bones.findIndex((bone) => bone.name.toLowerCase() === 'root') ?? -1;
        if (hasSkinBuffers) {
          const vertexCount = Math.floor(Math.min(matrixIndices!.length, matrixWeights!.length) / 4);
          for (let vertex = 0; vertex < vertexCount; vertex++) {
            let active = 0;
            for (let slot = 0; slot < 8; slot++) {
              const extra = slot >= 4; const indicesBuf = extra ? matrixIndicesExtra : matrixIndices; const weightsBuf = extra ? matrixWeightsExtra : matrixWeights;
              if (!indicesBuf || !weightsBuf) continue;
              const offset = vertex * 4 + slot % 4; const weight = weightsBuf[offset]; const boneIndex = indicesBuf[offset];
              if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(boneIndex) || (weight > 1e-6 && (!Number.isInteger(boneIndex) || boneIndex >= mesh.skeleton!.bones.length))) weightValuesValid = false;
              if (weight > 1e-6) { active++; if (boneIndex === rootIndex) rootWeightCount++; }
            }
            maxInfluences = Math.max(maxInfluences, active);
          }
        }
        checks.push(result('LAYERED.WEIGHTS.MAX_INFLUENCES', hasSkinBuffers ? (weightValuesValid && maxInfluences <= 4 ? 'PASS' : 'FAIL') : 'NOT_TESTED', 'error', hasSkinBuffers ? { maxInfluences, validIndicesAndWeights: weightValuesValid } : null, '<= 4 valid per-vertex influences', GENERAL, mesh, hasSkinBuffers ? 'Counts positive weights across primary and extra Babylon influence buffers and checks indices against the assigned skeleton.' : 'Skin-weight buffers and an assigned skeleton are required for this local check.', 'Reduce positive influences per vertex to four and repair invalid indices/weights.'));
        checks.push(result('LAYERED.WEIGHTS.NO_ROOT', !hasSkinBuffers || rootIndex < 0 ? 'NOT_TESTED' : rootWeightCount === 0 ? 'PASS' : 'FAIL', 'error', rootIndex < 0 ? null : { rootBoneIndex: rootIndex, positiveRootWeights: rootWeightCount }, 'no Root influence', GENERAL, mesh, rootIndex < 0 ? 'No bone named Root is available to map against an official R15 reference.' : 'Checks weights for the bone named Root; official R15 identity is not established by this name alone.', 'Remove all vertex weights from the Root bone.'));
        const baseName = renderMeshes[0]?.name;
        const requiredCages = baseName ? [`${baseName}_InnerCage`, `${baseName}_OuterCage`] : [];
        const cageNamesPresent = requiredCages.length === 2 && requiredCages.every((name) => names.includes(name));
        checks.push(result('LAYERED.CAGE.NAMES', requiredCages.length ? (cageNamesPresent ? 'PASS' : 'FAIL') : 'NOT_TESTED', 'error', names.filter((n) => n.includes('Cage')), requiredCages.length ? requiredCages : ['<asset>_InnerCage', '<asset>_OuterCage'], LAYERED, mesh, 'Checks exact naming against the candidate render mesh; this does not prove cage data came from the official template.', 'Add inner and outer cage nodes using the primary mesh name plus the required suffix.'));
        checks.push(result('LAYERED.CAGE.TOPOLOGY', 'NOT_TESTED', 'error', null, 'matches official cage topology', CAGES, mesh, 'Official archive conversion path and fixture integrity are not verified.'));
        checks.push(result('LAYERED.CAGE.UV', 'NOT_TESTED', 'error', null, 'matches official cage UV', CAGES, mesh, 'No verified official cage comparison fixture is available to the validator.'));
        checks.push(result('LAYERED.TRANSFORM.STUDS', 'NOT_TESTED', 'error', dims.asArray().map(round), [8, 8, 8], LAYERED, mesh, 'Babylon units have not been verified against Roblox studs, and attachment-relative transform conversion is unavailable.'));
      }
    }
    checks.push(result('EXPORT.STAGE.LOCAL_ONLY', 'NOT_TESTED', 'info', 'local_preflight', 'separate GLB/glTF postflight and Roblox Studio import', GENERAL, undefined, 'A scene preflight does not verify a serialized export or Roblox Studio import.'));
    const timestamp = new Date().toISOString();
    return { schemaVersion: 1, profileId: profile.id, profileVersion: profile.version, stage: 'local_preflight', generatedAt: timestamp, sceneFingerprint: this.fingerprint(meshes), stale: false, requirements: profile.rules, checks: stampChecks(checks, profile.id, profile.version, timestamp), robloxStudioVerification: { status: 'NOT_TESTED', verifiedAt: null, explanation: 'No Roblox Studio import or fitting test has been recorded.' } };
  }

  public static getCounts(report: RobloxValidationReport) {
    return report.checks.reduce((counts, check) => { counts[check.status]++; return counts; }, { PASS: 0, WARNING: 0, FAIL: 0, NOT_TESTED: 0 } as Record<RobloxValidationStatus, number>);
  }

  /** Checks GLB container integrity and compares mesh/triangle totals with a local snapshot. */
  public static async validateGlbPostflight(blob: Blob, expectedMeshes: Mesh[], profileId: RobloxAssetProfileId = 'static_prop_mesh_v1', profileVersion = getRobloxRequirementProfile(profileId).version): Promise<RobloxValidationReport['exportPostflight']> {
    const checks: RobloxCheckResult[] = [];
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength < 20) { const checkedAt = new Date().toISOString(); return { checkedAt, profileId, profileVersion, status: 'FAIL', filename: 'export.glb', checks: stampChecks([result('EXPORT.GLB.CONTAINER', 'FAIL', 'error', buffer.byteLength, 'valid GLB binary', GENERAL, undefined, 'File is too short to contain a GLB header.')], profileId, profileVersion, checkedAt) }; }
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true); const version = view.getUint32(4, true); const declaredLength = view.getUint32(8, true);
    const validHeader = magic === 0x46546c67 && version === 2 && declaredLength === buffer.byteLength;
    if (!validHeader) { const checkedAt = new Date().toISOString(); return { checkedAt, profileId, profileVersion, status: 'FAIL', filename: 'export.glb', checks: stampChecks([result('EXPORT.GLB.CONTAINER', 'FAIL', 'error', { magic, version, declaredLength, actualLength: buffer.byteLength }, 'GLB v2 with matching byte length', GENERAL, undefined, 'GLB header or byte length is invalid.')], profileId, profileVersion, checkedAt) }; }
    const jsonLength = view.getUint32(12, true); const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) { const checkedAt = new Date().toISOString(); return { checkedAt, profileId, profileVersion, status: 'FAIL', filename: 'export.glb', checks: stampChecks([result('EXPORT.GLB.JSON_CHUNK', 'FAIL', 'error', { jsonType, jsonLength }, 'valid JSON chunk', GENERAL, undefined, 'GLB JSON chunk is missing or out of bounds.')], profileId, profileVersion, checkedAt) }; }
    let document: any;
    try { document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim()); }
    catch { const checkedAt = new Date().toISOString(); return { checkedAt, profileId, profileVersion, status: 'FAIL', filename: 'export.glb', checks: stampChecks([result('EXPORT.GLB.JSON_PARSE', 'FAIL', 'error', null, 'valid glTF JSON', GENERAL, undefined, 'GLB JSON chunk cannot be parsed.')], profileId, profileVersion, checkedAt) }; }
    const primitives = (document.meshes || []).flatMap((m: any) => m.primitives || []);
    const exportedTriangles = primitives.reduce((sum: number, primitive: any) => {
      const accessor = primitive.indices !== undefined ? document.accessors?.[primitive.indices] : document.accessors?.[primitive.attributes?.POSITION];
      return sum + (accessor ? Math.floor(accessor.count / 3) : 0);
    }, 0);
    const expectedTriangles = expectedMeshes.reduce((sum, mesh) => sum + (mesh.getIndices() ? Math.floor(mesh.getIndices()!.length / 3) : Math.floor(mesh.getTotalVertices() / 3)), 0);
    const exportedMeshCount = (document.meshes || []).length;
    const expectedMeshCount = expectedMeshes.length;
    const checksOut = [
      result('EXPORT.GLB.CONTAINER', 'PASS', 'info', { version, byteLength: buffer.byteLength }, 'valid GLB v2', GENERAL, undefined, 'GLB binary header and declared length are valid.'),
      result('EXPORT.GLB.MESH_COUNT', exportedMeshCount === expectedMeshCount ? 'PASS' : 'WARNING', 'warning', exportedMeshCount, expectedMeshCount, GENERAL, undefined, 'Exported glTF mesh objects are counted; exporter may merge or omit non-render objects.'),
      result('EXPORT.GLB.TRIANGLE_COUNT', exportedTriangles === expectedTriangles ? 'PASS' : 'FAIL', 'error', exportedTriangles, expectedTriangles, GENERAL, undefined, 'Triangle count is read from exported accessor counts and compared with the local scene snapshot.'),
      result('EXPORT.GLB.UV_PRESENT', primitives.every((p: any) => p.attributes?.TEXCOORD_0 !== undefined) ? 'PASS' : 'WARNING', 'warning', primitives.map((p: any) => !!p.attributes?.TEXCOORD_0), 'UV0 retained where source meshes contain UVs', TEXTURE_DOC, undefined, 'Exported primitive UV attributes are inspected.'),
    ];
    const status = checksOut.some((check) => check.status === 'FAIL') ? 'FAIL' : checksOut.some((check) => check.status === 'WARNING') ? 'WARNING' : 'PASS';
    const checkedAt = new Date().toISOString();
    return { checkedAt, profileId, profileVersion, status, filename: 'export.glb', checks: stampChecks(checksOut, profileId, profileVersion, checkedAt) };
  }
}
