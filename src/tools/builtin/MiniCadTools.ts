import { Mesh } from '@babylonjs/core';
import { getMiniCadRecipe } from '../../minicad/MiniCadGeometry';
import {
  MINICAD_HOLE_PRESETS,
  MiniCadAlignAction,
  MiniCadFaceDir,
  MiniCadHoleFeature,
  MiniCadHolePresetId,
  MiniCadProfileId,
  MiniCadShapeKind,
  MiniCadStarterTemplateId,
} from '../../minicad/types';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';

export class CadCreatePartTool extends AbstractTool {
  public readonly name = 'cad_create_part';
  public readonly description =
    'Creates a precision, non-destructive parametric MiniCAD part (or starter assembly) using real millimeter dimensions. Ideal for 3D printing enclosures, mounting brackets, woodwork panels/shelves, spacers, and mechanical plates.';

  public readonly parameters = {
    type: 'object',
    properties: {
      profile: {
        type: 'string',
        enum: ['3d_print', 'woodwork', 'mechanics'],
        description: 'Active unit/tolerance profile (default keeps active MiniCAD profile, or "3d_print").',
      },
      template: {
        type: 'string',
        enum: ['enclosure', 'bracket', 'shelf_unit', 'spacer_hub'],
        description: 'Optional starter assembly template instead of a single primitive part.',
      },
      name: { type: 'string', description: 'Descriptive part name (e.g. "Sensor_Housing").' },
      shape: {
        type: 'string',
        enum: ['box', 'rounded_box', 'cylinder', 'tube', 'l_bracket', 'plate'],
        description: 'Base CAD solid shape (default: "box").',
      },
      widthMm: { type: 'number', description: 'Width along X axis in millimeters.' },
      heightMm: { type: 'number', description: 'Height along Y axis in millimeters.' },
      depthMm: { type: 'number', description: 'Depth along Z axis in millimeters.' },
      innerDiameterMm: { type: 'number', description: 'Inner hole diameter in mm (for "tube").' },
      wallThicknessMm: { type: 'number', description: 'Leg/wall thickness in mm (for "l_bracket" or "tube").' },
      cornerRadiusMm: { type: 'number', description: 'Corner rounding radius in mm (for "rounded_box" / "plate").' },
      positionMm: {
        type: 'object',
        description: 'Optional center position { x, y, z } in millimeters.',
        properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
      },
      groundToFloor: { type: 'boolean', description: 'If true (default), rests bottom at Y = 0.' },
      color: { type: 'string', description: 'Hex color string, e.g. "#3b82f6".' },
      shellWallMm: { type: 'number', description: 'Optional non-destructive hollow shell wall thickness in mm.' },
      shellOpenFace: {
        type: 'string',
        enum: ['top', 'bottom', 'front', 'back', 'left', 'right', 'none'],
        description: 'Which face to leave open when shellWallMm is specified (default: "top").',
      },
      bevelWidthMm: { type: 'number', description: 'Optional non-destructive edge bevel/fillet radius in mm.' },
      bevelSegments: { type: 'integer', minimum: 1, maximum: 4, description: 'Bevel segments (1=chamfer, 2..3=fillet).' },
    },
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const ctrl = context.service.miniCadController;
    if (args.profile) {
      ctrl.setProfile(args.profile as MiniCadProfileId);
    }

    if (args.template) {
      const meshes = ctrl.createStarterTemplate(args.template as MiniCadStarterTemplateId);
      return JSON.stringify({
        status: 'ok',
        template: args.template,
        profileId: ctrl.profileId,
        createdMeshes: meshes.map((m) => ({
          name: m.name,
          dimensionsMm: ctrl.getMeshDimensionsMm(m),
        })),
      });
    }

    const mesh = ctrl.createPart({
      name: args.name,
      shape: (args.shape || 'box') as MiniCadShapeKind,
      widthMm: args.widthMm,
      heightMm: args.heightMm,
      depthMm: args.depthMm,
      innerDiameterMm: args.innerDiameterMm,
      wallThicknessMm: args.wallThicknessMm,
      cornerRadiusMm: args.cornerRadiusMm,
      positionMm: args.positionMm,
      groundToFloor: args.groundToFloor !== false,
      color: args.color,
      shellWallMm: args.shellWallMm,
      shellOpenFace: args.shellOpenFace,
      bevelWidthMm: args.bevelWidthMm,
      bevelSegments: args.bevelSegments,
    });

    return JSON.stringify({
      status: 'ok',
      meshName: mesh.name,
      profileId: ctrl.profileId,
      dimensionsMm: ctrl.getMeshDimensionsMm(mesh),
      recipe: getMiniCadRecipe(mesh),
    });
  }
}

