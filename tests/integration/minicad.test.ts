import { Material, NullEngine, StandardMaterial, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';
import { getMiniCadRecipe } from '../../src/minicad/MiniCadGeometry';
import { createDefaultToolRegistry } from '../../src/tools';

describe('MiniCAD Studio Integration Tests', () => {
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
    engine.dispose();
    canvas.remove();
    document.body.innerHTML = '';
  });

  describe('1. Profiles, Parametric Shapes & Non-Destructive Recipes', () => {
    it('creates all base CAD shapes with accurate millimeter dimensions and recipes', () => {
      const ctrl = service.miniCadController;
      ctrl.setProfile('3d_print');

      const box = ctrl.createPart({
        name: 'Test_Box',
        shape: 'box',
        widthMm: 40,
        heightMm: 20,
        depthMm: 30,
      });
      expect(ctrl.getMeshDimensionsMm(box)).toEqual({
        width: 40,
        height: 20,
        depth: 30,
        wallThickness: 2,
        cornerRadius: 0,
      });
      expect(getMiniCadRecipe(box)?.baseShape).toBe('box');
      // Grounded on Y=0: center should be height/2 in world units (20 / 10 / 2 = 1.0)
      expect(box.position.y).toBeCloseTo(1.0, 3);

      const bracket = ctrl.createPart({
        name: 'Test_LBracket',
        shape: 'l_bracket',
        widthMm: 50,
        heightMm: 40,
        depthMm: 35,
        wallThicknessMm: 4,
      });
      expect(bracket.getTotalVertices()).toBeGreaterThan(0);
      expect(getMiniCadRecipe(bracket)?.baseShape).toBe('l_bracket');

      const tube = ctrl.createPart({
        name: 'Test_Tube',
        shape: 'tube',
        widthMm: 30,
        heightMm: 15,
        depthMm: 30,
        innerDiameterMm: 12,
      });
      expect(tube.getTotalVertices()).toBeGreaterThan(0);
      expect(getMiniCadRecipe(tube)?.baseShape).toBe('tube');
    });

    it('supports non-destructive shell, hardware holes, resize without losing features, and undo/redo', () => {
      const ctrl = service.miniCadController;
      const box = ctrl.createPart({
        name: 'Parametric_Enclosure',
        shape: 'rounded_box',
        widthMm: 80,
        heightMm: 30,
        depthMm: 50,
        cornerRadiusMm: 4,
      });

      ctrl.setShellOnMesh(box, 2.5, 'top');
      expect(getMiniCadRecipe(box)?.features.some((f) => f.kind === 'shell')).toBe(true);

      ctrl.addFeatureToMesh(box, {
        id: 'hole_m3_corners',
        kind: 'hole',
        preset: 'countersunk_m3',
        shape: 'countersunk',
        face: 'bottom',
        offsetUMm: 0,
        offsetVMm: 0,
        diameterMm: 3.2,
        headDiameterMm: 6.2,
        headDepthMm: 2.0,
        depthMm: 6,
        throughAll: true,
        pattern: { cols: 2, rows: 2, spacingUMm: 64, spacingVMm: 34 },
      });
      expect(getMiniCadRecipe(box)?.features.length).toBe(2);

      // Resize width non-destructively from 80 -> 100 mm; shell & holes remain in recipe!
      ctrl.updateSelectedDimensions({ width: 100 });
      const recipeAfterResize = getMiniCadRecipe(box)!;
      expect(recipeAfterResize.dimensionsMm.width).toBe(100);
      expect(recipeAfterResize.features.length).toBe(2);

      // Undo resize back to 80 mm
      expect(service.canUndo()).toBe(true);
      service.undo();
      expect(getMiniCadRecipe(box)?.dimensionsMm.width).toBe(80);

      // Redo resize back to 100 mm
      service.redo();
      expect(getMiniCadRecipe(box)?.dimensionsMm.width).toBe(100);

      // Remove hole feature by ID
      ctrl.removeFeatureFromMesh(box, 'hole_m3_corners');
      expect(getMiniCadRecipe(box)?.features.length).toBe(1);
    });
  });

  describe('2. Smart Alignment, Guides, Printability, Woodwork Cut List & STL Export', () => {
    it('aligns parts with exact millimeter gaps and computes Figma-style smart guides', () => {
      const ctrl = service.miniCadController;
      const base = ctrl.createPart({
        name: 'Base_Plate',
        shape: 'box',
        widthMm: 80,
        heightMm: 10,
        depthMm: 60,
        positionMm: { x: 0, y: 5, z: 0 },
      });
      const lid = ctrl.createPart({
        name: 'Top_Cap',
        shape: 'box',
        widthMm: 40,
        heightMm: 10,
        depthMm: 30,
        positionMm: { x: 100, y: 5, z: 40 },
      });

      ctrl.alignMeshes(lid, base, 'center_xz', 0);
      ctrl.alignMeshes(lid, base, 'stack_on_top', 2);

      const guides = ctrl.computeSmartGuides(lid);
      expect(guides.some((g) => g.axis === 'x' && g.kind === 'center')).toBe(true);
      expect(guides.some((g) => g.axis === 'z' && g.kind === 'center')).toBe(true);
      const yGuide = guides.find((g) => g.axis === 'y');
      expect(yGuide?.distanceMm).toBeCloseTo(2, 1);

      // Gap X alignment
      ctrl.alignMeshes(lid, base, 'gap_x', 15);
      const guidesAfterGap = ctrl.computeSmartGuides(lid);
      const xGuide = guidesAfterGap.find((g) => g.axis === 'x');
      expect(xGuide?.distanceMm).toBeCloseTo(15, 1);
    });

    it('generates printability reports, woodwork cut lists, and true-mm STL exports', () => {
      const ctrl = service.miniCadController;
      const shelfParts = ctrl.createStarterTemplate('shelf_unit');
      expect(shelfParts.length).toBe(4);
      expect(ctrl.profileId).toBe('woodwork');

      const cutList = ctrl.getWoodworkCutList();
      expect(cutList.length).toBeGreaterThanOrEqual(2);
      // Left and right sides (400 x 280 x 18 mm) should group with quantity 2
      const sideGroup = cutList.find((c) => c.thicknessMm === 18 && c.lengthMm === 400);
      expect(sideGroup?.quantity).toBe(2);

      ctrl.setProfile('3d_print');
      const spacer = ctrl.createPart({
        name: 'Print_Block',
        shape: 'box',
        widthMm: 20,
        heightMm: 10,
        depthMm: 20,
      });
      service.selectMesh(spacer);
      const report = ctrl.inspectSelectedPrintability();
      expect(report).not.toBeNull();
      expect(report!.isWatertight).toBe(true);
      expect(report!.stats.widthMm).toBeCloseTo(20, 1);
      expect(report!.stats.volumeCm3).toBeCloseTo(4.0, 1);

      const stlBlob = ctrl.exportStlInTrueMm(true, 'print_block');
      expect(stlBlob).not.toBeNull();
      expect(stlBlob!.size).toBeGreaterThan(84);
    });
  });

  describe('3. Exclusive 3D Tool Mode, Viewport HUD & AI Tools/Skill Integration', () => {
    it('activates MiniCAD as an exclusive 3D tool, shows Viewport HUD, and edits dims inline', () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      document.body.appendChild(container);
      const app = new MeshEditorApp({ container, engine });

      // Activate another exclusive tool first (Voxel Painter), then switch to MiniCAD
      app.activateExclusive3DTool('voxel_painter');
      expect(app.service.voxelPainter.isActive).toBe(true);

      app.toggleDialog('dialog-minicad', true);
      expect(app.service.miniCadController.isActive).toBe(true);
      expect(app.service.voxelPainter.isActive).toBe(false);

      const hud = container.querySelector('#minicadViewportHud') as HTMLElement;
      expect(hud).not.toBeNull();
      expect(hud.style.display).toBe('flex');

      const mesh = app.service.miniCadController.createPart({
        name: 'HUD_Part',
        shape: 'box',
        widthMm: 30,
        heightMm: 15,
        depthMm: 25,
      });

      const hudW = container.querySelector('#hudCadDimW') as HTMLInputElement;
      expect(hudW.value).toBe('30');
      hudW.value = '55';
      hudW.dispatchEvent(new Event('change'));
      expect(app.service.miniCadController.getMeshDimensionsMm(mesh).width).toBe(55);

      // Verify face highlight uses true alpha blending with translucent opacity and no lighting glare
      app.service.miniCadController.hoveredFace = {
        mesh,
        faceDir: 'top',
        worldPoint: [0, 1.5, 0],
        worldNormal: [0, 1, 0],
        localUWorld: [1, 0, 0],
        localVWorld: [0, 0, 1],
        offsetUMm: 0,
        offsetVMm: 0,
        faceWidthMm: 55,
        faceHeightMm: 25,
      };
      (app.service.miniCadController as any).updateFaceHighlightVisual();
      const hlMesh = app.service.scene.getMeshByName('minicad_face_highlight');
      expect(hlMesh).not.toBeNull();
      const hlMat = hlMesh!.material as StandardMaterial;
      expect(hlMat.alpha).toBeLessThanOrEqual(0.5);
      expect(hlMat.alpha).toBeGreaterThan(0);
      expect(hlMat.disableLighting).toBe(true);
      expect(hlMat.disableDepthWrite).toBe(true);
      expect(hlMat.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
      expect(Boolean((app.service.highlightLayer as any).shouldRenderMesh?.(hlMesh!))).toBe(false);

      app.dispose();
    });

    it('executes cad_* AI tools via ToolRegistry and includes mini-cad skill contextually', async () => {
      const registry = createDefaultToolRegistry();
      const context = {
        service,
        scene: service.scene,
        findMeshByNameOrId: (name: string) =>
          service.importedMeshes.find((m) => m.name === name || m.id === name) || null,
        registerMesh: (m: any) => {
          if (!service.importedMeshes.includes(m)) service.importedMeshes.push(m);
        },
        getOrCreateMaterial: (name: string) => service.scene.getMaterialByName(name) as any,
      } as any;

      const createRes = JSON.parse(
        await registry.execute(
          'cad_create_part',
          {
            profile: '3d_print',
            name: 'AI_Box',
            shape: 'rounded_box',
            widthMm: 60,
            heightMm: 24,
            depthMm: 40,
            shellWallMm: 2,
            shellOpenFace: 'top',
          },
          context
        )
      );
      expect(createRes.status).toBe('ok');
      expect(createRes.meshName).toBe('AI_Box');

      const modRes = JSON.parse(
        await registry.execute(
          'cad_modify_part',
          {
            meshName: 'AI_Box',
            addHole: {
              preset: 'm3',
              face: 'bottom',
              symmetricCornerInsetMm: 6,
            },
          },
          context
        )
      );
      expect(modRes.status).toBe('ok');
      expect(modRes.recipe.features.some((f: any) => f.kind === 'hole')).toBe(true);

      const inspectRes = JSON.parse(
        await registry.execute(
          'cad_inspect_and_cutlist',
          { meshName: 'AI_Box', includeCutList: true },
          context
        )
      );
      expect(inspectRes.status).toBe('ok');
      expect(inspectRes.printability.stats.widthMm).toBeCloseTo(60, 1);
      expect(inspectRes.printability.stats.triangleCount).toBeGreaterThan(0);
      expect(inspectRes.cutList.length).toBeGreaterThanOrEqual(1);

      const prompt = service.aiAgent.buildSystemPrompt({
        prompt: 'Design a 3D printable enclosure with 2 mm wall thickness and M3 corner holes',
        hasImages: false,
        sceneMeshCount: 1,
      });
      expect(prompt).toContain('MiniCAD Precision Modeling');
    });
  });
});
