import { Mesh } from '@babylonjs/core';
import { detectZFighting } from '../../geometry/zFightingDetector';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';

/**
 * Inspects scene meshes for coplanar or near-coplanar overlapping faces
 * that cause Z-fighting and texture bleeding, returning exact mesh/face locations
 * and recommended fixes (facet extrude, facet inset, offset, or boolean cleanup).
 */
export class CheckZFightingTool extends AbstractTool {
  public readonly name = 'modeler_check_z_fighting';
  public readonly description =
    'Checks scene meshes for Z-fighting and texture bleeding caused by coplanar or near-coplanar overlapping faces (both between separate meshes and within a single mesh). Returns affected mesh names, face directions, face IDs, overlap area, and recommended fixes using modeler_facet_extrude, modeler_facet_inset, or modeler_transform_mesh.';

  public readonly parameters = {
    type: 'object',
    properties: {
      meshNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of specific mesh names to check. If omitted, all active visible scene meshes are checked.',
      },
      planeTolerance: {
        type: 'number',
        description:
          'Maximum perpendicular distance in meters between faces to classify as coplanar/Z-fighting (default: 0.003).',
      },
      angleToleranceDeg: {
        type: 'number',
        description:
          'Maximum angle difference in degrees between face normals to classify as coplanar (default: 3.0).',
      },
    },
  };

  public execute(args: any, context: ToolExecutionContext): string {
    const requestedNames: string[] = Array.isArray(args?.meshNames)
      ? args.meshNames.map((n: any) => String(n || '').trim()).filter(Boolean)
      : [];

    let targetMeshes: Mesh[];
    if (requestedNames.length > 0) {
      targetMeshes = requestedNames
        .map((n) => context.findMeshByNameOrId(n))
        .filter((m): m is Mesh => !!m && !m.isDisposed());
      if (targetMeshes.length === 0) {
        throw new Error(`None of the specified meshes were found: ${requestedNames.join(', ')}`);
      }
    } else {
      targetMeshes = context.service.importedMeshes.filter(
        (m) => !context.service.isEditorHelper(m) && !m.isDisposed()
      );
    }

    const report = detectZFighting(targetMeshes, {
      planeTolerance:
        typeof args?.planeTolerance === 'number' && args.planeTolerance > 0
          ? args.planeTolerance
          : undefined,
      angleToleranceDeg:
        typeof args?.angleToleranceDeg === 'number' && args.angleToleranceDeg > 0
          ? args.angleToleranceDeg
          : undefined,
    });

    return JSON.stringify({
      status: 'ok',
      ...report,
      guidance: report.hasIssues
        ? 'Fix coplanar overlaps by extruding or insetting the affected face with non-zero depth (modeler_facet_extrude / modeler_facet_inset), offsetting one mesh slightly along the plane normal (modeler_transform_mesh), or carving/merging cleanly with modeler_boolean_operation.'
        : 'No Z-fighting or coplanar overlapping faces detected.',
    });
  }
}
