import { NullEngine, PBRMaterial, StandardMaterial, Texture } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';
import { PrimitiveConfig } from '../../src/types';

function createBoxConfig(name: string): PrimitiveConfig {
  return {
    shape: 'Box',
    name,
    size: 1,
    width: 1,
    height: 1,
    depth: 1,
    diameter: 1,
    thickness: 0.2,
    subdivisions: 1,
    tessellation: 12,
    color: '#ffffff',
    roughness: 0.5,
    metallic: 0.0,
  };
}

const PNG_1X1_RED =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_2X2_BLUE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADklEQVR42mNk+M/wHwAE/wH+j5e92QAAAABJRU5ErkJggg==';

describe('Material Editor Active Texture Display, Download & Delete Tests', () => {
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
        onTexturesChanged: vi.fn(),
        onToast: vi.fn(),
      },
      engine
    );
  });

  afterEach(() => {
    service.dispose();
    canvas.remove();
    vi.restoreAllMocks();
  });

  describe('1. Active Material Texture Inspection & Removal (Service)', () => {
    it('reports no material when nothing is selected and solid material when untextured', () => {
      expect(service.getActiveMaterialTexturesInfo().hasMaterial).toBe(false);

      const box = service.createPrimitive(createBoxConfig('UntexturedBox'));
      service.selectMesh(box);

      const info = service.getActiveMaterialTexturesInfo();
      expect(info.hasMaterial).toBe(true);
      expect(info.materialType).toBe('PBR');
      expect(info.albedo).toBeNull();
      expect(info.bump).toBeNull();
    });

    it('reports active albedo and normal textures on PBRMaterial and StandardMaterial', () => {
      const box = service.createPrimitive(createBoxConfig('TexturedBox'));
      service.selectMesh(box);

      service.addTextureFromDataUrl('brick_albedo.png', PNG_1X1_RED);
      service.addTextureFromDataUrl('brick_normal.png', PNG_2X2_BLUE);

      service.applyTextureToSelectedMaterial(PNG_1X1_RED, 'brick_albedo.png');
      service.applyBumpTextureToSelectedMaterial(PNG_2X2_BLUE, 'brick_normal.png');

      const pbrInfo = service.getActiveMaterialTexturesInfo();
      expect(pbrInfo.hasMaterial).toBe(true);
      expect(pbrInfo.albedo?.name).toBe('brick_albedo.png');
      expect(pbrInfo.albedo?.url).toBe(PNG_1X1_RED);
      expect(pbrInfo.bump?.name).toBe('brick_normal.png');
      expect(pbrInfo.bump?.url).toBe(PNG_2X2_BLUE);

      // Verify StandardMaterial support
      const stdBox = service.createPrimitive(createBoxConfig('StdBox'));
      const stdMat = new StandardMaterial('StdMat', service.scene);
      const diffTex = new Texture(PNG_1X1_RED, service.scene);
      diffTex.name = 'std_diffuse.png';
      stdMat.diffuseTexture = diffTex;
      stdBox.material = stdMat;
      service.selectMesh(stdBox);

      const stdInfo = service.getActiveMaterialTexturesInfo();
      expect(stdInfo.materialType).toBe('Standard');
      expect(stdInfo.albedo?.slot).toBe('diffuse');
      expect(stdInfo.albedo?.name).toBe('std_diffuse.png');
    });

    it('matches glTF-style textures whose resolved data URL differs from tex.url', () => {
      const box = service.createPrimitive(createBoxConfig('GlbBox'));
      const mat = box.material as PBRMaterial;
      const glbTex = new Texture(PNG_1X1_RED, service.scene);
      glbTex.name = 'glb_diffuse_0';
      (glbTex as any).url = 'data:model.glb#image0';
      (glbTex as any).__resolvedDataUrl = PNG_1X1_RED;
      mat.albedoTexture = glbTex;

      service.selectMesh(box);

      const embedded = service.getEmbeddedTexturesInfo().find((t) => t.name === 'glb_diffuse_0');
      expect(embedded).toBeDefined();
      expect(embedded?.url).toBe(PNG_1X1_RED);

      const match = service.isTextureAssignedToMaterial(mat, embedded!);
      expect(match.isAlbedo).toBe(true);
      expect(match.isBump).toBe(false);
    });

    it('removes active albedo texture from material without deleting embedded texture', () => {
      const box = service.createPrimitive(createBoxConfig('RemoveTexBox'));
      service.selectMesh(box);
      service.applyTextureToSelectedMaterial(PNG_1X1_RED, 'wood_plank.png');

      expect(service.getActiveMaterialTexturesInfo().albedo?.name).toBe('wood_plank.png');

      const removed = service.removeTextureFromSelectedMaterial();
      expect(removed).toBe(true);
      expect(service.getActiveMaterialTexturesInfo().albedo).toBeNull();

      // Embedded texture remains available in scene
      const stillEmbedded = service.getEmbeddedTexturesInfo().some((t) => t.name === 'wood_plank.png');
      expect(stillEmbedded).toBe(true);
    });
  });

  describe('2. Download & Delete Embedded Textures (Service)', () => {
    it('downloads embedded texture with sanitized filename and proper extension', async () => {
      service.addTextureFromDataUrl('rock/wall:albedo', PNG_1X1_RED);
      const texInfo = service.getEmbeddedTexturesInfo().find((t) => t.name === 'rock/wall:albedo')!;
      expect(texInfo).toBeDefined();

      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      let capturedDownload = '';
      let capturedHref = '';
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = origCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          el.click = () => {
            capturedDownload = (el as HTMLAnchorElement).download;
            capturedHref = (el as HTMLAnchorElement).href;
            clickSpy();
          };
        }
        return el;
      });

      const ok = await service.downloadEmbeddedTexture(texInfo);
      expect(ok).toBe(true);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(capturedDownload).toBe('rock_wall_albedo.png');
      expect(capturedHref).toBe(PNG_1X1_RED);
    });

    it('deletes embedded texture, detaches it from materials, and disposes scene Texture', () => {
      const box = service.createPrimitive(createBoxConfig('DeleteTexBox'));
      service.selectMesh(box);
      service.applyTextureToSelectedMaterial(PNG_1X1_RED, 'removable_tex.png');
      service.applyBumpTextureToSelectedMaterial(PNG_1X1_RED, 'removable_tex.png');

      const texInfo = service.getEmbeddedTexturesInfo().find((t) => t.name === 'removable_tex.png')!;
      expect(texInfo).toBeDefined();

      const deleted = service.deleteEmbeddedTexture(texInfo);
      expect(deleted).toBe(true);

      // Material references are cleared cleanly
      const mat = box.material as PBRMaterial;
      expect(mat.albedoTexture).toBeNull();
      expect(mat.bumpTexture).toBeNull();

      // Gone from embedded textures list
      expect(service.getEmbeddedTexturesInfo().some((t) => t.name === 'removable_tex.png')).toBe(false);
    });

    it('deletes texture atlas from TextureAtlasManager and switches Voxel Painter atlas', async () => {
      const extraAtlas = await service.textureAtlasManager.createGridAtlasFromImage('Extra Atlas', PNG_2X2_BLUE, 2, 2);
      service.voxelPainter.useTextureAtlas(extraAtlas.id);

      const atlasInfo = service.getEmbeddedTexturesInfo().find((t) => t.atlasId === extraAtlas.id);
      expect(atlasInfo).toBeDefined();

      const deleted = service.deleteEmbeddedTexture(atlasInfo!);
      expect(deleted).toBe(true);
      expect(service.textureAtlasManager.getAtlas(extraAtlas.id)).toBeUndefined();
      expect(service.voxelPainter.currentAtlasId).not.toBe(extraAtlas.id);
    });
  });

  describe('3. Material Editor UI Integration (MeshEditorApp)', () => {
    it('displays active textures for selected mesh and updates embedded gallery badges when switching selection', () => {
      const container = document.createElement('div');
      container.id = 'appRoot';
      document.body.appendChild(container);

      const app = new MeshEditorApp({ container, engine });

      const meshA = app.service.createPrimitive(createBoxConfig('MeshA'));
      const meshB = app.service.createPrimitive(createBoxConfig('MeshB'));
      const meshC = app.service.createPrimitive(createBoxConfig('MeshC'));

      app.service.addTextureFromDataUrl('wood_mat.png', PNG_1X1_RED);
      app.service.addTextureFromDataUrl('stone_mat.png', PNG_2X2_BLUE);

      app.service.selectMesh(meshA);
      app.service.applyTextureToSelectedMaterial(PNG_1X1_RED, 'wood_mat.png');

      app.service.selectMesh(meshB);
      app.service.applyTextureToSelectedMaterial(PNG_2X2_BLUE, 'stone_mat.png');

      // Select MeshA -> active textures bar and embedded card should reflect wood_mat.png
      app.service.selectMesh(meshA);
      const activeList = document.getElementById('activeMaterialTexturesList');
      expect(activeList?.textContent).toContain('wood_mat.png');
      expect(activeList?.textContent).not.toContain('stone_mat.png');

      const gallery = document.getElementById('embeddedTexturesGallery')!;
      let woodCard = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.getAttribute('data-name') === 'wood_mat.png'
      )!;
      let stoneCard = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.getAttribute('data-name') === 'stone_mat.png'
      )!;

      expect(woodCard.classList.contains('active')).toBe(true);
      expect(woodCard.querySelector('.embedded-texture-badge')?.textContent).toBe('Active Albedo');
      expect(woodCard.querySelector('.embedded-texture-btn-apply')?.textContent).toContain('Applied');
      expect(stoneCard.classList.contains('active')).toBe(false);
      expect(stoneCard.querySelector('.embedded-texture-btn-apply')?.textContent).toContain('Apply');

      // Switch to MeshB -> fast-path must update both active highlight AND badges/button labels
      app.service.selectMesh(meshB);
      expect(activeList?.textContent).toContain('stone_mat.png');
      expect(activeList?.textContent).not.toContain('wood_mat.png');

      woodCard = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.getAttribute('data-name') === 'wood_mat.png'
      )!;
      stoneCard = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.getAttribute('data-name') === 'stone_mat.png'
      )!;

      expect(stoneCard.classList.contains('active')).toBe(true);
      expect(stoneCard.querySelector('.embedded-texture-badge')?.textContent).toBe('Active Albedo');
      expect(stoneCard.querySelector('.embedded-texture-btn-apply')?.textContent).toContain('Applied');
      expect(woodCard.classList.contains('active')).toBe(false);
      expect(woodCard.querySelector('.embedded-texture-badge')?.textContent).toBe('1 material');

      // Switch to untextured MeshC -> active bar shows None
      app.service.selectMesh(meshC);
      expect(activeList?.textContent).toContain('None');

      app.dispose();
      container.remove();
    });

    it('provides working Save (download) and Delete buttons on Embedded Textures cards and closes open atlas picker on delete', async () => {
      const container = document.createElement('div');
      container.id = 'appRoot';
      document.body.appendChild(container);

      const app = new MeshEditorApp({ container, engine });

      const mesh = app.service.createPrimitive(createBoxConfig('CubeCardTest'));
      app.service.selectMesh(mesh);
      app.service.addTextureFromDataUrl('card_tex.png', PNG_1X1_RED);
      app.service.applyTextureToSelectedMaterial(PNG_1X1_RED, 'card_tex.png');

      const gallery = document.getElementById('embeddedTexturesGallery')!;
      const card = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.getAttribute('data-name') === 'card_tex.png'
      )!;
      expect(card).toBeDefined();

      // Test Download button on card
      const downloadSpy = vi.spyOn(app.service, 'downloadEmbeddedTexture');
      const btnDownload = card.querySelector<HTMLButtonElement>('.embedded-texture-btn-download')!;
      expect(btnDownload).toBeDefined();
      btnDownload.click();
      expect(downloadSpy).toHaveBeenCalledTimes(1);

      // Test Delete button on card
      const btnDelete = card.querySelector<HTMLButtonElement>('.embedded-texture-btn-delete')!;
      expect(btnDelete).toBeDefined();
      btnDelete.click();

      expect(app.service.getEmbeddedTexturesInfo().some((t) => t.name === 'card_tex.png')).toBe(false);
      expect((mesh.material as PBRMaterial).albedoTexture).toBeNull();
      expect(document.getElementById('activeMaterialTexturesList')?.textContent).toContain('None');

      // Test Atlas Delete also closes its open Tile Picker
      const atlas = app.service.textureAtlasManager.getAtlases()[0];
      app.renderAtlasTilePicker(atlas.id);
      const pickerSection = document.getElementById('atlasTilePickerSection')!;
      expect(pickerSection.style.display).toBe('flex');

      const atlasCard = Array.from(gallery.querySelectorAll<HTMLElement>('.embedded-texture-card')).find(
        (c) => c.classList.contains('is-atlas')
      )!;
      const btnAtlasDelete = atlasCard.querySelector<HTMLButtonElement>('.embedded-texture-btn-delete')!;
      btnAtlasDelete.click();

      expect(pickerSection.style.display).toBe('none');
      expect(app.service.textureAtlasManager.getAtlas(atlas.id)).toBeUndefined();

      app.dispose();
      container.remove();
    });
  });
});
