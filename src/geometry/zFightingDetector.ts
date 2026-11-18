import { Material, Mesh, MultiMaterial, Vector3, VertexBuffer } from '@babylonjs/core';

export type ZFightingFaceDirection =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'angled';

export interface ZFightingIssue {
  id: string;
  kind: 'inter_mesh_coplanar' | 'intra_mesh_coplanar';
  severity: 'high' | 'medium';
  meshA: string;
  meshB: string;
  faceDirectionA: ZFightingFaceDirection;
  faceDirectionB: ZFightingFaceDirection;
  representativeFaceIdA: number;
  representativeFaceIdB: number;
  normalOrientation: 'same' | 'opposite';
  planeNormal: { x: number; y: number; z: number };
  planeOffset: number;
  overlapPoint: { x: number; y: number; z: number };
  overlapArea: number;
  overlappingTriPairs: number;
  summary: string;
  recommendedFixes: string[];
}

export interface ZFightingReport {
  hasIssues: boolean;
  issueCount: number;
  highSeverityCount: number;
  checkedMeshes: number;
  checkedTriangles: number;
  issues: ZFightingIssue[];
}

export interface ZFightingCheckOptions {
  /** Maximum perpendicular plane distance (in meters) to consider faces coplanar. Default: 0.003 */
  planeTolerance?: number;
  /** Maximum angle difference (in degrees) between face normals to consider them coplanar. Default: 3.0 */
  angleToleranceDeg?: number;
  /** Minimum overlapping 2D area (in m^2) to flag as Z-fighting (prevents edge-touch false positives). Default: 1e-5 */
  minOverlapArea?: number;
  /** Maximum number of grouped issues to return. Default: 25 */
  maxIssues?: number;
}

interface Vec2 {
  x: number;
  y: number;
}

interface MeshMeta {
  index: number;
  mesh: Mesh;
  name: string;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  hasTransparency: boolean;
  backFaceCullingDisabled: boolean;
}

interface TriData {
  globalIdx: number;
  meshIdx: number;
  faceId: number;
  p0: Vector3;
  p1: Vector3;
  p2: Vector3;
  normal: Vector3;
  planeD: number;
  area: number;
  centroid: Vector3;
  radius: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  cn: Vector3;
  cd: number;
  qx: number;
  qy: number;
  qz: number;
}

