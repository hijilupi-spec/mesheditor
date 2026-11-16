import { Scene, Vector3 } from '@babylonjs/core';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  writeU32BE(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/**
 * Pure TypeScript fallback encoder producing a valid uncompressed PNG data URL
 * when 2D canvas context is unavailable (e.g. headless Node/Vitest environments).
 */
function encodeRawPngDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const dstRow = y * stride;
    raw[dstRow] = 0;
    const srcStart = y * width * 4;
    const srcEnd = Math.min(rgba.length, srcStart + width * 4);
    if (srcEnd > srcStart) {
      raw.set(rgba.subarray(srcStart, srcEnd), dstRow + 1);
    }
  }

  const maxBlock = 65535;
  const numBlocks = Math.max(1, Math.ceil(raw.length / maxBlock));
  const zlib = new Uint8Array(2 + raw.length + numBlocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let zPos = 2;
  let srcPos = 0;
  for (let b = 0; b < numBlocks; b++) {
    const remaining = raw.length - srcPos;
    const blockLen = Math.min(maxBlock, remaining);
    const isFinal = b === numBlocks - 1 ? 1 : 0;
    zlib[zPos++] = isFinal;
    zlib[zPos++] = blockLen & 0xff;
    zlib[zPos++] = (blockLen >>> 8) & 0xff;
    const nlen = blockLen ^ 0xffff;
    zlib[zPos++] = nlen & 0xff;
    zlib[zPos++] = (nlen >>> 8) & 0xff;
    zlib.set(raw.subarray(srcPos, srcPos + blockLen), zPos);
    zPos += blockLen;
    srcPos += blockLen;
  }
  writeU32BE(zlib, zPos, adler32(raw));

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const cIHDR = makePngChunk('IHDR', ihdr);
  const cIDAT = makePngChunk('IDAT', zlib);
  const cIEND = makePngChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(sig.length + cIHDR.length + cIDAT.length + cIEND.length);
  let off = 0;
  png.set(sig, off);
  off += sig.length;
  png.set(cIHDR, off);
  off += cIHDR.length;
  png.set(cIDAT, off);
  off += cIDAT.length;
  png.set(cIEND, off);

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < png.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(png.subarray(i, Math.min(png.length, i + chunkSize))));
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(png).toString('base64')
        : '';
  return b64 ? `data:image/png;base64,${b64}` : '';
}

export class ImageUtils {
  constructor(public scene: Scene) {}

  /**
   * Loads an image from a url
   *
   * @param imageUrl
   * @returns
   */
  static async loadImage(imageUrl: string): Promise<HTMLImageElement> {
    const imgBlob: Blob = await fetch(imageUrl).then((response) => {
      return response.blob();
    });
    const imageBlobUrl = URL.createObjectURL(imgBlob);
    const image = await ImageUtils.imageFromUrl(imageBlobUrl);
    return image;
  }

  static blobUrlFromArrayBuffer(buffer: ArrayBuffer): string {
    return URL.createObjectURL(new Blob([buffer]));
  }