export class CadModifyPartTool extends AbstractTool {
  public readonly name = 'cad_modify_part';
  public readonly description =
    'Modifies an existing MiniCAD part non-destructively in millimeters: resize dimensions, add/update shell wall thickness, add hardware holes or symmetric corner hole patterns (M2-M6, countersunk, dowel, slot), add rectangular/cylindrical cutouts or bosses, apply bevels, or remove features.';

  public readonly parameters = {
    type: 'object',
    properties: {
      meshName: { type: 'string', description: 'Name or ID of the target part in the scene.' },
      widthMm: { type: 'number', description: 'New width in mm.' },
      heightMm: { type: 'number', description: 'New height in mm.' },
      depthMm: { type: 'number', description: 'New depth in mm.' },
      cornerRadiusMm: { type: 'number', description: 'New corner radius in mm.' },
      shellWallMm: { type: 'number', description: 'Set shell wall thickness in mm (0 removes shell).' },
      shellOpenFace: {
        type: 'string',
        enum: ['top', 'bottom', 'front', 'back', 'left', 'right', 'none'],
      },
      bevelWidthMm: { type: 'number', description: 'Set edge bevel width in mm (0 removes bevel).' },
      bevelSegments: { type: 'integer', minimum: 1, maximum: 4 },
      addHole: {
        type: 'object',
        description: 'Punch a non-destructive hole or grid pattern on a cardinal face.',
        properties: {
          preset: {
            type: 'string',
            enum: Object.keys(MINICAD_HOLE_PRESETS),
          },
          face: { type: 'string', enum: ['top', 'bottom', 'front', 'back', 'left', 'right'] },
          offsetUMm: { type: 'number', description: 'Horizontal offset along face in mm (0 = centered).' },
          offsetVMm: { type: 'number', description: 'Vertical/depth offset along face in mm (0 = centered).' },
          diameterMm: { type: 'number', description: 'Override hole diameter in mm.' },
          widthMm: { type: 'number', description: 'Slot width in mm when preset is "slot".' },
          depthMm: { type: 'number', description: 'Blind hole depth in mm when throughAll is false.' },
          throughAll: { type: 'boolean', description: 'Cut completely through the part (default: true).' },
          patternCols: { type: 'integer', description: 'Optional grid columns (e.g. 2).' },
          patternRows: { type: 'integer', description: 'Optional grid rows (e.g. 2).' },
          spacingUMm: { type: 'number', description: 'Center-to-center spacing along face U in mm.' },
          spacingVMm: { type: 'number', description: 'Center-to-center spacing along face V in mm.' },
          symmetricCornerInsetMm: {
            type: 'number',
            description: 'Shortcut: auto-places 2x2 corner holes inset from the face edges by this margin in mm.',
          },
        },
        required: ['face'],
      },
      addCutout: {
        type: 'object',
        description: 'Subtract a rectangular or cylindrical pocket/cutout on a face.',
        properties: {
          shape: { type: 'string', enum: ['box', 'cylinder'] },
          face: { type: 'string', enum: ['top', 'bottom', 'front', 'back', 'left', 'right'] },
          offsetUMm: { type: 'number' },
          offsetVMm: { type: 'number' },
          widthMm: { type: 'number' },
          heightMm: { type: 'number' },
          depthMm: { type: 'number' },
          throughAll: { type: 'boolean' },
        },
        required: ['face', 'widthMm', 'heightMm', 'depthMm'],
      },
      addBoss: {
        type: 'object',
        description: 'Add/union a raised boss or mounting pad onto a face.',
        properties: {
          shape: { type: 'string', enum: ['box', 'cylinder'] },
          face: { type: 'string', enum: ['top', 'bottom', 'front', 'back', 'left', 'right'] },
          offsetUMm: { type: 'number' },
          offsetVMm: { type: 'number' },
          widthMm: { type: 'number' },
          heightMm: { type: 'number' },
          depthMm: { type: 'number' },
        },
        required: ['face', 'widthMm', 'heightMm', 'depthMm'],
      },
      removeFeatureId: { type: 'string', description: 'Remove an existing feature by its ID.' },
      bakeToStatic: { type: 'boolean', description: 'Bake parametric recipe into a static mesh.' },
    },
    required: ['meshName'],
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const mesh = context.findMeshByNameOrId(args.meshName);
    if (!mesh) {
      throw new Error(`Part "${args.meshName}" not found in scene.`);
    }

    const ctrl = context.service.miniCadController;
    context.service.selectMesh(mesh);

    if (
      args.widthMm !== undefined ||
      args.heightMm !== undefined ||
      args.depthMm !== undefined ||
      args.cornerRadiusMm !== undefined
    ) {
      ctrl.updateSelectedDimensions({
        width: args.widthMm,
        height: args.heightMm,
        depth: args.depthMm,
        cornerRadius: args.cornerRadiusMm,
      });
    }

    if (args.shellWallMm !== undefined) {
      ctrl.setShellOnMesh(mesh, Number(args.shellWallMm), (args.shellOpenFace || 'top') as MiniCadFaceDir | 'none');
    }

    if (args.addBoss) {
      const b = args.addBoss;
      ctrl.addFeatureToMesh(mesh, {
        id: `boss_${Date.now().toString(36)}`,
        kind: 'add_boss',
        label: `Boss (${b.widthMm}×${b.heightMm}×${b.depthMm} mm on ${b.face})`,
        shape: b.shape === 'cylinder' ? 'cylinder' : 'box',
        face: b.face as MiniCadFaceDir,
        offsetUMm: Number(b.offsetUMm) || 0,
        offsetVMm: Number(b.offsetVMm) || 0,
        widthMm: Number(b.widthMm),
        heightMm: Number(b.heightMm),
        depthMm: Number(b.depthMm),
      });
    }

    if (args.addCutout) {
      const c = args.addCutout;
      ctrl.addFeatureToMesh(mesh, {
        id: `cutout_${Date.now().toString(36)}`,
        kind: 'cutout',
        label: `Cutout (${c.widthMm}×${c.heightMm} mm on ${c.face})`,
        shape: c.shape === 'cylinder' ? 'cylinder' : 'box',
        face: c.face as MiniCadFaceDir,
        offsetUMm: Number(c.offsetUMm) || 0,
        offsetVMm: Number(c.offsetVMm) || 0,
        widthMm: Number(c.widthMm),
        heightMm: Number(c.heightMm),
        depthMm: Number(c.depthMm),
        throughAll: !!c.throughAll,
      });
    }

    if (args.addHole) {
      const h = args.addHole;
      const presetId = (h.preset || 'm3') as MiniCadHolePresetId;
      const preset = MINICAD_HOLE_PRESETS[presetId] || MINICAD_HOLE_PRESETS.m3;
      const dims = ctrl.getMeshDimensionsMm(mesh);
      const face = h.face as MiniCadFaceDir;
      const faceW = face === 'left' || face === 'right' ? dims.depth : dims.width;
      const faceH = face === 'top' || face === 'bottom' ? dims.depth : dims.height;

      let pattern: MiniCadHoleFeature['pattern'] | undefined;
      if (typeof h.symmetricCornerInsetMm === 'number' && h.symmetricCornerInsetMm > 0) {
        pattern = {
          cols: 2,
          rows: 2,
          spacingUMm: Math.max(4, faceW - h.symmetricCornerInsetMm * 2),
          spacingVMm: Math.max(4, faceH - h.symmetricCornerInsetMm * 2),
        };
      } else if ((h.patternCols && h.patternCols > 1) || (h.patternRows && h.patternRows > 1)) {
        pattern = {
          cols: Number(h.patternCols) || 1,
          rows: Number(h.patternRows) || 1,
          spacingUMm: Number(h.spacingUMm) || 20,
          spacingVMm: Number(h.spacingVMm) || 20,
        };
      }

      ctrl.addFeatureToMesh(mesh, {
        id: `hole_${Date.now().toString(36)}`,
        kind: 'hole',
        label: pattern ? `${preset.label} (${pattern.cols}×${pattern.rows})` : preset.label,
        preset: preset.id,
        shape: preset.shape,
        face,
        offsetUMm: pattern && typeof h.symmetricCornerInsetMm === 'number' ? 0 : Number(h.offsetUMm) || 0,
        offsetVMm: pattern && typeof h.symmetricCornerInsetMm === 'number' ? 0 : Number(h.offsetVMm) || 0,
        diameterMm: Number(h.diameterMm) || preset.diameterMm,
        widthMm: Number(h.widthMm) || preset.widthMm,
        depthMm: Number(h.depthMm) || 10,
        throughAll: h.throughAll !== false,
        headDiameterMm: preset.headDiameterMm,
        headDepthMm: preset.headDepthMm,
        pattern,
      });
    }

    if (args.bevelWidthMm !== undefined) {
      ctrl.setBevelOnMesh(mesh, Number(args.bevelWidthMm), Number(args.bevelSegments) || 2);
    }

    if (args.removeFeatureId) {
      ctrl.removeFeatureFromMesh(mesh, String(args.removeFeatureId));
    }

    if (args.bakeToStatic) {
      ctrl.bakeMeshToStatic(mesh);
    }

    return JSON.stringify({
      status: 'ok',
      meshName: mesh.name,
      dimensionsMm: ctrl.getMeshDimensionsMm(mesh),
      recipe: getMiniCadRecipe(mesh),
    });
  }
}