interface IssueAccumulator {
  key: string;
  kind: 'inter_mesh_coplanar' | 'intra_mesh_coplanar';
  severity: 'high' | 'medium';
  meshA: MeshMeta;
  meshB: MeshMeta;
  normalOrientation: 'same' | 'opposite';
  planeNormal: Vector3;
  planeOffset: number;
  repFaceIdA: number;
  repFaceIdB: number;
  repNormalA: Vector3;
  repNormalB: Vector3;
  bestPairArea: number;
  totalOverlapArea: number;
  weightedPoint: Vector3;
  pairCount: number;
  exactDuplicateVerts: boolean;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Maps a world-space face normal to the facet direction names accepted by
 * modeler_facet_extrude and modeler_facet_inset.
 */
export function classifyFaceDirection(normal: Vector3): ZFightingFaceDirection {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  const maxComp = Math.max(ax, ay, az);
  if (maxComp < 0.72) {
    return 'angled';
  }
  if (ay >= ax && ay >= az) {
    return normal.y >= 0 ? 'top' : 'bottom';
  }
  if (az >= ax && az >= ay) {
    return normal.z >= 0 ? 'front' : 'back';
  }
  return normal.x >= 0 ? 'right' : 'left';
}

function hasMaterialTransparency(mat: Material | null): boolean {
  if (!mat) return false;
  if (mat instanceof MultiMaterial) {
    return mat.subMaterials.some((sub) => hasMaterialTransparency(sub));
  }
  if (typeof mat.alpha === 'number' && mat.alpha < 0.99) {
    return true;
  }
  return typeof mat.needAlphaBlending === 'function' ? mat.needAlphaBlending() : false;
}

function isBackFaceCullingDisabled(mat: Material | null): boolean {
  if (!mat) return false;
  if (mat instanceof MultiMaterial) {
    return mat.subMaterials.some((sub) => (sub ? sub.backFaceCulling === false : false));
  }
  return mat.backFaceCulling === false;
}

function canonicalizeNormal(normal: Vector3): { cn: Vector3; flipped: boolean } {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  let flip = false;
  if (ax >= ay && ax >= az) {
    flip = normal.x < 0;
  } else if (ay >= ax && ay >= az) {
    flip = normal.y < 0;
  } else {
    flip = normal.z < 0;
  }
  return {
    cn: flip ? normal.scale(-1) : normal.clone(),
    flipped: flip,
  };
}

function buildPlaneBasis(n: Vector3): { u: Vector3; v: Vector3 } {
  const ref = Math.abs(n.x) < 0.85 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = Vector3.Cross(ref, n).normalize();
  const v = Vector3.Cross(n, u).normalize();
  return { u, v };
}

function projectTo2D(p: Vector3, u: Vector3, v: Vector3): Vec2 {
  return {
    x: Vector3.Dot(p, u),
    y: Vector3.Dot(p, v),
  };
}

function ensureCCW2D(tri: [Vec2, Vec2, Vec2]): [Vec2, Vec2, Vec2] {
  const area2 =
    (tri[1].x - tri[0].x) * (tri[2].y - tri[0].y) -
    (tri[1].y - tri[0].y) * (tri[2].x - tri[0].x);
  return area2 < 0 ? [tri[0], tri[2], tri[1]] : tri;
}

function cross2D(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Clips polygon `subject` against convex CCW triangle `clipTri` via Sutherland-Hodgman.
 */
function clipTriangle2D(subject: Vec2[], clipTri: [Vec2, Vec2, Vec2]): Vec2[] {
  let output = subject;
  const eps = 1e-9;

  for (let i = 0; i < 3; i++) {
    if (output.length === 0) break;
    const edgeStart = clipTri[i];
    const edgeEnd = clipTri[(i + 1) % 3];
    const input = output;
    output = [];

    for (let j = 0; j < input.length; j++) {
      const curr = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const dCurr = cross2D(edgeStart, edgeEnd, curr);
      const dPrev = cross2D(edgeStart, edgeEnd, prev);
      const currInside = dCurr >= -eps;
      const prevInside = dPrev >= -eps;

      if (currInside) {
        if (!prevInside) {
          const denom = dPrev - dCurr;
          if (Math.abs(denom) > 1e-12) {
            const t = dPrev / denom;
            output.push({
              x: prev.x + t * (curr.x - prev.x),
              y: prev.y + t * (curr.y - prev.y),
            });
          }
        }
        output.push(curr);
      } else if (prevInside) {
        const denom = dPrev - dCurr;
        if (Math.abs(denom) > 1e-12) {
          const t = dPrev / denom;
          output.push({
            x: prev.x + t * (curr.x - prev.x),
            y: prev.y + t * (curr.y - prev.y),
          });
        }
      }
    }
  }

  return output;
}

function polygonAreaAndCentroid2D(poly: Vec2[]): { area: number; cx: number; cy: number } {
  if (poly.length < 3) return { area: 0, cx: 0, cy: 0 };
  let signedArea2 = 0;
  let cxSum = 0;
  let cySum = 0;

  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    signedArea2 += cross;
    cxSum += (p0.x + p1.x) * cross;
    cySum += (p0.y + p1.y) * cross;
  }

  const area = Math.abs(signedArea2) * 0.5;
  if (area < 1e-12 || Math.abs(signedArea2) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    return { area, cx: sx / poly.length, cy: sy / poly.length };
  }

  return {
    area,
    cx: cxSum / (3 * signedArea2),
    cy: cySum / (3 * signedArea2),
  };
}

function trianglesShareExactVertices(a: TriData, b: TriData, tolSq: number = 1e-8): boolean {
  const aVerts = [a.p0, a.p1, a.p2];
  const bVerts = [b.p0, b.p1, b.p2];
  for (const va of aVerts) {
    let matched = false;
    for (const vb of bVerts) {
      if (Vector3.DistanceSquared(va, vb) <= tolSq) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function meshThicknessAlongNormal(meta: MeshMeta, n: Vector3): number {
  return (
    Math.abs(n.x) * meta.sizeX +
    Math.abs(n.y) * meta.sizeY +
    Math.abs(n.z) * meta.sizeZ
  );
}

function buildRecommendedFixes(acc: IssueAccumulator): string[] {
  const dirA = classifyFaceDirection(acc.repNormalA);
  const dirB = classifyFaceDirection(acc.repNormalB);
  const n = acc.planeNormal;

  if (acc.kind === 'intra_mesh_coplanar') {
    if (acc.normalOrientation === 'opposite' && acc.exactDuplicateVerts) {
      return [
        `Duplicate opposite-winding coplanar faces detected inside "${acc.meshA.name}" (e.g. Mesh.DOUBLESIDE combined with backFaceCulling=false). Rebuild without Mesh.DOUBLESIDE, or offset/extrude one side.`,
        `Or adjust the overlapping facet via modeler_facet_extrude (meshName: "${acc.meshA.name}", faceId: ${acc.repFaceIdA}, distance: 0.02) or modeler_facet_inset (insetAmount: 0.15, depth: -0.02).`,
      ];
    }
    return [
      `Use modeler_facet_extrude (meshName: "${acc.meshA.name}", ${dirA !== 'angled' ? `direction: "${dirA}", ` : ''}faceId: ${acc.repFaceIdA}, distance: 0.02) or modeler_facet_inset (insetAmount: 0.15, depth: -0.02 or 0.02) to move the overlapping face off the shared plane.`,
      `Remove any zero-distance extrusions or duplicate overlapping geometry in "${acc.meshA.name}".`,
    ];
  }

  return [
    `Use modeler_facet_extrude (meshName: "${acc.meshB.name}", ${dirB !== 'angled' ? `direction: "${dirB}", ` : ''}faceId: ${acc.repFaceIdB}, distance: 0.02) or modeler_facet_inset (meshName: "${acc.meshA.name}", ${dirA !== 'angled' ? `direction: "${dirA}", ` : ''}faceId: ${acc.repFaceIdA}, insetAmount: 0.15, depth: -0.02) so the surfaces do not share the exact same plane.`,
    `Or nudge "${acc.meshB.name}" by 0.01-0.02m along (${round3(n.x)}, ${round3(n.y)}, ${round3(n.z)}) using modeler_transform_mesh, or carve cleanly with modeler_boolean_operation.`,
  ];
}

/**
 * Analyzes active scene meshes for coplanar or near-coplanar overlapping faces
 * that cause Z-fighting and texture bleeding in WebGL rendering.
 */
export function detectZFighting(
  meshes: Mesh[],
  options: ZFightingCheckOptions = {}
): ZFightingReport {
  const planeTolerance = Math.max(1e-5, options.planeTolerance ?? 0.003);
  const angleToleranceDeg = Math.max(0.1, options.angleToleranceDeg ?? 3.0);
  const cosAngleTol = Math.cos((angleToleranceDeg * Math.PI) / 180);
  const minOverlapArea = Math.max(1e-8, options.minOverlapArea ?? 1e-5);
  const maxIssues = Math.max(1, options.maxIssues ?? 25);

  const validMeshes = meshes.filter(
    (m) => m && !m.isDisposed() && m.isVisible && m.isEnabled() && m.getTotalIndices() >= 3
  );

  const meshMetas: MeshMeta[] = [];
  const allTris: TriData[] = [];
  const bucketStep = 0.2;

  for (let mi = 0; mi < validMeshes.length; mi++) {
    const mesh = validMeshes[mi];
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices || indices.length < 3) continue;

    const wm = mesh.getWorldMatrix();
    const isIdentity = wm.isIdentity();
    const vertCount = Math.floor(positions.length / 3);
    const worldPos = new Float32Array(vertCount * 3);

    let mMinX = Infinity;
    let mMinY = Infinity;
    let mMinZ = Infinity;
    let mMaxX = -Infinity;
    let mMaxY = -Infinity;
    let mMaxZ = -Infinity;

    if (isIdentity) {
      for (let v = 0; v < vertCount; v++) {
        const x = positions[v * 3];
        const y = positions[v * 3 + 1];
        const z = positions[v * 3 + 2];
        worldPos[v * 3] = x;
        worldPos[v * 3 + 1] = y;
        worldPos[v * 3 + 2] = z;
        if (x < mMinX) mMinX = x;
        if (y < mMinY) mMinY = y;
        if (z < mMinZ) mMinZ = z;
        if (x > mMaxX) mMaxX = x;
        if (y > mMaxY) mMaxY = y;
        if (z > mMaxZ) mMaxZ = z;
      }
    } else {
      const m = wm.m;
      for (let v = 0; v < vertCount; v++) {
        const vx = positions[v * 3];
        const vy = positions[v * 3 + 1];
        const vz = positions[v * 3 + 2];
        const w = vx * m[3] + vy * m[7] + vz * m[11] + m[15] || 1;
        const x = (vx * m[0] + vy * m[4] + vz * m[8] + m[12]) / w;
        const y = (vx * m[1] + vy * m[5] + vz * m[9] + m[13]) / w;
        const z = (vx * m[2] + vy * m[6] + vz * m[10] + m[14]) / w;
        worldPos[v * 3] = x;
        worldPos[v * 3 + 1] = y;
        worldPos[v * 3 + 2] = z;
        if (x < mMinX) mMinX = x;
        if (y < mMinY) mMinY = y;
        if (z < mMinZ) mMinZ = z;
        if (x > mMaxX) mMaxX = x;
        if (y > mMaxY) mMaxY = y;
        if (z > mMaxZ) mMaxZ = z;
      }
    }

    const metaIdx = meshMetas.length;
    meshMetas.push({
      index: metaIdx,
      mesh,
      name: mesh.name,
      minX: mMinX,
      minY: mMinY,
      minZ: mMinZ,
      maxX: mMaxX,
      maxY: mMaxY,
      maxZ: mMaxZ,
      sizeX: Math.max(0, mMaxX - mMinX),
      sizeY: Math.max(0, mMaxY - mMinY),
      sizeZ: Math.max(0, mMaxZ - mMinZ),
      hasTransparency: hasMaterialTransparency(mesh.material),
      backFaceCullingDisabled: isBackFaceCullingDisabled(mesh.material),
    });

    const triCount = Math.floor(indices.length / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;

      const p0 = new Vector3(worldPos[i0 * 3], worldPos[i0 * 3 + 1], worldPos[i0 * 3 + 2]);
      const p1 = new Vector3(worldPos[i1 * 3], worldPos[i1 * 3 + 1], worldPos[i1 * 3 + 2]);
      const p2 = new Vector3(worldPos[i2 * 3], worldPos[i2 * 3 + 1], worldPos[i2 * 3 + 2]);

      // Babylon.js left-handed winding: Cross(p2 - p0, p1 - p0) gives outward normal
      const cross = Vector3.Cross(p2.subtract(p0), p1.subtract(p0));
      const len = cross.length();
      const area = len * 0.5;
      if (area < 1e-7) continue;

      const normal = cross.scale(1 / len);
      const planeD = Vector3.Dot(normal, p0);
      const centroid = p0.add(p1).add(p2).scale(1 / 3);
      const r0 = Vector3.Distance(centroid, p0);
      const r1 = Vector3.Distance(centroid, p1);
      const r2 = Vector3.Distance(centroid, p2);
      const radius = Math.max(r0, r1, r2);

      const { cn } = canonicalizeNormal(normal);
      const cd = Vector3.Dot(cn, centroid);

      allTris.push({
        globalIdx: allTris.length,
        meshIdx: metaIdx,
        faceId: t,
        p0,
        p1,
        p2,
        normal,
        planeD,
        area,
        centroid,
        radius,
        minX: Math.min(p0.x, p1.x, p2.x),
        minY: Math.min(p0.y, p1.y, p2.y),
        minZ: Math.min(p0.z, p1.z, p2.z),
        maxX: Math.max(p0.x, p1.x, p2.x),
        maxY: Math.max(p0.y, p1.y, p2.y),
        maxZ: Math.max(p0.z, p1.z, p2.z),
        cn,
        cd,
        qx: Math.floor(normal.x / bucketStep),
        qy: Math.floor(normal.y / bucketStep),
        qz: Math.floor(normal.z / bucketStep),
      });
    }
  }

  // Precompute mesh-pair AABB overlap lookup
  const meshPairOverlap = new Uint8Array(meshMetas.length * meshMetas.length);
  for (let i = 0; i < meshMetas.length; i++) {
    const a = meshMetas[i];
    meshPairOverlap[i * meshMetas.length + i] = 1;
    for (let j = i + 1; j < meshMetas.length; j++) {
      const b = meshMetas[j];
      const overlaps =
        a.minX <= b.maxX + planeTolerance &&
        a.maxX >= b.minX - planeTolerance &&
        a.minY <= b.maxY + planeTolerance &&
        a.maxY >= b.minY - planeTolerance &&
        a.minZ <= b.maxZ + planeTolerance &&
        a.maxZ >= b.minZ - planeTolerance;
      if (overlaps) {
        meshPairOverlap[i * meshMetas.length + j] = 1;
        meshPairOverlap[j * meshMetas.length + i] = 1;
      }
    }
  }

  // Bucket triangles by quantized canonical normal for O(N log N) plane sweep
  const normalBuckets = new Map<string, TriData[]>();
  for (const tri of allTris) {
    const key = `${tri.qx},${tri.qy},${tri.qz}`;
    let list = normalBuckets.get(key);
    if (!list) {
      list = [];
      normalBuckets.set(key, list);
    }
    list.push(tri);
  }
  for (const list of normalBuckets.values()) {
    list.sort((a, b) => a.minX - b.minX);
  }

  const issueGroups = new Map<string, IssueAccumulator>();
  const meshCount = meshMetas.length;

  for (const triA of allTris) {
    const metaA = meshMetas[triA.meshIdx];
    const minOverlapForA = minOverlapArea;

    const negQx = Math.floor(-triA.normal.x / bucketStep);
    const negQy = Math.floor(-triA.normal.y / bucketStep);
    const negQz = Math.floor(-triA.normal.z / bucketStep);

    const bucketKeysToCheck = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          bucketKeysToCheck.add(`${triA.qx + dx},${triA.qy + dy},${triA.qz + dz}`);
          bucketKeysToCheck.add(`${negQx + dx},${negQy + dy},${negQz + dz}`);
        }
      }
    }

    for (const bKey of bucketKeysToCheck) {
      const candidates = normalBuckets.get(bKey);
      if (!candidates) continue;

      for (let ci = 0; ci < candidates.length; ci++) {
        const triB = candidates[ci];
        if (triB.minX > triA.maxX + planeTolerance) break;
        if (triB.globalIdx <= triA.globalIdx) continue;

            if (triA.meshIdx !== triB.meshIdx) {
              if (!meshPairOverlap[triA.meshIdx * meshCount + triB.meshIdx]) continue;
            }

            if (triB.maxX < triA.minX - planeTolerance) continue;
            if (
              triB.minY > triA.maxY + planeTolerance ||
              triB.maxY < triA.minY - planeTolerance ||
              triB.minZ > triA.maxZ + planeTolerance ||
              triB.maxZ < triA.minZ - planeTolerance
            ) {
              continue;
            }

            const dot = Vector3.Dot(triA.normal, triB.normal);
            if (Math.abs(dot) < cosAngleTol) continue;

            const isSameMesh = triA.meshIdx === triB.meshIdx;
            const isSameNormal = dot > 0;
            const metaB = meshMetas[triB.meshIdx];

            // Verify all vertices of each triangle lie within planeTolerance of the other's plane
            const distB0 = Math.abs(Vector3.Dot(triA.normal, triB.p0) - triA.planeD);
            const distB1 = Math.abs(Vector3.Dot(triA.normal, triB.p1) - triA.planeD);
            const distB2 = Math.abs(Vector3.Dot(triA.normal, triB.p2) - triA.planeD);
            if (distB0 > planeTolerance || distB1 > planeTolerance || distB2 > planeTolerance) {
              continue;
            }
            const distA0 = Math.abs(Vector3.Dot(triB.normal, triA.p0) - triB.planeD);
            const distA1 = Math.abs(Vector3.Dot(triB.normal, triA.p1) - triB.planeD);
            const distA2 = Math.abs(Vector3.Dot(triB.normal, triA.p2) - triB.planeD);
            if (distA0 > planeTolerance || distA1 > planeTolerance || distA2 > planeTolerance) {
              continue;
            }

            let exactDup = false;
            if (!isSameNormal) {
              if (isSameMesh) {
                exactDup = trianglesShareExactVertices(triA, triB);
                const thinSelf =
                  meshThicknessAlongNormal(metaA, triA.normal) < planeTolerance * 2;
                // Opposite normals inside a thick solid mesh are internal butt-joints unless
                // exact duplicate geometry (e.g. DOUBLESIDE + backFaceCulling=false) or zero-thickness shell
                if (!exactDup && !thinSelf) continue;
                if (exactDup && !metaA.backFaceCullingDisabled) continue;
              } else {
                const flatA = meshThicknessAlongNormal(metaA, triA.normal) < planeTolerance * 2;
                const flatB = meshThicknessAlongNormal(metaB, triA.normal) < planeTolerance * 2;
                // Skip solid-to-solid resting contact (opposite normals, opaque, non-flat)
                if (!flatA && !flatB && !metaA.hasTransparency && !metaB.hasTransparency) {
                  continue;
                }
              }
            }

            // Compute exact 2D overlap area on triA's plane
            const { u, v } = buildPlaneBasis(triA.normal);
            const a2D = ensureCCW2D([
              projectTo2D(triA.p0, u, v),
              projectTo2D(triA.p1, u, v),
              projectTo2D(triA.p2, u, v),
            ]);
            const b2D = ensureCCW2D([
              projectTo2D(triB.p0, u, v),
              projectTo2D(triB.p1, u, v),
              projectTo2D(triB.p2, u, v),
            ]);

            const clipped = clipTriangle2D(b2D, a2D);
            if (clipped.length < 3) continue;

            const { area: overlapArea, cx, cy } = polygonAreaAndCentroid2D(clipped);
            const areaThreshold = Math.max(minOverlapForA, Math.min(triA.area, triB.area) * 0.02);
            if (overlapArea < areaThreshold) continue;

            const overlapWorld = u
              .scale(cx)
              .add(v.scale(cy))
              .add(triA.normal.scale(triA.planeD));

            const orderedFirst = triA.meshIdx <= triB.meshIdx ? triA : triB;
            const orderedSecond = triA.meshIdx <= triB.meshIdx ? triB : triA;
            const orderedMetaA = meshMetas[orderedFirst.meshIdx];
            const orderedMetaB = meshMetas[orderedSecond.meshIdx];

            const planeKey = `${Math.round(triA.cn.x * 20)},${Math.round(triA.cn.y * 20)},${Math.round(triA.cn.z * 20)}@${Math.round(triA.cd / Math.max(0.01, planeTolerance * 3))}`;
            const orientStr: 'same' | 'opposite' = isSameNormal ? 'same' : 'opposite';
            const groupKey = `${orderedMetaA.index}:${orderedMetaB.index}:${orientStr}:${planeKey}`;

            let acc = issueGroups.get(groupKey);
            if (!acc) {
              const kind: 'inter_mesh_coplanar' | 'intra_mesh_coplanar' = isSameMesh
                ? 'intra_mesh_coplanar'
                : 'inter_mesh_coplanar';
              const severity: 'high' | 'medium' =
                isSameNormal || exactDup || isSameMesh ? 'high' : 'medium';
              acc = {
                key: groupKey,
                kind,
                severity,
                meshA: orderedMetaA,
                meshB: orderedMetaB,
                normalOrientation: orientStr,
                planeNormal: orderedFirst.normal.clone(),
                planeOffset: orderedFirst.planeD,
                repFaceIdA: orderedFirst.faceId,
                repFaceIdB: orderedSecond.faceId,
                repNormalA: orderedFirst.normal.clone(),
                repNormalB: orderedSecond.normal.clone(),
                bestPairArea: overlapArea,
                totalOverlapArea: overlapArea,
                weightedPoint: overlapWorld.scale(overlapArea),
                pairCount: 1,
                exactDuplicateVerts: exactDup,
              };
              issueGroups.set(groupKey, acc);
            } else {
              acc.pairCount += 1;
              acc.totalOverlapArea += overlapArea;
              acc.weightedPoint.addInPlace(overlapWorld.scale(overlapArea));
              if (exactDup) acc.exactDuplicateVerts = true;
              if (overlapArea > acc.bestPairArea) {
                acc.bestPairArea = overlapArea;
                acc.repFaceIdA = orderedFirst.faceId;
                acc.repFaceIdB = orderedSecond.faceId;
                acc.repNormalA = orderedFirst.normal.clone();
                acc.repNormalB = orderedSecond.normal.clone();
              }
            }
      }
    }
  }

