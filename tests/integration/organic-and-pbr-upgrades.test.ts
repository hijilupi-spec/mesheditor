import {
  Color3,
  Mesh,
  MeshBuilder,
  MultiMaterial,
  NullEngine,
  PBRMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeshEditorService } from '../../src/MeshEditorService';
import {
  applyRootTipGradient,
  applyStandProudOffset,
  applyVertexPaintRegions,
  buildTaperedSweepVertexData,
  computeParallelTransportFrames,
  subdivideCatmullClarkMesh,
} from '../../src/geometry/organicGeometry';
import {
  applyCanonicalPbrPreset,
  CANONICAL_MATERIAL_PRESETS,
  clampAlbedoByte,
  clampPbrColor3,
  delightImageDataPixels,
  extractPbrBuffersFromRgba,
  mixPalette,
  synthesizePbrTextureBuffers,
} from '../../src/tools/textureUtils';

describe('Tasteful PBR Texturing & Organic Geometry Upgrades', () => {
  let canvas: HTMLCanvasElement;
  let engine: NullEngine;
  let service: MeshEditorService;

  beforeEach(() => {
    localStorage.clear();
    canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.width = 640;
    canvas.height = 480;
    document.body.appendChild(canvas);
    engine = new NullEngine();
    service = new MeshEditorService(canvas, {}, engine);
  });

  afterEach(() => {
    service.dispose();
    canvas.remove();
  });

  describe('1. PBR Albedo Clamping, Palette Mixing & 4-Map Procedural Synthesis', () => {
    it('clamps dielectric albedos to [30, 240] and mixes multi-stop palettes smoothly', () => {
      expect(clampAlbedoByte(0)).toBe(30);
      expect(clampAlbedoByte(255)).toBe(240);
      expect(clampAlbedoByte(142.4)).toBe(142);

      const clampedDielectric = clampPbrColor3(new Color3(0.0, 1.0, 0.5), false);
      expect(clampedDielectric.r).toBeCloseTo(30 / 255, 4);
      expect(clampedDielectric.g).toBeCloseTo(240 / 255, 4);
      expect(clampedDielectric.b).toBeCloseTo(0.5, 4);

      const clampedMetal = clampPbrColor3(new Color3(0.01, 1.0, 0.8), true);
      expect(clampedMetal.r).toBeCloseTo(0.08, 4);
      expect(clampedMetal.g).toBeCloseTo(0.98, 4);

      const stops: Array<[number, number, number]> = [
        [40, 40, 40],
        [120, 80, 60],
        [220, 200, 180],
      ];
      expect(mixPalette(stops, 0)).toEqual([40, 40, 40]);
      expect(mixPalette(stops, 0.5)).toEqual([120, 80, 60]);
      expect(mixPalette(stops, 1)).toEqual([220, 200, 180]);
      expect(mixPalette(stops, 0.25)).toEqual([80, 60, 50]);
    });

    it('synthesizes coordinated 4-map PBR buffers (albedo, normal, ORM, cavity AO) within [30, 240]', () => {
      const buffers = synthesizePbrTextureBuffers({
        type: 'skin',
        size: 64,
        palette: ['#b57b5c', '#d49a79', '#e2b599'],
        baseRoughness: 0.54,
        roughnessVariation: 0.16,
        normalStrength: 1.5,
        aoStrength: 0.65,
        seed: 7,
      });

      const pixelCount = 64 * 64;
      expect(buffers.albedoRgba.length).toBe(pixelCount * 4);
      expect(buffers.normalRgba.length).toBe(pixelCount * 4);
      expect(buffers.ormRgba.length).toBe(pixelCount * 4);
      expect(buffers.aoRgba.length).toBe(pixelCount * 4);

      let minAlbedo = 255;
      let maxAlbedo = 0;
      let normalZSum = 0;
      let minOrmG = 255;
      let maxOrmG = 0;
      let minAo = 255;
      let maxAo = 0;

      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        for (let c = 0; c < 3; c++) {
          const v = buffers.albedoRgba[idx + c];
          if (v < minAlbedo) minAlbedo = v;
          if (v > maxAlbedo) maxAlbedo = v;
        }
        expect(buffers.albedoRgba[idx + 3]).toBe(255);
        normalZSum += buffers.normalRgba[idx + 2];
        if (buffers.ormRgba[idx + 1] < minOrmG) minOrmG = buffers.ormRgba[idx + 1];
        if (buffers.ormRgba[idx + 1] > maxOrmG) maxOrmG = buffers.ormRgba[idx + 1];
        if (buffers.aoRgba[idx] < minAo) minAo = buffers.aoRgba[idx];
        if (buffers.aoRgba[idx] > maxAo) maxAo = buffers.aoRgba[idx];
      }

      expect(minAlbedo).toBeGreaterThanOrEqual(30);
      expect(maxAlbedo).toBeLessThanOrEqual(240);
      expect(normalZSum / pixelCount).toBeGreaterThan(180);
      expect(maxOrmG - minOrmG).toBeGreaterThan(5);
      expect(maxAo - minAo).toBeGreaterThan(5);
    });

    it('de-lits uneven directional shading and extracts 4 PBR buffers cleanly', () => {
      const width = 32;
      const height = 32;
      const src = new Uint8ClampedArray(width * height * 4);

      // Synthetic shaded tile: smooth periodic directional spotlight across X with high-frequency grain
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const wave = 0.5 + 0.5 * Math.cos((x / width) * Math.PI * 2);
          const lamp = Math.round(25 + wave * 220);
          const localDetail = (x + y) % 2 === 0 ? 6 : -6;
          src[idx] = Math.max(0, Math.min(255, lamp + localDetail));
          src[idx + 1] = Math.max(0, Math.min(255, lamp * 0.85 + localDetail));
          src[idx + 2] = Math.max(0, Math.min(255, lamp * 0.7 + localDetail));
          src[idx + 3] = 255;
        }
      }

      const delit = delightImageDataPixels(src, width, height, 0.9, 0.25);

      let minDelit = 255;
      let maxDelit = 0;
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        for (let c = 0; c < 3; c++) {
          if (delit[idx + c] < minDelit) minDelit = delit[idx + c];
          if (delit[idx + c] > maxDelit) maxDelit = delit[idx + c];
        }
      }
      expect(minDelit).toBeGreaterThanOrEqual(30);
      expect(maxDelit).toBeLessThanOrEqual(240);

      // Bright peak (x=0) vs dark trough (x=width/2) contrast should compress substantially after de-lighting
      const peakIdx = 0;
      const troughIdx = (width / 2) * 4;
      const srcContrast = Math.abs(src[peakIdx] - src[troughIdx]);
      const delitContrast = Math.abs(delit[peakIdx] - delit[troughIdx]);
      expect(delitContrast).toBeLessThan(srcContrast * 0.65);

      const extracted = extractPbrBuffersFromRgba(src, width, height, {
        delight: true,
        baseRoughness: 0.6,
      });
      expect(extracted.normalRgba.length).toBe(src.length);
      expect(extracted.ormRgba.length).toBe(src.length);
      expect(extracted.aoRgba.length).toBe(src.length);
    });
  });

  describe('2. Canonical PBR Material Presets', () => {
    it('configures Babylon clearCoat, subSurface translucency, energy-compensated sheen, and anisotropy', () => {
      expect(Object.keys(CANONICAL_MATERIAL_PRESETS).length).toBeGreaterThanOrEqual(27);

      const skinMat = new PBRMaterial('test_skin', service.scene);
      applyCanonicalPbrPreset(skinMat, 'skin', { baseColorHex: '#ffffff' });
      expect(skinMat.clearCoat.isEnabled).toBe(true);
      expect(skinMat.subSurface.isTranslucencyEnabled).toBe(true);
      expect(skinMat.albedoColor.r).toBeCloseTo(240 / 255, 3);

      const velvetMat = new PBRMaterial('test_velvet', service.scene);
      applyCanonicalPbrPreset(velvetMat, 'velvet', { baseColorHex: '#802030', sheen: 0.8 });
      expect(velvetMat.sheen.isEnabled).toBe(true);
      expect(velvetMat.sheen.albedoScaling).toBe(true);
      // Energy compensation 1 / (1 - 0.157 * 0.8) ~= 1.1436 lifts base albedo slightly
      const uncompR = 128 / 255;
      const expectedComp = uncompR / (1 - 0.157 * 0.8);
      expect(velvetMat.albedoColor.r).toBeCloseTo(expectedComp, 3);

      const hairMat = new PBRMaterial('test_hair', service.scene);
      applyCanonicalPbrPreset(hairMat, 'hair');
      expect(hairMat.anisotropy.isEnabled).toBe(true);
      expect(hairMat.anisotropy.intensity).toBeGreaterThan(0.5);

      const candyMat = new PBRMaterial('test_candy', service.scene);
      applyCanonicalPbrPreset(candyMat, 'candy_coat');
      expect(candyMat.clearCoat.isEnabled).toBe(true);
      expect(candyMat.clearCoat.intensity).toBeGreaterThanOrEqual(0.9);
      expect(candyMat.clearCoat.roughness).toBeLessThan(0.1);
    });
  });

  describe('3. Organic Geometry: Parallel Transport Sweeps, Catmull-Clark & Vertex Colors', () => {
    it('computes twist-free Parallel Transport Frames along S-curves', () => {
      const points = [
        new Vector3(0, 0, 0),
        new Vector3(0.3, 0.5, 0.2),
        new Vector3(0.0, 1.0, 0.4),
        new Vector3(-0.3, 1.5, 0.1),
        new Vector3(0.1, 2.0, -0.2),
      ];
      const { tangents, normals, binormals } = computeParallelTransportFrames(points, false);
      expect(normals.length).toBe(points.length);
      for (let i = 0; i < points.length; i++) {
        expect(Math.abs(Vector3.Dot(tangents[i], normals[i]))).toBeLessThan(1e-4);
        expect(Math.abs(Vector3.Dot(normals[i], binormals[i]))).toBeLessThan(1e-4);
        if (i < points.length - 1) {
          expect(Vector3.Dot(normals[i], normals[i + 1])).toBeGreaterThan(0.7);
        }
      }
    });

    it('builds tapered elliptical sweep with single-vertex tip convergence when rx=0, rz=0', () => {
      const radialSegments = 12;
      const tubularSegments = 10;
      const vdata = buildTaperedSweepVertexData({
        stations: [
          { x: 0, y: 0, z: 0, rx: 0.2, rz: 0.12, twist: 0 },
          { x: 0.15, y: 0.5, z: 0.05, rx: 0.12, rz: 0.08, twist: 0.25 },
          { x: 0.22, y: 1.0, z: -0.05, rx: 0, rz: 0, twist: 0.4 },
        ],
        tubularSegments,
        radialSegments,
        smoothPath: true,
        capStart: true,
        capEnd: true,
      });

      const pos = vdata.positions as Float32Array | number[];
      const indices = vdata.indices as Uint32Array | number[];
      expect(pos.length).toBeGreaterThan(0);
      expect(indices.length).toBeGreaterThan(0);

      // Find vertices near the tip Y=1.0: all should converge closely to a single apex point (no open ring)
      let nearTipCount = 0;
      for (let i = 0; i < pos.length; i += 3) {
        if (pos[i + 1] > 0.999) {
          nearTipCount++;
          expect(pos[i]).toBeCloseTo(0.22, 3);
          expect(pos[i + 2]).toBeCloseTo(-0.05, 3);
        }
      }
      expect(nearTipCount).toBe(1);
    });

    it('subdivides cubes with quad pairing & SDF MultiMaterial meshes via Catmull-Clark', () => {
      const box = MeshBuilder.CreateBox('catmull_box', { size: 1 }, service.scene);
      const stats1 = subdivideCatmullClarkMesh(box, 1, true);
      expect(stats1.quadCount).toBe(24);
      expect(stats1.faceCount).toBe(24);
      expect(box.getTotalVertices()).toBeGreaterThan(24);
      expect(box.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);

      // MultiMaterial preservation test
      const p1 = MeshBuilder.CreateBox('mm_part1', { size: 1 }, service.scene);
      const p2 = MeshBuilder.CreateBox('mm_part2', { size: 1 }, service.scene);
      p2.position.x = 2;
      const m1 = new PBRMaterial('slot_a', service.scene);
      const m2 = new PBRMaterial('slot_b', service.scene);
      p1.material = m1;
      p2.material = m2;
      const merged = Mesh.MergeMeshes([p1, p2], true, true, undefined, true, true)!;
      expect(merged.material).toBeInstanceOf(MultiMaterial);
      const initialSubMeshCount = merged.subMeshes.length;
      const mergedStats = subdivideCatmullClarkMesh(merged, 1, true);
      expect(mergedStats.quadCount).toBe(48);
      expect(merged.subMeshes.length).toBe(initialSubMeshCount);
      const distinctMats = new Set(merged.subMeshes.map((sm) => sm.materialIndex));
      expect(distinctMats.size).toBe(2);
    });

    it('applies root-tip gradient, mirrored SDF vertex paint regions, and standProud clearance', () => {
      const cyl = MeshBuilder.CreateCylinder('grad_cyl', { height: 2, diameter: 0.4 }, service.scene);
      applyRootTipGradient(cyl, {
        rootColor: '#201010',
        tipColor: '#e0d0c0',
        axis: 'y',
      });
      const colors = cyl.getVerticesData(VertexBuffer.ColorKind)!;
      expect(colors.length).toBe(cyl.getTotalVertices() * 4);

      const pos = cyl.getVerticesData(VertexBuffer.PositionKind)!;
      let bottomR = 0;
      let topR = 0;
      for (let i = 0; i < cyl.getTotalVertices(); i++) {
        if (pos[i * 3 + 1] < -0.95) bottomR = colors[i * 4];
        if (pos[i * 3 + 1] > 0.95) topR = colors[i * 4];
      }
      expect(topR).toBeGreaterThan(bottomR + 0.5);

      // Mirrored cheek spots on a sphere
      const sphere = MeshBuilder.CreateSphere('paint_sphere', { diameter: 2, segments: 12 }, service.scene);
      applyVertexPaintRegions(
        sphere,
        [
          {
            shape: 'sphere',
            center: [0.85, 0, 0.3],
            radius: 0.45,
            softness: 0.1,
            color: '#e03040',
            mirrorX: true,
          },
        ],
        '#d0d0d0'
      );
      const spPos = sphere.getVerticesData(VertexBuffer.PositionKind)!;
      const spCol = sphere.getVerticesData(VertexBuffer.ColorKind)!;
      let paintedRight = false;
      let paintedLeft = false;
      for (let i = 0; i < sphere.getTotalVertices(); i++) {
        const x = spPos[i * 3];
        const z = spPos[i * 3 + 2];
        const r = spCol[i * 4];
        const b = spCol[i * 4 + 2];
        if (x > 0.5 && z > 0.1 && r > b + 0.2) paintedRight = true;
        if (x < -0.5 && z > 0.1 && r > b + 0.2) paintedLeft = true;
      }
      expect(paintedRight).toBe(true);
      expect(paintedLeft).toBe(true);

      // Stand-proud pushout test
      const shell = MeshBuilder.CreateSphere('shell_mesh', { diameter: 0.96, segments: 8 }, service.scene);
      applyStandProudOffset(shell, {
        center: [0, 0, 0],
        radii: [0.5, 0.5, 0.5],
        clearance: 0.05,
      });
      const outPos = shell.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < shell.getTotalVertices(); i++) {
        const rad = Math.hypot(outPos[i * 3], outPos[i * 3 + 1], outPos[i * 3 + 2]);
        expect(rad).toBeGreaterThanOrEqual(0.545);
      }
    });
  });

  describe('4. Tool Pipeline & Base Mesh Integration', () => {
    it('executes modeler_create_material with canonical preset, palette, and 4-map procedural synthesis', async () => {
      const resStr = await service.aiAgent.executeToolCall('modeler_create_material', {
        materialName: 'VelvetRobeMat',
        materialPreset: 'velvet',
        palette: ['#5e1828', '#7a2236', '#42101c'],
        withProceduralMaps: true,
      });
      const parsed = JSON.parse(resStr);
      expect(parsed.status).toBe('ok');
      expect(parsed.materialPreset).toBe('velvet');
      expect(parsed.materialName).toBe('VelvetRobeMat');

      const mat = service.scene.getMaterialByName('VelvetRobeMat') as PBRMaterial;
      expect(mat).toBeDefined();
      expect(mat.sheen.isEnabled).toBe(true);
      expect(mat.albedoTexture).toBeDefined();
      expect(mat.bumpTexture).toBeDefined();
      expect(mat.metallicTexture).toBeDefined();
      expect(mat.ambientTexture).toBeDefined();
      expect(mat.useRoughnessFromMetallicTextureGreen).toBe(true);
      expect(mat.useAmbientInGrayScale).toBe(true);
    });

    it('executes modeler_create_tube with tapered stations, tip convergence, and rootTipGradient', async () => {
      const resStr = await service.aiAgent.executeToolCall('modeler_create_tube', {
        name: 'demon_horn',
        stations: [
          { x: 0, y: 0, z: 0, rx: 0.12, rz: 0.1 },
          { x: 0.12, y: 0.3, z: 0.04, rx: 0.07, rz: 0.06, twist: 0.2 },
          { x: 0.18, y: 0.6, z: -0.04, rx: 0, rz: 0 },
        ],
        smoothPath: true,
        tubularSegments: 16,
        radialSegments: 12,
        materialPreset: 'bone_horn',
        rootTipGradient: {
          rootColor: '#2a2225',
          tipColor: '#dfd4c0',
          axis: 'y',
        },
      });
      const parsed = JSON.parse(resStr);
      expect(parsed.status).toBe('ok');
      expect(parsed.meshName).toBe('demon_horn');
      expect(parsed.taperedSweep).toBe(true);

      const hornMesh = service.scene.getMeshByName('demon_horn') as Mesh;
      expect(hornMesh).toBeDefined();
      expect(hornMesh.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(true);
      expect((hornMesh.material as PBRMaterial).clearCoat.isEnabled).toBe(true);
    });

    it('executes modeler_create_sdf_mesh with Catmull-Clark subdivide, vertexPaintRegions, and standProud', async () => {
      const resStr = await service.aiAgent.executeToolCall('modeler_create_sdf_mesh', {
        name: 'organic_slime',
        resolution: 18,
        subdivide: 1,
        materialPreset: 'candy_coat',
        parts: [
          { type: 'ellipsoid', center: [0, 0.5, 0], radii: [0.55, 0.45, 0.5], color: '#44aa88' },
          { type: 'sphere', center: [0.22, 0.8, 0.3], radius: 0.18, blend: 0.08, symmetryX: true },
        ],
        vertexPaintRegions: [
          { shape: 'axis_band', axis: 'y', min: 0.0, max: 0.35, softness: 0.15, color: '#246652' },
        ],
        standProud: {
          center: [0, 0.5, 0],
          radii: [0.42, 0.36, 0.4],
          clearance: 0.02,
        },
      });
      const parsed = JSON.parse(resStr);
      expect(parsed.status).toBe('ok');
      expect(parsed.meshName).toBe('organic_slime');
      expect(parsed.subdivided).toBe(1);
      expect(parsed.triangles).toBeGreaterThan(200);

      const slime = service.scene.getMeshByName('organic_slime') as Mesh;
      expect(slime).toBeDefined();
      expect((slime.material as PBRMaterial).clearCoat.isEnabled).toBe(true);
    });

    it('spawns upgraded chibi and organic creature base meshes with canonical PBR presets and tapered horns', () => {
      const chibi = service.sculptController.spawnChibiBaseMesh({ materialStyle: 'colored' });
      expect(chibi).toBeDefined();
      expect(chibi.getTotalVertices()).toBeGreaterThan(200);
      expect(chibi.material).toBeInstanceOf(MultiMaterial);

      const creature = service.sculptController.spawnOrganicCreatureBaseMesh({ materialStyle: 'colored' });
      expect(creature).toBeDefined();
      expect(creature.getTotalVertices()).toBeGreaterThan(200);
      expect(creature.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(true);
      expect(creature.material).toBeInstanceOf(MultiMaterial);
    });
  });
});
