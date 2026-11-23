import {
  Color3,
  GaussianSplattingMesh,
  Matrix,
  Mesh,
  Quaternion,
  Vector3,
} from '@babylonjs/core';

export const SPLAT_RECORD_BYTES = 32;
export const SPLAT_SH_C0 = 0.28209479177387814;

export interface SplatRecord {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  a: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/**
 * Returns true if the given node is a Babylon.js GaussianSplattingMesh (or subclass such as CompoundMesh).
 */
export function isGaussianSplatMesh(node: any): node is GaussianSplattingMesh {
  if (!node) return false;
  if (node._isGaussianSplatting === true) return true;
  if (node instanceof GaussianSplattingMesh) return true;
  const className = typeof node.getClassName === 'function' ? node.getClassName() : '';
  return className === 'GaussianSplattingMesh' || className === 'GaussianSplattingCompoundMesh';
}

/**
 * Returns true if the node is an internal GaussianSplattingPartProxyMesh.
 */
export function isGaussianSplatProxyMesh(node: any): boolean {
  if (!node) return false;
  const className = typeof node.getClassName === 'function' ? node.getClassName() : '';
  return className === 'GaussianSplattingPartProxyMesh';
}

/**
 * Returns true if the node is a standard triangle Mesh (excludes Gaussian Splatting meshes and proxies).
 */
export function isTriangleMesh(node: any): node is Mesh {
  return node instanceof Mesh && !isGaussianSplatMesh(node) && !isGaussianSplatProxyMesh(node);
}

/**
 * Returns the exact unpadded source splat count for a GaussianSplattingMesh.
 * (Babylon's `mesh.splatCount` returns the GPU index buffer length padded to multiples of 16.)
 */
export function getSplatCount(mesh: GaussianSplattingMesh): number {
  if (mesh.splatsData) {
    return Math.floor(mesh.splatsData.byteLength / SPLAT_RECORD_BYTES);
  }
  return mesh.getTotalVertices();
}

/**
 * Clamps a numeric value to an integer byte in [0, 255].
 */
export function clampByte(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(255, Math.round(val)));
}

/**
 * Reads a single 32-byte `.splat` record at `index`.
 */
export function readSplatRecord(fBuffer: Float32Array, uBuffer: Uint8Array, index: number): SplatRecord {
  const fOff = index * 8;
  const uOff = index * SPLAT_RECORD_BYTES;
  const qw = -(uBuffer[uOff + 28] - 127.5) / 127.5;
  const qx = (uBuffer[uOff + 29] - 127.5) / 127.5;
  const qy = (uBuffer[uOff + 30] - 127.5) / 127.5;
  const qz = (uBuffer[uOff + 31] - 127.5) / 127.5;
  return {
    x: fBuffer[fOff],
    y: fBuffer[fOff + 1],
    z: fBuffer[fOff + 2],
    sx: fBuffer[fOff + 3],
    sy: fBuffer[fOff + 4],
    sz: fBuffer[fOff + 5],
    r: uBuffer[uOff + 24],
    g: uBuffer[uOff + 25],
    b: uBuffer[uOff + 26],
    a: uBuffer[uOff + 27],
    qx,
    qy,
    qz,
    qw,
  };
}

/**
 * Writes a single 32-byte `.splat` record at `index`, encoding a Babylon-space quaternion
 * so `_makeSplat()` reconstructs the exact orientation.
 */
export function writeSplatRecord(
  fBuffer: Float32Array,
  uBuffer: Uint8Array,
  index: number,
  rec: SplatRecord
): void {
  const fOff = index * 8;
  const uOff = index * SPLAT_RECORD_BYTES;
  fBuffer[fOff] = rec.x;
  fBuffer[fOff + 1] = rec.y;
  fBuffer[fOff + 2] = rec.z;
  fBuffer[fOff + 3] = Math.max(1e-5, rec.sx);
  fBuffer[fOff + 4] = Math.max(1e-5, rec.sy);
  fBuffer[fOff + 5] = Math.max(1e-5, rec.sz);

  uBuffer[uOff + 24] = clampByte(rec.r);
  uBuffer[uOff + 25] = clampByte(rec.g);
  uBuffer[uOff + 26] = clampByte(rec.b);
  uBuffer[uOff + 27] = clampByte(rec.a);

  const len = Math.hypot(rec.qx, rec.qy, rec.qz, rec.qw);
  const nx = len > 1e-8 ? rec.qx / len : 0;
  const ny = len > 1e-8 ? rec.qy / len : 0;
  const nz = len > 1e-8 ? rec.qz / len : 0;
  const nw = len > 1e-8 ? rec.qw / len : 1;

  // Negate w so Babylon's _makeSplat (which reads w as -(u[28] - 127.5) / 127.5) recovers +nw
  uBuffer[uOff + 28] = clampByte(-nw * 127.5 + 127.5);
  uBuffer[uOff + 29] = clampByte(nx * 127.5 + 127.5);
  uBuffer[uOff + 30] = clampByte(ny * 127.5 + 127.5);
  uBuffer[uOff + 31] = clampByte(nz * 127.5 + 127.5);
}

