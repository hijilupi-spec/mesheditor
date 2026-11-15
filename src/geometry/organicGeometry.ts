import {
  Color3,
  Matrix,
  Mesh,
  MultiMaterial,
  Quaternion,
  SubMesh,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';

export interface TaperedSweepStation {
  pos: Vector3;
  rx: number;
  rz: number;
  twist: number;
}

export interface TaperedSweepStationInput {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz?: number;
  twist?: number;
}

export interface TaperedSweepOptions {
  stations?: TaperedSweepStationInput[];
  path?: Vector3[];
  radius?: number;
  radiusStart?: number;
  radiusEnd?: number;
  radii?: number[];
  ellipticalRatio?: number;
  tubularSegments?: number;
  radialSegments?: number;
  smoothPath?: boolean;
  capStart?: boolean;
  capEnd?: boolean;
  closed?: boolean;
}

export interface RootTipGradientOptions {
  rootColor: string;
  tipColor: string;
  axis?: 'x' | 'y' | 'z';
  power?: number;
  blendStrength?: number;
}

export interface VertexPaintRegion {
  shape: 'axis_band' | 'ellipsoid' | 'tapered_capsule' | 'sphere';
  color: string;
  center?: [number, number, number] | { x?: number; y?: number; z?: number };
  radii?: [number, number, number] | { x?: number; y?: number; z?: number };
  radius?: number;
  start?: [number, number, number] | { x?: number; y?: number; z?: number };
  end?: [number, number, number] | { x?: number; y?: number; z?: number };
  r1?: number;
  r2?: number;
  axis?: 'x' | 'y' | 'z';
  min?: number;
  max?: number;
  softness?: number;
  mirrorX?: boolean;
}

export interface StandProudOptions {
  center?: [number, number, number] | { x?: number; y?: number; z?: number };
  radii?: [number, number, number] | { x?: number; y?: number; z?: number };
  clearance?: number;
}

function parseHexToColor3(hex?: string, fallback = '#d9b38c'): Color3 {
  let clean = (hex || fallback).trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) clean = '#' + clean;
  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
    clean =
      '#' +
      clean
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('');
  }
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return Color3.FromHexString(clean);
  }
  return Color3.FromHexString(fallback);
}

