import { MeshBuilder, NullEngine, PBRMaterial, Texture, VertexBuffer } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';

describe('3D UV Texture Painter (Phases 1-3: Seamless UV Painting, Layers/PBR, Stencil Projection & AI Tool)', () => {
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
    service?.dispose();
    canvas?.remove();
    document.body.innerHTML = '';
  });

  describe('Phase 1: Core Seamless 3D UV Painting, Stylized Base, Symmetry & Undo/Redo', () => {
    it('auto-unwraps a mesh without UVs, initializes paint session, and attaches live PBR albedo texture', () => {
      const box = MeshBuilder.CreateBox('paint_box', { size: 2 }, service.scene);
      box.removeVerticesData(VertexBuffer.UVKind);
      expect(box.getVerticesData(VertexBuffer.UVKind)).toBeNull();
      service.addMesh(box);

      const session = service.texturePaintController.ensurePaintSession(box, {
        resolution: 256,
        baseColor: '#3498db',
        autoUnwrap: true,
      });

      expect(session).not.toBeNull();
      expect(box.getVerticesData(VertexBuffer.UVKind)?.length).toBeGreaterThan(0);
      expect(session!.resolution).toBe(256);
      expect(session!.islandCount).toBeGreaterThan(0);
      expect(box.material).toBeInstanceOf(PBRMaterial);
      expect((box.material as PBRMaterial).albedoTexture).not.toBeNull();

      // Base color should be blue (#3498db -> 52, 152, 219)
      expect(session!.albedoComposite[0]).toBeCloseTo(52, -1);
      expect(session!.albedoComposite[1]).toBeCloseTo(152, -1);
      expect(session!.albedoComposite[2]).toBeCloseTo(219, -1);
    });

    it('paints a seamless 3D stroke with X-symmetry and supports Undo / Redo', () => {
      const sphere = MeshBuilder.CreateSphere('hero_head', { diameter: 2, segments: 12 }, service.scene);
      service.addMesh(sphere);

      const ctrl = service.texturePaintController;
      const session = ctrl.ensurePaintSession(sphere, { resolution: 256, baseColor: '#ffffff' })!;
      const beforeSnapshot = session.albedoComposite.slice();

      const strokeRes = ctrl.paintStroke3D(
        sphere,
        [
          [0.45, 0.2, -0.85],
          [0.55, 0.35, -0.75],
        ],
        {
          color: '#e74c3c',
          radius: 0.35,
          hardness: 0.8,
          opacity: 1.0,
          mirrorX: true,
        }
      );

      expect(strokeRes.stampsApplied).toBeGreaterThanOrEqual(4); // mirrored
      expect(strokeRes.texelsPainted).toBeGreaterThan(20);

      // Verify painted red pixels exist in composite
      let redPixelCount = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        if (session.albedoComposite[i] > 200 && session.albedoComposite[i + 1] < 120) {
          redPixelCount++;
        }
      }
      expect(redPixelCount).toBeGreaterThan(15);

      // Undo should restore clean white
      expect(ctrl.undo(sphere)).toBe(true);
      expect(session.albedoComposite[0]).toBe(beforeSnapshot[0]);
      let redAfterUndo = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        if (session.albedoComposite[i] > 200 && session.albedoComposite[i + 1] < 120) {
          redAfterUndo++;
        }
      }
      expect(redAfterUndo).toBe(0);

      // Redo restores painted stroke
      expect(ctrl.redo(sphere)).toBe(true);
      let redAfterRedo = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        if (session.albedoComposite[i] > 200 && session.albedoComposite[i + 1] < 120) {
          redAfterRedo++;
        }
      }
      expect(redAfterRedo).toBe(redPixelCount);
    });

    it('generates Nintendo-style stylized AO, vertical gradient, and edge highlights base', () => {
      const box = MeshBuilder.CreateBox('stylized_crate', { size: 2 }, service.scene);
      service.addMesh(box);

      const ctrl = service.texturePaintController;
      ctrl.ensurePaintSession(box, { resolution: 256 });
      const res = ctrl.applyStylizedBase(box, {
        baseColor: '#d35400',
        bottomColor: '#4a235a',
        topColor: '#f7dc6f',
        aoStrength: 0.4,
        edgeHighlightStrength: 0.3,
      });

      expect(res.texelsPainted).toBeGreaterThan(100);
      const session = ctrl.getSession(box)!;

      // Verify non-uniform shaded gradient variation across painted texels
      let minLuma = 255;
      let maxLuma = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        if (session.coverageMask[i >> 2] === 1) {
          const luma =
            session.albedoComposite[i] * 0.299 +
            session.albedoComposite[i + 1] * 0.587 +
            session.albedoComposite[i + 2] * 0.114;
          if (luma < minLuma) minLuma = luma;
          if (luma > maxLuma) maxLuma = luma;
        }
      }
      expect(maxLuma - minLuma).toBeGreaterThan(40);
    });
  });

  describe('Phase 2: Multi-Layer Stack, Blend Modes, PBR Channels & Direct 2D UV Painting', () => {
    it('supports layer CRUD, Multiply blend mode, Roughness/Metallic ORM & Emissive channels, and 2D UV painting', () => {
      const mesh = MeshBuilder.CreateBox('layered_prop', { size: 2 }, service.scene);
      service.addMesh(mesh);

      const ctrl = service.texturePaintController;
      const session = ctrl.ensurePaintSession(mesh, { resolution: 256, baseColor: '#ffffff' })!;
      expect(ctrl.getLayersSummary(mesh).length).toBe(2);

      // Add a Multiply shadow layer and fill it with mid-gray (#808080)
      const multLayer = ctrl.addLayer(mesh, {
        name: 'Shadow Tint',
        channel: 'albedo',
        blendMode: 'multiply',
        opacity: 1.0,
      })!;
      expect(multLayer).not.toBeNull();
      ctrl.fillRegion(mesh, { color: '#808080', layerName: 'Shadow Tint' });

      // White * 0.5 gray => ~128
      expect(session.albedoComposite[0]).toBeGreaterThanOrEqual(120);
      expect(session.albedoComposite[0]).toBeLessThanOrEqual(136);

      // Hiding the multiply layer restores white (~255)
      ctrl.updateLayerProperties(mesh, multLayer.id, { visible: false });
      expect(session.albedoComposite[0]).toBeGreaterThan(245);

      // Paint Metallic channel -> should attach ORM metallicTexture to PBRMaterial
      ctrl.addLayer(mesh, { name: 'Gold Trim', channel: 'metallic' });
      ctrl.fillRegion(mesh, { channel: 'metallic', value: 0.9, layerName: 'Gold Trim' });
      const mat = mesh.material as PBRMaterial;
      expect(session.hasRoughnessOrMetallicData).toBe(true);
      expect(mat.metallicTexture).not.toBeNull();
      expect(session.ormComposite[2]).toBeGreaterThan(210); // B channel = metallic

      // Paint Emissive channel -> should attach emissiveTexture to PBRMaterial
      ctrl.addLayer(mesh, { name: 'Rune Glow', channel: 'emissive' });
      ctrl.fillRegion(mesh, { channel: 'emissive', color: '#00ffff', layerName: 'Rune Glow' });
      expect(session.hasEmissiveData).toBe(true);
      expect(mat.emissiveTexture).not.toBeNull();
      expect(session.emissiveComposite[1]).toBeGreaterThan(240);
      expect(session.emissiveComposite[2]).toBeGreaterThan(240);

      // Direct 2D UV Canvas paint with chalk alpha
      ctrl.setChannel('albedo');
      ctrl.colorHex = '#2ecc71';
      ctrl.brushAlpha = 'chalk';
      ctrl.brushOpacity = 1.0;
      const painted2D = ctrl.paint2DAtUV(mesh, 0.5, 0.5, { radiusPx: 20, pushUndo: true });
      expect(painted2D).toBe(true);
      ctrl.finalize2DStroke(mesh);

      const sampled = ctrl.sampleColorAtUV(mesh, 0.5, 0.5);
      expect(sampled).toMatch(/^#[0-9a-f]{6}$/);

      // Flatten albedo layers
      expect(ctrl.flattenAlbedoLayers(mesh)).toBe(true);
      const albedoLayers = ctrl.getLayersSummary(mesh).filter((l) => l.channel === 'albedo');
      expect(albedoLayers.length).toBe(1);
    });
  });

  describe('Phase 3: Stencil / Projection Painting & Export Preparation', () => {
    it('projects a loaded RGBA stencil buffer onto the front face of a 3D mesh and prepares clean export textures', async () => {
      const box = MeshBuilder.CreateBox('stenciled_box', { size: 2 }, service.scene);
      service.addMesh(box);

      const ctrl = service.texturePaintController;
      const session = ctrl.ensurePaintSession(box, { resolution: 256, baseColor: '#111111' })!;

      // Create a bright magenta 32x32 stencil buffer
      const sw = 32;
      const sh = 32;
      const stencilBuf = new Uint8ClampedArray(sw * sh * 4);
      for (let i = 0; i < sw * sh; i++) {
        stencilBuf[i * 4] = 255;
        stencilBuf[i * 4 + 1] = 20;
        stencilBuf[i * 4 + 2] = 200;
        stencilBuf[i * 4 + 3] = 255;
      }
      ctrl.setStencilFromBuffer(stencilBuf, sw, sh, 'Magenta Emblem');

      const projRes = ctrl.projectWholeStencil(box, { face: 'front', scale: 0.9, opacity: 1.0 });
      expect(projRes.texelsPainted).toBeGreaterThan(50);

      let magentaTexels = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        if (session.albedoComposite[i] > 200 && session.albedoComposite[i + 2] > 160) {
          magentaTexels++;
        }
      }
      expect(magentaTexels).toBeGreaterThan(50);

      // Export preparation swaps RawTexture -> DataURL-backed Texture and restores cleanly
      const origAlbedoTex = (box.material as PBRMaterial).albedoTexture;
      await ctrl.prepareMeshesForExport();
      const exportAlbedoTex = (box.material as PBRMaterial).albedoTexture;
      expect(exportAlbedoTex).toBeInstanceOf(Texture);
      expect(exportAlbedoTex).not.toBe(origAlbedoTex);

      ctrl.restoreAfterExport();
      expect((box.material as PBRMaterial).albedoTexture).toBe(origAlbedoTex);
    });

    it('detects and preserves an existing GLB-style texture (invertY=false) and UVs when editing instead of wiping them', async () => {
      // 1. Create a mesh with custom non-overlapping UVs and a GLB-style texture (invertY = false, top half bright green, bottom half bright blue)
      const mesh = MeshBuilder.CreateBox('reloaded_glb_mesh', { size: 2 }, service.scene);
      service.addMesh(mesh);
      service.uvUnwrapController.unwrapMesh(mesh, { method: 'angle_project', textureResolution: 128 });
      const origUVs = Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!);

      const ctrl = service.texturePaintController;
      const w = 64;
      const h = 64;
      const srcPixels = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const isTopHalf = y < h / 2;
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          srcPixels[idx] = isTopHalf ? 20 : 30;
          srcPixels[idx + 1] = isTopHalf ? 220 : 60;
          srcPixels[idx + 2] = isTopHalf ? 40 : 235;
          srcPixels[idx + 3] = 255;
        }
      }

      // Encode as BMP DataURL (mirrors how Babylon GLB loader stores image data in texture url/_buffer with invertY = false)
      const bmpDataUrl = ctrl.rgbaBufferToDataURL(srcPixels, w, h);
      const glbMat = new PBRMaterial('reloaded_glb_mat', service.scene);
      glbMat.albedoColor.set(1, 1, 1);
      const glbTex = new Texture(bmpDataUrl, service.scene, false, false); // invertY = false like glTF/GLB!
      glbMat.albedoTexture = glbTex;
      mesh.material = glbMat;

      expect(ctrl.hasExistingEditableTexture(mesh)).toBe(true);

      // 2. Initialize paint session preserving existing GLB texture & UVs
      const session = (await ctrl.ensurePaintSessionAsync(mesh, {
        resolution: 256,
        preserveExistingTexture: true,
      }))!;
      expect(session).not.toBeNull();
      expect(session.loadedFromExistingTexture).toBe(true);

      // Original UVs MUST remain untouched (not re-unwrapped!)
      const postUVs = Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!);
      expect(postUVs.length).toBe(origUVs.length);
      expect(postUVs[0]).toBeCloseTo(origUVs[0], 5);

      // Because glbTex had invertY=false, its PNG top half (green) maps to UV v=0 (bottom of our invertY=true buffer)
      // and its PNG bottom half (blue) maps to UV v=1 (top of our invertY=true buffer)!
      const topRowIdx = 10 * session.resolution * 4 + 10 * 4;
      const botRowIdx = (session.resolution - 10) * session.resolution * 4 + 10 * 4;
      expect(session.albedoComposite[topRowIdx + 2]).toBeGreaterThan(200); // Blue at py=10
      expect(session.albedoComposite[botRowIdx + 1]).toBeGreaterThan(190); // Green at py=res-10

      // 3. Paint a new red stroke ON TOP of the loaded GLB texture (lands on Paint Layer 1, keeping Base Texture intact)
      ctrl.paintStroke3D(mesh, [[0, 0, -1]], { color: '#ff0000', radius: 0.6, opacity: 1.0 });
      let redCount = 0;
      let greenOrBlueCount = 0;
      for (let i = 0; i < session.albedoComposite.length; i += 4) {
        const r = session.albedoComposite[i];
        const g = session.albedoComposite[i + 1];
        const b = session.albedoComposite[i + 2];
        if (r > 200 && g < 80 && b < 80) redCount++;
        if (g > 180 || b > 180) greenOrBlueCount++;
      }
      expect(redCount).toBeGreaterThan(20);
      expect(greenOrBlueCount).toBeGreaterThan(1000);

      // 4. Resizing an active session resamples layers instead of wiping them
      const resized = (await ctrl.ensurePaintSessionAsync(mesh, {
        resolution: 512,
        preserveExistingTexture: true,
      }))!;
      expect(resized.resolution).toBe(512);
      expect(resized.layers.length).toBe(2);
      const resizedTopIdx = 20 * 512 * 4 + 20 * 4;
      expect(resized.albedoComposite[resizedTopIdx + 2]).toBeGreaterThan(200);
    });
  });

  describe('AI Tool (modeler_paint_texture) & Editor Tool UI Integration', () => {
    it('executes full AI stylized character painting pipeline via modeler_paint_texture', async () => {
      const head = MeshBuilder.CreateSphere('mario_slime', { diameter: 2, segments: 12 }, service.scene);
      service.addMesh(head);
      service.selectMesh(head);

      const registry = service.aiAgent.toolRegistry;
      expect(registry.has('modeler_paint_texture')).toBe(true);

      // 1. Init
      const initOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'init',
          targetMesh: 'mario_slime',
          resolution: 256,
          color: '#3498db',
        })
      );
      expect(initOut.status).toBe('ok');
      expect(initOut.resolution).toBe(256);

      // 2. Stylized base
      const baseOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'stylized_base',
          targetMesh: 'mario_slime',
          color: '#3498db',
          bottomColor: '#1b4f72',
          topColor: '#85c1e9',
        })
      );
      expect(baseOut.status).toBe('ok');
      expect(baseOut.texelsPainted).toBeGreaterThan(100);

      // 3. Normal-top gradient (e.g. bright highlight cap)
      const gradOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'gradient',
          targetMesh: 'mario_slime',
          gradientType: 'normal_top',
          color: '#ffffff',
          topColor: '#fff9c4',
          opacity: 0.4,
          layerName: 'Top Light',
        })
      );
      expect(gradOut.status).toBe('ok');
      expect(gradOut.texelsPainted).toBeGreaterThan(20);

      // 4. Symmetrical eyes stamp
      const eyeOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'stamp',
          targetMesh: 'mario_slime',
          shape: 'eye',
          position: [0.32, 0.15, -0.92],
          color: '#111111',
          secondaryColor: '#ffffff',
          radius: 0.25,
          mirrorX: true,
          layerName: 'Face Details',
        })
      );
      expect(eyeOut.status).toBe('ok');
      expect(eyeOut.shape).toBe('eye');
      expect(eyeOut.texelsPainted).toBeGreaterThan(20);

      // 5. Layer list
      const layerOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'layer',
          targetMesh: 'mario_slime',
          layerAction: 'list',
        })
      );
      expect(layerOut.status).toBe('ok');
      expect(layerOut.layers.length).toBeGreaterThanOrEqual(4);

      // 6. Stencil projection via prompt/dataUrl
      const stencilOut = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_paint_texture', {
          action: 'project_stencil',
          targetMesh: 'mario_slime',
          stencilUrl: 'data:image/png;base64,iVBORw0KGgo=',
          face: 'back',
          scale: 0.8,
        })
      );
      expect(stencilOut.status).toBe('ok');
      expect(stencilOut.texelsPainted).toBeGreaterThan(0);
    });

    it('registers TexturePaintEditorTool in the dynamic Tools menu under Materials and toggles 3D paint mode', () => {
      const appContainer = document.createElement('div');
      document.body.appendChild(appContainer);
      const appEngine = new NullEngine();
      const app = new MeshEditorApp({ container: appContainer, engine: appEngine });
      try {
        const tool = app.getToolByName('texture_painter');
        expect(tool).toBeDefined();
        expect(tool?.menuLabel).toBe('3D Texture Painter');
        expect(tool?.category).toBe('Materials');
        expect(tool?.isExclusive3DTool).toBe(true);

        const triggerBtn = appContainer.querySelector('#btnToggleTexturePaintTool');
        expect(triggerBtn).not.toBeNull();

        const dialog = appContainer.querySelector('#dialog-texture-paint');
        expect(dialog).not.toBeNull();

        app.toggleDialog('dialog-texture-paint', true);
        expect(app.service.texturePaintController.isActive).toBe(true);

        app.toggleDialog('dialog-texture-paint', false);
        expect(app.service.texturePaintController.isActive).toBe(false);
      } finally {
        app.dispose();
        appContainer.remove();
      }
    });
  });
});
