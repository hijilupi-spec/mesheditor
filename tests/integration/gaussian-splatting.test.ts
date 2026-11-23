import { Color3, GaussianSplattingMesh, MeshBuilder, NullEngine, PBRMaterial } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_AGENT_SKILLS } from '../../src/builtInSkills';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';
import {
  getSplatCount,
  isGaussianSplatMesh,
  isTriangleMesh,
  readSplatRecord,
  SPLAT_RECORD_BYTES,
  writeSplatRecord,
} from '../../src/splatting';

describe('Gaussian Splatting Studio, AI Tools & Skill Integration Tests', () => {
  let canvas: HTMLCanvasElement;
  let engine: NullEngine;
  let service: MeshEditorService;

  beforeEach(() => {
    localStorage.clear();
    canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);
    engine = new NullEngine();
    service = new MeshEditorService(canvas, {}, engine);
  });

  afterEach(() => {
    service.dispose();
    canvas.remove();
  });

  it('creates volumetric presets, updates render settings, and supports undo/redo', () => {
    const ctrl = service.gaussianSplatController;
    const cloud = ctrl.createProceduralPreset('cloud', {
      name: 'cumulus_test',
      splatCount: 256,
      radius: 1.5,
      opacity: 0.8,
    });

    expect(isGaussianSplatMesh(cloud)).toBe(true);
    expect(isTriangleMesh(cloud)).toBe(false);
    expect(getSplatCount(cloud)).toBe(256);
    expect(cloud.splatsData).not.toBeNull();
    expect(cloud.splatsData!.byteLength).toBe(256 * SPLAT_RECORD_BYTES);
    expect(service.importedMeshes).toContain(cloud);

    const stats = ctrl.getSplatStats(cloud);
    expect(stats.name).toBe('cumulus_test');
    expect(stats.hasEditableData).toBe(true);
    expect(stats.worldBounds.min[1]).toBeGreaterThanOrEqual(-0.05);

    ctrl.setRenderSettings(cloud, { minPixelSize: 2.5 });
    expect(cloud.minPixelSize).toBe(2.5);
    service.undo();
    expect(cloud.minPixelSize).toBe(0);
    service.redo();
    expect(cloud.minPixelSize).toBe(2.5);

    // Undo creation
    service.undo(); // undo render settings
    service.undo(); // undo creation
    expect(service.importedMeshes).not.toContain(cloud);
    service.redo();
    expect(service.importedMeshes).toContain(cloud);
  });

  it('cleans up floaters, crops radius/box, decimates, and adjusts scale/opacity/tint with undo/redo', () => {
    const ctrl = service.gaussianSplatController;

    // Build custom 4-splat buffer: 1 transparent floater, 1 oversized floater, 1 far outlier, 1 valid core splat
    const count = 4;
    const buf = new ArrayBuffer(count * SPLAT_RECORD_BYTES);
    const fBuf = new Float32Array(buf);
    const uBuf = new Uint8Array(buf);

    writeSplatRecord(fBuf, uBuf, 0, { x: 0, y: 0.5, z: 0, sx: 0.1, sy: 0.1, sz: 0.1, r: 200, g: 100, b: 50, a: 230, qx: 0, qy: 0, qz: 0, qw: 1 });
    writeSplatRecord(fBuf, uBuf, 1, { x: 0.2, y: 0.5, z: 0, sx: 0.1, sy: 0.1, sz: 0.1, r: 100, g: 200, b: 50, a: 5, qx: 0, qy: 0, qz: 0, qw: 1 }); // low opacity
    writeSplatRecord(fBuf, uBuf, 2, { x: 0.3, y: 0.5, z: 0, sx: 5.0, sy: 0.1, sz: 0.1, r: 50, g: 100, b: 200, a: 220, qx: 0, qy: 0, qz: 0, qw: 1 }); // oversized
    writeSplatRecord(fBuf, uBuf, 3, { x: 25, y: 0.5, z: 0, sx: 0.1, sy: 0.1, sz: 0.1, r: 255, g: 255, b: 255, a: 220, qx: 0, qy: 0, qz: 0, qw: 1 }); // far outlier

    const mesh = ctrl.createFromSplatsBuffer('cleanup_test', buf);
    expect(getSplatCount(mesh)).toBe(4);

    const res = ctrl.cleanupSplats(mesh, {
      minOpacity: 0.1,
      maxScale: 1.0,
      cropCenter: [0, 0.5, 0],
      cropRadius: 2.0,
    });
    expect(res.beforeCount).toBe(4);
    expect(res.afterCount).toBe(1);
    expect(res.removedCount).toBe(3);
    expect(getSplatCount(mesh)).toBe(1);

    // Undo restores all 4 splats
    service.undo();
    expect(getSplatCount(mesh)).toBe(4);
    service.redo();
    expect(getSplatCount(mesh)).toBe(1);

    // Adjust scale and tint
    ctrl.adjustSplats(mesh, {
      scaleMultiplier: 2.0,
      colorTint: '#00ff00',
      tintStrength: 1.0,
    });
    const adjusted = readSplatRecord(
      new Float32Array(mesh.splatsData!),
      new Uint8Array(mesh.splatsData!),
      0
    );
    expect(adjusted.sx).toBeCloseTo(0.2, 4);
    expect(adjusted.g).toBeGreaterThan(240);
    expect(adjusted.r).toBeLessThan(15);
  });

  it('bakes non-uniform transforms and merges multiple splat clouds with undo/redo', () => {
    const ctrl = service.gaussianSplatController;
    const s1 = ctrl.createProceduralPreset('fire', { name: 'flame_a', splatCount: 100, radius: 0.5 });
    const s2 = ctrl.createProceduralPreset('bush', { name: 'bush_b', splatCount: 150, radius: 0.8 });

    s1.position.set(2, 1, 0);
    s1.scaling.set(2, 1, 0.5);
    ctrl.bakeTransform(s1, true);

    expect(s1.position.length()).toBeCloseTo(0, 5);
    expect(s1.scaling.x).toBeCloseTo(1, 5);
    expect(s1.scaling.y).toBeCloseTo(1, 5);
    expect(ctrl.getSplatStats(s1).worldBounds.min[1]).toBeCloseTo(0, 3);

    const merged = ctrl.mergeSplatMeshes([s1, s2], 'merged_fx', true);
    expect(getSplatCount(merged)).toBe(250);
    expect(service.importedMeshes).toContain(merged);
    expect(service.importedMeshes).not.toContain(s1);
    expect(service.importedMeshes).not.toContain(s2);

    service.undo();
    expect(service.importedMeshes).not.toContain(merged);
    expect(service.importedMeshes).toContain(s1);
    expect(service.importedMeshes).toContain(s2);
  });

  it('converts triangle meshes to Gaussian Splats in surface and volume modes and exports .splat / .ply', async () => {
    const box = MeshBuilder.CreateBox('hedge_block', { width: 2, height: 1, depth: 1 }, service.scene);
    const mat = new PBRMaterial('hedge_mat', service.scene);
    mat.albedoColor = new Color3(0.15, 0.65, 0.2);
    box.material = mat;
    box.position.set(1, 0.5, -1);
    service.importedMeshes.push(box);

    const ctrl = service.gaussianSplatController;
    const { splatMesh, splatCount } = ctrl.convertMeshToSplats(box, {
      name: 'hedge_splats',
      targetSplatCount: 320,
      mode: 'volume',
      opacity: 0.85,
      removeSource: false,
    });

    expect(splatCount).toBe(320);
    expect(getSplatCount(splatMesh)).toBe(320);
    expect(isGaussianSplatMesh(splatMesh)).toBe(true);

    // Export .splat binary
    const splatBlob = ctrl.exportSplatBlob(splatMesh, 'splat', true);
    expect(splatBlob.size).toBe(320 * SPLAT_RECORD_BYTES);

    // Export .ply binary and verify header + round-trip PLY -> Splat conversion
    const plyBlob = ctrl.exportSplatBlob(splatMesh, 'ply', true);
    const plyBuffer = await plyBlob.arrayBuffer();
    const headerText = new TextDecoder().decode(new Uint8Array(plyBuffer, 0, Math.min(400, plyBuffer.byteLength)));
    expect(headerText).toContain('ply');
    expect(headerText).toContain('element vertex 320');
    expect(headerText).toContain('property float f_dc_0');

    const converted = await GaussianSplattingMesh.ConvertPLYWithSHToSplatAsync(plyBuffer) as { buffer: ArrayBuffer };
    expect(converted.buffer.byteLength).toBe(320 * SPLAT_RECORD_BYTES);
  });

  it('exposes AI tools (modeler_gaussian_splat & modeler_mesh_to_splats), skill, and splat-aware scene summary', async () => {
    const skill = BUILT_IN_AGENT_SKILLS.find((s) => s.id === 'gaussian-splatting');
    expect(skill).toBeDefined();
    expect(skill!.enabled).toBe(true);

    const registry = service.aiAgent.toolRegistry;
    expect(registry.has('modeler_gaussian_splat')).toBe(true);
    expect(registry.has('modeler_mesh_to_splats')).toBe(true);

    const ctx = service.aiAgent.createToolContext();

    // Create procedural foliage splat via AI tool
    const createRes = JSON.parse(
      await registry.execute(
        'modeler_gaussian_splat',
        {
          action: 'create_preset',
          preset: 'foliage',
          name: 'ai_canopy',
          splatCount: 200,
          radius: 1.0,
          position: [0, 2, 0],
        },
        ctx
      )
    );
    expect(createRes.status).toBe('created');
    expect(createRes.splatCount).toBe(200);

    // Create a primitive box and convert it via modeler_mesh_to_splats
    await registry.execute(
      'modeler_create_primitive',
      { shape: 'Box', name: 'moss_cube', size: 1.0, color: '#339944', position: [3, 0.5, 0] },
      ctx
    );
    const convertRes = JSON.parse(
      await registry.execute(
        'modeler_mesh_to_splats',
        {
          targetMesh: 'moss_cube',
          name: 'moss_splats',
          targetSplatCount: 180,
          mode: 'surface',
          splatStyle: 'foliage',
          removeSource: true,
        },
        ctx
      )
    );
    expect(convertRes.status).toBe('converted');
    expect(convertRes.splatCount).toBe(180);

    // Verify splatStyle: 'foliage' produces anisotropic leaf-blade splats (sx > sy > sz) and capped scale
    const foliageMesh = service.gaussianSplatController.resolveSplatMesh('moss_splats')!;
    const firstLeaf = readSplatRecord(
      new Float32Array(foliageMesh.splatsData!),
      new Uint8Array(foliageMesh.splatsData!),
      0
    );
    expect(firstLeaf.sx).toBeGreaterThan(firstLeaf.sy);
    expect(firstLeaf.sy).toBeGreaterThan(firstLeaf.sz);
    expect(firstLeaf.sx).toBeLessThan(0.15);

    // Scene summary should flag splats with triangles: 0 and splatCount without false proportion warnings
    const summary = service.aiAgent.buildSceneSummary();
    const splatEntries = summary.meshes.filter((m: any) => m.isGaussianSplat);
    expect(splatEntries.length).toBe(2);
    expect(splatEntries[0].triangles).toBe(0);
    expect(splatEntries[0].splatCount).toBeGreaterThan(0);
    expect(summary.diagnostics.budgetStatus).toBe('within_budget');
  });

  it('wires GaussianSplatEditorTool into MeshEditorApp, Outliner, and CSG filters cleanly', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'gs-app-container';
    document.body.appendChild(container);

    const app = new MeshEditorApp({ container, engine });
    try {
      const tool = app.getToolByDialogId('dialog-gaussian-splat');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('gaussian_splatting');

      const splat = app.service.gaussianSplatController.createProceduralPreset('cloud', {
        name: 'ui_cloud',
        splatCount: 120,
      });
      app.updateOutliner();
      app.updateCSGGUI();
      app.updateGaussianSplatUI();

      const outlinerHtml = app.outlinerTreeContainer.innerHTML;
      expect(outlinerHtml).toContain('ui_cloud');
      expect(outlinerHtml).toContain('120 Splats');

      // CSG target should not select a GaussianSplattingMesh
      expect(app.csgParams.targetMesh).toBe('None');

      const badge = app.getElement('gsSelectedBadge');
      expect(badge?.textContent).toContain('ui_cloud');
      expect(badge?.textContent).toContain('120 splats');
      expect(splat.isDisposed()).toBe(false);
    } finally {
      app.dispose();
      container.remove();
    }
  });
});