function parseVec3Like(v: any, defX = 0, defY = 0, defZ = 0): Vector3 {
  if (Array.isArray(v)) {
    return new Vector3(
      Number.isFinite(Number(v[0])) ? Number(v[0]) : defX,
      Number.isFinite(Number(v[1])) ? Number(v[1]) : defY,
      Number.isFinite(Number(v[2])) ? Number(v[2]) : defZ
    );
  }
  if (v && typeof v === 'object') {
    return new Vector3(
      Number.isFinite(Number(v.x)) ? Number(v.x) : defX,
      Number.isFinite(Number(v.y)) ? Number(v.y) : defY,
      Number.isFinite(Number(v.z)) ? Number(v.z) : defZ
    );
  }
  return new Vector3(defX, defY, defZ);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function catmullRomVec3(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
  return new Vector3(
    catmullRomScalar(p0.x, p1.x, p2.x, p3.x, t),
    catmullRomScalar(p0.y, p1.y, p2.y, p3.y, t),
    catmullRomScalar(p0.z, p1.z, p2.z, p3.z, t)
  );
}

/**
 * Resamples input stations along a smooth Catmull-Rom spline with interpolated elliptical radii and twist.
 */
function sampleStationsCatmullRom(
  rawStations: TaperedSweepStation[],
  segments: number,
  closed: boolean
): TaperedSweepStation[] {
  const n = rawStations.length;
  if (n < 2) return rawStations;
  const out: TaperedSweepStation[] = [];
  const segCount = Math.max(4, segments);

  for (let i = 0; i <= segCount; i++) {
    const u = i / segCount;
    const scaled = closed ? u * n : u * (n - 1);
    const idx = closed ? Math.floor(scaled) % n : Math.min(n - 2, Math.floor(scaled));
    const localT = scaled - Math.floor(scaled);

    const getStation = (k: number): TaperedSweepStation => {
      if (closed) return rawStations[((k % n) + n) % n];
      return rawStations[Math.max(0, Math.min(n - 1, k))];
    };

    const s0 = getStation(idx - 1);
    const s1 = getStation(idx);
    const s2 = getStation(idx + 1);
    const s3 = getStation(idx + 2);

    out.push({
      pos: catmullRomVec3(s0.pos, s1.pos, s2.pos, s3.pos, localT),
      rx: Math.max(0, catmullRomScalar(s0.rx, s1.rx, s2.rx, s3.rx, localT)),
      rz: Math.max(0, catmullRomScalar(s0.rz, s1.rz, s2.rz, s3.rz, localT)),
      twist: catmullRomScalar(s0.twist, s1.twist, s2.twist, s3.twist, localT),
    });
  }

  // Ensure exact endpoints on open splines
  if (!closed && out.length >= 2) {
    out[0].pos.copyFrom(rawStations[0].pos);
    out[0].rx = Math.max(0, rawStations[0].rx);
    out[0].rz = Math.max(0, rawStations[0].rz);
    out[out.length - 1].pos.copyFrom(rawStations[n - 1].pos);
    out[out.length - 1].rx = Math.max(0, rawStations[n - 1].rx);
    out[out.length - 1].rz = Math.max(0, rawStations[n - 1].rz);
  }
  return out;
}

/**
 * Computes twist-free Parallel Transport Frames along a station spine (eliminates 180-degree Frenet flips).
 */
export function computeParallelTransportFrames(points: Vector3[], closed = false): {
  tangents: Vector3[];
  normals: Vector3[];
  binormals: Vector3[];
} {
  const n = points.length;
  const tangents: Vector3[] = [];
  const normals: Vector3[] = [];
  const binormals: Vector3[] = [];

  if (n === 0) return { tangents, normals, binormals };
  if (n === 1) {
    return {
      tangents: [new Vector3(0, 1, 0)],
      normals: [new Vector3(1, 0, 0)],
      binormals: [new Vector3(0, 0, 1)],
    };
  }

  for (let i = 0; i < n; i++) {
    let t: Vector3;
    if (closed) {
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      t = next.subtract(prev);
    } else if (i === 0) {
      t = points[1].subtract(points[0]);
    } else if (i === n - 1) {
      t = points[n - 1].subtract(points[n - 2]);
    } else {
      t = points[i + 1].subtract(points[i - 1]);
    }
    if (t.lengthSquared() < 1e-10) {
      t = i > 0 ? tangents[i - 1].clone() : new Vector3(0, 1, 0);
    } else {
      t.normalize();
    }
    tangents.push(t);
  }

  // Initial normal frame perpendicular to T[0]
  const refUp = Math.abs(Vector3.Dot(tangents[0], new Vector3(0, 1, 0))) < 0.92
    ? new Vector3(0, 1, 0)
    : new Vector3(1, 0, 0);
  const n0 = Vector3.Cross(refUp, tangents[0]);
  if (n0.lengthSquared() < 1e-10) n0.set(1, 0, 0);
  n0.normalize();
  normals.push(n0);
  binormals.push(Vector3.Cross(tangents[0], n0).normalize());

  for (let i = 1; i < n; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const axis = Vector3.Cross(prevT, currT);
    const axisLenSq = axis.lengthSquared();
    let nextN = normals[i - 1].clone();

    if (axisLenSq > 1e-10) {
      axis.scaleInPlace(1 / Math.sqrt(axisLenSq));
      const cosTheta = Math.max(-1, Math.min(1, Vector3.Dot(prevT, currT)));
      const theta = Math.acos(cosTheta);
      const q = Quaternion.RotationAxis(axis, theta);
      const m = new Matrix();
      Matrix.FromQuaternionToRef(q, m);
      nextN = Vector3.TransformNormal(nextN, m);
    }

    // Re-orthonormalize against currT
    nextN.subtractInPlace(currT.scale(Vector3.Dot(nextN, currT)));
    if (nextN.lengthSquared() < 1e-10) {
      nextN = Vector3.Cross(Math.abs(currT.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), currT);
    }
    nextN.normalize();
    normals.push(nextN);
    binormals.push(Vector3.Cross(currT, nextN).normalize());
  }

  return { tangents, normals, binormals };
}

/**
 * Builds an organic tapered elliptical sweep mesh along a 3D spine using Catmull-Rom smoothing,
 * parallel transport framing (no Frenet flips), per-station elliptical radii (rx, rz, twist),
 * and true single-vertex tip convergence when radii reach zero.
 */
export function buildTaperedSweepVertexData(options: TaperedSweepOptions): VertexData {
  let rawStations: TaperedSweepStation[] = [];
  const ratio = typeof options.ellipticalRatio === 'number' && options.ellipticalRatio > 0 ? options.ellipticalRatio : 1.0;

  if (options.stations && options.stations.length >= 2) {
    rawStations = options.stations.map((s) => {
      const rx = Math.max(0, Number(s.rx));
      const rz = s.rz !== undefined ? Math.max(0, Number(s.rz)) : rx / ratio;
      return {
        pos: new Vector3(Number(s.x) || 0, Number(s.y) || 0, Number(s.z) || 0),
        rx,
        rz,
        twist: Number(s.twist) || 0,
      };
    });
  } else if (options.path && options.path.length >= 2) {
    const p = options.path;
    const baseR = options.radius !== undefined ? Math.max(0, Number(options.radius)) : 0.2;
    const rStart = options.radiusStart !== undefined ? Math.max(0, Number(options.radiusStart)) : baseR;
    const rEnd = options.radiusEnd !== undefined ? Math.max(0, Number(options.radiusEnd)) : baseR;

    rawStations = p.map((pt, i) => {
      const t = p.length > 1 ? i / (p.length - 1) : 0;
      const r =
        options.radii && options.radii[i] !== undefined
          ? Math.max(0, Number(options.radii[i]))
          : rStart + (rEnd - rStart) * t;
      return {
        pos: pt.clone(),
        rx: r,
        rz: r / ratio,
        twist: 0,
      };
    });
  } else {
    throw new Error('buildTaperedSweepVertexData requires at least 2 stations or path points.');
  }

  const closed = !!options.closed;
  const shouldSmooth = options.smoothPath !== false && rawStations.length >= 3;
  const defaultSegs = shouldSmooth ? Math.max(20, (rawStations.length - 1) * 10) : rawStations.length - 1;
  const segCount = options.tubularSegments !== undefined ? Math.max(rawStations.length - 1, Math.round(options.tubularSegments)) : defaultSegs;
  const radialSegs = Math.max(6, Math.min(64, Math.round(options.radialSegments ?? 24)));

  const stations = shouldSmooth || segCount > rawStations.length - 1
    ? sampleStationsCatmullRom(rawStations, segCount, closed)
    : rawStations;

  const points = stations.map((s) => s.pos);
  const { tangents, normals, binormals } = computeParallelTransportFrames(points, closed);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const tipEps = 1e-4;
  const startConverges = !closed && stations[0].rx <= tipEps && stations[0].rz <= tipEps;
  const endConverges = !closed && stations[stations.length - 1].rx <= tipEps && stations[stations.length - 1].rz <= tipEps;

  const firstRingIdx = startConverges ? 1 : 0;
  const lastRingIdx = endConverges ? stations.length - 2 : stations.length - 1;

  // Emit ring vertices
  const ringStarts: number[] = [];
  const ringSpineIndices: number[] = [];

  for (let i = firstRingIdx; i <= lastRingIdx; i++) {
    const st = stations[i];
    const cosTw = Math.cos(st.twist);
    const sinTw = Math.sin(st.twist);
    const nVec = normals[i];
    const bVec = binormals[i];
    const rotN = nVec.scale(cosTw).add(bVec.scale(sinTw));
    const rotB = bVec.scale(cosTw).subtract(nVec.scale(sinTw));

    const rx = Math.max(1e-5, st.rx);
    const rz = Math.max(1e-5, st.rz);
    const vCoord = i / Math.max(1, stations.length - 1);

    ringStarts.push(positions.length / 3);
    ringSpineIndices.push(i);

    for (let j = 0; j <= radialSegs; j++) {
      const uCoord = j / radialSegs;
      const theta = uCoord * Math.PI * 2;
      const cosA = Math.cos(theta);
      const sinA = Math.sin(theta);

      const offset = rotN.scale(cosA * rx).add(rotB.scale(sinA * rz));
      const worldPos = st.pos.add(offset);
      positions.push(worldPos.x, worldPos.y, worldPos.z);
      uvs.push(uCoord, vCoord);
    }
  }

  // Push outward-checked triangle helper compatible with Babylon's ComputeNormals winding
  const pushOutwardTri = (a: number, b: number, c: number, outwardRef: Vector3) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];

    // Babylon VertexData.ComputeNormals uses Cross(p1 - p2, p3 - p2) => Cross(a - b, c - b)
    const abx = ax - bx, aby = ay - by, abz = az - bz;
    const cbx = cx - bx, cby = cy - by, cbz = cz - bz;
    const nx = aby * cbz - abz * cby;
    const ny = abz * cbx - abx * cbz;
    const nz = abx * cby - aby * cbx;

    const dot = nx * outwardRef.x + ny * outwardRef.y + nz * outwardRef.z;
    if (dot >= 0) {
      indices.push(a, b, c);
    } else {
      indices.push(a, c, b);
    }
  };

  // Connect consecutive non-collapsed rings
  for (let r = 0; r < ringStarts.length - 1; r++) {
    const s0 = ringStarts[r];
    const s1 = ringStarts[r + 1];
    const st0 = stations[ringSpineIndices[r]].pos;
    const st1 = stations[ringSpineIndices[r + 1]].pos;
    const midSpine = st0.add(st1).scale(0.5);

    for (let j = 0; j < radialSegs; j++) {
      const a = s0 + j;
      const b = s0 + j + 1;
      const c = s1 + j + 1;
      const d = s1 + j;

      const centroid = new Vector3(
        (positions[a * 3] + positions[b * 3] + positions[c * 3] + positions[d * 3]) * 0.25,
        (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1] + positions[d * 3 + 1]) * 0.25,
        (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2] + positions[d * 3 + 2]) * 0.25
      );
      const radialOut = centroid.subtract(midSpine);
      pushOutwardTri(a, d, b, radialOut);
      pushOutwardTri(b, d, c, radialOut);
    }
  }

  // Handle start convergence or flat cap
  if (ringStarts.length > 0) {
    if (startConverges && options.capStart !== false) {
      const tipIdx = positions.length / 3;
      const tipPos = stations[0].pos;
      positions.push(tipPos.x, tipPos.y, tipPos.z);
      uvs.push(0.5, 0);

      const s0 = ringStarts[0];
      const nextCenter = stations[ringSpineIndices[0]].pos;
      const tipOut = tangents[0].scale(-1);
      for (let j = 0; j < radialSegs; j++) {
        const vA = s0 + j;
        const vB = s0 + j + 1;
        const triCenter = new Vector3(
          (positions[vA * 3] + positions[vB * 3] + tipPos.x) / 3,
          (positions[vA * 3 + 1] + positions[vB * 3 + 1] + tipPos.y) / 3,
          (positions[vA * 3 + 2] + positions[vB * 3 + 2] + tipPos.z) / 3
        );
        const radial = triCenter.subtract(nextCenter).add(tipOut.scale(0.25));
        pushOutwardTri(tipIdx, vB, vA, radial);
      }
    } else if (!closed && options.capStart !== false) {
      const capCenterIdx = positions.length / 3;
      const st = stations[ringSpineIndices[0]];
      positions.push(st.pos.x, st.pos.y, st.pos.z);
      uvs.push(0.5, 0);
      const s0 = ringStarts[0];
      const capNormal = tangents[ringSpineIndices[0]].scale(-1);
      for (let j = 0; j < radialSegs; j++) {
        pushOutwardTri(capCenterIdx, s0 + j + 1, s0 + j, capNormal);
      }
    }

    if (endConverges && options.capEnd !== false) {
      const tipIdx = positions.length / 3;
      const tipPos = stations[stations.length - 1].pos;
      positions.push(tipPos.x, tipPos.y, tipPos.z);
      uvs.push(0.5, 1);

      const sLast = ringStarts[ringStarts.length - 1];
      const prevCenter = stations[ringSpineIndices[ringSpineIndices.length - 1]].pos;
      const tipOut = tangents[stations.length - 1];
      for (let j = 0; j < radialSegs; j++) {
        const vA = sLast + j;
        const vB = sLast + j + 1;
        const triCenter = new Vector3(
          (positions[vA * 3] + positions[vB * 3] + tipPos.x) / 3,
          (positions[vA * 3 + 1] + positions[vB * 3 + 1] + tipPos.y) / 3,
          (positions[vA * 3 + 2] + positions[vB * 3 + 2] + tipPos.z) / 3
        );
        const radial = triCenter.subtract(prevCenter).add(tipOut.scale(0.25));
        pushOutwardTri(tipIdx, vA, vB, radial);
      }
    } else if (!closed && options.capEnd !== false) {
      const capCenterIdx = positions.length / 3;
      const lastStIdx = ringSpineIndices[ringSpineIndices.length - 1];
      const st = stations[lastStIdx];
      positions.push(st.pos.x, st.pos.y, st.pos.z);
      uvs.push(0.5, 1);
      const sLast = ringStarts[ringStarts.length - 1];
      const capNormal = tangents[lastStIdx];
      for (let j = 0; j < radialSegs; j++) {
        pushOutwardTri(capCenterIdx, sLast + j, sLast + j + 1, capNormal);
      }
    }
  }

  const normalsOut = new Array<number>(positions.length).fill(0);
  VertexData.ComputeNormals(positions, indices, normalsOut);

  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normalsOut;
  vd.uvs = uvs;
  return vd;
}

