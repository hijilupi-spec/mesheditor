import { Mesh } from '@babylonjs/core';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import {
  PaintBlendMode,
  PaintBrushAlpha,
  PaintChannel,
  PaintGradientType,
  PaintStampShape,
} from '../../painting/TexturePaintController';

export class PaintTextureTool extends AbstractTool {
  public readonly name = 'modeler_paint_texture';
  public readonly description =
    '3D UV Texture Painter for hand-painted / Nintendo-style stylized assets and multi-layer PBR painting. Supports seamless 3D painting across UV seams, auto-UV unwrapping, stylized AO+gradient+edge-highlight base shading, spatial/normal gradients, 3D brush strokes (with X-symmetry), crisp shape stamps (eye, star, heart, circle, oval, ring, stripe, dot_pattern), multi-layer blending (normal, multiply, overlay, screen, soft-light, add), PBR channels (albedo, roughness, metallic, emissive), and image stencil projection.';

  public readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['init', 'stylized_base', 'fill', 'gradient', 'stroke', 'stamp', 'layer', 'project_stencil'],
        description:
          '"init" prepares UVs and paint canvas; "stylized_base" generates a hand-painted vertical gradient + soft AO + edge highlights base; "fill" fills a layer or UV island; "gradient" paints vertical/radial/normal-based color blends; "stroke" paints a 3D brush path; "stamp" projects crisp shapes (eye, star, stripe, circle, etc.); "layer" manages layers; "project_stencil" projects an image or AI-generated graphic onto the mesh UV texture.',
      },
      targetMesh: {
        type: 'string',
        description: 'Name of the target mesh to paint (defaults to the currently selected mesh).',
      },
      resolution: {
        type: 'number',
        enum: [256, 512, 1024, 2048],
        description: 'Texture resolution in pixels for "init" (default: 512 for fast AI workflows, or 1024).',
      },
      autoUnwrap: {
        type: 'boolean',
        description: 'Automatically unwrap UVs if missing or overlapping (default: true).',
      },
      channel: {
        type: 'string',
        enum: ['albedo', 'roughness', 'metallic', 'emissive'],
        description: 'Target PBR channel (default: "albedo").',
      },
      layerName: {
        type: 'string',
        description: 'Optional target layer name (creates the layer if it does not exist yet).',
      },
      blendMode: {
        type: 'string',
        enum: ['normal', 'multiply', 'overlay', 'screen', 'soft-light', 'add'],
        description: 'Layer blend mode (default: "normal").',
      },
      color: {
        type: 'string',
        description: 'Primary hex color (e.g. "#e74c3c"). Used by init (baseColor), stylized_base, fill, stroke, stamp.',
      },
      secondaryColor: {
        type: 'string',
        description: 'Secondary hex color (e.g. sclera color for "eye" stamp, default: "#ffffff").',
      },
      bottomColor: {
        type: 'string',
        description: 'Bottom shadow hex color for "stylized_base" or colorA for "gradient".',
      },
      topColor: {
        type: 'string',
        description: 'Top highlight hex color for "stylized_base" or colorB for "gradient".',
      },
      value: {
        type: 'number',
        description: 'Scalar value 0.0 to 1.0 when painting "roughness" or "metallic" channels.',
      },
      aoStrength: {
        type: 'number',
        description: 'Hemisphere ambient occlusion strength 0..1 for "stylized_base" (default: 0.35).',
      },
      edgeHighlightStrength: {
        type: 'number',
        description: 'Convex edge highlight strength 0..1 for "stylized_base" (default: 0.25).',
      },
      asLayer: {
        type: 'boolean',
        description: 'For "stylized_base": create a dedicated layer instead of overwriting the base layer.',
      },
      gradientType: {
        type: 'string',
        enum: ['vertical', 'radial', 'normal_top', 'normal_front'],
        description: 'Gradient projection type for action="gradient".',
      },
      center: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional [x, y, z] center for radial gradient.',
      },
      normalThreshold: {
        type: 'number',
        description: 'Dot-product threshold (-1..1) for normal_top / normal_front gradients (default: 0.35).',
      },
      points: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
        },
        description: 'Array of [x, y, z] 3D world points forming a brush stroke for action="stroke".',
      },
      position: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional [x, y, z] 3D world position for action="stamp".',
      },
      normal: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional [nx, ny, nz] surface normal for action="stamp".',
      },
      face: {
        type: 'string',
        enum: ['front', 'back', 'top', 'bottom', 'left', 'right', 'camera'],
        description: 'Target face side for "stamp" or "project_stencil" (default: "front").',
      },
      shape: {
        type: 'string',
        enum: ['circle', 'oval', 'ring', 'star', 'stripe', 'eye', 'heart', 'dot_pattern'],
        description: 'Stylized shape to paint for action="stamp".',
      },
      radius: {
        type: 'number',
        description: 'World-space brush or stamp radius (default: 0.25).',
      },
      hardness: {
        type: 'number',
        description: 'Brush edge hardness 0..1 (default: 0.65 for strokes, 0.85 for stamps).',
      },
      opacity: {
        type: 'number',
        description: 'Stroke, stamp, fill, or layer opacity 0.02..1.0 (default: 0.95).',
      },
      brushAlpha: {
        type: 'string',
        enum: ['round', 'soft', 'chalk', 'watercolor', 'noise', 'square'],
        description: 'Brush texture alpha for action="stroke" (default: "round").',
      },
      mode: {
        type: 'string',
        enum: ['brush', 'eraser', 'smudge'],
        description: 'Stroke painting mode for action="stroke" (default: "brush").',
      },
      mirrorX: {
        type: 'boolean',
        description: 'Mirror stroke or stamp symmetrically across the mesh X-center (great for eyes, cheeks, bands).',
      },
      rotationDeg: {
        type: 'number',
        description: 'Rotation in degrees for "stamp" or "project_stencil" (default: 0).',
      },
      scale: {
        type: 'number',
        description: 'Projection scale for "project_stencil" (default: 0.75).',
      },
      islandId: {
        type: 'number',
        description: 'Optional UV island index (0..N-1) to fill when action="fill".',
      },
      layerAction: {
        type: 'string',
        enum: ['add', 'select', 'delete', 'set_props', 'flatten', 'list'],
        description: 'Sub-action when action="layer".',
      },
      visible: {
        type: 'boolean',
        description: 'Layer visibility toggle for action="layer" / layerAction="set_props".',
      },
      stencilUrl: {
        type: 'string',
        description: 'Image URL, DataURL, or scene texture name for action="project_stencil".',
      },
      prompt: {
        type: 'string',
        description: 'Optional prompt to generate a custom stencil graphic with the AI Texture Generator before projecting.',
      },
    },
    required: ['action'],
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const controller = context.service.texturePaintController;
    const action = String(args.action || 'init').toLowerCase();

    const mesh = this.resolveTargetMesh(args.targetMesh, context);
    if (!mesh) {
      throw new Error(
        args.targetMesh
          ? `Target mesh "${args.targetMesh}" was not found in the scene.`
          : 'No target mesh selected or available in the scene.'
      );
    }

    if (action === 'init') {
      const session = await controller.ensurePaintSessionAsync(mesh, {
        resolution: typeof args.resolution === 'number' ? args.resolution : undefined,
        baseColor: args.color ? String(args.color) : undefined,
        autoUnwrap: args.autoUnwrap !== false,
        preserveExistingTexture: !args.color,
      });
      if (!session) throw new Error(`Failed to initialize paint canvas on "${mesh.name}".`);
      return JSON.stringify({
        status: 'ok',
        action: 'init',
        meshName: mesh.name,
        resolution: session.resolution,
        islandCount: session.islandCount,
        loadedFromExistingTexture: session.loadedFromExistingTexture,
        layers: controller.getLayersSummary(mesh),
      });
    }

    // Ensure any existing GLB/material texture is hydrated before painting on top of it
    if (action !== 'stylized_base') {
      await controller.ensurePaintSessionAsync(mesh);
    }

    if (action === 'stylized_base') {
      const res = controller.applyStylizedBase(mesh, {
        baseColor: args.color ? String(args.color) : undefined,
        bottomColor: args.bottomColor ? String(args.bottomColor) : undefined,
        topColor: args.topColor ? String(args.topColor) : undefined,
        aoStrength: typeof args.aoStrength === 'number' ? args.aoStrength : undefined,
        edgeHighlightStrength:
          typeof args.edgeHighlightStrength === 'number' ? args.edgeHighlightStrength : undefined,
        asLayer: Boolean(args.asLayer),
        layerName: args.layerName ? String(args.layerName) : undefined,
      });
      return JSON.stringify({ status: 'ok', action: 'stylized_base', ...res });
    }

    if (action === 'fill') {
      const res = controller.fillRegion(mesh, {
        color: args.color ? String(args.color) : undefined,
        value: typeof args.value === 'number' ? args.value : undefined,
        opacity: typeof args.opacity === 'number' ? args.opacity : 1.0,
        channel: (args.channel as PaintChannel) || 'albedo',
        blendMode: (args.blendMode as PaintBlendMode) || undefined,
        layerName: args.layerName ? String(args.layerName) : undefined,
        islandId: typeof args.islandId === 'number' ? args.islandId : undefined,
      });
      return JSON.stringify({ status: 'ok', action: 'fill', ...res });
    }

    if (action === 'gradient') {
      const res = controller.paintGradient(mesh, {
        gradientType: (args.gradientType as PaintGradientType) || 'vertical',
        colorA: args.bottomColor ? String(args.bottomColor) : args.color ? String(args.color) : undefined,
        colorB: args.topColor ? String(args.topColor) : args.secondaryColor ? String(args.secondaryColor) : undefined,
        center: Array.isArray(args.center) && args.center.length >= 3 ? [Number(args.center[0]), Number(args.center[1]), Number(args.center[2])] : undefined,
        radius: typeof args.radius === 'number' ? args.radius : undefined,
        normalThreshold: typeof args.normalThreshold === 'number' ? args.normalThreshold : undefined,
        opacity: typeof args.opacity === 'number' ? args.opacity : 0.85,
        blendMode: (args.blendMode as PaintBlendMode) || undefined,
        channel: (args.channel as PaintChannel) || 'albedo',
        layerName: args.layerName ? String(args.layerName) : undefined,
      });
      return JSON.stringify({ status: 'ok', action: 'gradient', ...res });
    }

    if (action === 'stroke') {
      if (!Array.isArray(args.points) || args.points.length === 0) {
        throw new Error('action="stroke" requires a non-empty "points" array of [x, y, z] coordinates.');
      }
      const pts: Array<[number, number, number]> = args.points.map((p: any) => [
        Number(p[0]) || 0,
        Number(p[1]) || 0,
        Number(p[2]) || 0,
      ]);
      const res = controller.paintStroke3D(mesh, pts, {
        color: args.color ? String(args.color) : undefined,
        value: typeof args.value === 'number' ? args.value : undefined,
        radius: typeof args.radius === 'number' ? args.radius : undefined,
        hardness: typeof args.hardness === 'number' ? args.hardness : undefined,
        opacity: typeof args.opacity === 'number' ? args.opacity : 0.95,
        brushAlpha: (args.brushAlpha as PaintBrushAlpha) || 'round',
        mirrorX: Boolean(args.mirrorX),
        mode: (args.mode as 'brush' | 'eraser' | 'smudge') || 'brush',
        channel: (args.channel as PaintChannel) || 'albedo',
        layerName: args.layerName ? String(args.layerName) : undefined,
      });
      return JSON.stringify({ status: 'ok', action: 'stroke', ...res });
    }

    if (action === 'stamp') {
      const res = controller.paintShapeStamp(mesh, {
        shape: (args.shape as PaintStampShape) || 'circle',
        position:
          Array.isArray(args.position) && args.position.length >= 3
            ? [Number(args.position[0]), Number(args.position[1]), Number(args.position[2])]
            : undefined,
        normal:
          Array.isArray(args.normal) && args.normal.length >= 3
            ? [Number(args.normal[0]), Number(args.normal[1]), Number(args.normal[2])]
            : undefined,
        face: (args.face && args.face !== 'camera' ? args.face : 'front') as any,
        color: args.color ? String(args.color) : undefined,
        secondaryColor: args.secondaryColor ? String(args.secondaryColor) : undefined,
        value: typeof args.value === 'number' ? args.value : undefined,
        radius: typeof args.radius === 'number' ? args.radius : undefined,
        hardness: typeof args.hardness === 'number' ? args.hardness : 0.85,
        opacity: typeof args.opacity === 'number' ? args.opacity : 1.0,
        rotationDeg: typeof args.rotationDeg === 'number' ? args.rotationDeg : 0,
        mirrorX: Boolean(args.mirrorX),
        channel: (args.channel as PaintChannel) || 'albedo',
        layerName: args.layerName ? String(args.layerName) : undefined,
      });
      return JSON.stringify({ status: 'ok', action: 'stamp', ...res });
    }

    if (action === 'layer') {
      controller.ensurePaintSession(mesh);
      const sub = String(args.layerAction || 'list').toLowerCase();
      if (sub === 'add') {
        const layer = controller.addLayer(mesh, {
          name: args.layerName ? String(args.layerName) : undefined,
          channel: (args.channel as PaintChannel) || 'albedo',
          blendMode: (args.blendMode as PaintBlendMode) || 'normal',
          opacity: typeof args.opacity === 'number' ? args.opacity : 1.0,
        });
        return JSON.stringify({
          status: 'ok',
          action: 'layer',
          layerAction: 'add',
          layerId: layer?.id,
          layerName: layer?.name,
          layers: controller.getLayersSummary(mesh),
        });
      }
      if (sub === 'select' && args.layerName) {
        const layer = controller.selectLayer(mesh, String(args.layerName));
        return JSON.stringify({
          status: layer ? 'ok' : 'error',
          action: 'layer',
          layerAction: 'select',
          selected: layer?.name || null,
          layers: controller.getLayersSummary(mesh),
        });
      }
      if (sub === 'delete' && args.layerName) {
        const summary = controller.getLayersSummary(mesh);
        const found = summary.find(
          (l) => l.id === args.layerName || l.name.toLowerCase() === String(args.layerName).toLowerCase()
        );
        const ok = found ? controller.deleteLayer(mesh, found.id) : false;
        return JSON.stringify({
          status: ok ? 'ok' : 'error',
          action: 'layer',
          layerAction: 'delete',
          deleted: ok,
          layers: controller.getLayersSummary(mesh),
        });
      }
      if (sub === 'set_props') {
        const summary = controller.getLayersSummary(mesh);
        const target = args.layerName
          ? summary.find(
              (l) => l.id === args.layerName || l.name.toLowerCase() === String(args.layerName).toLowerCase()
            )
          : summary.find((l) => l.isActive);
        if (!target) throw new Error('Target layer not found.');
        controller.updateLayerProperties(mesh, target.id, {
          visible: typeof args.visible === 'boolean' ? args.visible : undefined,
          opacity: typeof args.opacity === 'number' ? args.opacity : undefined,
          blendMode: (args.blendMode as PaintBlendMode) || undefined,
        });
        return JSON.stringify({
          status: 'ok',
          action: 'layer',
          layerAction: 'set_props',
          layers: controller.getLayersSummary(mesh),
        });
      }
      if (sub === 'flatten') {
        controller.flattenAlbedoLayers(mesh);
        return JSON.stringify({
          status: 'ok',
          action: 'layer',
          layerAction: 'flatten',
          layers: controller.getLayersSummary(mesh),
        });
      }
      return JSON.stringify({
        status: 'ok',
        action: 'layer',
        layerAction: 'list',
        layers: controller.getLayersSummary(mesh),
      });
    }

    if (action === 'project_stencil') {
      let url = args.stencilUrl ? String(args.stencilUrl) : '';
      let stencilName = 'Projected Stencil';

      if (args.prompt) {
        const generated = await context.service.aiTextureGenerator.generateTexture({
          prompt: String(args.prompt),
          style: 'decal',
          seamless: false,
          size: 256,
          generateNormalMap: false,
          embedInScene: true,
        });
        url = generated.albedoDataUrl;
        stencilName = generated.name;
      } else if (url && !url.startsWith('data:') && !url.startsWith('http')) {
        // Look up by decal preset or scene texture name
        const opt = context.service.decalController.getAvailableTextures().find(
          (o) => o.id.toLowerCase() === url.toLowerCase() || o.name.toLowerCase() === url.toLowerCase()
        );
        if (opt) {
          url = opt.url;
          stencilName = opt.name;
        }
      }

      if (url) {
        await controller.loadStencilFromUrl(url, stencilName);
      }
      if (!controller.stencil.pixels) {
        throw new Error('Provide "stencilUrl" or "prompt" (or load a stencil first) for action="project_stencil".');
      }

      const res = controller.projectWholeStencil(mesh, {
        face: (args.face as any) || 'front',
        opacity: typeof args.opacity === 'number' ? args.opacity : 1.0,
        scale: typeof args.scale === 'number' ? args.scale : 0.85,
        rotationDeg: typeof args.rotationDeg === 'number' ? args.rotationDeg : 0,
        layerName: args.layerName ? String(args.layerName) : undefined,
      });

      return JSON.stringify({ status: 'ok', action: 'project_stencil', stencilName, ...res });
    }

    throw new Error(`Unsupported paint texture action: ${action}`);
  }

  private resolveTargetMesh(name: string | undefined, context: ToolExecutionContext): Mesh | null {
    if (name) {
      const lower = String(name).toLowerCase();
      const found = context.service.importedMeshes.find(
        (m) => m.name === name || m.name.toLowerCase() === lower
      );
      if (found) return found;
      const byScene = context.scene.getMeshByName(String(name));
      if (byScene && byScene instanceof Mesh) return byScene;
    }
    return context.service.texturePaintController.getActiveTargetMesh();
  }
}