export class CadAlignAndMeasureTool extends AbstractTool {
  public readonly name = 'cad_align_and_measure';
  public readonly description =
    'Aligns, stacks, or spaces two CAD parts with exact millimeter gaps (center, flush edges, stack on top, gap X/Y/Z), drops a part to Y=0 floor, or measures exact surface-to-surface distances and smart guides.';

  public readonly parameters = {
    type: 'object',
    properties: {
      targetMeshName: { type: 'string', description: 'Part to move or inspect.' },
      anchorMeshName: { type: 'string', description: 'Reference part to align or measure against.' },
      action: {
        type: 'string',
        enum: [
          'measure',
          'drop_to_floor',
          'center_x',
          'center_z',
          'center_xz',
          'flush_left',
          'flush_right',
          'flush_front',
          'flush_back',
          'flush_bottom',
          'stack_on_top',
          'gap_x',
          'gap_y',
          'gap_z',
        ],
        description: 'Alignment or measurement action.',
      },
      gapMm: { type: 'number', description: 'Exact gap in millimeters for stack_on_top or gap_x/y/z (default: 0).' },
    },
    required: ['targetMeshName', 'action'],
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const target = context.findMeshByNameOrId(args.targetMeshName);
    if (!target) {
      throw new Error(`Target part "${args.targetMeshName}" not found.`);
    }

    const ctrl = context.service.miniCadController;
    const action = String(args.action || 'measure');

    if (action === 'drop_to_floor') {
      ctrl.dropMeshToFloor(target);
      return JSON.stringify({
        status: 'ok',
        action,
        targetMeshName: target.name,
        dimensionsMm: ctrl.getMeshDimensionsMm(target),
      });
    }

    if (action === 'measure') {
      const guides = ctrl.computeSmartGuides(target);
      return JSON.stringify({
        status: 'ok',
        action: 'measure',
        targetMeshName: target.name,
        dimensionsMm: ctrl.getMeshDimensionsMm(target),
        smartGuides: guides,
      });
    }

    const anchor = args.anchorMeshName
      ? context.findMeshByNameOrId(args.anchorMeshName)
      : context.service.importedMeshes.find(
          (m) => m !== target && !m.isDisposed() && !context.service.isEditorHelper(m)
        );
    if (!anchor) {
      throw new Error('Anchor part not found for alignment.');
    }

    const res = ctrl.alignMeshes(
      target as Mesh,
      anchor as Mesh,
      action as MiniCadAlignAction,
      Number(args.gapMm) || 0
    );

    return JSON.stringify({
      status: 'ok',
      action,
      targetMeshName: target.name,
      anchorMeshName: anchor.name,
      deltaMm: res.deltaMm,
      smartGuides: ctrl.computeSmartGuides(target),
    });
  }
}