/**
 * Parses a CSS hex color string (e.g. "#44aa88") into RGB bytes [0..255].
 */
export function hexToRgbBytes(hex: string): [number, number, number] {
  const normalized = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
  const c = Color3.FromHexString(normalized.length === 7 ? normalized : '#ffffff');
  return [clampByte(c.r * 255), clampByte(c.g * 255), clampByte(c.b * 255)];
}

/**
 * Computes a quaternion rotating +Z (or +Y) onto the given unit normal vector.
 */
export function quaternionFromNormal(normal: Vector3): Quaternion {
  const n = normal.lengthSquared() > 1e-10 ? normal.clone().normalize() : Vector3.Up();
  const up = new Vector3(0, 0, 1);
  const dot = Vector3.Dot(up, n);
  if (dot > 0.9999) {
    return Quaternion.Identity();
  }
  if (dot < -0.9999) {
    return Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  }
  const axis = Vector3.Cross(up, n).normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  return Quaternion.RotationAxis(axis, angle);
}

/**
 * Reflects a `.splat` ArrayBuffer across the XZ plane (`y -> -y` and mirrored quaternion)
 * to convert between Babylon.js (`+Y up`) and standard 3DGS `.splat`/`.ply` (`+Y down`) coordinates.
 */
export function flipSplatsBufferY(splatsData: ArrayBuffer, vertexCount?: number): ArrayBuffer {
  const count = vertexCount ?? Math.floor(splatsData.byteLength / SPLAT_RECORD_BYTES);
  const out = splatsData.slice(0, count * SPLAT_RECORD_BYTES);
  const fBuf = new Float32Array(out);
  const uBuf = new Uint8Array(out);

  for (let i = 0; i < count; i++) {
    const rec = readSplatRecord(fBuf, uBuf, i);
    writeSplatRecord(fBuf, uBuf, i, {
      ...rec,
      y: -rec.y,
      qx: -rec.qx,
      qy: rec.qy,
      qz: -rec.qz,
      qw: rec.qw,
    });
  }

  return out;
}

/**
 * Transforms a `.splat` ArrayBuffer by an arbitrary 4x4 matrix (supporting non-uniform & negative scaling).
 */
export function transformSplatsBuffer(
  splatsData: ArrayBuffer,
  vertexCount: number,
  matrix: Matrix
): ArrayBuffer {
  const out = splatsData.slice(0, vertexCount * SPLAT_RECORD_BYTES);
  const fBuf = new Float32Array(out);
  const uBuf = new Uint8Array(out);

  const scaleVec = new Vector3();
  const rotQuat = new Quaternion();
  const transVec = new Vector3();
  matrix.decompose(scaleVec, rotQuat, transVec);
  rotQuat.normalize();

  const flipX = scaleVec.x < 0;
  const flipY = scaleVec.y < 0;
  const flipZ = scaleVec.z < 0;
  const absSx = Math.max(1e-5, Math.abs(scaleVec.x));
  const absSy = Math.max(1e-5, Math.abs(scaleVec.y));
  const absSz = Math.max(1e-5, Math.abs(scaleVec.z));

  const pos = new Vector3();
  const splatQuat = new Quaternion();
  const combinedQuat = new Quaternion();

  for (let i = 0; i < vertexCount; i++) {
    const rec = readSplatRecord(fBuf, uBuf, i);
    pos.set(rec.x, rec.y, rec.z);
    Vector3.TransformCoordinatesToRef(pos, matrix, pos);

    let qx = rec.qx;
    let qy = rec.qy;
    let qz = rec.qz;
    const qw = rec.qw;
    if (flipX) {
      qy = -qy;
      qz = -qz;
    }
    if (flipY) {
      qx = -qx;
      qz = -qz;
    }
    if (flipZ) {
      qx = -qx;
      qy = -qy;
    }

    splatQuat.set(qx, qy, qz, qw).normalize();
    rotQuat.multiplyToRef(splatQuat, combinedQuat);
    combinedQuat.normalize();

    writeSplatRecord(fBuf, uBuf, i, {
      ...rec,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      sx: rec.sx * absSx,
      sy: rec.sy * absSy,
      sz: rec.sz * absSz,
      qx: combinedQuat.x,
      qy: combinedQuat.y,
      qz: combinedQuat.z,
      qw: combinedQuat.w,
    });
  }

  return out;
}

