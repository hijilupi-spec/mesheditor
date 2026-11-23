import { GaussianSplattingMesh } from '@babylonjs/core';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import type { GaussianSplatPresetKind } from '../../splatting/GaussianSplatController';

export class ManageGaussianSplatTool extends AbstractTool {
  public readonly name = 'modeler_gaussian_splat';
  public readonly description =
    'Creates, loads, inspects, cleans, adjusts, transforms, or merges 3D Gaussian Splatting clouds (GaussianSplattingMesh). Use "create_preset" for volumetric organic effects (cloud, foliage, bush, fire, galaxy, nebula), "load_url" to import .splat/.ply/.spz/.sog files, "cleanup" to remove floaters or crop bounds, "adjust" to rescale/recolor splats, "bake_transform" to bake transform/align to Y=0, "merge" to combine multiple splat clouds, or "inspect" to read splat stats and worldBounds.';

  public readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'inspect',
          'create_preset',
          'cleanup',
          'adjust',
          'bake_transform',
          'merge',
          'load_url',
        ],
        description: 'Gaussian Splatting operation to perform.',
      },
      targetMesh: {
        type: 'string',
        description: 'Name or ID of an existing GaussianSplattingMesh (optional for inspect/create_preset/load_url/merge).',
      },
      name: {
        type: 'string',
        description: 'Name for a newly created, merged, or loaded GaussianSplattingMesh.',
      },
      preset: {
        type: 'string',
        enum: ['cloud', 'foliage', 'bush', 'fire', 'galaxy', 'nebula'],
        description: 'Volumetric preset kind when action is "create_preset" (default: "cloud").',
      },
      splatCount: {
        type: 'integer',
        minimum: 64,
        maximum: 100000,
        description: 'Number of splats to generate for "create_preset" (default: 2500).',
      },
      radius: {
        type: 'number',
        description: 'Approximate radius in meters for "create_preset" (default: 1.2).',
      },
      color: {
        type: 'string',
        description: 'Optional hex color (e.g. "#44aa55") for "create_preset".',
      },
      opacity: {
        type: 'number',
        description: 'Base opacity [0.05..1.0] for "create_preset" (default: 0.72).',
      },
      url: {
        type: 'string',
        description: 'URL of a .splat, .ply, .spz, or .sog file when action is "load_url".',
      },
      flipY: {
        type: 'boolean',
        description: 'Whether to flip Y coordinates when loading via "load_url".',
      },
      alignToGround: {
        type: 'boolean',
        description: 'Align lowest world bounding Y to 0 after "load_url" or "bake_transform".',
      },
      minOpacity: {
        type: 'number',
        description: 'Minimum opacity [0..1] to keep during "cleanup" (removes transparent floaters).',
      },
      minScale: {
        type: 'number',
        description: 'Minimum splat axis scale to keep during "cleanup".',
      },
      maxScale: {
        type: 'number',
        description: 'Maximum splat axis scale to keep during "cleanup" (removes oversized floater splats).',
      },
      cropBoxMin: {
        type: 'array',
        items: { type: 'number' },
        description: 'Local [x, y, z] min corner for box crop during "cleanup".',
      },
      cropBoxMax: {
        type: 'array',
        items: { type: 'number' },
        description: 'Local [x, y, z] max corner for box crop during "cleanup".',
      },
      cropCenter: {
        type: 'array',
        items: { type: 'number' },
        description: 'Center [x, y, z] for spherical radius crop during "cleanup".',
      },
      cropRadius: {
        type: 'number',
        description: 'Radius in meters for spherical crop during "cleanup".',
      },
      sampleStep: {
        type: 'integer',
        minimum: 1,
        description: 'Keep every N-th splat during "cleanup" (e.g. 2 keeps 50%).',
      },
      scaleMultiplier: {
        type: 'number',
        description: 'Multiplier for splat radii during "adjust" (e.g. 1.25).',
      },
      opacityMultiplier: {
        type: 'number',
        description: 'Multiplier for splat opacity during "adjust".',
      },
      brightness: {
        type: 'number',
        description: 'RGB brightness multiplier during "adjust".',
      },
      colorTint: {
        type: 'string',
        description: 'Hex tint color during "adjust" (e.g. "#ffcc88").',
      },
      tintStrength: {
        type: 'number',
        description: 'Blend strength [0..1] for colorTint during "adjust".',
      },
      shDegree: {
        type: 'integer',
        minimum: 0,
        maximum: 3,
        description: 'Spherical Harmonics degree [0..3] to set during "adjust".',
      },
      minPixelSize: {
        type: 'number',
        description: 'Minimum projected pixel size cutoff for rendering during "adjust".',
      },
      disableDepthSort: {
        type: 'boolean',
        description: 'Disable depth sort worker during "adjust".',
      },
      sourceMeshes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of GaussianSplattingMesh objects to merge when action is "merge" (defaults to all active splat meshes).',
      },
      removeSources: {
        type: 'boolean',
        description: 'Whether to remove/hide source splats after "merge" (default: true).',
      },
      position: {
        description: 'World position {x,y,z} or [x,y,z].',
      },
      rotationDegrees: {
        description: 'Euler rotation in degrees {x,y,z} or [x,y,z].',
      },
      scale: {
        description: 'Scaling {x,y,z} or [x,y,z].',
      },
    },
    required: ['action'],
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const ctrl = context.service.gaussianSplatController;
    const action = String(args.action || 'inspect').toLowerCase();

    if (action === 'inspect') {
      if (args.targetMesh) {
        const mesh = ctrl.resolveSplatMesh(String(args.targetMesh));
        if (!mesh) {
          throw new Error(`GaussianSplattingMesh "${args.targetMesh}" not found.`);
        }
        return JSON.stringify(ctrl.getSplatStats(mesh));
      }
      const all = ctrl.getAllSplatMeshes();
      return JSON.stringify({
        count: all.length,
        splatMeshes: all.map((m) => ctrl.getSplatStats(m)),
      });
    }

    if (action === 'create_preset') {
      const preset = (args.preset || 'cloud') as GaussianSplatPresetKind;
      const mesh = ctrl.createProceduralPreset(preset, {
        name: args.name ? String(args.name) : undefined,
        splatCount: typeof args.splatCount === 'number' ? args.splatCount : undefined,
        radius: typeof args.radius === 'number' ? args.radius : undefined,
        colorHex: args.color ? String(args.color) : undefined,
        opacity: typeof args.opacity === 'number' ? args.opacity : undefined,
      });
      context.applyTransformArgs(mesh, args);
      return JSON.stringify({
        status: 'created',
        ...ctrl.getSplatStats(mesh),
      });
    }

    if (action === 'load_url') {
      if (!args.url) {
        throw new Error('Parameter "url" is required for action "load_url".');
      }
      const added = await ctrl.loadSplatFromUrl(String(args.url), {
        name: args.name ? String(args.name) : undefined,
        flipY: !!args.flipY,
        alignToGround: !!args.alignToGround,
      });
      for (const m of added) {
        context.applyTransformArgs(m, args);
      }
      return JSON.stringify({
        status: 'loaded',
        meshes: added.map((m) => ctrl.getSplatStats(m)),
      });
    }

    if (action === 'merge') {
      const all = ctrl.getAllSplatMeshes();
      let targets: GaussianSplattingMesh[];
      if (Array.isArray(args.sourceMeshes) && args.sourceMeshes.length > 0) {
        targets = args.sourceMeshes
          .map((n: any) => ctrl.resolveSplatMesh(String(n)))
          .filter((m: GaussianSplattingMesh | null): m is GaussianSplattingMesh => !!m);
      } else {
        targets = all;
      }
      const merged = ctrl.mergeSplatMeshes(
        targets,
        args.name ? String(args.name) : undefined,
        args.removeSources !== false
      );
      return JSON.stringify({
        status: 'merged',
        ...ctrl.getSplatStats(merged),
      });
    }

    const target = ctrl.resolveSplatMesh(args.targetMesh ? String(args.targetMesh) : undefined);
    if (!target) {
      throw new Error('No active GaussianSplattingMesh found in the scene.');
    }

    if (action === 'cleanup') {
      const result = ctrl.cleanupSplats(target, {
        minOpacity: typeof args.minOpacity === 'number' ? args.minOpacity : undefined,
        minScale: typeof args.minScale === 'number' ? args.minScale : undefined,
        maxScale: typeof args.maxScale === 'number' ? args.maxScale : undefined,
        cropBoxMin: Array.isArray(args.cropBoxMin) && args.cropBoxMin.length >= 3
          ? [Number(args.cropBoxMin[0]), Number(args.cropBoxMin[1]), Number(args.cropBoxMin[2])]
          : undefined,
        cropBoxMax: Array.isArray(args.cropBoxMax) && args.cropBoxMax.length >= 3
          ? [Number(args.cropBoxMax[0]), Number(args.cropBoxMax[1]), Number(args.cropBoxMax[2])]
          : undefined,
        cropCenter: Array.isArray(args.cropCenter) && args.cropCenter.length >= 3
          ? [Number(args.cropCenter[0]), Number(args.cropCenter[1]), Number(args.cropCenter[2])]
          : undefined,
        cropRadius: typeof args.cropRadius === 'number' ? args.cropRadius : undefined,
        sampleStep: typeof args.sampleStep === 'number' ? args.sampleStep : undefined,
      });
      return JSON.stringify({
        status: 'cleaned',
        ...result,
        stats: ctrl.getSplatStats(target),
      });
    }

    if (action === 'adjust') {
      const hasRenderSettings =
        args.shDegree !== undefined ||
        args.minPixelSize !== undefined ||
        args.disableDepthSort !== undefined;

      if (hasRenderSettings) {
        ctrl.setRenderSettings(target, {
          shDegree: typeof args.shDegree === 'number' ? args.shDegree : undefined,
          minPixelSize: typeof args.minPixelSize === 'number' ? args.minPixelSize : undefined,
          disableDepthSort: typeof args.disableDepthSort === 'boolean' ? args.disableDepthSort : undefined,
        });
      }

      const hasDataAdjust =
        args.scaleMultiplier !== undefined ||
        args.opacityMultiplier !== undefined ||
        args.brightness !== undefined ||
        args.colorTint !== undefined;

      if (hasDataAdjust) {
        ctrl.adjustSplats(target, {
          scaleMultiplier: typeof args.scaleMultiplier === 'number' ? args.scaleMultiplier : undefined,
          opacityMultiplier: typeof args.opacityMultiplier === 'number' ? args.opacityMultiplier : undefined,
          brightness: typeof args.brightness === 'number' ? args.brightness : undefined,
          colorTint: args.colorTint ? String(args.colorTint) : undefined,
          tintStrength: typeof args.tintStrength === 'number' ? args.tintStrength : undefined,
        });
      }

      return JSON.stringify({
        status: 'adjusted',
        ...ctrl.getSplatStats(target),
      });
    }

    if (action === 'bake_transform') {
      ctrl.bakeTransform(target, !!args.alignToGround);
      return JSON.stringify({
        status: 'baked',
        ...ctrl.getSplatStats(target),
      });
    }

    throw new Error(`Unknown Gaussian Splat action "${action}".`);
  }
}