export class CadInspectAndCutListTool extends AbstractTool {
  public readonly name = 'cad_inspect_and_cutlist';
  public readonly description =
    'Inspects a CAD part for 3D printability (watertight manifold edges, minimum wall thickness, floor contact, dimensions in mm, volume in cm3) and/or generates a sorted Woodwork Cut List (Length x Width x Thickness in mm) for all scene parts.';

  public readonly parameters = {
    type: 'object',
    properties: {
      meshName: { type: 'string', description: 'Optional mesh name to run printability inspection on.' },
      profile: { type: 'string', enum: ['3d_print', 'woodwork', 'mechanics'] },
      includeCutList: { type: 'boolean', description: 'Include full scene woodwork/parts cut list (default: true).' },
    },
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const ctrl = context.service.miniCadController;
    if (args.profile) {
      ctrl.setProfile(args.profile as MiniCadProfileId);
    }

    let printability = null;
    if (args.meshName) {
      const mesh = context.findMeshByNameOrId(args.meshName);
      if (!mesh) {
        throw new Error(`Mesh "${args.meshName}" not found.`);
      }
      context.service.selectMesh(mesh);
      printability = ctrl.inspectSelectedPrintability();
    } else if (context.service.selectedMesh) {
      printability = ctrl.inspectSelectedPrintability();
    }

    const includeCutList = args.includeCutList !== false;
    const cutList = includeCutList ? ctrl.getWoodworkCutList() : undefined;

    return JSON.stringify({
      status: 'ok',
      profileId: ctrl.profileId,
      printability,
      cutList,
    });
  }
}