// =========================================================================
// QUAD-AWARE CATMULL-CLARK SUBDIVISION
// =========================================================================

interface PolyFace {
  corners: number[]; // indices into working corner table (pos welded via cornerToWeld, uv/color un-welded)
  materialIndex: number;
}

/**
 * Pairs adjacent nearly-coplanar triangles into quads, then runs true Catmull-Clark
 * subdivision across welded spatial topology while preserving separate UV charts and material slots.
 */
export function subdivideCatmullClarkMesh(
  mesh: Mesh,
  iterations = 1,
  preserveVolume = true
): { faceCount: number; quadCount: number; triangleCount: number; vertexCount: number } {
  const rawPos = mesh.getVerticesData(VertexBuffer.PositionKind);
  const rawIndices = mesh.getIndices();
  if (!rawPos || !rawIndices || rawIndices.length < 3) {
    return { faceCount: 0, quadCount: 0, triangleCount: 0, vertexCount: 0 };
  }

  const rawUVs = mesh.getVerticesData(VertexBuffer.UVKind);
  const rawColors = mesh.getVerticesData(VertexBuffer.ColorKind);
  const hasUVs = !!(rawUVs && rawUVs.length >= (rawPos.length / 3) * 2);
  const hasColors = !!(rawColors && rawColors.length >= (rawPos.length / 3) * 4);

  // Determine material slot per source triangle
  const triCount = Math.floor(rawIndices.length / 3);
  const triMats = new Int32Array(triCount);
  if (mesh.subMeshes && mesh.subMeshes.length > 0) {
    for (const sm of mesh.subMeshes) {
      const s = Math.max(0, Math.floor(sm.indexStart / 3));
      const e = Math.min(triCount, Math.ceil((sm.indexStart + sm.indexCount) / 3));
      for (let t = s; t < e; t++) triMats[t] = sm.materialIndex;
    }
  }

  // Initial spatial positions & attributes
  const posArr = Array.from(rawPos);
  const uvArr = hasUVs ? Array.from(rawUVs!) : [];
  const colArr = hasColors ? Array.from(rawColors!) : [];

  // Weld coincident positions into spatial vertices
  const vertCount = posArr.length / 3;
  const spatialMap = new Map<string, number>();
  const cornerToSpatial: number[] = new Array(vertCount);
  const spatialPositions: number[] = [];

  for (let i = 0; i < vertCount; i++) {
    const x = posArr[i * 3];
    const y = posArr[i * 3 + 1];
    const z = posArr[i * 3 + 2];
    const key = `${Math.round(x * 1e5)}_${Math.round(y * 1e5)}_${Math.round(z * 1e5)}`;
    let sid = spatialMap.get(key);
    if (sid === undefined) {
      sid = spatialPositions.length / 3;
      spatialMap.set(key, sid);
      spatialPositions.push(x, y, z);
    }
    cornerToSpatial[i] = sid;
  }

  // Compute source triangle normals for quad pairing
  const triNormals: Vector3[] = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = rawIndices[t * 3];
    const i1 = rawIndices[t * 3 + 1];
    const i2 = rawIndices[t * 3 + 2];
    const p0 = new Vector3(posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]);
    const p1 = new Vector3(posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]);
    const p2 = new Vector3(posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]);
    const n = Vector3.Cross(p0.subtract(p1), p2.subtract(p1));
    if (n.lengthSquared() > 1e-12) n.normalize();
    triNormals.push(n);
  }

  // Map undirected spatial edge -> incident triangles
  const edgeToTris = new Map<string, Array<{ tri: number; sA: number; sB: number; oppCorner: number }>>();
  for (let t = 0; t < triCount; t++) {
    const corners = [rawIndices[t * 3], rawIndices[t * 3 + 1], rawIndices[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const cA = corners[e];
      const cB = corners[(e + 1) % 3];
      const cOpp = corners[(e + 2) % 3];
      const sA = cornerToSpatial[cA];
      const sB = cornerToSpatial[cB];
      const key = sA < sB ? `${sA}_${sB}` : `${sB}_${sA}`;
      if (!edgeToTris.has(key)) edgeToTris.set(key, []);
      edgeToTris.get(key)!.push({ tri: t, sA, sB, oppCorner: cOpp });
    }
  }

  // Greedily pair triangles sharing an interior edge with matching material & aligned normals into quads
  const usedTri = new Uint8Array(triCount);
  let faces: PolyFace[] = [];

  for (let t = 0; t < triCount; t++) {
    if (usedTri[t]) continue;
    const cornersT = [rawIndices[t * 3], rawIndices[t * 3 + 1], rawIndices[t * 3 + 2]];
    let paired = false;

    for (let e = 0; e < 3 && !paired; e++) {
      const cA = cornersT[e];
      const cB = cornersT[(e + 1) % 3];
      const cOppT = cornersT[(e + 2) % 3];
      const sA = cornerToSpatial[cA];
      const sB = cornerToSpatial[cB];
      const key = sA < sB ? `${sA}_${sB}` : `${sB}_${sA}`;
      const inc = edgeToTris.get(key);
      if (!inc || inc.length !== 2) continue;

      const other = inc[0].tri === t ? inc[1] : inc[0];
      const t2 = other.tri;
      if (usedTri[t2] || triMats[t2] !== triMats[t]) continue;

      // Require reasonably aligned normals (coplanar or mild curvature < 40 deg)
      if (Vector3.Dot(triNormals[t], triNormals[t2]) < 0.76) continue;

      // Also check that the shared edge isn't collinear/degenerate
      const pA = new Vector3(posArr[cA * 3], posArr[cA * 3 + 1], posArr[cA * 3 + 2]);
      const pB = new Vector3(posArr[cB * 3], posArr[cB * 3 + 1], posArr[cB * 3 + 2]);
      if (pA.subtract(pB).lengthSquared() < 1e-10) continue;

      // Quad winding follows T's edge order: cOppT -> cA -> other.oppCorner -> cB
      usedTri[t] = 1;
      usedTri[t2] = 1;
      faces.push({
        corners: [cOppT, cA, other.oppCorner, cB],
        materialIndex: triMats[t],
      });
      paired = true;
    }

    if (!paired) {
      usedTri[t] = 1;
      faces.push({
        corners: cornersT,
        materialIndex: triMats[t],
      });
    }
  }

  let curSpatialPos = spatialPositions;
  let curUv = uvArr;
  let curCol = colArr;
  let curCornerToSpatial = cornerToSpatial;

  const iters = Math.max(1, Math.min(3, Math.round(iterations)));

  for (let iter = 0; iter < iters; iter++) {
    const numSpatial = curSpatialPos.length / 3;
    const faceCount = faces.length;

    // 1. Face Points (spatial centroid)
    const faceSpatialIdx = new Int32Array(faceCount);
    const faceSpatialPos = new Array<number>(faceCount * 3).fill(0);
    for (let f = 0; f < faceCount; f++) {
      const cs = faces[f].corners;
      let fx = 0, fy = 0, fz = 0;
      for (const c of cs) {
        const sid = curCornerToSpatial[c];
        fx += curSpatialPos[sid * 3];
        fy += curSpatialPos[sid * 3 + 1];
        fz += curSpatialPos[sid * 3 + 2];
      }
      const inv = 1 / cs.length;
      faceSpatialPos[f * 3] = fx * inv;
      faceSpatialPos[f * 3 + 1] = fy * inv;
      faceSpatialPos[f * 3 + 2] = fz * inv;
    }

    // 2. Spatial edges & adjacency
    interface SpatialEdgeRecord {
      s0: number;
      s1: number;
      faces: number[];
      edgeSpatialIdx: number;
    }
    const edgeRecords = new Map<string, SpatialEdgeRecord>();
    const spatialIncidentFaces: number[][] = Array.from({ length: numSpatial }, () => []);
    const spatialIncidentEdges: SpatialEdgeRecord[][] = Array.from({ length: numSpatial }, () => []);

    for (let f = 0; f < faceCount; f++) {
      const cs = faces[f].corners;
      for (let k = 0; k < cs.length; k++) {
        const s0 = curCornerToSpatial[cs[k]];
        const s1 = curCornerToSpatial[cs[(k + 1) % cs.length]];
        if (!spatialIncidentFaces[s0].includes(f)) spatialIncidentFaces[s0].push(f);
        const key = s0 < s1 ? `${s0}_${s1}` : `${s1}_${s0}`;
        let rec = edgeRecords.get(key);
        if (!rec) {
          rec = {
            s0: Math.min(s0, s1),
            s1: Math.max(s0, s1),
            faces: [],
            edgeSpatialIdx: -1,
          };
          edgeRecords.set(key, rec);
          spatialIncidentEdges[rec.s0].push(rec);
          if (rec.s1 !== rec.s0) spatialIncidentEdges[rec.s1].push(rec);
        }
        rec.faces.push(f);
      }
    }

    // Build next spatial positions array:
    // [0 .. numSpatial-1] = updated vertex points
    // [numSpatial .. numSpatial+faceCount-1] = face points
    // [numSpatial+faceCount ..] = edge points
    const nextSpatialPos: number[] = [];

    // Compute updated spatial vertex points (Catmull-Clark rule)
    for (let s = 0; s < numSpatial; s++) {
      const px = curSpatialPos[s * 3];
      const py = curSpatialPos[s * 3 + 1];
      const pz = curSpatialPos[s * 3 + 2];
      const incFaces = spatialIncidentFaces[s];
      const incEdges = spatialIncidentEdges[s];
      const boundaryEdges = incEdges.filter((er) => er.faces.length < 2);

      if (incFaces.length === 0 || incEdges.length === 0) {
        nextSpatialPos.push(px, py, pz);
        continue;
      }

      if (boundaryEdges.length >= 2) {
        // Classic Catmull-Clark boundary rule: (6 * P + R0 + R1) / 8
        const r0 = boundaryEdges[0];
        const r1 = boundaryEdges[1];
        const o0 = r0.s0 === s ? r0.s1 : r0.s0;
        const o1 = r1.s0 === s ? r1.s1 : r1.s0;
        const m0x = (px + curSpatialPos[o0 * 3]) * 0.5;
        const m0y = (py + curSpatialPos[o0 * 3 + 1]) * 0.5;
        const m0z = (pz + curSpatialPos[o0 * 3 + 2]) * 0.5;
        const m1x = (px + curSpatialPos[o1 * 3]) * 0.5;
        const m1y = (py + curSpatialPos[o1 * 3 + 1]) * 0.5;
        const m1z = (pz + curSpatialPos[o1 * 3 + 2]) * 0.5;
        nextSpatialPos.push(
          (6 * px + m0x + m1x) / 8,
          (6 * py + m0y + m1y) / 8,
          (6 * pz + m0z + m1z) / 8
        );
      } else {
        const nVal = incEdges.length;
        let avgFx = 0, avgFy = 0, avgFz = 0;
        for (const fIdx of incFaces) {
          avgFx += faceSpatialPos[fIdx * 3];
          avgFy += faceSpatialPos[fIdx * 3 + 1];
          avgFz += faceSpatialPos[fIdx * 3 + 2];
        }
        avgFx /= incFaces.length;
        avgFy /= incFaces.length;
        avgFz /= incFaces.length;

        let avgRx = 0, avgRy = 0, avgRz = 0;
        for (const er of incEdges) {
          const other = er.s0 === s ? er.s1 : er.s0;
          avgRx += (px + curSpatialPos[other * 3]) * 0.5;
          avgRy += (py + curSpatialPos[other * 3 + 1]) * 0.5;
          avgRz += (pz + curSpatialPos[other * 3 + 2]) * 0.5;
        }
        avgRx /= nVal;
        avgRy /= nVal;
        avgRz /= nVal;

        if (nVal <= 2) {
          nextSpatialPos.push((px + avgRx) * 0.5, (py + avgRy) * 0.5, (pz + avgRz) * 0.5);
        } else {
          nextSpatialPos.push(
            (avgFx + 2 * avgRx + (nVal - 3) * px) / nVal,
            (avgFy + 2 * avgRy + (nVal - 3) * py) / nVal,
            (avgFz + 2 * avgRz + (nVal - 3) * pz) / nVal
          );
        }
      }
    }

    // Append face points into nextSpatialPos
    for (let f = 0; f < faceCount; f++) {
      faceSpatialIdx[f] = nextSpatialPos.length / 3;
      nextSpatialPos.push(faceSpatialPos[f * 3], faceSpatialPos[f * 3 + 1], faceSpatialPos[f * 3 + 2]);
    }

    // Compute and append edge points into nextSpatialPos
    for (const rec of edgeRecords.values()) {
      rec.edgeSpatialIdx = nextSpatialPos.length / 3;
      const p0x = curSpatialPos[rec.s0 * 3], p0y = curSpatialPos[rec.s0 * 3 + 1], p0z = curSpatialPos[rec.s0 * 3 + 2];
      const p1x = curSpatialPos[rec.s1 * 3], p1y = curSpatialPos[rec.s1 * 3 + 1], p1z = curSpatialPos[rec.s1 * 3 + 2];

      if (rec.faces.length >= 2) {
        let sumFx = 0, sumFy = 0, sumFz = 0;
        for (let k = 0; k < 2; k++) {
          const fIdx = rec.faces[k];
          sumFx += faceSpatialPos[fIdx * 3];
          sumFy += faceSpatialPos[fIdx * 3 + 1];
          sumFz += faceSpatialPos[fIdx * 3 + 2];
        }
        nextSpatialPos.push(
          (p0x + p1x + sumFx) * 0.25,
          (p0y + p1y + sumFy) * 0.25,
          (p0z + p1z + sumFz) * 0.25
        );
      } else {
        nextSpatialPos.push((p0x + p1x) * 0.5, (p0y + p1y) * 0.5, (p0z + p1z) * 0.5);
      }
    }

    // 3. Emit subdivided quad faces with chart-continuous corners (keeping UV/Color seams intact!)
    const nextCornersToSpatial: number[] = [...curCornerToSpatial];
    const nextUv = hasUVs ? [...curUv] : [];
    const nextCol = hasColors ? [...curCol] : [];
    const nextFaces: PolyFace[] = [];

    const allocAttrCorner = (
      spatialIdx: number,
      u: number,
      v: number,
      r: number,
      g: number,
      b: number,
      a: number
    ): number => {
      const idx = nextCornersToSpatial.length;
      nextCornersToSpatial.push(spatialIdx);
      if (hasUVs) nextUv.push(u, v);
      if (hasColors) nextCol.push(r, g, b, a);
      return idx;
    };

    for (let f = 0; f < faceCount; f++) {
      const cs = faces[f].corners;
      const mIdx = faces[f].materialIndex;
      const m = cs.length;

      // Face center UV and Color
      let fcU = 0, fcV = 0, fcR = 0, fcG = 0, fcB = 0, fcA = 0;
      for (const c of cs) {
        if (hasUVs) {
          fcU += curUv[c * 2];
          fcV += curUv[c * 2 + 1];
        }
        if (hasColors) {
          fcR += curCol[c * 4];
          fcG += curCol[c * 4 + 1];
          fcB += curCol[c * 4 + 2];
          fcA += curCol[c * 4 + 3];
        }
      }
      const invM = 1 / m;
      const faceCenterCorner = allocAttrCorner(
        faceSpatialIdx[f],
        fcU * invM,
        fcV * invM,
        fcR * invM,
        fcG * invM,
        fcB * invM,
        fcA * invM
      );

      // Edge midpoint corners per half-edge k in [0..m-1]
      const edgeCornerIndices: number[] = new Array(m);
      for (let k = 0; k < m; k++) {
        const cA = cs[k];
        const cB = cs[(k + 1) % m];
        const sA = curCornerToSpatial[cA];
        const sB = curCornerToSpatial[cB];
        const key = sA < sB ? `${sA}_${sB}` : `${sB}_${sA}`;
        const rec = edgeRecords.get(key)!;
        edgeCornerIndices[k] = allocAttrCorner(
          rec.edgeSpatialIdx,
          hasUVs ? (curUv[cA * 2] + curUv[cB * 2]) * 0.5 : 0,
          hasUVs ? (curUv[cA * 2 + 1] + curUv[cB * 2 + 1]) * 0.5 : 0,
          hasColors ? (curCol[cA * 4] + curCol[cB * 4]) * 0.5 : 1,
          hasColors ? (curCol[cA * 4 + 1] + curCol[cB * 4 + 1]) * 0.5 : 1,
          hasColors ? (curCol[cA * 4 + 2] + curCol[cB * 4 + 2]) * 0.5 : 1,
          hasColors ? (curCol[cA * 4 + 3] + curCol[cB * 4 + 3]) * 0.5 : 1
        );
      }

      for (let k = 0; k < m; k++) {
        const prevEdgeCorner = edgeCornerIndices[(k - 1 + m) % m];
        nextFaces.push({
          corners: [cs[k], edgeCornerIndices[k], faceCenterCorner, prevEdgeCorner],
          materialIndex: mIdx,
        });
      }
    }

    // Optional mild volume preservation (compensates Catmull-Clark convex hull contraction slightly on coarse cages)
    if (preserveVolume) {
      let cx = 0, cy = 0, cz = 0;
      for (let s = 0; s < curSpatialPos.length / 3; s++) {
        cx += curSpatialPos[s * 3];
        cy += curSpatialPos[s * 3 + 1];
        cz += curSpatialPos[s * 3 + 2];
      }
      const oldN = Math.max(1, curSpatialPos.length / 3);
      cx /= oldN; cy /= oldN; cz /= oldN;

      let oldRms = 0;
      for (let s = 0; s < oldN; s++) {
        oldRms +=
          (curSpatialPos[s * 3] - cx) ** 2 +
          (curSpatialPos[s * 3 + 1] - cy) ** 2 +
          (curSpatialPos[s * 3 + 2] - cz) ** 2;
      }
      oldRms = Math.sqrt(oldRms / oldN);

      const newN = nextSpatialPos.length / 3;
      let newRms = 0;
      for (let s = 0; s < newN; s++) {
        newRms +=
          (nextSpatialPos[s * 3] - cx) ** 2 +
          (nextSpatialPos[s * 3 + 1] - cy) ** 2 +
          (nextSpatialPos[s * 3 + 2] - cz) ** 2;
      }
      newRms = Math.sqrt(newRms / Math.max(1, newN));
      if (oldRms > 1e-5 && newRms > 1e-5 && newRms < oldRms) {
        // Nudge half-way back toward RMS radius so closed shapes retain crisp volume
        const ratioScale = Math.min(1.06, 1 + ((oldRms / newRms) - 1) * 0.45);
        for (let s = 0; s < newN; s++) {
          nextSpatialPos[s * 3] = cx + (nextSpatialPos[s * 3] - cx) * ratioScale;
          nextSpatialPos[s * 3 + 1] = cy + (nextSpatialPos[s * 3 + 1] - cy) * ratioScale;
          nextSpatialPos[s * 3 + 2] = cz + (nextSpatialPos[s * 3 + 2] - cz) * ratioScale;
        }
      }
    }

    curSpatialPos = nextSpatialPos;
    curUv = nextUv;
    curCol = nextCol;
    curCornerToSpatial = nextCornersToSpatial;
    faces = nextFaces;
  }

  // Triangulate resulting poly faces grouped by materialIndex and materialize un-shared/shared buffers
  const finalPositions: number[] = [];
  const finalUVs: number[] = [];
  const finalColors: number[] = [];
  const cornerEmitMap = new Int32Array(curCornerToSpatial.length).fill(-1);

  const getEmittedVert = (c: number): number => {
    if (cornerEmitMap[c] >= 0) return cornerEmitMap[c];
    const sid = curCornerToSpatial[c];
    const vIdx = finalPositions.length / 3;
    finalPositions.push(curSpatialPos[sid * 3], curSpatialPos[sid * 3 + 1], curSpatialPos[sid * 3 + 2]);
    if (hasUVs) finalUVs.push(curUv[c * 2] ?? 0, curUv[c * 2 + 1] ?? 0);
    if (hasColors) finalColors.push(curCol[c * 4] ?? 1, curCol[c * 4 + 1] ?? 1, curCol[c * 4 + 2] ?? 1, curCol[c * 4 + 3] ?? 1);
    cornerEmitMap[c] = vIdx;
    return vIdx;
  };

  // Sort faces by materialIndex so SubMeshes stay contiguous
  const sortedFaces = [...faces].sort((a, b) => a.materialIndex - b.materialIndex);
  const finalIndices: number[] = [];
  const subRanges: Array<{ materialIndex: number; indexStart: number; indexCount: number }> = [];
  let curMat = sortedFaces[0]?.materialIndex ?? 0;
  let rangeStart = 0;

  for (let i = 0; i < sortedFaces.length; i++) {
    const f = sortedFaces[i];
    if (f.materialIndex !== curMat) {
      subRanges.push({ materialIndex: curMat, indexStart: rangeStart, indexCount: finalIndices.length - rangeStart });
      curMat = f.materialIndex;
      rangeStart = finalIndices.length;
    }
    const cs = f.corners;
    const v0 = getEmittedVert(cs[0]);
    for (let k = 1; k + 1 < cs.length; k++) {
      finalIndices.push(v0, getEmittedVert(cs[k]), getEmittedVert(cs[k + 1]));
    }
  }
  if (sortedFaces.length > 0) {
    subRanges.push({ materialIndex: curMat, indexStart: rangeStart, indexCount: finalIndices.length - rangeStart });
  }

  mesh.setVerticesData(VertexBuffer.PositionKind, finalPositions, true);
  mesh.setIndices(finalIndices);
  if (hasUVs) mesh.setVerticesData(VertexBuffer.UVKind, finalUVs, true);
  if (hasColors) mesh.setVerticesData(VertexBuffer.ColorKind, finalColors, true);

  const finalNormals: number[] = [];
  VertexData.ComputeNormals(finalPositions, finalIndices, finalNormals);
  mesh.setVerticesData(VertexBuffer.NormalKind, finalNormals, true);

  if (mesh.material instanceof MultiMaterial || subRanges.length > 1) {
    mesh.subMeshes = [];
    const totalV = finalPositions.length / 3;
    for (const r of subRanges) {
      new SubMesh(r.materialIndex, 0, totalV, r.indexStart, r.indexCount, mesh);
    }
  } else {
    mesh.subMeshes = [];
    new SubMesh(0, 0, finalPositions.length / 3, 0, finalIndices.length, mesh);
  }
  mesh.refreshBoundingInfo();

  return {
    faceCount: faces.length,
    quadCount: faces.filter((f) => f.corners.length === 4).length,
    triangleCount: Math.floor(finalIndices.length / 3),
    vertexCount: finalPositions.length / 3,
  };
}