/**
 * Encodes a 32-byte-per-splat ArrayBuffer into a standard binary little-endian 3DGS `.ply` file buffer.
 */
export function encodeSplatsToPlyBuffer(splatsData: ArrayBuffer, vertexCount?: number): ArrayBuffer {
  const count = vertexCount ?? Math.floor(splatsData.byteLength / SPLAT_RECORD_BYTES);
  const headerLines = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${count}`,
    'property float x',
    'property float y',
    'property float z',
    'property float nx',
    'property float ny',
    'property float nz',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'property float rot_0',
    'property float rot_1',
    'property float rot_2',
    'property float rot_3',
    'end_header\n',
  ];
  const headerBytes = new TextEncoder().encode(headerLines.join('\n'));
  const floatsPerVertex = 17;
  const vertexStride = floatsPerVertex * 4;
  const out = new ArrayBuffer(headerBytes.byteLength + count * vertexStride);
  new Uint8Array(out, 0, headerBytes.byteLength).set(headerBytes);

  const srcF = new Float32Array(splatsData);
  const srcU = new Uint8Array(splatsData);
  const dstView = new DataView(out, headerBytes.byteLength);

  for (let i = 0; i < count; i++) {
    const fOff = i * 8;
    const uOff = i * SPLAT_RECORD_BYTES;
    const rowByte = i * vertexStride;

    const x = srcF[fOff];
    const y = srcF[fOff + 1];
    const z = srcF[fOff + 2];
    const sx = Math.max(1e-6, srcF[fOff + 3]);
    const sy = Math.max(1e-6, srcF[fOff + 4]);
    const sz = Math.max(1e-6, srcF[fOff + 5]);

    const r = srcU[uOff + 24] / 255;
    const g = srcU[uOff + 25] / 255;
    const b = srcU[uOff + 26] / 255;
    const a = Math.max(1e-4, Math.min(1 - 1e-4, srcU[uOff + 27] / 255));

    const fdc0 = (r - 0.5) / SPLAT_SH_C0;
    const fdc1 = (g - 0.5) / SPLAT_SH_C0;
    const fdc2 = (b - 0.5) / SPLAT_SH_C0;
    const logitOpacity = Math.log(a / (1 - a));

    // Match Babylon's _GetSplat quaternion convention: r0=qw, r1=qx, r2=qy, r3=qz
    const rot0 = (srcU[uOff + 28] - 127.5) / 127.5;
    const rot1 = (srcU[uOff + 29] - 127.5) / 127.5;
    const rot2 = (srcU[uOff + 30] - 127.5) / 127.5;
    const rot3 = (srcU[uOff + 31] - 127.5) / 127.5;

    dstView.setFloat32(rowByte, x, true);
    dstView.setFloat32(rowByte + 4, y, true);
    dstView.setFloat32(rowByte + 8, z, true);
    dstView.setFloat32(rowByte + 12, 0, true);
    dstView.setFloat32(rowByte + 16, 0, true);
    dstView.setFloat32(rowByte + 20, 0, true);
    dstView.setFloat32(rowByte + 24, fdc0, true);
    dstView.setFloat32(rowByte + 28, fdc1, true);
    dstView.setFloat32(rowByte + 32, fdc2, true);
    dstView.setFloat32(rowByte + 36, logitOpacity, true);
    dstView.setFloat32(rowByte + 40, Math.log(sx), true);
    dstView.setFloat32(rowByte + 44, Math.log(sy), true);
    dstView.setFloat32(rowByte + 48, Math.log(sz), true);
    dstView.setFloat32(rowByte + 52, rot0, true);
    dstView.setFloat32(rowByte + 56, rot1, true);
    dstView.setFloat32(rowByte + 60, rot2, true);
    dstView.setFloat32(rowByte + 64, rot3, true);
  }

  return out;
}
