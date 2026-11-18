import { NullEngine, MeshBuilder, Mesh, GroundMesh, Vector3, PBRMaterial, Texture } from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';
import {
  AbstractTool,
  ToolInterface,
  ToolRegistry,
  ToolExecutionContext,
  createDefaultToolRegistry,
  CreatePrimitiveTool,
  GetSceneInfoTool,
  getBuiltinEditorTools,
  createBuiltinEditorTools,
  OutlinerEditorTool,
  CreatePrimitiveEditorTool,
  CSGEditorTool,
  FacetEditorTool,
  TextureOptimizerEditorTool,
  CompressModelEditorTool,
  VoxelPainterEditorTool,
  SculptEditorTool,
  PathExtrusionEditorTool,
  AIAgentEditorTool,
  MeshPropertiesEditorTool,
  MaterialEditorTool,
  SceneEnvironmentEditorTool,
  AnimationPlayerEditorTool,
  HeightmapEditorTool,
} from '../../src/tools';

describe('Modular Tools Architecture (ToolInterface, AbstractTool, ToolRegistry)', () => {
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

  describe('1. ToolInterface & AbstractTool Base Class', () => {
    it('provides standard OpenAI tool definitions from metadata', () => {
      const tool = new GetSceneInfoTool();
      const def = tool.getDefinition();

      expect(def.type).toBe('function');
      expect(def.function.name).toBe('modeler_get_scene_info');
      expect(typeof def.function.description).toBe('string');
      expect(def.function.parameters).toEqual({ type: 'object', properties: {} });
    });

    it('exposes shared vector, color, and mesh helper methods on AbstractTool', () => {
      class TestToolHelper extends AbstractTool {
        public readonly name = 'test_helper_tool';
        public readonly description = 'Test tool for helpers';
        public readonly parameters = { type: 'object', properties: {} };

        public execute(_args: any, _context: ToolExecutionContext): string {
          return 'ok';
        }

        public testVec3(v: any, def?: number): Vector3 {
          return this.parseVec3(v, def);
        }

        public testPolygonPoint(p: any): Vector3 {
          return this.parsePolygonPoint(p);
        }

        public testNormalizeHex(hex: string): string {
          return this.normalizeHex(hex);
        }
      }

      const helper = new TestToolHelper();

      // Test parseVec3
      expect(helper.testVec3([1, 2, 3])).toEqual(new Vector3(1, 2, 3));
      expect(helper.testVec3({ x: 4, y: 5, z: 6 })).toEqual(new Vector3(4, 5, 6));
      expect(helper.testVec3(null, 9)).toEqual(new Vector3(9, 9, 9));

      // Test parsePolygonPoint
      expect(helper.testPolygonPoint([10, 20])).toEqual(new Vector3(10, 0, 20));
      expect(helper.testPolygonPoint([10, 20, 30])).toEqual(new Vector3(10, 20, 30));
      expect(helper.testPolygonPoint({ x: 5, y: 15, z: 25 })).toEqual(new Vector3(5, 15, 25));

      // Test normalizeHex
      expect(helper.testNormalizeHex('#fff')).toBe('#ffffff');
      expect(helper.testNormalizeHex('#123456')).toBe('#123456');
      expect(helper.testNormalizeHex('invalid')).toBe('#58a6ff');
    });
  });

  describe('2. ToolRegistry Management', () => {
    it('initializes default registry with all 46 built-in modeling tools', () => {
      const registry = createDefaultToolRegistry();
      const allTools = registry.getAll();

      expect(allTools.length).toBe(46);
      expect(registry.has('modeler_get_scene_info')).toBe(true);
      expect(registry.has('modeler_check_z_fighting')).toBe(true);
      expect(registry.has('modeler_plan_model')).toBe(true);
      expect(registry.has('modeler_create_primitive')).toBe(true);
      expect(registry.has('modeler_create_rounded_box')).toBe(true);
      expect(registry.has('modeler_create_sdf_mesh')).toBe(true);
      expect(registry.has('modeler_extrude_polygon')).toBe(true);
      expect(registry.has('modeler_extrude_shape')).toBe(true);
      expect(registry.has('modeler_create_lathe')).toBe(true);
      expect(registry.has('modeler_create_tube')).toBe(true);
      expect(registry.has('modeler_boolean_operation')).toBe(true);
      expect(registry.has('modeler_create_wall')).toBe(true);
      expect(registry.has('modeler_create_arch')).toBe(true);
      expect(registry.has('modeler_create_column')).toBe(true);
      expect(registry.has('modeler_create_molding')).toBe(true);
      expect(registry.has('modeler_create_stairs')).toBe(true);
      expect(registry.has('modeler_create_roof')).toBe(true);
      expect(registry.has('modeler_create_material')).toBe(true);
      expect(registry.has('modeler_apply_material')).toBe(true);
      expect(registry.has('modeler_auto_uv_mapping')).toBe(true);
      expect(registry.has('modeler_transform_mesh')).toBe(true);
      expect(registry.has('modeler_clone_array')).toBe(true);
      expect(registry.has('modeler_merge_meshes')).toBe(true);
      expect(registry.has('modeler_separate_mesh')).toBe(true);
      expect(registry.has('modeler_delete_mesh')).toBe(true);
      expect(registry.has('modeler_build_voxel_mesh')).toBe(true);
      expect(registry.has('modeler_paint_voxels')).toBe(true);
      expect(registry.has('modeler_execute_babylon_code')).toBe(true);
      expect(registry.has('modeler_solidify_mesh')).toBe(true);
      expect(registry.has('modeler_subdivide_mesh')).toBe(true);
      expect(registry.has('modeler_subd_smooth')).toBe(true);
      expect(registry.has('modeler_facet_extrude')).toBe(true);
      expect(registry.has('modeler_facet_inset')).toBe(true);
      expect(registry.has('modeler_facet_arc')).toBe(true);
      expect(registry.has('modeler_facet_cut_through')).toBe(true);
      expect(registry.has('modeler_spawn_base_mesh')).toBe(true);
      expect(registry.has('modeler_retopologize_mesh')).toBe(true);
      expect(registry.has('modeler_sculpt_mesh')).toBe(true);
      expect(registry.has('modeler_generate_neural_mesh')).toBe(true);
      expect(registry.has('modeler_uv_unwrap')).toBe(true);
      expect(registry.has('modeler_bake_textures')).toBe(true);
      expect(registry.has('modeler_rig_and_weight_paint')).toBe(true);
      expect(registry.has('modeler_generate_texture')).toBe(true);
      expect(registry.has('modeler_create_text_mesh')).toBe(true);
      expect(registry.has('modeler_decal')).toBe(true);
      expect(registry.has('modeler_create_heightmap')).toBe(true);

      const openAiDefs = registry.getOpenAITools();
      expect(openAiDefs.length).toBe(46);
      expect(openAiDefs.every((d) => d.type === 'function' && typeof d.function.name === 'string')).toBe(true);
    });

    it('allows registering, looking up, and unregistering tools dynamically', () => {
      const registry = new ToolRegistry();
      expect(registry.getAll().length).toBe(0);

      const primTool = new CreatePrimitiveTool();
      registry.register(primTool);

      expect(registry.has(primTool.name)).toBe(true);
      expect(registry.get(primTool.name)).toBe(primTool);
      expect(registry.getAll().length).toBe(1);

      const unregistered = registry.unregister(primTool.name);
      expect(unregistered).toBe(true);
      expect(registry.has(primTool.name)).toBe(false);
      expect(registry.getAll().length).toBe(0);
    });

    it('throws when executing an unknown tool name', async () => {
      const registry = new ToolRegistry();
      const ctx = service.aiAgent.createToolContext();

      await expect(registry.execute('modeler_unknown_tool', {}, ctx)).rejects.toThrow(
        'Unknown tool: modeler_unknown_tool'
      );
    });
  });

  describe('3. Rapid Custom Tool Development & Extensibility', () => {
    it('enables quickly authoring a new autarkic tool class extending AbstractTool and registering it', async () => {
      // Define a custom specialized tool in a few lines of code
      class CreatePyramidTool extends AbstractTool {
        public readonly name = 'modeler_create_pyramid';
        public readonly description = 'Creates a 4-sided pyramid in the live Babylon.js scene.';
        public readonly parameters = {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the pyramid' },
            baseSize: { type: 'number', description: 'Base width and depth' },
            height: { type: 'number', description: 'Height of the pyramid' },
            color: { type: 'string', description: 'Hex color string' },
          },
          required: ['name'],
        };

        public execute(args: any, context: ToolExecutionContext): string {
          const baseSize = Number(args.baseSize) || 2;
          const height = Number(args.height) || 2;
          const name = String(args.name || 'custom_pyramid');

          // Cylinder with 4 tessellations and diameterTop=0 forms a 4-sided pyramid
          const pyramid = MeshBuilder.CreateCylinder(
            name,
            {
              height,
              diameterTop: 0,
              diameterBottom: baseSize * Math.SQRT2,
              tessellation: 4,
            },
            context.scene
          );

          pyramid.material = this.getOrCreateMaterial(
            context,
            undefined,
            args.color || '#e0a030',
            0.4,
            0.1,
            name
          );

          this.applyTransform(pyramid, args, context);
          this.registerMesh(pyramid, context);

          return JSON.stringify({
            status: 'ok',
            meshName: pyramid.name,
            vertices: pyramid.getTotalVertices(),
          });
        }
      }

      // Register into live AIAgentService
      const pyramidTool = new CreatePyramidTool();
      service.aiAgent.registerTool(pyramidTool);

      // Verify tool definition appears in agent's OpenAI tool specs
      const tools = service.aiAgent.getOpenAITools();
      const found = tools.find((t) => t.function.name === 'modeler_create_pyramid');
      expect(found).toBeDefined();
      expect(found?.function.description).toContain('4-sided pyramid');

      // Execute custom tool via aiAgent.executeToolCall
      const resultJson = await service.aiAgent.executeToolCall('modeler_create_pyramid', {
        name: 'Giza_Pyramid',
        baseSize: 4,
        height: 3,
        color: '#ffcc00',
        position: { x: 0, y: 1.5, z: 0 },
      });

      const res = JSON.parse(resultJson);
      expect(res.status).toBe('ok');
      expect(res.meshName).toBe('Giza_Pyramid');
      expect(res.vertices).toBeGreaterThan(0);

      // Verify the pyramid exists in the Babylon scene and service tracking
      const mesh = service.importedMeshes.find((m) => m.name === 'Giza_Pyramid');
      expect(mesh).toBeDefined();
      expect(mesh?.position.y).toBe(1.5);
    });
  });

  describe('4. Tool Abstraction, In-App Help Guides & Dialog Wiring', () => {
    it('provides unified ToolInterface metadata and comprehensive English help text for all 21 editor tools', () => {
      const editorTools = getBuiltinEditorTools();
      expect(editorTools.length).toBe(21);

      const requiredTools = [
        'scene_outliner',
        'create_primitive',
        'csg_sculpting',
        'facet_editor',
        'sculpt_retopo',
        'uv_unwrap',
        'texture_baker',
        'texture_optimizer',
        'compress_model',
        'voxel_painter',
        'path_extrusion',
        'ai_agent',
        'mesh_properties',
        'material_uv',
        'scene_environment',
        'animation_player',
        'rigging_skinning',
        'ai_texture_generator',
        'text_mesh',
        'decal_painter',
        'heightmap_terrain',
      ];

      for (const name of requiredTools) {
        const tool = editorTools.find((t) => t.name === name);
        expect(tool, `Tool ${name} should be registered`).toBeDefined();
        expect(tool!.dialogId).toBeDefined();
        expect(tool!.triggerButtonId).toBeDefined();
        expect(tool!.icon).toBeDefined();
        expect(tool!.description).toBeDefined();
        expect(tool!.helpText).toBeDefined();
        expect(tool!.helpText!.length).toBeGreaterThan(100);
        // Ensure help text is strictly in English (not German)
        expect(tool!.helpText).not.toMatch(/Benutzer|Möglichkeiten|Einstellungen|Werkzeug/i);
      }
    });

    it('renders a help (?) button directly to the left of the minimize button in dialog headers and opens help modal', () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-test-container';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      // Verify that every floating dialog header has a .btn-help before .btn-min
      for (const tool of app.editorTools) {
        if (!tool.dialogId) continue;
        const dialog = container.querySelector(`#${tool.dialogId}`) as HTMLElement | null;
        expect(dialog, `Dialog #${tool.dialogId} should exist`).not.toBeNull();

        const btnMin = dialog!.querySelector('.btn-min') as HTMLElement | null;
        const btnHelp = dialog!.querySelector('.btn-help') as HTMLElement | null;
        expect(btnMin, `btn-min in ${tool.dialogId} should exist`).not.toBeNull();
        expect(btnHelp, `btn-help in ${tool.dialogId} should exist`).not.toBeNull();

        // Check DOM ordering: btn-help must precede btn-min
        const actions = dialog!.querySelector('.dialog-actions')!;
        const children = Array.from(actions.children);
        const helpIndex = children.indexOf(btnHelp!);
        const minIndex = children.indexOf(btnMin!);
        expect(helpIndex).toBeLessThan(minIndex);
      }

      // Test opening help modal via the Voxel Painter ? button
      const voxelDlg = container.querySelector('#dialog-voxel-painter') as HTMLElement;
      const btnVoxelHelp = voxelDlg.querySelector('.btn-help') as HTMLButtonElement;
      btnVoxelHelp.click();

      const helpModal = container.querySelector('#toolHelpModal') as HTMLElement;
      expect(helpModal).not.toBeNull();
      expect(helpModal.classList.contains('active')).toBe(true);

      const titleEl = container.querySelector('#toolHelpTitle');
      expect(titleEl?.textContent).toContain('Voxel Painter');

      const bodyEl = container.querySelector('#toolHelpBody');
      expect(bodyEl?.innerHTML).toContain('Left Click');

      // Test closing via close button
      const btnClose = container.querySelector('#btnCloseToolHelp') as HTMLButtonElement;
      btnClose.click();
      expect(helpModal.classList.contains('active')).toBe(false);

      // Reopen and test closing via "Got it!" button
      btnVoxelHelp.click();
      expect(helpModal.classList.contains('active')).toBe(true);

      const btnDone = container.querySelector('#btnDoneToolHelp') as HTMLButtonElement;
      btnDone.click();
      expect(helpModal.classList.contains('active')).toBe(false);
    });

    it('abstracts tool lifecycle hooks: handles open, close, minimize, maximize, and exclusive 3D tool deactivation', () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-test-container-lifecycle';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
        layoutMode: 'floating',
      });

      // 1. Open Voxel Painter: sets active = true
      app.toggleDialog('dialog-voxel-painter', true);
      expect(app.service.voxelPainter.isActive).toBe(true);
      expect(app.service.pathExtrusion.isActive).toBe(false);

      // 2. Open Path Extrusion: deactivates 3D editing of Voxel Painter WITHOUT closing its dialog
      app.toggleDialog('dialog-path-extrusion', true);
      expect(app.service.pathExtrusion.isActive).toBe(true);
      expect(app.service.voxelPainter.isActive).toBe(false);
      const voxelDlg = container.querySelector('#dialog-voxel-painter') as HTMLElement;
      const pathDlg = container.querySelector('#dialog-path-extrusion') as HTMLElement;
      expect(voxelDlg.style.display).not.toBe('none');
      expect(pathDlg.style.display).not.toBe('none');

      // 3. Focusing / clicking Voxel Painter dialog reactivates Voxel Painter and deactivates Path Extrusion
      app.bringDialogToFront(voxelDlg);
      expect(app.service.voxelPainter.isActive).toBe(true);
      expect(app.service.pathExtrusion.isActive).toBe(false);
      expect(voxelDlg.style.display).not.toBe('none');
      expect(pathDlg.style.display).not.toBe('none');

      // Reactivate Path Extrusion for subsequent tests
      app.bringDialogToFront(pathDlg);
      expect(app.service.pathExtrusion.isActive).toBe(true);
      expect(app.service.voxelPainter.isActive).toBe(false);

      // 4. Path Extrusion does NOT create a path automatically on activation
      expect(app.service.pathExtrusion.paths.length).toBe(0);

      // 5. Minimize Path Extrusion: deactivates path extrusion tool
      app.toggleDialogMinimize(pathDlg, true);
      expect(pathDlg.classList.contains('minimized')).toBe(true);
      expect(app.service.pathExtrusion.isActive).toBe(false);

      // 6. Maximize Path Extrusion: reactivates path extrusion tool
      app.toggleDialogMinimize(pathDlg, false);
      expect(pathDlg.classList.contains('minimized')).toBe(false);
      expect(app.service.pathExtrusion.isActive).toBe(true);

      // 7. Close Path Extrusion
      app.toggleDialog('dialog-path-extrusion', false);
      expect(app.service.pathExtrusion.isActive).toBe(false);

      // 8. Switching to standard transform gizmo deactivates active exclusive 3D tools without closing dialogs
      app.toggleDialog('dialog-voxel-painter', true);
      app.bringDialogToFront(voxelDlg);
      expect(app.service.voxelPainter.isActive).toBe(true);
      expect(voxelDlg.style.display).toBe('flex');

      container.querySelector('#btnGizmoTranslate')?.dispatchEvent(new MouseEvent('click'));
      expect(app.service.voxelPainter.isActive).toBe(false);
      expect(voxelDlg.style.display).toBe('flex');

      // 9. Switching to a standard panel (e.g. Create Mesh) does not close open exclusive 3D tool dialogs
      app.toggleDialog('dialog-create-primitive', true);
      expect(voxelDlg.style.display).toBe('flex');
    });

    it('instantiates all decentralized editor tool classes with self-contained configurations and help guides', () => {
      const tools = createBuiltinEditorTools();
      expect(tools.length).toBe(21);

      const heightmapTool = new HeightmapEditorTool();
      expect(heightmapTool.name).toBe('heightmap_terrain');
      expect(heightmapTool.dialogId).toBe('dialog-heightmap');
      expect(heightmapTool.helpText).toContain('Heightmap Terrain');

      const outliner = new OutlinerEditorTool();
      expect(outliner.name).toBe('scene_outliner');
      expect(outliner.dialogId).toBe('dialog-outliner');
      expect(outliner.helpText).toContain('Scene Objects Outliner');

      const createMesh = new CreatePrimitiveEditorTool();
      expect(createMesh.name).toBe('create_primitive');
      expect(createMesh.dialogId).toBe('dialog-create-primitive');
      expect(createMesh.helpText).toContain('Create Mesh');

      const csg = new CSGEditorTool();
      expect(csg.name).toBe('csg_sculpting');
      expect(csg.dialogId).toBe('dialog-csg');
      expect(csg.helpText).toContain('Constructive Solid Geometry');

      const facet = new FacetEditorTool();
      expect(facet.name).toBe('facet_editor');
      expect(facet.dialogId).toBe('dialog-facet');

      const sculpt = new SculptEditorTool();
      expect(sculpt.name).toBe('sculpt_retopo');
      expect(sculpt.dialogId).toBe('dialog-sculpt');
      expect(sculpt.helpText).toContain('Figure Sculpt & Retopo');

      const tex = new TextureOptimizerEditorTool();
      expect(tex.name).toBe('texture_optimizer');
      expect(tex.dialogId).toBe('dialog-textures');

      const compressTool = new CompressModelEditorTool();
      expect(compressTool.name).toBe('compress_model');
      expect(compressTool.dialogId).toBe('dialog-compress-model');
      expect(compressTool.helpText).toContain('Compress Model');

      const voxel = new VoxelPainterEditorTool();
      expect(voxel.name).toBe('voxel_painter');
      expect(voxel.isExclusive3DTool).toBe(true);

      const path = new PathExtrusionEditorTool();
      expect(path.name).toBe('path_extrusion');
      expect(path.isExclusive3DTool).toBe(true);

      const ai = new AIAgentEditorTool();
      expect(ai.name).toBe('ai_agent');
      expect(ai.dialogId).toBe('dialog-ai-agent');

      const props = new MeshPropertiesEditorTool();
      expect(props.name).toBe('mesh_properties');

      const mat = new MaterialEditorTool();
      expect(mat.name).toBe('material_uv');

      const scene = new SceneEnvironmentEditorTool();
      expect(scene.name).toBe('scene_environment');

      const anim = new AnimationPlayerEditorTool();
      expect(anim.name).toBe('animation_player');

      // Verify each decentralized tool is an instance of ToolInterface with complete metadata
      for (const t of tools) {
        expect(t.name).toBeTruthy();
        expect(t.menuLabel).toBeTruthy();
        expect(t.icon).toBeTruthy();
        expect(t.dialogId).toBeTruthy();
        expect(t.helpText).toBeTruthy();
        expect(t.description).toBeTruthy();

        // Verify each tool brings its own decentralized view template
        const viewTemplate = t.getViewTemplate?.();
        expect(viewTemplate).toBeTruthy();
        expect(viewTemplate).toContain(`id="${t.dialogId}"`);
        expect(viewTemplate).toContain('class="floating-dialog');
        expect(viewTemplate).toContain('class="dialog-header"');
      }
    });

    it('mounts decentralized tool views dynamically into container when missing from DOM', () => {
      const container = document.createElement('div');
      container.id = 'customContainer';
      document.body.appendChild(container);

      const voxelTool = new VoxelPainterEditorTool();
      expect(voxelTool.dialogId).toBe('dialog-voxel-painter');

      // Clean up any lingering dialog from previous tests
      document.getElementById('dialog-voxel-painter')?.remove();

      // Ensure dialog is not yet in DOM
      expect(document.getElementById('dialog-voxel-painter')).toBeNull();

      // Render view dynamically
      const renderedElement = voxelTool.renderView(container);
      expect(renderedElement).not.toBeNull();
      expect(renderedElement?.id).toBe('dialog-voxel-painter');
      expect(container.contains(renderedElement!)).toBe(true);

      // Subsequent call returns existing element without duplicating
      const secondCall = voxelTool.renderView(container);
      expect(secondCall).toBe(renderedElement);
      expect(container.querySelectorAll('#dialog-voxel-painter').length).toBe(1);

      container.remove();
    });

    it('dynamically builds the Tools dropdown menu from ToolInterface instances without hardcoding in EJS', () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-test-container-dynamic-menu';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      const menuTools = container.querySelector('#menuTools');
      expect(menuTools).not.toBeNull();

      // Verify that all 12 editor tools have dynamically generated menu items
      for (const tool of app.editorTools) {
        if (!tool.triggerButtonId) continue;
        const btn = menuTools!.querySelector(`#${tool.triggerButtonId}`) as HTMLButtonElement | null;
        expect(btn, `Button #${tool.triggerButtonId} should be dynamically rendered`).not.toBeNull();
        expect(btn?.getAttribute('data-tool-name')).toBe(tool.name);
        expect(btn?.textContent).toContain(tool.menuLabel);
      }

      // Verify that NO quick-toggle buttons exist in the top toolbar
      const quickToolbarToggles = container.querySelectorAll(
        '#btnToolbarAIAgent, #btnToolbarVoxelPainter, #btnToolbarPathExtrusion, .ai-toolbar-group, .voxel-toolbar-group, .path-extrusion-toolbar-group'
      );
      expect(quickToolbarToggles.length).toBe(0);

      // Verify registering a new tool dynamically appends it to #menuTools
      const customTool = {
        name: 'custom_procedural_tool',
        menuLabel: 'Procedural Generator',
        triggerButtonId: 'btnToggleCustomProceduralTool',
        dialogId: 'dialog-custom-procedural',
        icon: 'sparkles',
        order: 99,
        description: 'Dynamically registered procedural tool',
      };

      app.registerEditorTool(customTool as any);

      const customBtn = menuTools!.querySelector('#btnToggleCustomProceduralTool') as HTMLButtonElement | null;
      expect(customBtn).not.toBeNull();
      expect(customBtn?.textContent).toContain('Procedural Generator');

      // Verify registering a custom categorized tool places it in the specified category submenu
      app.registerEditorTool({
        name: 'custom_material_helper',
        menuLabel: 'PBR Shader Mixer',
        category: 'Materials',
        triggerButtonId: 'btnTogglePbrMixer',
        dialogId: 'dialog-pbr-mixer',
        icon: 'palette',
        order: 99,
        description: 'Custom material mixer tool',
      } as any);
      const customMatBtn = menuTools!.querySelector('#menuToolsSubmenu-Materials #btnTogglePbrMixer');
      expect(customMatBtn).not.toBeNull();
      expect(customMatBtn?.textContent).toContain('PBR Shader Mixer');

      // Verify registering a tool with a new custom category creates its submenu dynamically
      app.registerEditorTool({
        name: 'custom_physics_tool',
        menuLabel: 'Physics Collider',
        category: 'Physics',
        triggerButtonId: 'btnTogglePhysicsTool',
        dialogId: 'dialog-physics-tool',
        icon: 'box',
        order: 100,
        description: 'Custom physics collider tool',
      } as any);
      const physicsTrigger = menuTools!.querySelector('#btnToolCategory-Physics');
      const physicsBtn = menuTools!.querySelector('#menuToolsSubmenu-Physics #btnTogglePhysicsTool');
      expect(physicsTrigger).not.toBeNull();
      expect(physicsBtn).not.toBeNull();
    });

    it('organizes all 21 editor tools into Generic, Materials, Creation, Optimization, and Characters submenus', () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-test-container-categories';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      const expectedByCategory: Record<string, string[]> = {
        Generic: ['Scene Objects', 'Mesh Properties', 'Scene & Environment', 'Animation Player'],
        Materials: ['AI Texture Generator', 'Material & Texture', 'Normal & AO Baker', 'UV Unwrap & Texel Density'],
        Creation: [
          'AI Mesh Agent',
          'Create Mesh',
          'Facet & Vertex Editor',
          'Figure Sculpt & Retopo',
          'Voxel Painter',
          'Path Extrusion',
          'Constructive Solid Geometry',
          '3D Text',
          'Decal Painter',
          'Heightmap Terrain',
        ],
        Optimization: ['Compress Model', 'Texture Optimizer'],
        Characters: ['Rigging & Weight Paint'],
      };

      const menuTools = container.querySelector('#menuTools') as HTMLElement;
      expect(menuTools).not.toBeNull();

      // Verify category triggers appear in exact expected order
      const catTriggers = Array.from(menuTools.querySelectorAll('.dropdown-submenu-trigger')) as HTMLButtonElement[];
      expect(catTriggers.map((t) => t.getAttribute('data-tool-category'))).toEqual([
        'Generic',
        'Materials',
        'Creation',
        'Optimization',
        'Characters',
      ]);

      // Verify every tool belongs to its exact category and submenu
      for (const [category, expectedLabels] of Object.entries(expectedByCategory)) {
        const toolsInCat = app.editorTools.filter((t) => t.category === category);
        const actualLabels = toolsInCat.map((t) => t.menuLabel);
        expect(new Set(actualLabels)).toEqual(new Set(expectedLabels));

        const submenu = menuTools.querySelector(`#menuToolsSubmenu-${category}`) as HTMLElement | null;
        expect(submenu, `Submenu for ${category} should exist`).not.toBeNull();
        const submenuLabels = Array.from(submenu!.querySelectorAll('.dropdown-item[data-tool-name]')).map(
          (el) => el.querySelector('.btn-label')?.textContent?.trim()
        );
        expect(new Set(submenuLabels)).toEqual(new Set(expectedLabels));
      }

      // Verify opening root Tools menu and toggling category submenus via fallback click & keyboard
      const btnTools = container.querySelector('#btnDropdownTools') as HTMLButtonElement;
      btnTools.click();
      expect(menuTools.getAttribute('data-popover-open')).toBe('true');

      const materialsTrigger = menuTools.querySelector('#btnToolCategory-Materials') as HTMLButtonElement;
      const materialsSubmenu = menuTools.querySelector('#menuToolsSubmenu-Materials') as HTMLElement;
      const creationTrigger = menuTools.querySelector('#btnToolCategory-Creation') as HTMLButtonElement;
      const creationSubmenu = menuTools.querySelector('#menuToolsSubmenu-Creation') as HTMLElement;

      materialsTrigger.click();
      expect(materialsSubmenu.getAttribute('data-popover-open')).toBe('true');
      expect(materialsTrigger.getAttribute('aria-expanded')).toBe('true');

      // Opening another submenu closes the previous sibling submenu
      creationTrigger.click();
      expect(creationSubmenu.getAttribute('data-popover-open')).toBe('true');
      expect(materialsSubmenu.getAttribute('data-popover-open')).toBeNull();
      expect(materialsTrigger.getAttribute('aria-expanded')).toBe('false');

      // Escape inside submenu closes only that submenu and keeps root Tools menu open
      const creationList = creationSubmenu.querySelector('.dropdown-menu-list') as HTMLElement;
      creationList.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(creationSubmenu.getAttribute('data-popover-open')).toBeNull();
      expect(menuTools.getAttribute('data-popover-open')).toBe('true');

      // Active tool indicator (.has-active-tool) tracks open tools in the category
      app.toggleDialog('dialog-rigging', true);
      const charactersTrigger = menuTools.querySelector('#btnToolCategory-Characters') as HTMLButtonElement;
      expect(charactersTrigger.classList.contains('has-active-tool')).toBe(true);
      app.toggleDialog('dialog-rigging', false);
      expect(charactersTrigger.classList.contains('has-active-tool')).toBe(false);

      // Clean up open dropdowns
      app.closeAllDropdowns();
      expect(menuTools.getAttribute('data-popover-open')).toBeNull();
      app.dispose();
    });
  });

  describe('5. Facet & Box Modeling Builtin AI Tools', () => {
    it('solidifies an open mesh sheet with real physical wall thickness', async () => {
      // Create a test box
      const box = MeshBuilder.CreateBox('test_box', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_solidify_mesh', {
        meshName: 'test_box',
        thickness: 0.15,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.meshName).toBe('test_box');
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
      expect(parsed.thickness).toBe(0.15);
    });

    it('subdivides mesh faces into equilateral subtriangles', async () => {
      const box = MeshBuilder.CreateBox('subdiv_box', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialIndices = box.getTotalIndices(); // 36 indices = 12 triangles

      const result = await service.aiAgent.executeToolCall('modeler_subdivide_mesh', {
        meshName: 'subdiv_box',
        iterations: 1,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.totalIndices).toBe(initialIndices * 4); // 48 triangles = 144 indices
    });

    it('applies Sub-D smoothing with midpoint subdivision and Laplacian relaxation', async () => {
      const box = MeshBuilder.CreateBox('smooth_cage', { size: 2 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_subd_smooth', {
        meshName: 'smooth_cage',
        iterations: 2,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.meshName).toBe('smooth_cage');
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
    });

    it('extrudes a facet along normal with connecting side quads', async () => {
      const box = MeshBuilder.CreateBox('extrude_tower', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_facet_extrude', {
        meshName: 'extrude_tower',
        direction: 'top',
        distance: 0.8,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.faceDirection).toBe('top');
      expect(parsed.distance).toBe(0.8);
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
    });

    it('insets a facet toward centroid with depth offset', async () => {
      const box = MeshBuilder.CreateBox('inset_window', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_facet_inset', {
        meshName: 'inset_window',
        direction: 'front',
        insetAmount: 0.2,
        depth: -0.1,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.faceDirection).toBe('front');
      expect(parsed.insetAmount).toBe(0.2);
      expect(parsed.depth).toBe(-0.1);
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
    });

    it('extrudes a facet along a curved circular arch', async () => {
      const box = MeshBuilder.CreateBox('arch_bridge', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_facet_arc', {
        meshName: 'arch_bridge',
        direction: 'top',
        segments: 4,
        height: 0.6,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.segments).toBe(4);
      expect(parsed.height).toBe(0.6);
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
    });

    it('punches a cut-through portal into a mesh', async () => {
      const box = MeshBuilder.CreateBox('portal_wall', { size: 1 }, service.scene);
      service.importedMeshes.push(box);
      const initialVerts = box.getTotalVertices();

      const result = await service.aiAgent.executeToolCall('modeler_facet_cut_through', {
        meshName: 'portal_wall',
        direction: 'front',
        depth: 0.5,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.depth).toBe(0.5);
      expect(parsed.totalVertices).toBeGreaterThan(initialVerts);
    });

    it('generates seamless sand procedural texture and sets up tiling', async () => {
      const result = await service.aiAgent.executeToolCall('modeler_create_material', {
        materialName: 'DesertSandMat',
        roughness: 0.9,
        metallic: 0.0,
        uScale: 3,
        vScale: 3,
        proceduralTexture: {
          type: 'sand',
          primaryColor: '#c2b280',
          secondaryColor: '#9c8c5a',
          scale: 1.5,
        },
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.materialName).toBe('DesertSandMat');

      const mat = service.scene.getMaterialByName('DesertSandMat') as any;
      expect(mat).toBeDefined();
      expect(mat.roughness).toBe(0.9);
      expect(mat.albedoTexture).toBeDefined();
      expect(mat.albedoTexture.uScale).toBe(3);
      expect(mat.albedoTexture.vScale).toBe(3);
    });

    it('applies direct image texture URL and tiling to PBR material', async () => {
      const fakeDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

      const result = await service.aiAgent.executeToolCall('modeler_create_material', {
        materialName: 'AiGeneratedSandMat',
        textureUrl: fakeDataUrl,
        uScale: 5,
        vScale: 5,
        roughness: 0.95,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');

      const mat = service.scene.getMaterialByName('AiGeneratedSandMat') as any;
      expect(mat).toBeDefined();
      expect(mat.albedoTexture).toBeDefined();
      expect(mat.albedoTexture.uScale).toBe(5);
      expect(mat.albedoTexture.vScale).toBe(5);
    });

    it('creates normal map on PBR material with normalMapUrl, parallax mapping, and procedural normal generation', async () => {
      const fakeNormalUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

      const result = await service.aiAgent.executeToolCall('modeler_create_material', {
        materialName: 'NormalStoneMat',
        normalMapUrl: fakeNormalUrl,
        bumpLevel: 1.8,
        invertNormalMapY: true,
        useParallax: true,
        useParallaxOcclusion: true,
        parallaxScaleBias: 0.06,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');

      const mat = service.scene.getMaterialByName('NormalStoneMat') as any;
      expect(mat).toBeDefined();
      expect(mat.bumpTexture).toBeDefined();
      expect(mat.bumpTexture.level).toBe(1.8);
      expect(mat.invertNormalMapY).toBe(true);
      expect(mat.useParallax).toBe(true);
      expect(mat.useParallaxOcclusion).toBe(true);
      expect(mat.parallaxScaleBias).toBe(0.06);

      // Verify procedural normal map generation when proceduralTexture is used
      const procResult = await service.aiAgent.executeToolCall('modeler_create_material', {
        materialName: 'ProcBrickMat',
        proceduralTexture: {
          type: 'brick',
          scale: 1.0,
        },
      });
      const parsedProc = JSON.parse(procResult);
      expect(parsedProc.status).toBe('ok');
      const procMat = service.scene.getMaterialByName('ProcBrickMat') as any;
      expect(procMat.bumpTexture).toBeDefined();
      expect(procMat.bumpTexture.name).toContain('ProcBrickMat_brick_normal');
    });
  });

  describe('8. AI Texture Generator, 3D Text & Decal Painter + Export Fusion', () => {
    it('generates textures from prompts via AITextureGenerator and modeler_generate_texture tool and applies to mesh', async () => {
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        shape: 'box',
        name: 'DungeonWall',
        options: { size: 2 },
      });

      const genRes = await service.aiAgent.executeToolCall('modeler_generate_texture', {
        prompt: 'Weathered dark dungeon cobblestone floor with mossy crevices',
        size: 256,
        seamless: true,
        generateNormalMap: true,
        applyToMesh: 'DungeonWall',
      });

      const parsed = JSON.parse(genRes);
      expect(parsed.status).toBe('ok');
      expect(parsed.style).toBe('cobblestone');
      expect(parsed.appliedToMeshes).toContain('DungeonWall');

      const history = service.aiTextureGenerator.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].albedoDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(history[0].normalDataUrl).toMatch(/^data:image\/png;base64,/);

      const wallMesh = service.importedMeshes.find((m) => m.name === 'DungeonWall');
      expect(wallMesh?.material).toBeDefined();
    });

    it('creates and updates 3D extruded text meshes via TextMeshController and modeler_create_text_mesh tool', async () => {
      const createRes = await service.aiAgent.executeToolCall('modeler_create_text_mesh', {
        text: 'HERO',
        name: 'HeroSign',
        font: 'kenney_future',
        size: 1.2,
        depth: 0.3,
        resolution: 6,
        color: '#f59e0b',
        position: [0, 1, 0],
      });

      const parsed = JSON.parse(createRes);
      expect(parsed.status).toBe('ok');
      expect(parsed.meshName).toBe('HeroSign');
      expect(parsed.vertices).toBeGreaterThan(0);

      const signMesh = service.importedMeshes.find((m) => m.name === 'HeroSign');
      expect(signMesh).toBeDefined();
      expect(service.textMeshController.isTextMesh(signMesh)).toBe(true);

      // Update the 3D text mesh in-place
      const updateRes = await service.aiAgent.executeToolCall('modeler_create_text_mesh', {
        targetMesh: 'HeroSign',
        text: 'VICTORY',
        size: 1.5,
        depth: 0.4,
        color: '#10b981',
      });
      const parsedUpdate = JSON.parse(updateRes);
      expect(parsedUpdate.status).toBe('ok');

      const updatedMesh = service.importedMeshes.find((m) => m.name === 'HeroSign');
      expect(updatedMesh).toBeDefined();
      expect(service.textMeshController.getTextConfig(updatedMesh!)?.text).toBe('VICTORY');
    });

    it('places decals on a mesh and fuses/merges them into the target mesh via DecalController and modeler_decal tool', async () => {
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        shape: 'box',
        name: 'ArmorCrate',
        options: { size: 2 },
      });

      const crateBefore = service.importedMeshes.find((m) => m.name === 'ArmorCrate')!;
      expect(crateBefore).toBeDefined();
      const initialVerts = crateBefore.getTotalVertices();

      // Place two decals onto ArmorCrate
      const placeRes1 = await service.aiAgent.executeToolCall('modeler_decal', {
        action: 'place',
        targetMesh: 'ArmorCrate',
        decalType: 'bullet_hole',
        face: 'front',
        size: 0.8,
      });
      expect(JSON.parse(placeRes1).status).toBe('ok');

      const placeRes2 = await service.aiAgent.executeToolCall('modeler_decal', {
        action: 'place',
        targetMesh: 'ArmorCrate',
        prompt: 'Glowing arcane rune seal decal',
        face: 'top',
        size: 0.8,
      });
      expect(JSON.parse(placeRes2).status).toBe('ok');

      expect(service.decalController.getUnmergedDecals('ArmorCrate').length).toBe(2);

      // Merge decals into the mesh
      const mergeRes = await service.aiAgent.executeToolCall('modeler_decal', {
        action: 'merge',
        targetMesh: 'ArmorCrate',
      });
      expect(JSON.parse(mergeRes).status).toBe('ok');

      // Verify decals are now fused into ArmorCrate and no unmerged decals remain
      expect(service.decalController.getUnmergedDecals('ArmorCrate').length).toBe(0);
      const crateAfter = service.importedMeshes.find((m) => m.name === 'ArmorCrate')!;
      expect(crateAfter).toBeDefined();
      expect(crateAfter.getTotalVertices()).toBeGreaterThan(initialVerts);
      expect(crateAfter.metadata?.mergedDecalCount).toBe(2);
    });
  });

  describe('9. Heightmap Terrain Tool (User UI, 2-Tab Paint Editor & AI Tool)', () => {
    it('initializes heightmap with black ground, supports grayscale & RGB painting with size/smoothness, and redraws GroundMesh on OK', async () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-heightmap-container';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      const ctrl = app.service.heightmapController;

      // Default heightmap starts pure black (0)
      expect(ctrl.heightmapRgba[0]).toBe(0);
      expect(ctrl.heightmapRgba[1]).toBe(0);
      expect(ctrl.heightmapRgba[2]).toBe(0);

      // Open Heightmap tool dialog
      app.toggleDialog('dialog-heightmap', true);
      const dlg = container.querySelector('#dialog-heightmap') as HTMLElement;
      expect(dlg.style.display).toBe('flex');

      // Default tab is Heightmap (Grayscale), Mix tab hidden
      const heightPane = container.querySelector('#heightmapTabPaneHeight') as HTMLElement;
      const mixPane = container.querySelector('#heightmapTabPaneMix') as HTMLElement;
      expect(heightPane.style.display).not.toBe('none');
      expect(mixPane.style.display).toBe('none');

      // Open 2-tab Paint Editor modal
      (container.querySelector('#btnOpenHeightmapPainter') as HTMLButtonElement).click();
      const paintModal = container.querySelector('#heightmapPaintModal') as HTMLElement;
      expect(paintModal.classList.contains('active')).toBe(true);

      // Set brush size & smoothness via UI controls and paint white grayscale hill in center
      const sizeRange = container.querySelector('#heightmapBrushSizeRange') as HTMLInputElement;
      const smoothRange = container.querySelector('#heightmapBrushSmoothnessRange') as HTMLInputElement;
      sizeRange.value = '48';
      sizeRange.dispatchEvent(new Event('input'));
      smoothRange.value = '80';
      smoothRange.dispatchEvent(new Event('input'));

      expect(ctrl.brushSize).toBe(48);
      expect(ctrl.brushSmoothness).toBeCloseTo(0.8);

      // Paint white stroke on black heightmap
      ctrl.paintHeightmapStroke(128, 128, 128, 128, { size: 48, smoothness: 0.8, value: 255 });
      const centerIdx = (128 * ctrl.mapSize + 128) * 4;
      const edgeIdx = (128 * ctrl.mapSize + 148) * 4;
      expect(ctrl.heightmapRgba[centerIdx]).toBe(255);
      expect(ctrl.heightmapRgba[edgeIdx]).toBeGreaterThan(0);
      expect(ctrl.heightmapRgba[edgeIdx]).toBeLessThan(255);

      // Switch to Tab 2 (Mix Texture RGB) and paint a green path
      (container.querySelector('#paintModalTabMix') as HTMLButtonElement).click();
      (container.querySelector('#btnPaintChannelGreen') as HTMLButtonElement).click();
      expect(ctrl.brushRgbChannel).toBe('g');
      ctrl.paintMixmapStroke(20, 128, 230, 128, { size: 24, smoothness: 0.5, channel: 'g' });
      expect(ctrl.hasCustomMixMap).toBe(true);
      expect(ctrl.mixmapRgba[centerIdx + 1]).toBe(255);
      expect(ctrl.mixmapRgba[centerIdx]).toBe(0);

      // Press OK button -> closes modal and immediately redraws 3D GroundMesh
      (container.querySelector('#btnConfirmHeightmapPaint') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 20));
      expect(paintModal.classList.contains('active')).toBe(false);

      const terrainMesh = ctrl.getActiveTerrainMesh();
      expect(terrainMesh).not.toBeNull();
      expect(terrainMesh instanceof GroundMesh).toBe(true);
      expect(terrainMesh!.material instanceof TerrainMaterial).toBe(true);

      // Verify elevated center vs black border
      const bbox = terrainMesh!.getBoundingInfo().boundingBox;
      expect(bbox.maximum.y).toBeGreaterThan(8);
      expect(bbox.minimum.y).toBeCloseTo(0, 2);

      app.dispose();
    });

    it('individually assigns the 3 terrain textures and immediately re-renders the mesh upon selection', async () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-heightmap-tex-container';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      const ctrl = app.service.heightmapController;
      app.toggleDialog('dialog-heightmap', true);

      // Build an initial terrain mesh
      const terrain = await ctrl.buildOrUpdateTerrainMesh({
        preset: 'island',
        width: 80,
        height: 80,
        subdivisions: 32,
        maxHeight: 12,
      });

      const renderSpy = vi.spyOn(app.service.scene, 'render');
      const tex1Select = container.querySelector('#heightmapTex1Select') as HTMLSelectElement;
      const tex2Select = container.querySelector('#heightmapTex2Select') as HTMLSelectElement;
      const tex3Select = container.querySelector('#heightmapTex3Select') as HTMLSelectElement;

      // Select Texture 1 (Red channel) -> immediately updates & re-renders
      tex1Select.value = 'snow';
      tex1Select.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.config.terrainTextureName1).toBe('snow');
      expect((terrain.material as TerrainMaterial).diffuseTexture1.name).toContain('snow');
      expect(renderSpy).toHaveBeenCalled();

      // Select Texture 2 (Green channel) -> immediately updates & re-renders
      renderSpy.mockClear();
      tex2Select.value = 'cobblestone';
      tex2Select.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.config.terrainTextureName2).toBe('cobblestone');
      expect((terrain.material as TerrainMaterial).diffuseTexture2.name).toContain('cobblestone');
      expect(renderSpy).toHaveBeenCalled();

      // Select Texture 3 (Blue channel) -> immediately updates & re-renders
      renderSpy.mockClear();
      tex3Select.value = 'volcanic';
      tex3Select.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 20));
      expect(ctrl.config.terrainTextureName3).toBe('volcanic');
      expect((terrain.material as TerrainMaterial).diffuseTexture3.name).toContain('volcanic');
      expect(renderSpy).toHaveBeenCalled();

      app.dispose();
    });

    it('creates and updates heightmap terrains via AI tool modeler_create_heightmap with paths and GLB export', async () => {
      const resJson = await service.aiAgent.executeToolCall('modeler_create_heightmap', {
        name: 'VolcanicIsland',
        preset: 'island',
        width: 100,
        height: 100,
        subdivisions: 40,
        minHeight: 0,
        maxHeight: 14,
        texture1: 'volcanic',
        texture2: 'cobblestone',
        texture3: 'sand',
        textureScale: [12, 16, 10],
        heightStrokes: [
          {
            points: [
              [0.5, 0.5],
              [0.6, 0.6],
            ],
            size: 36,
            smoothness: 0.75,
            value: 255,
          },
        ],
        pathPoints: [
          [-30, 1, -20],
          [0, 2, 0],
          [30, 1, 20],
        ],
        pathWidth: 10,
        pathTransitionWidth: 5,
        pathYOffset: 0,
        pathProjection: true,
      });

      const res = JSON.parse(resJson);
      expect(res.status).toBe('ok');
      expect(res.meshName).toBe('VolcanicIsland');
      expect(res.textures).toEqual(['volcanic', 'cobblestone', 'sand']);
      expect(res.vertices).toBe(41 * 41);

      const terrainMesh = service.importedMeshes.find((m) => m.name === 'VolcanicIsland') as GroundMesh;
      expect(terrainMesh).toBeDefined();
      expect(terrainMesh instanceof GroundMesh).toBe(true);
      expect(terrainMesh.material instanceof TerrainMaterial).toBe(true);
      const tm = terrainMesh.material as TerrainMaterial;
      expect(tm.diffuseTexture1.uScale).toBe(12);
      expect(tm.diffuseTexture2.uScale).toBe(16);
      expect(tm.diffuseTexture3.uScale).toBe(10);

      // Verify GLB export works cleanly and restores TerrainMaterial afterwards
      const glbBlob = await service.exportToGLBBlob('volcanic_island');
      expect(glbBlob).toBeDefined();
      expect(glbBlob.size).toBeGreaterThan(0);
      expect(terrainMesh.material instanceof TerrainMaterial).toBe(true);
    });

    it('discovers and makes AI textures created after heightmap AND GLB/scene textures immediately selectable', async () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'app-heightmap-ai-tex-container';
      document.body.appendChild(container);

      const app = new MeshEditorApp({
        container,
        engine,
      });

      const ctrl = app.service.heightmapController;
      app.toggleDialog('dialog-heightmap', true);

      // 1. Create heightmap first
      const terrain = await ctrl.buildOrUpdateTerrainMesh({
        name: 'AI_Textured_Terrain',
        preset: 'mountains',
        width: 80,
        height: 80,
        subdivisions: 24,
        maxHeight: 12,
      });

      // 2. Generate a new AI texture AFTER heightmap creation (both via UI generator / AI tool)
      const aiItem = await app.service.aiTextureGenerator.generateTexture({
        prompt: 'Obsidian volcanic magma rock',
        name: 'ObsidianMagma',
        style: 'lava',
        size: 64,
        useAI: false,
      });

      const tex1Select = container.querySelector('#heightmapTex1Select') as HTMLSelectElement;
      const tex2Select = container.querySelector('#heightmapTex2Select') as HTMLSelectElement;
      const tex3Select = container.querySelector('#heightmapTex3Select') as HTMLSelectElement;

      const aiOptId = `ai_${aiItem.id}`;
      expect(Array.from(tex1Select.options).some((o) => o.value === aiOptId)).toBe(true);
      expect(Array.from(tex2Select.options).some((o) => o.value === aiOptId)).toBe(true);
      expect(Array.from(tex3Select.options).some((o) => o.value === aiOptId)).toBe(true);

      // 3. Simulate a GLB-imported material texture whose URL is internal "data:file:model.glb#image0" with binary buffer
      const glbSampleMat = new PBRMaterial('GLB_Mesh_Mat', app.service.scene);
      const glbTex = new Texture('data:file:imported_rock.glb#image0', app.service.scene, false, false);
      glbTex.name = 'Imported_Cliff_Albedo';
      const tinyPngBytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII='),
        (c) => c.charCodeAt(0),
      );
      (glbTex.getInternalTexture() as any)._buffer = tinyPngBytes;
      glbSampleMat.albedoTexture = glbTex;

      // Also add a normal embedded scene texture via service
      const extraDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      app.service.addTextureFromDataUrl('Forest_Soil_Diffuse.png', extraDataUrl);

      const available = ctrl.getAvailableTextures();
      const glbOpt = available.find((t) => t.name.includes('Imported_Cliff_Albedo'));
      const sceneOpt = available.find((t) => t.name.includes('Forest_Soil_Diffuse'));
      expect(glbOpt).toBeDefined();
      expect(glbOpt!.url.startsWith('data:image/png;base64,')).toBe(true);
      expect(sceneOpt).toBeDefined();

      expect(Array.from(tex1Select.options).some((o) => o.value === glbOpt!.id)).toBe(true);
      expect(Array.from(tex2Select.options).some((o) => o.value === sceneOpt!.id)).toBe(true);

      // Selecting the AI texture and GLB texture immediately assigns them on TerrainMaterial
      tex1Select.value = aiOptId;
      tex1Select.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 20));
      expect((terrain.material as TerrainMaterial).diffuseTexture1.name).toContain(aiOptId);

      tex2Select.value = glbOpt!.id;
      tex2Select.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 20));
      expect((terrain.material as TerrainMaterial).diffuseTexture2.name).toContain(glbOpt!.id);

      app.dispose();
    });

    it('exports heightmap terrain textures to GLB (including AI textures) and preserves PBR textures on reload', async () => {
      const aiItem = await service.aiTextureGenerator.generateTexture({
        prompt: 'Golden alpine meadow grass',
        name: 'AlpineGrass',
        style: 'moss',
        size: 64,
        useAI: false,
      });

      const terrain = await service.heightmapController.buildOrUpdateTerrainMesh({
        name: 'ExportableTerrain',
        preset: 'island',
        width: 80,
        height: 80,
        subdivisions: 24,
        maxHeight: 12,
        texture1: 'rock',
        texture2: `ai_${aiItem.id}`,
        texture3: 'sand',
      });
      expect(terrain.material instanceof TerrainMaterial).toBe(true);

      const glbBlob = await service.exportToGLBBlob('terrain_export_test');
      expect(glbBlob.size).toBeGreaterThan(256);

      // Parse GLB JSON chunk directly and verify embedded image, texture, and baseColorTexture exist
      const glbBuf = await glbBlob.arrayBuffer();
      const view = new DataView(glbBuf);
      expect(view.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
      const jsonChunkLen = view.getUint32(12, true);
      expect(view.getUint32(16, true)).toBe(0x4e4f534a); // 'JSON'
      const gltfJson = JSON.parse(new TextDecoder().decode(new Uint8Array(glbBuf, 20, jsonChunkLen)));

      expect(Array.isArray(gltfJson.images)).toBe(true);
      expect(gltfJson.images.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(gltfJson.textures)).toBe(true);
      expect(gltfJson.textures.length).toBeGreaterThanOrEqual(1);
      expect(gltfJson.materials[0]?.pbrMetallicRoughness?.baseColorTexture).toBeDefined();

      // Reload exported GLB into a fresh MeshEditorService and verify texture survives reload
      const reloadCanvas = document.createElement('canvas');
      const reloadEngine = new NullEngine();
      const reloadService = new MeshEditorService(reloadCanvas, {}, reloadEngine);
      try {
        const glbFile = new File([glbBuf], 'terrain_export_test.glb', { type: 'model/gltf-binary' });
        await reloadService.loadFiles([glbFile]);

        const reloadedMesh = reloadService.importedMeshes.find(
          (m) => m.name !== '__root__' && m.getTotalVertices() > 0,
        );
        expect(reloadedMesh).toBeDefined();
        const reloadedMat = reloadedMesh!.material as PBRMaterial;
        expect(reloadedMat).toBeInstanceOf(PBRMaterial);
        expect(reloadedMat.albedoTexture).not.toBeNull();

        // Reloaded GLB texture should also be discoverable in Heightmap tool texture selector
        const reloadedAvailable = reloadService.heightmapController.getAvailableTextures();
        expect(reloadedAvailable.some((t) => t.category === 'scene')).toBe(true);
      } finally {
        reloadService.dispose();
        reloadEngine.dispose();
      }
    });

    it('preserves TerrainMaterial, 3 splat textures, and heightmap state when saving and reloading .babylon project', async () => {
      const aiItem = await service.aiTextureGenerator.generateTexture({
        prompt: 'Ancient canyon sandstone',
        name: 'CanyonSandstone',
        style: 'stone',
        size: 64,
        useAI: false,
      });

      await service.heightmapController.buildOrUpdateTerrainMesh({
        name: 'SavedBabylonTerrain',
        preset: 'volcano',
        width: 90,
        height: 90,
        subdivisions: 24,
        maxHeight: 16,
        texture1: 'rock',
        texture2: `ai_${aiItem.id}`,
        texture3: 'sand',
        textureScale: [11, 14, 9],
      });

      let babylonBlob: Blob | null = null;
      const origOnExport = service.events.onExportModel;
      service.events.onExportModel = async (blob, _filename, format) => {
        if (format === 'babylon') babylonBlob = blob;
        return true;
      };

      await service.exportCurrentModel({ format: 'babylon', filename: 'saved_terrain_project' });
      service.events.onExportModel = origOnExport;

      expect(babylonBlob).not.toBeNull();
      const babylonText = await (babylonBlob as unknown as Blob).text();
      const parsed = JSON.parse(babylonText);

      // Should preserve TerrainMaterial natively (not swapped to PBR) and embed heightmap project state
      expect(parsed.metadata?.meshEditor?.tools?.heightmap?.meshes?.length).toBe(1);
      const savedEntry = parsed.metadata.meshEditor.tools.heightmap.meshes[0];
      expect(savedEntry.texture2).toBe(`ai_${aiItem.id}`);

      // Reload .babylon project file into a fresh service
      const reloadCanvas = document.createElement('canvas');
      const reloadEngine = new NullEngine();
      const reloadService = new MeshEditorService(reloadCanvas, {}, reloadEngine);
      try {
        const babylonFile = new File([babylonText], 'saved_terrain_project.babylon', {
          type: 'application/json',
        });
        await reloadService.loadFiles([babylonFile]);

        const restoredTerrain = reloadService.heightmapController.getActiveTerrainMesh();
        expect(restoredTerrain).not.toBeNull();
        expect(restoredTerrain!.material instanceof TerrainMaterial).toBe(true);
        const tm = restoredTerrain!.material as TerrainMaterial;
        expect(tm.mixTexture).not.toBeNull();
        expect(tm.diffuseTexture1).not.toBeNull();
        expect(tm.diffuseTexture2).not.toBeNull();
        expect(tm.diffuseTexture3).not.toBeNull();
        expect(tm.diffuseTexture1.uScale).toBe(11);
        expect(tm.diffuseTexture2.uScale).toBe(14);
        expect(tm.diffuseTexture3.uScale).toBe(9);
        expect(reloadService.heightmapController.config.terrainTextureName2).toBe(`ai_${aiItem.id}`);
      } finally {
        reloadService.dispose();
        reloadEngine.dispose();
      }
    });
  });
});

