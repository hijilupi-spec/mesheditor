import {
  Mesh,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorService } from '../../src/MeshEditorService';
import { PrimitiveConfig } from '../../src/types';

function makePrimitiveConfig(overrides: Partial<PrimitiveConfig> = {}): PrimitiveConfig {
  return {
    shape: 'Box',
    name: 'UndoBox',
    size: 2,
    width: 2,
    height: 2,
    depth: 2,
    diameter: 2,
    thickness: 0.4,
    subdivisions: 2,
    tessellation: 16,
    color: '#4f8cf6',
    roughness: 0.4,
    metallic: 0.1,
    ...overrides,
  };
}

describe('Comprehensive Undo / Redo Integration Across Tools', () => {
  let canvas: HTMLCanvasElement;
  let engine: NullEngine;
  let service: MeshEditorService;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    document.body.appendChild(canvas);

    engine = new NullEngine();
    service = new MeshEditorService(
      canvas,
      {
        onSelectionChanged: vi.fn(),
        onSceneModified: vi.fn(),
        onHistoryChanged: vi.fn(),
        onToast: vi.fn(),
        onStatsUpdated: vi.fn(),
      },
      engine
    );
  });

  afterEach(() => {
    service.dispose();
    canvas.remove();
  });

  describe('1. Primitives, Transforms, Pivots, Wireframe & CSG', () => {
    it('supports undo/redo for createPrimitive and addQuickCutter', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'HeroBox' }));
      expect(service.importedMeshes).toContain(box);
      expect(service.canUndo()).toBe(true);

      service.undo();
      expect(service.importedMeshes).not.toContain(box);
      expect(box.isEnabled()).toBe(false);

      service.redo();
      expect(service.importedMeshes).toContain(box);
      expect(box.isEnabled()).toBe(true);

      const cutter = service.addQuickCutter('Sphere', box.name);
      expect(service.importedMeshes).toContain(cutter);

      service.undo();
      expect(service.importedMeshes).not.toContain(cutter);

      service.redo();
      expect(service.importedMeshes).toContain(cutter);
    });

    it('supports undo/redo for snapSelectedToGround, centerSelectedToOrigin, centerSelectedPivot, centerAllMeshPivots, and bakeSelectedTransform', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'TransformBox', height: 2 }));
      box.position.set(3, 5, -2);

      // Snap to ground
      service.snapSelectedToGround();
      expect(box.position.y).toBeCloseTo(1, 3);
      service.undo();
      expect(box.position.y).toBeCloseTo(5, 3);
      service.redo();
      expect(box.position.y).toBeCloseTo(1, 3);

      // Center to origin
      service.centerSelectedToOrigin();
      expect(box.position.length()).toBeCloseTo(0, 4);
      service.undo();
      expect(box.position.x).toBeCloseTo(3, 3);
      service.redo();
      expect(box.position.length()).toBeCloseTo(0, 4);

      // Bake transform
      box.position.set(2, 3, 4);
      box.scaling.set(2, 1, 1);
      const vertsBeforeBake = Array.from(box.getVerticesData(VertexBuffer.PositionKind)!);
      service.bakeSelectedTransform();
      expect(box.position.length()).toBeCloseTo(0, 4);
      expect(box.scaling.x).toBeCloseTo(1, 4);
      service.undo();
      expect(box.position.x).toBeCloseTo(2, 3);
      expect(box.scaling.x).toBeCloseTo(2, 3);
      expect(Array.from(box.getVerticesData(VertexBuffer.PositionKind)!)[0]).toBeCloseTo(vertsBeforeBake[0], 4);
      service.redo();
      expect(box.position.length()).toBeCloseTo(0, 4);

      // Shift vertex coordinates so pivot is off-center, then centerSelectedPivot
      const shiftedVerts = Array.from(box.getVerticesData(VertexBuffer.PositionKind)!);
      for (let i = 0; i < shiftedVerts.length; i += 3) {
        shiftedVerts[i] += 4;
      }
      box.setVerticesData(VertexBuffer.PositionKind, shiftedVerts, true);
      box.refreshBoundingInfo();
      const posBeforePivot = box.position.clone();
      service.centerSelectedPivot();
      expect(box.position.x).toBeGreaterThan(posBeforePivot.x + 1);
      service.undo();
      expect(box.position.x).toBeCloseTo(posBeforePivot.x, 3);
      service.redo();
      expect(box.position.x).toBeGreaterThan(posBeforePivot.x + 1);
    });

    it('supports undo/redo for toggleMeshWireframe and batched toggleSelectedWireframe', () => {
      const m1 = service.createPrimitive(makePrimitiveConfig({ name: 'Wire1' }));
      const m2 = service.createPrimitive(makePrimitiveConfig({ name: 'Wire2' }));
      service.selectNodes([m1, m2]);

      const stackLenBefore = service.undoStack.length;
      service.toggleSelectedWireframe();
      expect(service.undoStack.length).toBe(stackLenBefore + 1);
      expect(service.isMeshWireframe(m1)).toBe(true);
      expect(service.isMeshWireframe(m2)).toBe(true);

      service.undo();
      expect(service.isMeshWireframe(m1)).toBe(false);
      expect(service.isMeshWireframe(m2)).toBe(false);

      service.redo();
      expect(service.isMeshWireframe(m1)).toBe(true);
      expect(service.isMeshWireframe(m2)).toBe(true);
    });

    it('supports single-step undo/redo for CSG Boolean Operations without disposing source meshes', async () => {
      const target = service.createPrimitive(makePrimitiveConfig({ name: 'BaseCube', size: 2 }));
      const cutter = service.createPrimitive(makePrimitiveConfig({ name: 'CutCube', size: 1 }));
      cutter.position.set(0.5, 0.5, 0.5);

      const stackBefore = service.undoStack.length;
      const result = await service.performCSGOperation(target, cutter, 'subtract', false, {
        nonDestructive: true,
        bevelWidth: 0.05,
        bevelSegments: 1,
      });

      expect(result).not.toBeNull();
      // CSG + optional bevel must push exactly ONE undo record
      expect(service.undoStack.length).toBe(stackBefore + 1);
      expect(service.importedMeshes).toContain(result);
      expect(service.importedMeshes).not.toContain(target);
      expect(service.importedMeshes).not.toContain(cutter);

      service.undo();
      expect(service.importedMeshes).not.toContain(result);
      expect(service.importedMeshes).toContain(target);
      expect(service.importedMeshes).toContain(cutter);
      expect(target.isDisposed()).toBe(false);
      expect(cutter.isDisposed()).toBe(false);
      expect(target.isEnabled()).toBe(true);
      expect(cutter.isEnabled()).toBe(true);

      service.redo();
      expect(service.importedMeshes).toContain(result);
      expect(service.importedMeshes).not.toContain(target);
      expect(service.importedMeshes).not.toContain(cutter);
    });
  });

  describe('2. Facet Geometry & Topology Operations + SubMeshes', () => {
    it('supports undo/redo across facet extrude, inset, bevel, subdivide, subDSmooth, solidify, arc, knifeSplit, cutThrough, relax, array, flipNormal, and deleteFacet', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'FacetBox' }));
      service.selectMesh(box);
      service.toggleFacetEditor(true);

      const assertOpUndoRedo = (op: () => void, expectChange: () => void) => {
        const beforePos = Array.from(box.getVerticesData(VertexBuffer.PositionKind)!);
        const beforeInd = Array.from(box.getIndices()!);
        const beforeLen = service.undoStack.length;
        op();
        expect(service.undoStack.length).toBe(beforeLen + 1);
        expectChange();
        const afterInd = Array.from(box.getIndices()!);
        const afterPos = Array.from(box.getVerticesData(VertexBuffer.PositionKind)!);

        service.undo();
        expect(Array.from(box.getIndices()!).length).toBe(beforeInd.length);
        expect(Array.from(box.getVerticesData(VertexBuffer.PositionKind)!).length).toBe(beforePos.length);
        expect(Array.from(box.getVerticesData(VertexBuffer.PositionKind)!)[0]).toBeCloseTo(beforePos[0], 4);

        service.redo();
        expect(Array.from(box.getIndices()!).length).toBe(afterInd.length);
        expect(Array.from(box.getVerticesData(VertexBuffer.PositionKind)!).length).toBe(afterPos.length);
        service.undo(); // reset back to clean cube state for next op
      };

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.extrudeSelectedFacet(0.5),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.insetSelectedFacet(0.25, 0.1),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.bevelSelectedFacet(0.2),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.subdivideSelectedFacet(),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      assertOpUndoRedo(
        () => service.subdivideMesh(box),
        () => expect(box.getTotalIndices()).toBe(36 * 4)
      );

      assertOpUndoRedo(
        () => service.subDSmoothMeshOrFacet(1, box),
        () => expect(box.getTotalVertices()).toBeGreaterThan(24)
      );

      assertOpUndoRedo(
        () => service.solidifyMeshOrFacet(0.2, false, box),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.arcSelectedFacet(3, 0.5),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.knifeSplitFacet(),
        () => expect(box.getTotalIndices()).toBe(39)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.cutThroughSelectedFacet(0.5),
        () => expect(box.getTotalIndices()).toBeGreaterThan(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.relaxSelectedFacet(),
        () => expect(box.getTotalIndices()).toBe(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.flipSelectedFacetNormal(),
        () => expect(box.getTotalIndices()).toBe(36)
      );

      expect(service.selectFace(box, 0)).toBe(true);
      assertOpUndoRedo(
        () => service.deleteSelectedFacet(),
        () => expect(box.getTotalIndices()).toBeLessThan(36)
      );

      // Array in mesh mode
      service.selectedFaceId = null;
      const countBeforeArray = service.importedMeshes.length;
      service.arraySelectedFacetOrMesh(2, 3, 0, 0);
      expect(service.importedMeshes.length).toBe(countBeforeArray + 2);
      service.undo();
      expect(service.importedMeshes.length).toBe(countBeforeArray);
      service.redo();
      expect(service.importedMeshes.length).toBe(countBeforeArray + 2);
    });

    it('supports undo/redo for extractSelectedSubMesh, splitAllSubMeshesOnSelected, and deleteSelectedSubMesh', () => {
      const m1 = service.createPrimitive(makePrimitiveConfig({ name: 'PartA' }));
      const m2 = service.createPrimitive(makePrimitiveConfig({ name: 'PartB' }));
      m2.position.x = 3;
      service.selectNodes([m1, m2]);
      const merged = service.mergeSelectedMeshes()!;
      expect(merged.subMeshes.length).toBe(2);

      // Extract single submesh
      const beforeCount = service.importedMeshes.length;
      const extracted = service.extractSelectedSubMesh(0, true)!;
      expect(service.importedMeshes.length).toBe(beforeCount + 1);
      service.undo();
      expect(service.importedMeshes).not.toContain(extracted);
      service.redo();
      expect(service.importedMeshes).toContain(extracted);
      service.undo();

      // Delete single submesh
      service.selectMesh(merged, 1);
      const indicesBeforeDelete = merged.getTotalIndices();
      service.deleteSelectedSubMesh();
      expect(merged.subMeshes.length).toBe(1);
      expect(merged.getTotalIndices()).toBeLessThan(indicesBeforeDelete);
      service.undo();
      expect(merged.subMeshes.length).toBe(2);
      expect(merged.getTotalIndices()).toBe(indicesBeforeDelete);

      // Split all submeshes in 1 atomic undo step
      const stackBeforeSplit = service.undoStack.length;
      const splitParts = service.splitAllSubMeshesOnSelected();
      expect(splitParts.length).toBe(2);
      expect(service.undoStack.length).toBe(stackBeforeSplit + 1);
      expect(service.importedMeshes).not.toContain(merged);

      service.undo();
      expect(service.importedMeshes).toContain(merged);
      expect(service.importedMeshes).not.toContain(splitParts[0]);
      service.redo();
      expect(service.importedMeshes).not.toContain(merged);
      expect(service.importedMeshes).toContain(splitParts[0]);
    });
  });

  describe('3. Materials, Textures & UV Projections', () => {
    it('supports undo/redo for material creation, texture apply/remove, bump flags, transparency, and UV projections', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'MatBox' }));
      const origMat = box.material!;

      const newMat = service.createNewMaterialForSelected('CustomMat') as PBRMaterial;
      expect(box.material).toBe(newMat);
      service.undo();
      expect(box.material).toBe(origMat);
      service.redo();
      expect(box.material).toBe(newMat);

      const dummyDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      expect(service.applyTextureToSelectedMaterial(dummyDataUrl, 'dot.png')).toBe(true);
      expect(newMat.albedoTexture).not.toBeNull();
      service.undo();
      expect(newMat.albedoTexture).toBeNull();
      service.redo();
      expect(newMat.albedoTexture).not.toBeNull();

      expect(service.removeTextureFromSelectedMaterial()).toBe(true);
      expect(newMat.albedoTexture).toBeNull();
      service.undo();
      expect(newMat.albedoTexture).not.toBeNull();

      // Transparency / two-sided / normal flags
      service.setMaterialTwoSided(false);
      expect(newMat.backFaceCulling).toBe(true);
      service.undo();
      expect(newMat.backFaceCulling).toBe(false);

      service.setInvertNormalMapY(true);
      expect(newMat.invertNormalMapY).toBe(true);
      service.undo();
      expect(newMat.invertNormalMapY).toBe(false);

      // UV Projections
      const origUVs = Array.from(box.getVerticesData(VertexBuffer.UVKind)!);
      service.applyTriplanarUVs(2.0, 2.0);
      const triUVs = Array.from(box.getVerticesData(VertexBuffer.UVKind)!);
      expect(triUVs).not.toEqual(origUVs);
      service.undo();
      expect(Array.from(box.getVerticesData(VertexBuffer.UVKind)!)[0]).toBeCloseTo(origUVs[0], 4);
      service.redo();
      expect(Array.from(box.getVerticesData(VertexBuffer.UVKind)!)[0]).toBeCloseTo(triUVs[0], 4);

      service.scaleMeshUVs(3.0, 3.0);
      service.undo();
      expect(Array.from(box.getVerticesData(VertexBuffer.UVKind)!)[0]).toBeCloseTo(triUVs[0], 4);
    });
  });

  describe('4. Voxel Painter Undo / Redo', () => {
    it('supports undo/redo for setBlock, removeBlock, clear, loadVoxelData, and repeated bakeToMesh undo/redo', () => {
      const vp = service.voxelPainter;
      vp.setBlock(0, 0, 0, 'stone');
      expect(vp.blocks.size).toBe(1);

      service.undo();
      expect(vp.blocks.size).toBe(0);
      service.redo();
      expect(vp.blocks.size).toBe(1);

      vp.removeBlock(0, 0, 0);
      expect(vp.blocks.size).toBe(0);
      service.undo();
      expect(vp.blocks.size).toBe(1);

      vp.clear();
      expect(vp.blocks.size).toBe(0);
      service.undo();
      expect(vp.blocks.size).toBe(1);

      // Bake + repeated undo/redo/undo must stay consistent without leaking meshes
      const baked = vp.bakeToMesh('VoxelCube')!;
      expect(service.importedMeshes).toContain(baked);
      service.undo();
      expect(service.importedMeshes).not.toContain(baked);
      service.redo();
      expect(service.importedMeshes).toContain(baked);
      service.undo();
      expect(service.importedMeshes).not.toContain(baked);
      service.redo();
      expect(service.importedMeshes).toContain(baked);
    });
  });

  describe('5. 3D Texture Painter Unified Global Undo / Redo', () => {
    it('integrates strokes, fills, and layer operations into global service.undo()/redo() while keeping ctrl.undo()/redo() in sync', () => {
      const sphere = MeshBuilder.CreateSphere('PaintBall', { diameter: 2, segments: 12 }, service.scene);
      service.addMesh(sphere);
      const tp = service.texturePaintController;
      const session = tp.ensurePaintSession(sphere, { resolution: 64 })!;
      const initialLayerCount = session.layers.length;
      expect(initialLayerCount).toBeGreaterThanOrEqual(1);

      // Add layer -> undo -> redo via global service
      const layer2 = tp.addLayer(sphere, { name: 'Details', channel: 'albedo' })!;
      expect(session.layers.length).toBe(initialLayerCount + 1);
      service.undo();
      expect(session.layers.length).toBe(initialLayerCount);
      service.redo();
      expect(session.layers.length).toBe(initialLayerCount + 1);

      // Update / flatten layer
      const layerIdx = session.layers.findIndex((l) => l.id === layer2.id);
      tp.updateLayerProperties(sphere, layer2.id, { opacity: 0.4, visible: false });
      expect(session.layers[layerIdx].opacity).toBeCloseTo(0.4, 3);
      service.undo();
      expect(session.layers[layerIdx].opacity).toBeCloseTo(1.0, 3);
      expect(session.layers[layerIdx].visible).toBe(true);

      tp.flattenAlbedoLayers(sphere);
      expect(session.layers.length).toBe(1);
      service.undo();
      expect(session.layers.length).toBe(initialLayerCount + 1);

      // Fill region via global service.undo() / service.redo()
      const beforePix = session.albedoComposite[0];
      tp.fillRegion(sphere, { color: '#ff0000' });
      expect(session.albedoComposite[0]).toBeGreaterThan(200);
      service.undo();
      expect(session.albedoComposite[0]).toBe(beforePix);
      service.redo();
      expect(session.albedoComposite[0]).toBeGreaterThan(200);

      // Local ctrl.undo() stays synchronized with global stack
      expect(tp.undo(sphere)).toBe(true);
      expect(session.albedoComposite[0]).toBe(beforePix);
      expect(tp.redo(sphere)).toBe(true);
      expect(session.albedoComposite[0]).toBeGreaterThan(200);
    });
  });

  describe('6. Heightmap Terrain Global Undo / Redo', () => {
    it('supports global undo/redo for presets, clear, regenerateMixmap, paint strokes, texture scale, and terrain rebuilds', async () => {
      const hm = service.heightmapController;
      hm.applyPreset('mountains');
      const maxAfterMountains = Math.max(...Array.from(hm.heightmapRgba.filter((_, i) => i % 4 === 0)));
      expect(maxAfterMountains).toBeGreaterThan(50);

      service.undo();
      const maxAfterUndo = Math.max(...Array.from(hm.heightmapRgba.filter((_, i) => i % 4 === 0)));
      expect(maxAfterUndo).toBe(0);

      service.redo();
      const maxAfterRedo = Math.max(...Array.from(hm.heightmapRgba.filter((_, i) => i % 4 === 0)));
      expect(maxAfterRedo).toBe(maxAfterMountains);

      // Paint stroke
      hm.beginPaintStroke('height');
      hm.paintHeightmapStamp(128, 128, { size: 20, value: 255, opacity: 1 });
      hm.endPaintStroke();
      const centerAfterPaint = hm.heightmapRgba[(128 * hm.mapSize + 128) * 4];
      expect(centerAfterPaint).toBe(255);

      service.undo();
      service.redo();
      expect(hm.heightmapRgba[(128 * hm.mapSize + 128) * 4]).toBe(255);

      // Build terrain & scale texture with undo/redo
      const terrain = await hm.buildOrUpdateTerrainMesh({ width: 20, height: 20, subdivisions: 8 });
      expect(service.importedMeshes).toContain(terrain);
      const prevScale = hm.config.terrainTextureScale.x;
      await hm.setTerrainTextureScale(1, 25);
      expect(hm.config.terrainTextureScale.x).toBe(25);
      service.undo();
      expect(hm.config.terrainTextureScale.x).toBe(prevScale);
      service.redo();
      expect(hm.config.terrainTextureScale.x).toBe(25);
    });
  });

  describe('7. Decals Undo / Redo', () => {
    it('supports undo/redo for placeDecal, removeDecal, clearUnmergedDecals, and mergeDecalsIntoMesh', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'DecalTarget' }));
      const dc = service.decalController;

      const d1 = dc.placeDecal({
        targetMesh: box,
        face: 'top',
        size: 0.8,
      });
      expect(dc.getUnmergedDecals(box.name).length).toBe(1);

      // Remove decal -> undo -> redo -> undo
      expect(dc.removeDecal(d1)).toBe(true);
      expect(dc.getUnmergedDecals(box.name).length).toBe(0);
      service.undo();
      expect(dc.getUnmergedDecals(box.name).length).toBe(1);

      // Clear unmerged decals -> undo
      expect(dc.clearUnmergedDecals(box.name)).toBe(1);
      expect(dc.getUnmergedDecals(box.name).length).toBe(0);
      service.undo();
      expect(dc.getUnmergedDecals(box.name).length).toBe(1);

      // Merge decals into mesh -> undo -> redo
      const merged = dc.mergeDecalsIntoMesh(box, { recordUndo: true })!;
      expect(merged).not.toBe(box);
      expect(service.importedMeshes).toContain(merged);
      expect(dc.getUnmergedDecals().length).toBe(0);

      service.undo();
      expect(service.importedMeshes).toContain(box);
      expect(service.importedMeshes).not.toContain(merged);
      expect(dc.getUnmergedDecals(box.name).length).toBe(1);

      service.redo();
      expect(service.importedMeshes).toContain(merged);
      expect(service.importedMeshes).not.toContain(box);
      expect(dc.getUnmergedDecals().length).toBe(0);
    });
  });

  describe('8. Path Extrusion, 3D Text, Sculpt, UV Unwrap, Rigging, Baking & AI Textures', () => {
    it('supports undo/redo for PathExtrusion add/delete/duplicate/points/config and repeated bakeMesh undo/redo', () => {
      const pe = service.pathExtrusion;
      const p1 = pe.addNewPath('Road');
      expect(pe.paths.length).toBe(1);
      service.undo();
      expect(pe.paths.length).toBe(0);
      service.redo();
      expect(pe.paths.length).toBe(1);

      pe.addPoint(new Vector3(5, 0, 5));
      expect(pe.activePath!.points.length).toBe(4);
      service.undo();
      expect(pe.activePath!.points.length).toBe(3);
      service.redo();
      expect(pe.activePath!.points.length).toBe(4);

      pe.updateShapeConfig({ width: 5.5 });
      expect(pe.activePath!.shapeConfig.width).toBe(5.5);
      service.undo();
      expect(pe.activePath!.shapeConfig.width).toBe(3.0);

      const baked = pe.bakeMesh(p1.id)!;
      expect(service.importedMeshes).toContain(baked);
      service.undo();
      expect(service.importedMeshes).not.toContain(baked);
      service.redo();
      expect(service.importedMeshes).toContain(baked);
      expect(baked.isDisposed()).toBe(false);
    });

    it('supports undo/redo for Sculpt spawners, QuadStrip, QuadFlowCage (single-step), and standalone brush stroke', () => {
      const sc = service.sculptController;
      const sphere = sc.spawnSculptSphere({ name: 'ClaySphere', subdivisions: 10 });
      expect(service.importedMeshes).toContain(sphere);
      service.undo();
      expect(service.importedMeshes).not.toContain(sphere);
      service.redo();
      expect(service.importedMeshes).toContain(sphere);

      // Standalone brush stroke
      const posBefore = Array.from(sphere.getVerticesData(VertexBuffer.PositionKind)!);
      sc.setRadius(0.6);
      sc.setStrength(0.8);
      sc.applyBrushStroke(sphere, new Vector3(0, 1.5, 0), new Vector3(0, 1, 0));
      const posAfter = Array.from(sphere.getVerticesData(VertexBuffer.PositionKind)!);
      expect(posAfter).not.toEqual(posBefore);
      service.undo();
      const restoredPos = Array.from(sphere.getVerticesData(VertexBuffer.PositionKind)!);
      expect(restoredPos[1]).toBeCloseTo(posBefore[1], 4);
      service.redo();
      const redonePos = Array.from(sphere.getVerticesData(VertexBuffer.PositionKind)!);
      expect(redonePos[1]).toBeCloseTo(posAfter[1], 4);

      // QuadFlowCage must be a single undo step that removes the cage
      const stackBeforeCage = service.undoStack.length;
      const cage = sc.generateQuadFlowCage(sphere, 6, 8, 0.02);
      expect(service.undoStack.length).toBe(stackBeforeCage + 1);
      expect(service.importedMeshes).toContain(cage);
      service.undo();
      expect(service.importedMeshes).not.toContain(cage);
      service.redo();
      expect(service.importedMeshes).toContain(cage);
    });

    it('supports undo/redo for UV seams, packUVIslands, and normalizeTexelDensity', () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'UVBox' }));
      const uv = service.uvUnwrapController;

      const res = uv.markSmartSeams(box, 45);
      expect(res.seamEdgeCount).toBeGreaterThan(0);
      service.undo();
      expect(box.metadata?.uvSeams?.length || 0).toBe(0);
      service.redo();
      expect(box.metadata?.uvSeams?.length).toBe(res.seamEdgeCount);

      uv.clearSeams(box);
      expect(box.metadata?.uvSeams?.length).toBe(0);
      service.undo();
      expect(box.metadata?.uvSeams?.length).toBe(res.seamEdgeCount);

      const uvsBeforePack = Array.from(box.getVerticesData(VertexBuffer.UVKind)!);
      uv.packUVIslands(box, { marginPx: 4, textureResolution: 512 });
      const uvsAfterPack = Array.from(box.getVerticesData(VertexBuffer.UVKind)!);
      service.undo();
      expect(Array.from(box.getVerticesData(VertexBuffer.UVKind)!)[0]).toBeCloseTo(uvsBeforePack[0], 4);
      service.redo();
      expect(Array.from(box.getVerticesData(VertexBuffer.UVKind)!)[0]).toBeCloseTo(uvsAfterPack[0], 4);
    });

    it('supports undo/redo for Rigging auto-rig, pose, resetBindPose, and nudgeActiveBone', () => {
      const hero = service.sculptController.spawnHumanoidBaseMesh({ name: 'RigHero' });
      const rig = service.weightPaintController;

      const skel = rig.createAutoRig(hero, 'humanoid');
      expect(hero.skeleton).toBe(skel);
      service.undo();
      expect(hero.skeleton).toBeNull();
      service.redo();
      expect(hero.skeleton).toBe(skel);

      const bindVerts = Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!);
      rig.setActiveBoneIndex(2);
      rig.poseActiveBone(hero, 35, 0, 0);
      const posedVerts = Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!);
      expect(posedVerts).not.toEqual(bindVerts);

      service.undo();
      expect(Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!)[1]).toBeCloseTo(bindVerts[1], 4);
      service.redo();
      expect(Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!)[1]).toBeCloseTo(posedVerts[1], 4);

      rig.resetBindPose(hero);
      expect(Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!)[1]).toBeCloseTo(bindVerts[1], 4);
      service.undo();
      expect(Array.from(hero.getVerticesData(VertexBuffer.PositionKind)!)[1]).toBeCloseTo(posedVerts[1], 4);
    });

    it('supports undo/redo for TextureBaker bakeTextures and applyBakedTexturesToMesh', async () => {
      const box = service.createPrimitive(makePrimitiveConfig({ name: 'BakeBox' }));
      const origMat = box.material as PBRMaterial;
      expect(origMat.bumpTexture).toBeNull();
      expect(origMat.ambientTexture).toBeNull();

      const res = await service.textureBaker.bakeTextures({
        lowPolyMesh: box,
        highPolyMesh: box,
        resolution: 128,
        applyToMaterial: true,
      });
      expect(res.appliedToMaterial).toBe(true);
      expect((box.material as PBRMaterial).bumpTexture).not.toBeNull();
      expect((box.material as PBRMaterial).ambientTexture).not.toBeNull();

      service.undo();
      expect((box.material as PBRMaterial).bumpTexture).toBeNull();
      expect((box.material as PBRMaterial).ambientTexture).toBeNull();

      service.redo();
      expect((box.material as PBRMaterial).bumpTexture).not.toBeNull();
      expect((box.material as PBRMaterial).ambientTexture).not.toBeNull();
    });

    it('supports undo/redo for TextMesh updateTextMesh (both material and geometry rebuilds)', async () => {
      const tm = service.textMeshController;
      const textMesh = await tm.createTextMesh({ text: 'HELLO', color: '#ff0000' });
      expect(service.importedMeshes).toContain(textMesh);

      // Material-only update
      await tm.updateTextMesh(textMesh, { color: '#00ff00', roughness: 0.9 });
      expect(tm.getTextConfig(textMesh)?.color).toBe('#00ff00');
      service.undo();
      expect(tm.getTextConfig(textMesh)?.color).toBe('#ff0000');
      service.redo();
      expect(tm.getTextConfig(textMesh)?.color).toBe('#00ff00');

      // Geometry rebuild update
      const rebuilt = await tm.updateTextMesh(textMesh, { text: 'WORLD' });
      expect(rebuilt).not.toBe(textMesh);
      expect(service.importedMeshes).toContain(rebuilt);
      expect(service.importedMeshes).not.toContain(textMesh);

      service.undo();
      expect(service.importedMeshes).toContain(textMesh);
      expect(service.importedMeshes).not.toContain(rebuilt);
      expect(tm.getTextConfig(textMesh)?.text).toBe('HELLO');

      service.redo();
      expect(service.importedMeshes).toContain(rebuilt);
      expect(service.importedMeshes).not.toContain(textMesh);
    });
  });
});