// =========================================================================
// ROOT-TO-TIP GRADIENTS, 3D SDF VERTEX PAINTING & STAND-PROUD CLEARANCE
// =========================================================================

/**
 * Applies a root-to-tip vertex color gradient along a local axis (hair locks, horns, feathers, leaves, tails).
 */
export function applyRootTipGradient(mesh: Mesh, options: RootTipGradientOptions): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length < 3) return;
  const vertCount = positions.length / 3;
  const axisIdx = options.axis === 'x' ? 0 : options.axis === 'z' ? 2 : 1;

  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const val = positions[i * 3 + axisIdx];
    if (val < minV) minV = val;
    if (val > maxV) maxV = val;
  }
  const span = Math.max(1e-6, maxV - minV);
  const rootC = parseHexToColor3(options.rootColor, '#2e2017');
  const tipC = parseHexToColor3(options.tipColor, '#8c6244');
  const power = typeof options.power === 'number' && options.power > 0 ? options.power : 1.0;
  const strength = options.blendStrength !== undefined ? clamp01(options.blendStrength) : 1.0;

  const existing = mesh.getVerticesData(VertexBuffer.ColorKind);
  const colors = existing && existing.length === vertCount * 4
    ? Array.from(existing)
    : new Array<number>(vertCount * 4).fill(1);

  for (let i = 0; i < vertCount; i++) {
    const rawT = (positions[i * 3 + axisIdx] - minV) / span;
    const t = Math.pow(clamp01(rawT), power);
    const gr = rootC.r + (tipC.r - rootC.r) * t;
    const gg = rootC.g + (tipC.g - rootC.g) * t;
    const gb = rootC.b + (tipC.b - rootC.b) * t;

    if (existing) {
      colors[i * 4] = colors[i * 4] * (1 - strength) + gr * colors[i * 4] * strength;
      colors[i * 4 + 1] = colors[i * 4 + 1] * (1 - strength) + gg * colors[i * 4 + 1] * strength;
      colors[i * 4 + 2] = colors[i * 4 + 2] * (1 - strength) + gb * colors[i * 4 + 2] * strength;
    } else {
      colors[i * 4] = gr;
      colors[i * 4 + 1] = gg;
      colors[i * 4 + 2] = gb;
    }
    colors[i * 4 + 3] = 1.0;
  }

  mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
  mesh.useVertexColors = true;
}

