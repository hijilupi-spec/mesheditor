import { CubeTexture, Scene } from '@babylonjs/core';

/**
 * Maps cubemap face index (0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z) and normalized
 * UV coordinates in [-1, 1] to a unit 3D direction vector.
 */
function faceUvToDirection(face: number, u: number, v: number): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  switch (face) {
    case 0: // +X
      x = 1;
      y = -v;
      z = -u;
      break;
    case 1: // -X
      x = -1;
      y = -v;
      z = u;
      break;
    case 2: // +Y
      x = u;
      y = 1;
      z = v;
      break;
    case 3: // -Y
      x = u;
      y = -1;
      z = -v;
      break;
    case 4: // +Z
      x = u;
      y = -v;
      z = 1;
      break;
    default: // -Z
      x = -u;
      y = -v;
      z = -1;
      break;
  }
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Encodes an RGBA top-down buffer into an uncompressed 24-bit BMP data URL
 * without requiring a 2D canvas context.
 */
function encodeRgbaToBmpDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // BMP header
  buf[0] = 0x42;
  buf[1] = 0x4d;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const dstRow = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4;
      const dstIdx = dstRow + x * 3;
      buf[dstIdx] = rgba[srcIdx + 2]; // B
      buf[dstIdx + 1] = rgba[srcIdx + 1]; // G
      buf[dstIdx + 2] = rgba[srcIdx]; // R
    }
  }

  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return `data:image/bmp;base64,${btoa(binary)}`;
}

/**
 * Creates a self-contained procedural daytime sky + urban horizon + sun-lobe
 * CubeTexture for Babylon.js PBR IBL reflections (`scene.environmentTexture`).
 * Uses `CubeTexture.CreateFromImages` with 24-bit BMP data URLs so Babylon
 * generates full WebGL cubemap mipmaps and triggers PBR shader reflection sampling.
 */
export function createProceduralEnvironmentTexture(scene: Scene, size = 64): CubeTexture {
  const faceUrls: string[] = [];

  // Normalized sun direction aligned with key directional light
  const sunLen = Math.hypot(-0.45, 0.72, -0.53);
  const sx = -0.45 / sunLen;
  const sy = 0.72 / sunLen;
  const sz = -0.53 / sunLen;

  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(size * size * 4);
    for (let py = 0; py < size; py++) {
      const v = ((py + 0.5) / size) * 2 - 1;
      for (let px = 0; px < size; px++) {
        const u = ((px + 0.5) / size) * 2 - 1;
        const [dx, dy, dz] = faceUvToDirection(f, u, v);

        let r: number;
        let g: number;
        let b: number;

        if (dy >= 0) {
          // Daytime sky gradient: luminous pale blue at horizon -> deep azure zenith
          const t = Math.pow(Math.min(1, dy), 0.55);
          r = lerp(0.86, 0.08, t);
          g = lerp(0.94, 0.32, t);
          b = lerp(1.0, 0.72, t);

          // Crisp bright cloud bands for high-contrast specular reflections
          const az = Math.atan2(dz, dx);
          const cloud = Math.max(0, Math.sin(az * 3.0 + dy * 7.0) * Math.cos(az * 2.0 - 0.8));
          const cloudMask = Math.max(0, 1 - Math.abs(dy - 0.28) * 3.2) * 0.28 * cloud;
          r = Math.min(1, r + cloudMask);
          g = Math.min(1, g + cloudMask);
          b = Math.min(1, b + cloudMask * 0.95);

          // High-contrast urban skyline silhouettes near the horizon
          const skylineHeight =
            0.03 +
            0.08 * Math.max(0, Math.sin(az * 7.0 + 0.4)) +
            0.055 * Math.max(0, Math.cos(az * 13.0 - 1.2));
          if (dy < skylineHeight) {
            const shade = 0.11 + 0.07 * Math.sin(az * 5.0);
            r = shade * 0.78;
            g = shade * 0.95;
            b = shade * 1.25;
          }
        } else {
          // Dark urban ground / pavement bounce below horizon for strong Fresnel contrast
          const t = Math.min(1, -dy);
          r = lerp(0.16, 0.09, t);
          g = lerp(0.20, 0.11, t);
          b = lerp(0.26, 0.15, t);
        }

        // Sun glow + crisp specular highlight lobe
        const sunDot = Math.max(0, dx * sx + dy * sy + dz * sz);
        const sunGlow = Math.pow(sunDot, 12) * 0.45 + Math.pow(sunDot, 96) * 1.0;
        r = Math.min(1, r + sunGlow * 1.0);
        g = Math.min(1, g + sunGlow * 0.97);
        b = Math.min(1, b + sunGlow * 0.90);

        const idx = (py * size + px) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;
      }
    }
    faceUrls.push(encodeRgbaToBmpDataUrl(data, size, size));
  }

  const cubeTex = CubeTexture.CreateFromImages(faceUrls, scene, false);
  cubeTex.name = 'procedural_daylight_env';
  return cubeTex;
}
