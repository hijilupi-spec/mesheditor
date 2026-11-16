import { GroundMesh, Vector3 } from '@babylonjs/core';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import {
  HeightmapBrushStroke,
  HeightmapPresetKind,
  MixmapBrushStroke,
} from '../../heightmap/HeightmapController';

export class CreateHeightmapTool extends AbstractTool {
  public readonly name = 'modeler_create_heightmap';
  public readonly description =
    'Creates or updates a 3D heightmap terrain GroundMesh with a 3-channel RGB TerrainMaterial. Supports procedural presets ("island", "mountains", "peak", "volcano", "canyon", "dunes", "black"), custom grayscale heightmap URLs, grayscale brush strokes (size & smoothness), RGB mix texture painting/URLs, terrain pathway carving/projection, and individual assignment of the 3 splat textures ("rock", "grass", "sand", "snow", "dirt", "cobblestone", "gravel", "volcanic", "moss", "water", or any scene/AI texture).';

  public readonly parameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional unique name for the terrain mesh (default: "gdhm").',
      },
      targetMesh: {
        type: 'string',
        description: 'Optional name of an existing heightmap terrain mesh to update in-place.',
      },
      preset: {
        type: 'string',
        enum: ['island', 'mountains', 'peak', 'volcano', 'canyon', 'dunes', 'black', 'flat'],
        description:
          'Procedural terrain heightmap preset (default: "mountains" when creating a new terrain without strokes/image, or "black" when heightStrokes are supplied).',
      },
      width: {
        type: 'number',
        description: 'Total terrain width in world units along X-axis (default: 100).',
      },
      height: {
        type: 'number',
        description: 'Total terrain length/depth in world units along Z-axis (default: 100).',
      },
      subdivisions: {
        type: 'number',
        description: 'Grid subdivisions per side from 4 to 256 (default: 100).',
      },
      minHeight: {
        type: 'number',
        description: 'Minimum elevation at pure black (0) pixels (default: 0).',
      },
      maxHeight: {
        type: 'number',
        description: 'Maximum elevation at pure white (255) pixels (default: 10).',
      },
      heightMapUrl: {
        type: 'string',
        description: 'Optional URL or data URL of a grayscale heightmap image.',
      },
      mixMapUrl: {
        type: 'string',
        description: 'Optional URL or data URL of an RGB splat mixmap image (Red=texture1, Green=texture2, Blue=texture3).',
      },
      texture1: {
        type: 'string',
        description:
          'Red-channel terrain texture (high elevations / peaks): e.g. "rock", "snow", "volcanic", "grass", "sand", "dirt", "cobblestone", "gravel", "moss", "water", or scene texture name/URL.',
      },
      texture2: {
        type: 'string',
        description:
          'Green-channel terrain texture (mid elevations & pathways): e.g. "grass", "cobblestone", "dirt", "moss", "rock", "sand", or scene texture name/URL.',
      },
      texture3: {
        type: 'string',
        description:
          'Blue-channel terrain texture (low elevations / base): e.g. "sand", "water", "gravel", "grass", "dirt", or scene texture name/URL.',
      },
      textureScale: {
        description: 'UV tiling scale as a uniform number (e.g. 10) or [scale1, scale2, scale3] array.',
        oneOf: [
          { type: 'number' },
          { type: 'array', items: { type: 'number' } },
        ],
      },
      heightStrokes: {
        type: 'array',
        description:
          'Grayscale brush strokes painted onto the heightmap. Coordinates [x, y] can be normalized [0..1] or pixel [0..255].',
        items: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              items: { type: 'array', items: { type: 'number' } },
              description: 'Array of [x, y] control points along the stroke.',
            },
            size: { type: 'number', description: 'Brush diameter in pixels (default: 28).' },
            smoothness: { type: 'number', description: 'Soft edge smoothness from 0.0 (hard) to 1.0 (soft, default: 0.75).' },
            value: { type: 'number', description: 'Grayscale brightness 0 (black/min) to 255 (white/max, default: 255).' },
            opacity: { type: 'number', description: 'Brush opacity 0.0 to 1.0 (default: 1.0).' },
          },
          required: ['points'],
        },
      },
      mixStrokes: {
        type: 'array',
        description:
          'RGB brush strokes painted onto the mix texture (e.g. to draw green pathways). Coordinates [x, y] can be normalized [0..1] or pixel [0..255].',
        items: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              items: { type: 'array', items: { type: 'number' } },
              description: 'Array of [x, y] control points along the stroke.',
            },
            channel: {
              type: 'string',
              enum: ['r', 'g', 'b', 'custom'],
              description: 'Target mix channel: "r" (texture1), "g" (texture2 / path), "b" (texture3), or "custom".',
            },
            color: {
              type: 'array',
              items: { type: 'number' },
              description: 'Optional explicit [R, G, B] values (0..255).',
            },
            size: { type: 'number', description: 'Brush diameter in pixels (default: 24).' },
            smoothness: { type: 'number', description: 'Soft edge smoothness from 0.0 to 1.0 (default: 0.75).' },
            opacity: { type: 'number', description: 'Brush opacity 0.0 to 1.0 (default: 1.0).' },
          },
          required: ['points'],
        },
      },
      pathPoints: {
        type: 'array',
        description: 'Optional [x, y, z] world-space waypoints to project a green-channel pathway onto the mixmap and optionally level vertices.',
        items: { type: 'array', items: { type: 'number' } },
      },
      pathWidth: {
        type: 'number',
        description: 'Width of the pathway in world units (default: 10).',
      },
      pathTransitionWidth: {
        type: 'number',
        description: 'Transition blend width around the pathway in world units (default: 5).',
      },
      pathYOffset: {
        type: 'number',
        description: 'Optional vertical height offset when carving path corridor vertices.',
      },
      pathProjection: {
        type: 'boolean',
        description: 'Whether to paint pathPoints onto the green channel of the mixmap (default: true).',
      },
      position: {
        type: 'array',
        items: { type: 'number' },
        description: '[x, y, z] world position (default: [0, 0, 0]).',
      },
      rotation: {
        type: 'array',
        items: { type: 'number' },
        description: '[rx, ry, rz] Euler rotation in radians.',
      },
      rotationDegrees: {
        type: 'array',
        items: { type: 'number' },
        description: '[rx, ry, rz] Euler rotation in degrees.',
      },
      scale: {
        type: 'array',
        items: { type: 'number' },
        description: '[sx, sy, sz] scaling factors.',
      },
    },
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const controller = context.service.heightmapController;

    let targetGround: GroundMesh | undefined;
    if (args.targetMesh) {
      const found = context.findMeshByNameOrId(String(args.targetMesh));
      if (found && found instanceof GroundMesh) {
        targetGround = found;
        controller.syncFromMesh(found);
      }
    }

    if (args.heightMapUrl) {
      await controller.loadHeightmapFromUrl(String(args.heightMapUrl));
    } else if (args.preset) {
      controller.applyPreset(String(args.preset) as HeightmapPresetKind, false);
    } else if (Array.isArray(args.heightStrokes) && args.heightStrokes.length > 0 && !targetGround) {
      controller.clearHeightmapToBlack(false);
    } else if (!targetGround) {
      controller.applyPreset('mountains', false);
    }

    if (Array.isArray(args.heightStrokes) && args.heightStrokes.length > 0) {
      const strokes: HeightmapBrushStroke[] = args.heightStrokes.map((s: any) => ({
        points: Array.isArray(s.points)
          ? s.points.map((p: any) => [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number])
          : [],
        size: typeof s.size === 'number' ? s.size : undefined,
        smoothness: typeof s.smoothness === 'number' ? s.smoothness : undefined,
        value: typeof s.value === 'number' ? s.value : 255,
        opacity: typeof s.opacity === 'number' ? s.opacity : 1.0,
      }));
      controller.applyHeightStrokes(strokes);
    }

    if (args.mixMapUrl) {
      await controller.loadMixmapFromUrl(String(args.mixMapUrl));
    }

    if (Array.isArray(args.mixStrokes) && args.mixStrokes.length > 0) {
      const mixStrokes: MixmapBrushStroke[] = args.mixStrokes.map((s: any) => ({
        points: Array.isArray(s.points)
          ? s.points.map((p: any) => [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number])
          : [],
        channel: s.channel,
        color: Array.isArray(s.color) && s.color.length >= 3
          ? ([Number(s.color[0]) || 0, Number(s.color[1]) || 0, Number(s.color[2]) || 0] as [number, number, number])
          : undefined,
        size: typeof s.size === 'number' ? s.size : undefined,
        smoothness: typeof s.smoothness === 'number' ? s.smoothness : undefined,
        opacity: typeof s.opacity === 'number' ? s.opacity : 1.0,
      }));
      controller.applyMixStrokes(mixStrokes);
    }

    let textureScale: [number, number, number] | undefined;
    if (typeof args.textureScale === 'number') {
      textureScale = [args.textureScale, args.textureScale, args.textureScale];
    } else if (Array.isArray(args.textureScale) && args.textureScale.length >= 3) {
      textureScale = [
        Number(args.textureScale[0]) || 10,
        Number(args.textureScale[1]) || 10,
        Number(args.textureScale[2]) || 10,
      ];
    }

    const pathPoints: Vector3[] | undefined = Array.isArray(args.pathPoints)
      ? args.pathPoints.map((pt: any) => this.parseVec3(pt))
      : undefined;

    const mesh = await controller.buildOrUpdateTerrainMesh({
      targetMesh: targetGround,
      createNew: !targetGround,
      name: args.name ? String(args.name) : undefined,
      width: typeof args.width === 'number' ? args.width : undefined,
      height: typeof args.height === 'number' ? args.height : undefined,
      subdivisions: typeof args.subdivisions === 'number' ? args.subdivisions : undefined,
      minHeight: typeof args.minHeight === 'number' ? args.minHeight : undefined,
      maxHeight: typeof args.maxHeight === 'number' ? args.maxHeight : undefined,
      texture1: args.texture1 ? String(args.texture1) : undefined,
      texture2: args.texture2 ? String(args.texture2) : undefined,
      texture3: args.texture3 ? String(args.texture3) : undefined,
      textureScale,
      pathPoints,
      pathWidth: typeof args.pathWidth === 'number' ? args.pathWidth : undefined,
      pathTransitionWidth: typeof args.pathTransitionWidth === 'number' ? args.pathTransitionWidth : undefined,
      pathYOffset: typeof args.pathYOffset === 'number' ? args.pathYOffset : undefined,
      pathProjection: typeof args.pathProjection === 'boolean' ? args.pathProjection : undefined,
      selectAfterBuild: true,
    });

    if (args.position || args.rotation || args.rotationDegrees || args.scale) {
      context.applyTransformArgs(mesh, args);
    }

    context.registerCreatedMesh(mesh);

    return JSON.stringify({
      status: 'ok',
      meshName: mesh.name,
      width: controller.config.width,
      height: controller.config.height,
      subdivisions: controller.config.subdivisions,
      minHeight: controller.config.minHeight,
      maxHeight: controller.config.maxHeight,
      textures: [
        controller.config.terrainTextureName1,
        controller.config.terrainTextureName2,
        controller.config.terrainTextureName3,
      ],
      vertices: mesh.getTotalVertices(),
      faces: Math.floor(mesh.getTotalIndices() / 3),
    });
  }
}