function evalRegionSignedDistance(px: number, py: number, pz: number, region: VertexPaintRegion): number {
  switch (region.shape) {
    case 'axis_band': {
      const axisIdx = region.axis === 'x' ? 0 : region.axis === 'z' ? 2 : 1;
      const coord = axisIdx === 0 ? px : axisIdx === 1 ? py : pz;
      const lo = region.min ?? -0.5;
      const hi = region.max ?? 0.5;
      if (coord < lo) return lo - coord;
      if (coord > hi) return coord - hi;
      return -Math.min(coord - lo, hi - coord);
    }
    case 'tapered_capsule': {
      const a = parseVec3Like(region.start, 0, 0, 0);
      const b = parseVec3Like(region.end, 0, 1, 0);
      const r1 = region.r1 ?? region.radius ?? 0.1;
      const r2 = region.r2 ?? region.radius ?? 0.1;
      const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
      const baDot = bax * bax + bay * bay + baz * baz;
      const h = baDot > 1e-8 ? clamp01(((px - a.x) * bax + (py - a.y) * bay + (pz - a.z) * baz) / baDot) : 0;
      const dx = px - (a.x + bax * h);
      const dy = py - (a.y + bay * h);
      const dz = pz - (a.z + baz * h);
      return Math.hypot(dx, dy, dz) - (r1 + (r2 - r1) * h);
    }
    case 'ellipsoid': {
      const c = parseVec3Like(region.center, 0, 0, 0);
      const r = parseVec3Like(region.radii, 0.25, 0.25, 0.25);
      const rx = Math.max(1e-4, Math.abs(r.x));
      const ry = Math.max(1e-4, Math.abs(r.y));
      const rz = Math.max(1e-4, Math.abs(r.z));
      const lx = px - c.x, ly = py - c.y, lz = pz - c.z;
      const k0 = Math.hypot(lx / rx, ly / ry, lz / rz);
      if (k0 < 1e-8) return -Math.min(rx, ry, rz);
      const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry), lz / (rz * rz));
      return (k0 * (k0 - 1)) / k1;
    }
    case 'sphere':
    default: {
      const c = parseVec3Like(region.center, 0, 0, 0);
      const rad = region.radius ?? 0.2;
      return Math.hypot(px - c.x, py - c.y, pz - c.z) - rad;
    }
  }
}