  const sortedIssues = Array.from(issueGroups.values())
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return b.totalOverlapArea - a.totalOverlapArea;
    })
    .slice(0, maxIssues);

  const issues: ZFightingIssue[] = sortedIssues.map((acc, idx) => {
    const faceDirectionA = classifyFaceDirection(acc.repNormalA);
    const faceDirectionB = classifyFaceDirection(acc.repNormalB);
    const pt = acc.weightedPoint.scale(1 / Math.max(1e-9, acc.totalOverlapArea));
    const areaRounded = Math.round(acc.totalOverlapArea * 10000) / 10000;

    const summary =
      acc.kind === 'intra_mesh_coplanar'
        ? `Self-overlapping coplanar faces inside "${acc.meshA.name}" (${faceDirectionA} face, area ~${areaRounded} m², ${acc.pairCount} overlapping triangle pair(s)).`
        : `Coplanar overlap between "${acc.meshA.name}" (${faceDirectionA}) and "${acc.meshB.name}" (${faceDirectionB}) at (${round3(pt.x)}, ${round3(pt.y)}, ${round3(pt.z)}) (area ~${areaRounded} m², ${acc.normalOrientation} normals).`;

    return {
      id: `zf_${idx + 1}`,
      kind: acc.kind,
      severity: acc.severity,
      meshA: acc.meshA.name,
      meshB: acc.meshB.name,
      faceDirectionA,
      faceDirectionB,
      representativeFaceIdA: acc.repFaceIdA,
      representativeFaceIdB: acc.repFaceIdB,
      normalOrientation: acc.normalOrientation,
      planeNormal: {
        x: round3(acc.planeNormal.x),
        y: round3(acc.planeNormal.y),
        z: round3(acc.planeNormal.z),
      },
      planeOffset: round3(acc.planeOffset),
      overlapPoint: {
        x: round3(pt.x),
        y: round3(pt.y),
        z: round3(pt.z),
      },
      overlapArea: areaRounded,
      overlappingTriPairs: acc.pairCount,
      summary,
      recommendedFixes: buildRecommendedFixes(acc),
    };
  });

  const highSeverityCount = issues.filter((i) => i.severity === 'high').length;

  return {
    hasIssues: issues.length > 0,
    issueCount: issues.length,
    highSeverityCount,
    checkedMeshes: meshMetas.length,
    checkedTriangles: allTris.length,
    issues,
  };
}
