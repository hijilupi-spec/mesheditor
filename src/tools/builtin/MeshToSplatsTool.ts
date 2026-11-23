import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import { isTriangleMesh } from '../../splatting/GaussianSplatUtils';

export class MeshToSplatsTool extends AbstractTool {
  public readonly name = 'modeler_mesh_to_splats';
  public readonly description =
    'Converts an existing triangle Mesh into a GaussianSplattingMesh by sampling its surface triangles or internal volume. Useful for turning blocky foliage canopies, bushes, clouds, smoke, moss, or organic forms into soft volumetric Gaussian Splats.';

  public readonly parameters = {
    type: 'object',
    properties: {
      targetMesh: {
        type: 'string',
        description: 'Name or ID of the source triangle Mesh to convert into Gaussian Splats.',
      },
      name: {
        type: 'string',
        description: 'Optional name for the created GaussianSplattingMesh.',
      },
      targetSplatCount: {
        type: 'integer',
        minimum: 64,
        maximum: 200000,
        description: 'Number of Gaussian Splats to sample from the mesh (default: 4000).',
      },
      mode: {
        type: 'string',
        enum: ['surface', 'volume'],
        description: '"surface" samples oriented splats across triangles; "volume" fills the interior volume (default: "surface").',
      },
      splatStyle: {
        type: 'string',
        enum: ['default', 'foliage', 'moss', 'fuzzy'],
        description:
          'Splat shape & shading preset: "foliage" creates crisp elongated leaf blades with botanical color variation, "moss" creates tiny fuzzy tufts, "fuzzy" creates soft puffs, "default" creates flat surface discs.',
      },
      colorVariation: {
        type: 'number',
        description: 'Optional color/brightness jitter [0.0..0.5] across sampled splats (auto-enabled for foliage/moss).',
      },
      splatScale: {
        type: 'number',
        description: 'Optional explicit splat radius in meters (recommend 0.015..0.05 for crisp leaves/moss; auto-capped at 0.055 if omitted).',
      },
      opacity: {
        type: 'number',
        description: 'Splat opacity from 0.05 to 1.0 (default: 0.92).',
      },
      jitter: {
        type: 'number',
        description: 'Optional random position offset in meters for fluffy/organic edges (default: 0).',
      },
      color: {
        type: 'string',
        description: 'Optional hex color override (defaults to source mesh vertex colors or material albedo).',
      },
      removeSource: {
        type: 'boolean',
        description: 'Whether to hide/remove the original triangle mesh after conversion (default: false).',
      },
    },
    required: ['targetMesh'],
  };

  public execute(args: any, context: ToolExecutionContext): string {
    const sourceMesh = context.findMeshByNameOrId(String(args.targetMesh));
    if (!sourceMesh || !isTriangleMesh(sourceMesh)) {
      throw new Error(`Triangle mesh "${args.targetMesh}" not found.`);
    }

    const validStyles = ['default', 'foliage', 'moss', 'fuzzy'];
    const splatStyle = validStyles.includes(String(args.splatStyle)) ? args.splatStyle : 'default';

    const ctrl = context.service.gaussianSplatController;
    const { splatMesh, splatCount } = ctrl.convertMeshToSplats(sourceMesh, {
      name: args.name ? String(args.name) : undefined,
      targetSplatCount: typeof args.targetSplatCount === 'number' ? args.targetSplatCount : undefined,
      mode: args.mode === 'volume' ? 'volume' : 'surface',
      splatStyle,
      colorVariation: typeof args.colorVariation === 'number' ? args.colorVariation : undefined,
      splatScale: typeof args.splatScale === 'number' ? args.splatScale : undefined,
      opacity: typeof args.opacity === 'number' ? args.opacity : undefined,
      jitter: typeof args.jitter === 'number' ? args.jitter : undefined,
      colorHex: args.color ? context.normalizeHex(String(args.color)) : undefined,
      removeSource: !!args.removeSource,
    });

    return JSON.stringify({
      status: 'converted',
      sourceMesh: sourceMesh.name,
      splatCount,
      ...ctrl.getSplatStats(splatMesh),
    });
  }
}