/**
 * Evaluates 3D signed-distance paint regions across mesh vertices to produce crisp or softly feathered
 * organic surface markings (muzzles, patches, stripes, cheeks, spots) directly into vertex colors.
 */
export function applyVertexPaintRegions(
  mesh: Mesh,
  regions: VertexPaintRegion[],
  baseColorHex?: string
): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length < 3 || !regions || regions.length === 0) return;
  const vertCount = positions.length / 3;

  const existing = mesh.getVerticesData(VertexBuffer.ColorKind);
  const baseC = parseHexToColor3(baseColorHex || '#d9b38c');
  const colors = existing && existing.length === vertCount * 4
    ? Array.from(existing)
    : new Array<number>(vertCount * 4);

  if (!existing || existing.length !== vertCount * 4) {
    for (let i = 0; i < vertCount; i++) {
      colors[i * 4] = baseC.r;
      colors[i * 4 + 1] = baseC.g;
      colors[i * 4 + 2] = baseC.b;
      colors[i * 4 + 3] = 1.0;
    }
  }

  // Expand mirrored X regions
  const expandedRegions: Array<{ reg: VertexPaintRegion; color: Color3; softness: number }> = [];
  for (const reg of regions) {
    const col = parseHexToColor3(reg.color);
    const softness = Math.max(0.002, reg.softness ?? 0.04);
    expandedRegions.push({ reg, color: col, softness });
    if (reg.mirrorX) {
      const c = parseVec3Like(reg.center, 0, 0, 0);
      const s = parseVec3Like(reg.start, 0, 0, 0);
      const e = parseVec3Like(reg.end, 0, 0, 0);
      const mirrored: VertexPaintRegion = {
        ...reg,
        mirrorX: false,
        center: reg.center ? [-c.x, c.y, c.z] : undefined,
        start: reg.start ? [-s.x, s.y, s.z] : undefined,
        end: reg.end ? [-e.x, e.y, e.z] : undefined,
      };
      expandedRegions.push({ reg: mirrored, color: col, softness });
    }
  }

  for (let i = 0; i < vertCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    let r = colors[i * 4];
    let g = colors[i * 4 + 1];
    let b = colors[i * 4 + 2];

    for (const item of expandedRegions) {
      const dist = evalRegionSignedDistance(px, py, pz, item.reg);
      const weight = 1 - smoothstep(0, item.softness, dist);
      if (weight > 1e-4) {
        r = r * (1 - weight) + item.color.r * weight;
        g = g * (1 - weight) + item.color.g * weight;
        b = b * (1 - weight) + item.color.b * weight;
      }
    }

    colors[i * 4] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = 1.0;
  }

  mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
  mesh.useVertexColors = true;
}