  /**
   * Creates an image from a url
   *
   * @param url
   * @returns image
   */
  static async imageFromUrl(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        // Fallback for environments where decode() rejects on synthetic or data URLs
      }
    } else {
      await new Promise<void>((resolve) => {
        if (image.complete) {
          resolve();
          return;
        }
        image.onload = () => resolve();
        image.onerror = () => resolve();
        setTimeout(resolve, 100);
      });
    }
    return image;
  }

  /**
   * Maps colors from a grayscale value to a color map
   * Uses linear interpolation between the two nearest color stops
   *
   * @param gray
   * @param colorMap
   * @returns
   */
  static mapColors(gray: number, colorMap?: Map<number, number[]>): number[] {
    if (!colorMap || colorMap.size === 0) {
      // Define the default color map
      colorMap = new Map();
      colorMap.set(0, [0, 0, 255]);
      colorMap.set(64, [0, 255, 255]);
      colorMap.set(128, [0, 255, 0]);
      colorMap.set(192, [255, 255, 0]);
      colorMap.set(254, [255, 0, 0]);
    }

    const sortedKeys = Array.from(colorMap.keys()).sort((a, b) => a - b);
    if (sortedKeys.length === 1) {
      const only = colorMap.get(sortedKeys[0]) || [0, 0, 0];
      return [only[0], only[1], only[2]];
    }

    if (gray <= sortedKeys[0]) {
      const first = colorMap.get(sortedKeys[0]) || [0, 0, 0];
      return [first[0], first[1], first[2]];
    }
    const lastKey = sortedKeys[sortedKeys.length - 1];
    if (gray >= lastKey) {
      const last = colorMap.get(lastKey) || [0, 0, 0];
      return [last[0], last[1], last[2]];
    }

    let prev = sortedKeys[0];
    let next = lastKey;

    // Find the two nearest color stops in the color map
    for (const key of sortedKeys) {
      if (gray >= key && key >= prev) {
        prev = key;
      }
      if (gray <= key && key <= next) {
        next = key;
      }
    }

    const prevColor = colorMap.get(prev) || [0, 0, 0];
    const nextColor = colorMap.get(next) || prevColor;

    // Interpolate between the two nearest color stops
    const denom = next - prev;
    const t = denom === 0 ? 0 : (gray - prev) / denom;
    const r = nextColor[0] * t + prevColor[0] * (1 - t);
    const g = nextColor[1] * t + prevColor[1] * (1 - t);
    const b = nextColor[2] * t + prevColor[2] * (1 - t);

    return [r, g, b];
  }

  /**
   * Encodes an RGBA buffer into a PNG data URL using 2D canvas when available,
   * or a pure TypeScript stored-PNG fallback in headless environments.
   */
  static rgbaBufferToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
    const fallback =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
    if (width <= 0 || height <= 0) {
      return fallback;
    }
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.createImageData(width, height);
          imgData.data.set(rgba.subarray(0, width * height * 4));
          ctx.putImageData(imgData, 0, 0);
          const url = canvas.toDataURL('image/png');
          if (url && url.startsWith('data:image')) return url;
        }
      } catch {
        // Fall through to stored PNG encoder
      }
    }
    const rawPngUrl = encodeRawPngDataUrl(rgba, width, height);
    return rawPngUrl || fallback;
  }

  /**
   * Converts a grayscale heightmap RGBA buffer directly into an RGB splat mixmap RGBA buffer.
   */
  static generateMixMapBufferFromHeightMapBuffer(
    heightRgba: Uint8ClampedArray,
    width: number,
    height: number,
    colorMap?: Map<number, number[]>,
  ): Uint8ClampedArray {
    const len = width * height * 4;
    const out = new Uint8ClampedArray(len);
    for (let i = 0; i < len && i < heightRgba.length; i += 4) {
      const r = heightRgba[i];
      const g = heightRgba[i + 1];
      const b = heightRgba[i + 2];
      const a = heightRgba[i + 3] || 255;
      const gray = (r + g + b) / 3;
      const colorValues = this.mapColors(gray, colorMap);
      out[i] = Math.max(0, Math.min(255, Math.round(colorValues[0])));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(colorValues[1])));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(colorValues[2])));
      out[i + 3] = a;
    }
    return out;
  }

  /**
   * Paints a soft-edged green-channel pathway onto an existing mixmap RGBA buffer.
   * Strips existing green weights proportionally into red/blue first so green is reserved for the path texture.
   */
  static paintPathOnMixMapBuffer(
    mixRgba: Uint8ClampedArray,
    width: number,
    height: number,
    pathPoints: Vector3[],
    terrainWidth: number,
    terrainHeight: number,
    pathWidth: number,
  ): Uint8ClampedArray {
    const out = new Uint8ClampedArray(mixRgba);
    if (!pathPoints || pathPoints.length < 2 || width <= 0 || height <= 0 || terrainWidth <= 0 || terrainHeight <= 0) {
      return out;
    }

    // Step 1: Strip green channel from mix map and redistribute proportionally to R and B
    for (let i = 0; i < out.length; i += 4) {
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (g > 0) {
        const rb = r + b;
        if (rb > 0) {
          out[i] = Math.min(255, Math.round(r + g * (r / rb)));
          out[i + 2] = Math.min(255, Math.round(b + g * (b / rb)));
        } else {
          out[i] = Math.round(g / 2);
          out[i + 2] = Math.round(g / 2);
        }
        out[i + 1] = 0;
      }
    }

    // Step 2: Convert world points to pixel coordinates
    const pixelPts: Array<[number, number]> = pathPoints.map((pt) => {
      const u = (pt.x + terrainWidth / 2) / terrainWidth;
      const v = 1 - (pt.z + terrainHeight / 2) / terrainHeight;
      return [u * width, v * height];
    });

    const pixelWidth = Math.max(1, (pathWidth / terrainWidth) * width);
    const coreRadius = pixelWidth * 0.5;
    const outerRadius = pixelWidth;

    const distToSegmentSq = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
      const vx = bx - ax;
      const vy = by - ay;
      const wx = px - ax;
      const wy = py - ay;
      const lenSq = vx * vx + vy * vy;
      if (lenSq <= 1e-8) {
        return wx * wx + wy * wy;
      }
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
      const dx = px - (ax + t * vx);
      const dy = py - (ay + t * vy);
      return dx * dx + dy * dy;
    };

    const outerRadiusSq = outerRadius * outerRadius;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minDistSq = Infinity;
        const cx = x + 0.5;
        const cy = y + 0.5;
        for (let s = 0; s < pixelPts.length - 1; s++) {
          const dSq = distToSegmentSq(
            cx,
            cy,
            pixelPts[s][0],
            pixelPts[s][1],
            pixelPts[s + 1][0],
            pixelPts[s + 1][1],
          );
          if (dSq < minDistSq) {
            minDistSq = dSq;
          }
        }
        if (minDistSq > outerRadiusSq) continue;

        const dist = Math.sqrt(minDistSq);
        let alpha = 0;
        if (dist <= coreRadius) {
          alpha = 1;
        } else {
          const t = (dist - coreRadius) / Math.max(1e-5, outerRadius - coreRadius);
          alpha = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.max(0, t))));
        }

        const idx = (y * width + x) * 4;
        out[idx] = Math.round(out[idx] * (1 - alpha));
        out[idx + 1] = Math.round(out[idx + 1] * (1 - alpha) + 255 * alpha);
        out[idx + 2] = Math.round(out[idx + 2] * (1 - alpha));
        out[idx + 3] = 255;
      }
    }

    return out;
  }

  /**
   * Decodes an image URL or Data URL into an RGBA buffer (optionally resized to targetWidth x targetHeight).
   */
  static async loadImageRgba(
    imageUrl: string,
    targetWidth?: number,
    targetHeight?: number,
  ): Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null> {
    if (typeof document === 'undefined') return null;
    try {
      const img = await ImageUtils.imageFromUrl(imageUrl);
      const w = targetWidth || img.naturalWidth || img.width || 256;
      const h = targetHeight || img.naturalHeight || img.height || 256;
      if (w <= 0 || h <= 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      canvas.remove();
      return { rgba: new Uint8ClampedArray(imgData.data), width: w, height: h };
    } catch {
      return null;
    }
  }

  /**
   * Convert a heightmap image to a mix map image
   *
   * @param image
   * @param colorMap
   * @returns mix map image
   */
  static async generateMixMapFromHeightMap(image: HTMLImageElement, colorMap?: Map<number, number[]>): Promise<HTMLImageElement> {
    // read image pixel by pixel
    const canvas = document.createElement('canvas');
    const w = image.width || 1;
    const h = image.height || 1;
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) {
      const fallbackUrl = ImageUtils.rgbaBufferToDataUrl(new Uint8ClampedArray(w * h * 4), w, h);
      return await ImageUtils.imageFromUrl(fallbackUrl);
    }
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, w, h);
    const outRgba = ImageUtils.generateMixMapBufferFromHeightMapBuffer(imageData.data, w, h, colorMap);
    imageData.data.set(outRgba);
    context.putImageData(imageData, 0, 0);

    const rgbImage = await ImageUtils.imageFromUrl(canvas.toDataURL());

    canvas.remove();

    return rgbImage;
  }

  /**
   * Paint a path onto a mix map image using the green channel.
   * The green channel controls diffuseTexture2 in the TerrainMaterial,
   * so setting it to 255 will show the path texture on the terrain.
   *
   * Uses multi-pass drawing for soft edge transitions.
   *
   * @param mixMapImage The existing mix map image
   * @param pathPoints The path points in world space
   * @param terrainWidth Width of the terrain ground mesh
   * @param terrainHeight Height (depth) of the terrain ground mesh
   * @param pathWidth Width of the path in world units
   * @returns Modified mix map image with path painted
   */
  static async paintPathOnMixMap(
    mixMapImage: HTMLImageElement,
    pathPoints: Vector3[],
    terrainWidth: number,
    terrainHeight: number,
    pathWidth: number
  ): Promise<HTMLImageElement> {
    const canvas = document.createElement('canvas');
    const w = mixMapImage.width || 1;
    const h = mixMapImage.height || 1;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const fallbackUrl = ImageUtils.rgbaBufferToDataUrl(new Uint8ClampedArray(w * h * 4), w, h);
      return await ImageUtils.imageFromUrl(fallbackUrl);
    }
    ctx.drawImage(mixMapImage, 0, 0);

    // Step 1: Strip green channel from entire mix map and redistribute to R/B.
    // This reserves the green channel exclusively for the path texture.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (g > 0) {
        const rb = r + b;
        if (rb > 0) {
          // Redistribute green proportionally to R and B
          data[i] = Math.min(255, Math.round(r + g * (r / rb)));
          data[i + 2] = Math.min(255, Math.round(b + g * (b / rb)));
        } else {
          // No R or B -> split green evenly
          data[i] = Math.round(g / 2);
          data[i + 2] = Math.round(g / 2);
        }
        data[i + 1] = 0; // Clear green
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Step 2: Paint path in green channel
    // Convert world space path width to pixel width
    const pixelWidth = (pathWidth / terrainWidth) * canvas.width;

    /**
     * Convert world coordinates to pixel coordinates on the mix map.
     * The ground mesh goes from -width/2 to +width/2 in X and -height/2 to +height/2 in Z.
     * Image pixel (0,0) is top-left.
     */
    const worldToPixel = (worldX: number, worldZ: number): [number, number] => {
      const u = (worldX + terrainWidth / 2) / terrainWidth;
      const v = 1 - (worldZ + terrainHeight / 2) / terrainHeight;
      return [u * canvas.width, v * canvas.height];
    };

    /** Draw the full path polyline with given style */
    const drawPath = (lineWidth: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < pathPoints.length; i++) {
        const [px, py] = worldToPixel(pathPoints[i].x, pathPoints[i].z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    // Multi-pass drawing for soft edge transitions
    // Outer edge: wide, very transparent
    drawPath(pixelWidth * 2.0, 'rgba(0, 255, 0, 0.15)');
    // Middle edge: medium, semi-transparent
    drawPath(pixelWidth * 1.4, 'rgba(0, 255, 0, 0.3)');
    // Solid core: path width, full green
    drawPath(pixelWidth, 'rgb(0, 255, 0)');

    const result = await ImageUtils.imageFromUrl(canvas.toDataURL());
    canvas.remove();
    return result;
  }

  static async generateCubeTextureImages2(imageUrl: string): Promise<string[]> {
    const image = await ImageUtils.imageFromUrl(imageUrl);

    const columns = 4;
    const rows = 3;

    const width = image.width / columns;
    const height = image.height / rows;
    const cells: Map<number, number[]> = new Map();
    cells.set(0, [1]);
    cells.set(1, [0, 1, 2, 3]);
    cells.set(2, [1]);

    const rotated: Map<string, (context: CanvasRenderingContext2D) => void> = new Map();
    rotated.set('01', (context: CanvasRenderingContext2D) => {
      context.translate(0, height);
      context.rotate(-Math.PI / 2);
    });
    rotated.set('21', (context: CanvasRenderingContext2D) => {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    const urls: string[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (!cells.get(r).includes(c)) {
          continue;
        }
        const sx = c * width;
        const sy = r * height;

        const rotateKey = r + '' + c;
        if (rotated.has(rotateKey)) {
          rotated.get(rotateKey)(context);
        }

        context.drawImage(image, sx, sy, width, height, 0, 0, width, height);

        urls.push(canvas.toDataURL());

        if (rotated.has(rotateKey)) {
          context.resetTransform();
        }

        context.clearRect(0, 0, width, height);
      }
    }

    canvas.remove();

    //mapping: "_px", "_py", "_pz", "_nx", "_ny", "_nz"
    const mappedUrls: string[] = [];
    mappedUrls[0] = urls[2];
    mappedUrls[1] = urls[0];
    mappedUrls[2] = urls[1];
    mappedUrls[3] = urls[4];
    mappedUrls[4] = urls[5];
    mappedUrls[5] = urls[3];

    return mappedUrls;
  }

  static async generateCubeTextureImages(imageUrl: string): Promise<string[]> {
    const image = await ImageUtils.imageFromUrl(imageUrl);

    const columns = 4;
    const rows = 3;

    const width = image.width / columns;
    const height = image.height / rows;

    // Standard cross layout:
    // Row 0:        [py]          (col 1)
    // Row 1: [nx]   [pz]  [px]  [nz]  (col 0-3)
    // Row 2:        [ny]          (col 1)
    const facePositions: { name: string; row: number; col: number }[] = [
      { name: 'py', row: 0, col: 1 },
      { name: 'nx', row: 1, col: 0 },
      { name: 'pz', row: 1, col: 1 },
      { name: 'px', row: 1, col: 2 },
      { name: 'nz', row: 1, col: 3 },
      { name: 'ny', row: 2, col: 1 },
    ];

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    const faceUrls: Record<string, string> = {};

    for (const face of facePositions) {
      const sx = face.col * width;
      const sy = face.row * height;

      context.clearRect(0, 0, width, height);
      context.drawImage(image, sx, sy, width, height, 0, 0, width, height);

      faceUrls[face.name] = canvas.toDataURL();
    }

    canvas.remove();

    // BabylonJS CubeTexture.CreateFromImages expects: [px, py, pz, nx, ny, nz]
    return [faceUrls['px'], faceUrls['py'], faceUrls['pz'], faceUrls['nx'], faceUrls['ny'], faceUrls['nz']];
  }
}
