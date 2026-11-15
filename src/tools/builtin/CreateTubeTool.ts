import { Color3, Mesh, MeshBuilder } from '@babylonjs/core';
import {
  applyRootTipGradient,
  applyVertexPaintRegions,
  buildTaperedSweepVertexData,
  VertexPaintRegion,
} from '../../geometry/organicGeometry';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import { applyCanonicalPbrPreset, CANONICAL_MATERIAL_PRESETS } from '../textureUtils';

export class CreateTubeTool extends AbstractTool {
  public readonly name = 'modeler_create_tube';
  public readonly description =
    'Creates a smooth, twist-free 3D tube, tapered horn, hair lock, tentacle, organic limb, branch, or rail using parallel-transport framing, optional Catmull-Rom smoothing, per-station elliptical radii (rx, rz, twist), root-to-tip vertex color gradients, and canonical PBR material presets.';

  public readonly parameters = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      path: {
        type: 'array',
        description: 'Array of 3D points { x, y, z } defining the tube centerline (optional if stations is provided).',
        items: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          required: ['x', 'y', 'z'],
        },
      },
      stations: {
        type: 'array',
        description:
          'Optional array of tapered elliptical sweep stations { x, y, z, rx, rz?, twist? }. Setting rx=0, rz=0 at an end converges cleanly to a single pointed tip (horns, claws, tails, hair locks).',
        items: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
            rx: { type: 'number' },
            rz: { type: 'number' },
            twist: { type: 'number' },
          },
          required: ['x', 'y', 'z', 'rx'],
        },
      },
      radius: { type: 'number', description: 'Uniform tube radius when using path (default 0.2).' },
      radiusStart: { type: 'number', description: 'Optional start radius for linear taper along path.' },
      radiusEnd: { type: 'number', description: 'Optional end radius for linear taper along path (0 = pointed tip).' },
      radii: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional array of radii matching each point in path.',
      },
      ellipticalRatio: {
        type: 'number',
        description: 'Cross-section aspect ratio rx / rz (e.g. 1.5 for flattened hair clumps, ribbons, or tentacles).',
      },
      tubularSegments: {
        type: 'integer',
        description: 'Number of length segments along the Catmull-Rom curve (default auto from path length).',
      },
      smoothPath: {
        type: 'boolean',
        description: 'Interpolate stations/path along a smooth Catmull-Rom spline with parallel-transport framing (default true for tapered/multi-point sweeps).',
      },
      tessellation: { type: 'number', description: 'Radial segments around circumference (default 24).' },
      cap: { type: 'number', description: '0: No cap, 1: Start, 2: End, 3: Both (default 3).' },
      closed: { type: 'boolean', description: 'Close into a continuous loop (default false).' },
      position: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
      },
      rotationDegrees: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
      },
      color: { type: 'string' },
      roughness: { type: 'number' },
      metallic: { type: 'number' },
      materialName: { type: 'string' },
      materialPreset: {
        type: 'string',
        enum: Object.keys(CANONICAL_MATERIAL_PRESETS),
        description: 'Optional canonical PBR preset (hair, fur, bone_horn, skin, unfinished_wood, foliage, brushed_steel, etc.).',
      },
      rootTipGradient: {
        type: 'object',
        description: 'Optional vertex color gradient from root to tip along a local axis.',
        properties: {
          rootColor: { type: 'string' },
          tipColor: { type: 'string' },
          axis: { type: 'string', enum: ['x', 'y', 'z'] },
          power: { type: 'number' },
        },
        required: ['rootColor', 'tipColor'],
      },
      vertexPaintRegions: {
        type: 'array',
        description: 'Optional 3D signed-distance paint regions blended smoothly across vertices.',
        items: { type: 'object' },
      },
    },
  };

  public execute(args: any, context: ToolExecutionContext): string {
    const baseName = (args.name || 'tube_mesh').replace(/\s+/g, '_');
    const uniqueName = context.findMeshByNameOrId(baseName)
      ? `${baseName}_${Date.now().toString().slice(-4)}`
      : baseName;

    const stations = Array.isArray(args.stations) && args.stations.length >= 2 ? args.stations : undefined;
    const path = Array.isArray(args.path) ? args.path.map((p: any) => this.parseVec3(p, 0)) : [];

    if (!stations && path.length < 2) {
      throw new Error('modeler_create_tube requires at least 2 points in "path" or 2 entries in "stations".');
    }

    const useTaperedSweep =
      !!stations ||
      args.radiusStart !== undefined ||
      args.radiusEnd !== undefined ||
      Array.isArray(args.radii) ||
      args.ellipticalRatio !== undefined ||
      args.smoothPath === true ||
      args.tubularSegments !== undefined ||
      (args.smoothPath !== false && path.length >= 3);

    const cap = args.cap !== undefined ? Number(args.cap) : Mesh.CAP_ALL;
    const tessellation = args.tessellation !== undefined ? Number(args.tessellation) : 24;

    let mesh: Mesh;
    let isTapered = false;

    if (useTaperedSweep) {
      isTapered = true;
      const capStart = cap === Mesh.CAP_START || cap === Mesh.CAP_ALL || cap === 1 || cap === 3;
      const capEnd = cap === Mesh.CAP_END || cap === Mesh.CAP_ALL || cap === 2 || cap === 3;
      const vd = buildTaperedSweepVertexData({
        stations,
        path: stations ? undefined : path,
        radius: args.radius !== undefined ? Number(args.radius) : 0.2,
        radiusStart: args.radiusStart !== undefined ? Number(args.radiusStart) : undefined,
        radiusEnd: args.radiusEnd !== undefined ? Number(args.radiusEnd) : undefined,
        radii: Array.isArray(args.radii) ? args.radii.map(Number) : undefined,
        ellipticalRatio: args.ellipticalRatio !== undefined ? Number(args.ellipticalRatio) : undefined,
        tubularSegments: args.tubularSegments !== undefined ? Number(args.tubularSegments) : undefined,
        radialSegments: tessellation,
        smoothPath: args.smoothPath !== false,
        capStart,
        capEnd,
        closed: !!args.closed,
      });
      mesh = new Mesh(uniqueName, context.scene);
      vd.applyToMesh(mesh, true);
    } else {
      mesh = MeshBuilder.CreateTube(
        uniqueName,
        {
          path,
          radius: args.radius !== undefined ? Number(args.radius) : 0.2,
          tessellation,
          cap,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        context.scene
      );
    }

    const hasVertexPaint = !!(args.rootTipGradient || (Array.isArray(args.vertexPaintRegions) && args.vertexPaintRegions.length > 0));
    const mat = context.getOrCreateMaterial(
      args.materialName,
      hasVertexPaint ? '#ffffff' : args.color,
      args.roughness,
      args.metallic,
      uniqueName
    );
    if (args.materialPreset) {
      applyCanonicalPbrPreset(mat, args.materialPreset, {
        baseColorHex: hasVertexPaint ? undefined : args.color,
        roughness: args.roughness !== undefined ? Number(args.roughness) : undefined,
        metallic: args.metallic !== undefined ? Number(args.metallic) : undefined,
      });
    }

    if (args.rootTipGradient && args.rootTipGradient.rootColor && args.rootTipGradient.tipColor) {
      applyRootTipGradient(mesh, {
        rootColor: String(args.rootTipGradient.rootColor),
        tipColor: String(args.rootTipGradient.tipColor),
        axis: args.rootTipGradient.axis || 'y',
        power: args.rootTipGradient.power,
      });
    }
    if (Array.isArray(args.vertexPaintRegions) && args.vertexPaintRegions.length > 0) {
      applyVertexPaintRegions(mesh, args.vertexPaintRegions as VertexPaintRegion[], args.color || '#d9b38c');
    }
    if (hasVertexPaint) {
      mesh.useVertexColors = true;
      mat.albedoColor = Color3.White();
    }

    mesh.material = mat;
    context.applyTransformArgs(mesh, args);
    context.registerCreatedMesh(mesh);

    return JSON.stringify({
      status: 'ok',
      meshName: mesh.name,
      taperedSweep: isTapered,
      vertices: mesh.getTotalVertices(),
      triangles: Math.floor(mesh.getTotalIndices() / 3),
    });
  }
}