/**
 * Ensures vertices stay at least `clearance` outside a reference ellipsoid (for hair caps, belts, armor plates)
 * so conforming shells never clip into the underlying anatomy.
 */
export function applyStandProudOffset(mesh: Mesh, options: StandProudOptions): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || positions.length < 3) return;

  const center = parseVec3Like(options.center, 0, 0, 0);
  const radii = parseVec3Like(options.radii, 0.25, 0.25, 0.25);
  const rx = Math.max(1e-4, Math.abs(radii.x));
  const ry = Math.max(1e-4, Math.abs(radii.y));
  const rz = Math.max(1e-4, Math.abs(radii.z));
  const clearance = Math.max(0.001, options.clearance ?? 0.015);

  const outPos = Array.from(positions);
  const vertCount = outPos.length / 3;

  for (let i = 0; i < vertCount; i++) {
    const vx = outPos[i * 3] - center.x;
    const vy = outPos[i * 3 + 1] - center.y;
    const vz = outPos[i * 3 + 2] - center.z;

    const k0 = Math.hypot(vx / rx, vy / ry, vz / rz);
    if (k0 < 1e-8) continue;
    const k1 = Math.hypot(vx / (rx * rx), vy / (ry * ry), vz / (rz * rz));
    const approxSdf = (k0 * (k0 - 1)) / Math.max(1e-6, k1);

    if (approxSdf < clearance) {
      const pushDist = clearance - approxSdf;
      const gx = (vx / (rx * rx)) / k1;
      const gy = (vy / (ry * ry)) / k1;
      const gz = (vz / (rz * rz)) / k1;
      outPos[i * 3] += gx * pushDist;
      outPos[i * 3 + 1] += gy * pushDist;
      outPos[i * 3 + 2] += gz * pushDist;
    }
  }

  mesh.setVerticesData(VertexBuffer.PositionKind, outPos, true);
  if (indices && indices.length >= 3) {
    const normals: number[] = [];
    VertexData.ComputeNormals(outPos, indices, normals);
    mesh.setVerticesData(VertexBuffer.NormalKind, normals, true);
  }
  mesh.refreshBoundingInfo();
}
