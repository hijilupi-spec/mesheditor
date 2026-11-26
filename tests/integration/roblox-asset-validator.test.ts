import { NullEngine, Scene, MeshBuilder, VertexBuffer } from '@babylonjs/core';
import { GLTF2Export } from '@babylonjs/serializers';
import '../../src/MeshEditorService';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RobloxAssetValidator } from '../../src/robloxAssetValidator/RobloxAssetValidator';
import { getRobloxRequirementProfile } from '../../src/robloxAssetValidator/RobloxRequirementProfiles';
import { createStaticFixture, STATIC_FIXTURE_IDS } from '../fixtures/robloxStaticFixtures';

describe('Roblox Asset Validator Phase 1 fixtures', () => {
  let engine: NullEngine; let scene: Scene;
  beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
  afterEach(() => { scene.dispose(); engine.dispose(); });

  it('registers each specified static fixture ID', () => { expect(STATIC_FIXTURE_IDS).toHaveLength(10); });
  it('rejects unknown profiles without a generic fallback', () => { expect(() => getRobloxRequirementProfile('other_asset')).toThrow('Unknown Roblox asset profile'); });
  it('uses distinct static and layered triangle thresholds', () => {
    const staticRule = getRobloxRequirementProfile('static_prop_mesh_v1').rules.find((rule) => rule.id === 'STATIC.MESH.TRIANGLES.MAX');
    const layeredRule = getRobloxRequirementProfile('layered_tshirt_v1').rules.find((rule) => rule.id === 'LAYERED.MESH.TRIANGLES.MAX');
    expect(staticRule?.expected).toBe(20000); expect(layeredRule?.expected).toBe(4000);
  });
  it('passes the closed crate geometry and preserves the per-mesh triangle boundary', () => {
    const crate = createStaticFixture(scene, 'S-STATIC-VALID-CRATE');
    const report = RobloxAssetValidator.validate([crate], 'static_prop_mesh_v1');
    expect(report.checks.find((c) => c.checkId === 'STATIC_PROP.MESH.TRIANGLES')?.status).toBe('PASS');
    const over = createStaticFixture(scene, 'S-STATIC-TRI-OVER');
    const overReport = RobloxAssetValidator.validate([over], 'static_prop_mesh_v1');
    expect(overReport.checks.find((c) => c.checkId === 'STATIC_PROP.MESH.TRIANGLES')?.actual).toBe(20001);
    expect(overReport.checks.find((c) => c.checkId === 'STATIC_PROP.MESH.TRIANGLES')?.status).toBe('FAIL');
    const exact = MeshBuilder.CreateBox('exact-limit-mesh', {}, scene);
    const positions = new Float32Array(20000 * 9); const indices = new Uint32Array(20000 * 3);
    for (let i = 0; i < 20000; i++) { positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], i * 9); indices.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3); }
    exact.setVerticesData(VertexBuffer.PositionKind, positions, true, 3); exact.setIndices(indices);
    const exactReport = RobloxAssetValidator.validate([exact], 'static_prop_mesh_v1');
    expect(exactReport.checks.find((c) => c.checkId === 'STATIC_PROP.MESH.TRIANGLES')?.status).toBe('PASS');
  });
  it('detects open boundary and zero-volume fixtures without claiming watertight proof', () => {
    for (const id of ['S-STATIC-OPEN-BOUNDARY', 'S-STATIC-ZERO-THICKNESS'] as const) {
      const mesh = createStaticFixture(scene, id); const report = RobloxAssetValidator.validate([mesh], 'static_prop_mesh_v1');
      expect(report.checks.find((c) => c.checkId === 'MESH.INTEGRITY.BOUNDARY_EDGES')?.status).toBe('FAIL');
      if (id === 'S-STATIC-ZERO-THICKNESS') expect(report.checks.find((c) => c.checkId === 'MESH.GEOMETRY.NONZERO_VOLUME')?.status).toBe('FAIL');
      expect(report.checks.find((c) => c.checkId === 'MESH.INTEGRITY.WATERTIGHT_CLAIM')?.status).toBe('NOT_TESTED');
    }
  });
  it('reports non-finite positions, UV range, UV overlap policy, and extra UV sets', () => {
    const nonfinite = RobloxAssetValidator.validate([createStaticFixture(scene, 'S-STATIC-NONFINITE')], 'static_prop_mesh_v1');
    expect(nonfinite.checks.find((c) => c.checkId === 'MESH.POSITION.FINITE')?.status).toBe('FAIL');
    const outOfBounds = RobloxAssetValidator.validate([createStaticFixture(scene, 'S-STATIC-UV-OOB')], 'static_prop_mesh_v1');
    expect(outOfBounds.checks.find((c) => c.checkId === 'MESH.UV.RANGE')?.status).toBe('FAIL');
    const overlap = RobloxAssetValidator.validate([createStaticFixture(scene, 'S-STATIC-UV-OVERLAP')], 'static_prop_mesh_v1');
    expect(overlap.checks.find((c) => c.checkId === 'MESH.UV.OVERLAP')?.status).toBe('NOT_TESTED');
    const multi = RobloxAssetValidator.validate([createStaticFixture(scene, 'S-STATIC-MULTI-UV')], 'static_prop_mesh_v1');
    expect(multi.checks.find((c) => c.checkId === 'MESH.UV.SET_COUNT')?.status).toBe('FAIL');
  });
  it('checks assigned material count and image file format without imposing static texture resolution', () => {
    const crate = createStaticFixture(scene, 'S-STATIC-TEXTURE-FORMAT');
    const valid = RobloxAssetValidator.validate([crate], 'static_prop_mesh_v1');
    expect(valid.checks.find((c) => c.checkId === 'MESH.MATERIAL.ASSIGNMENT')?.status).toBe('PASS');
    expect(valid.checks.find((c) => c.checkId === 'MESH.MATERIAL.COUNT')?.status).toBe('PASS');
    expect(valid.checks.find((c) => c.checkId === 'MESH.TEXTURE.FORMAT')?.status).toBe('PASS');
    expect(valid.checks.find((c) => c.checkId === 'MESH.TEXTURE.DIMENSIONS')?.expected).toContain('no static maximum');
  });
  it('keeps all unverified layered reference checks NOT_TESTED', () => {
    const shirt = MeshBuilder.CreateBox('shirt', {}, scene);
    const report = RobloxAssetValidator.validate([shirt], 'layered_tshirt_v1');
    for (const id of ['LAYERED.RIG.R15', 'LAYERED.WEIGHTS.MAX_INFLUENCES', 'LAYERED.WEIGHTS.NO_ROOT', 'LAYERED.CAGE.TOPOLOGY', 'LAYERED.CAGE.UV', 'LAYERED.TRANSFORM.STUDS']) {
      expect(report.checks.find((c) => c.checkId === id)?.status).toBe('NOT_TESTED');
    }
    expect(report.checks.find((c) => c.checkId === 'LAYERED.ATTACHMENT.BODY_FRONT')?.status).toBe('FAIL');
    expect(report.checks.find((c) => c.checkId === 'LAYERED.CAGE.NAMES')?.status).toBe('FAIL');
  });
  it('is stable for unchanged scene data apart from validation timestamp', () => {
    const mesh = createStaticFixture(scene, 'S-STATIC-VALID-CRATE');
    const a = RobloxAssetValidator.validate([mesh], 'static_prop_mesh_v1');
    const b = RobloxAssetValidator.validate([mesh], 'static_prop_mesh_v1');
    expect(a.sceneFingerprint).toBe(b.sceneFingerprint);
    const stableChecks = (checks: typeof a.checks) => checks.map(({ validatedAt, ...check }) => check);
    expect(stableChecks(a.checks)).toEqual(stableChecks(b.checks));
  });
  it('invalidates fingerprint after geometry, UV, material, or transform changes', () => {
    const mesh = createStaticFixture(scene, 'S-STATIC-VALID-CRATE');
    let previous = RobloxAssetValidator.fingerprint([mesh]);
    const setUV = mesh.getVerticesData(VertexBuffer.UVKind)!; setUV[0] += 0.1; mesh.setVerticesData(VertexBuffer.UVKind, setUV, true, 2);
    expect(RobloxAssetValidator.fingerprint([mesh])).not.toBe(previous); previous = RobloxAssetValidator.fingerprint([mesh]);
    mesh.position.x += 1; expect(RobloxAssetValidator.fingerprint([mesh])).not.toBe(previous);
  });
  it('reports local preflight separately and includes deterministic fixture IDs', () => {
    const mesh = createStaticFixture(scene, 'S-STATIC-VALID-CRATE');
    const report = RobloxAssetValidator.validate([mesh], 'static_prop_mesh_v1');
    expect(report.stage).toBe('local_preflight');
    expect(report.robloxStudioVerification.status).toBe('NOT_TESTED');
    expect(report.requirements.find((rule) => rule.id === 'STATIC.MESH.TRIANGLES.MAX')?.classification).toBe('OFFICIAL_HARD_RULE');
    expect(RobloxAssetValidator.getCounts(report).NOT_TESTED).toBeGreaterThan(0);
  });
  it('postflights an exported GLB container and triangle data separately from Studio verification', async () => {
    const crate = createStaticFixture(scene, 'S-STATIC-EXPORT-ROUNDTRIP');
    const preflight = RobloxAssetValidator.validate([crate], 'static_prop_mesh_v1');
    const exported: any = await GLTF2Export.GLBAsync(scene, 'S-STATIC-EXPORT-ROUNDTRIP');
    const files = exported._glTFData?.files || exported.files;
    const blob = files[Object.keys(files).find((name) => name.endsWith('.glb'))!];
    const postflight = await RobloxAssetValidator.validateGlbPostflight(blob, [crate]);
    expect(postflight?.checks.find((c) => c.checkId === 'EXPORT.GLB.CONTAINER')?.status).toBe('PASS');
    expect(postflight?.checks.find((c) => c.checkId === 'EXPORT.GLB.TRIANGLE_COUNT')?.status).toBe('PASS');
    expect(preflight.stage).toBe('local_preflight');
  });
});
