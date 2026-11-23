import {
  Color3,
  FilesInputStore,
  GaussianSplattingMesh,
  Matrix,
  Mesh,
  PBRMaterial,
  Quaternion,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import type { MeshEditorService } from '../MeshEditorService';
import {
  clampByte,
  encodeSplatsToPlyBuffer,
  getSplatCount,
  hexToRgbBytes,
  isGaussianSplatMesh,
  isTriangleMesh,
  quaternionFromNormal,
  readSplatRecord,
  SPLAT_RECORD_BYTES,
  transformSplatsBuffer,
  writeSplatRecord,
} from './GaussianSplatUtils';

export type GaussianSplatPresetKind =
  | 'cloud'
  | 'foliage'
  | 'fire'
  | 'galaxy'
  | 'nebula'
  | 'bush';

export interface GaussianSplatStats {
  name: string;
  splatCount: number;
  renderedSplatCount: number;
  shDegree: number;
  maxShDegree: number;
  minPixelSize: number;
  disableDepthSort: boolean;
  needsRotationScaleTextures: boolean;
  keepInRam: boolean;
  hasEditableData: boolean;
  isCompound: boolean;
  splatSizeRange: { min: number; max: number } | null;
  worldBounds: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
    center: [number, number, number];
  };
}

export interface SplatCleanupOptions {
  minOpacity?: number;
  minScale?: number;
  maxScale?: number;
  cropBoxMin?: [number, number, number];
  cropBoxMax?: [number, number, number];
  cropCenter?: [number, number, number];
  cropRadius?: number;
  sampleStep?: number;
}

export interface SplatAdjustOptions {
  scaleMultiplier?: number;
  opacityMultiplier?: number;
  colorTint?: string;
  tintStrength?: number;
  brightness?: number;
}

export type MeshToSplatsStyle = 'default' | 'foliage' | 'moss' | 'fuzzy';

export interface MeshToSplatsOptions {
  name?: string;
  targetSplatCount?: number;
  splatScale?: number;
  opacity?: number;
  mode?: 'surface' | 'volume';
  splatStyle?: MeshToSplatsStyle;
  colorVariation?: number;
  colorHex?: string;
  jitter?: number;
  removeSource?: boolean;
}

export interface SplatPresetOptions {
  name?: string;
  splatCount?: number;
  radius?: number;
  colorHex?: string;
  opacity?: number;
  seed?: number;
}

function createSeededRandom(seed: number): () => number {
  let s = (seed | 0) || 1337;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function getTextureSizeForCount(count: number, maxTexSize: number = 4096): { width: number; height: number } {
  const width = Math.max(1, Math.min(maxTexSize, Math.max(16, count)));
  const height = Math.max(1, Math.ceil(count / width));
  return { width, height };
}

/**
 * Core controller for importing, generating, editing, cleaning up, merging,
 * and exporting Gaussian Splatting meshes (`GaussianSplattingMesh`).
 */
export class GaussianSplatController {
  private splatCounter = 0;

  constructor(private readonly service: MeshEditorService) {}

  /**
   * Ensures headless/NullEngine environments without global `Worker` disable depth-sort worker creation.
   */
  private ensureHeadlessWorkerSafety(mesh: GaussianSplattingMesh): void {
    if (typeof Worker === 'undefined') {
      mesh.disableDepthSort = true;
    }
  }

  /**
   * Returns all active, non-disposed GaussianSplattingMesh objects in the scene.
   */
  public getAllSplatMeshes(): GaussianSplattingMesh[] {
    return this.service.importedMeshes.filter(
      (m): m is GaussianSplattingMesh =>
        !m.isDisposed() &&
        !this.service.isEditorHelper(m) &&
        (!m.isEnabled || m.isEnabled()) &&
        isGaussianSplatMesh(m)
    );
  }

  /**
   * Returns the currently selected GaussianSplattingMesh, or the first active one if none is selected.
   */
  public getActiveSplatMesh(): GaussianSplattingMesh | null {
    const sel = this.service.selectedMesh;
    if (sel && !sel.isDisposed() && isGaussianSplatMesh(sel)) {
      return sel;
    }
    const all = this.getAllSplatMeshes();
    return all.length > 0 ? all[0] : null;
  }

  /**
   * Returns all editable triangle meshes eligible for Mesh-to-Splats conversion.
   */
  public getConvertibleTriangleMeshes(): Mesh[] {
    return this.service.importedMeshes.filter(
      (m): m is Mesh =>
        !m.isDisposed() &&
        !this.service.isEditorHelper(m) &&
        m.name !== '__root__' &&
        (!m.isEnabled || m.isEnabled()) &&
        isTriangleMesh(m) &&
        m.getTotalVertices() > 0
    );
  }

  /**
   * Finds a GaussianSplattingMesh by name or ID, falling back to active splat mesh if omitted.
   */
  public resolveSplatMesh(nameOrId?: string): GaussianSplattingMesh | null {
    if (nameOrId) {
      const target = nameOrId.trim().toLowerCase();
      const match = this.getAllSplatMeshes().find(
        (m) => m.name.toLowerCase() === target || String(m.id || '').toLowerCase() === target
      );
      if (match) return match;
    }
    return this.getActiveSplatMesh();
  }

  /**
   * Extracts diagnostic and rendering statistics for a GaussianSplattingMesh.
   */
  public getSplatStats(mesh: GaussianSplattingMesh): GaussianSplatStats {
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo()?.boundingBox;
    const min = bb?.minimumWorld || Vector3.Zero();
    const max = bb?.maximumWorld || Vector3.Zero();
    const size = max.subtract(min);
    const center = bb?.centerWorld || mesh.position;
    const splatCount = getSplatCount(mesh);

    return {
      name: mesh.name,
      splatCount,
      renderedSplatCount: mesh.renderedSplatCount ?? splatCount,
      shDegree: mesh.shDegree ?? 0,
      maxShDegree: mesh.maxShDegree ?? 0,
      minPixelSize: mesh.minPixelSize ?? 0,
      disableDepthSort: !!mesh.disableDepthSort,
      needsRotationScaleTextures: !!mesh.needsRotationScaleTextures,
      keepInRam: !!mesh.splatsData,
      hasEditableData: !!mesh.splatsData && splatCount > 0,
      isCompound: !!mesh.isCompound,
      splatSizeRange: mesh.splatSizeRange ? { ...mesh.splatSizeRange } : null,
      worldBounds: {
        min: [Number(min.x.toFixed(4)), Number(min.y.toFixed(4)), Number(min.z.toFixed(4))],
        max: [Number(max.x.toFixed(4)), Number(max.y.toFixed(4)), Number(max.z.toFixed(4))],
        size: [Number(size.x.toFixed(4)), Number(size.y.toFixed(4)), Number(size.z.toFixed(4))],
        center: [Number(center.x.toFixed(4)), Number(center.y.toFixed(4)), Number(center.z.toFixed(4))],
      },
    };
  }

  /**
   * Imports a Gaussian Splatting file (`.splat`, `.ply`, `.spz`, `.sog`) with `keepInRam: true`.
   */
  public async loadSplatFromFile(
    file: File,
    options: { replaceScene?: boolean; flipY?: boolean } = {}
  ): Promise<GaussianSplattingMesh[]> {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const supported = ['.splat', '.ply', '.spz', '.sog', '.json'];
    if (!supported.includes(ext)) {
      throw new Error(`Unsupported Gaussian Splat format "${ext}". Expected .splat, .ply, .spz, or .sog.`);
    }

    if (options.replaceScene) {
      this.service.clearModel();
    }

    FilesInputStore.FilesToLoad[file.name.toLowerCase()] = file;
    const result = await SceneLoader.ImportMeshAsync('', 'file:', file, this.service.scene, undefined, ext, {
      pluginOptions: {
        splat: {
          keepInRam: true,
          flipY: !!options.flipY,
          disableAutoCameraLimits: true,
        },
      },
    } as any);

    const splatMeshes = (result.meshes || []).filter((m): m is GaussianSplattingMesh => isGaussianSplatMesh(m));
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const added: GaussianSplattingMesh[] = [];

    splatMeshes.forEach((m, idx) => {
      m.isPickable = true;
      if (!m.name || m.name === 'GaussianSplattingMesh') {
        m.name = splatMeshes.length === 1 ? baseName : `${baseName}_${idx + 1}`;
      }
      if (!this.service.importedMeshes.includes(m)) {
        this.service.importedMeshes.push(m);
      }
      added.push(m);
    });

    if (added.length === 0) {
      // Fallback: file may have loaded as a standard triangle/point-cloud mesh (e.g. mesh .ply)
      const regularMeshes = (result.meshes || []).filter(
        (m): m is Mesh => m instanceof Mesh && !this.service.isEditorHelper(m)
      );
      for (const m of regularMeshes) {
        m.isPickable = true;
        if (!this.service.importedMeshes.includes(m)) {
          this.service.importedMeshes.push(m);
        }
      }
      if (regularMeshes.length > 0) {
        this.service.selectMesh(regularMeshes[0]);
      }
    } else {
      const prevSelected = [...this.service.selectedNodes];
      this.service.selectMesh(added[0]);
      if (!options.replaceScene) {
        this.service.recordAction({
          name: `Import Splat "${file.name}"`,
          undo: () => {
            this.service.clearSelectionProxy();
            for (const m of added) {
              if (!m.isDisposed()) m.setEnabled(false);
              const i = this.service.importedMeshes.indexOf(m);
              if (i !== -1) this.service.importedMeshes.splice(i, 1);
            }
            this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
          },
          redo: () => {
            this.service.clearSelectionProxy();
            for (const m of added) {
              if (!m.isDisposed()) {
                m.setEnabled(true);
                if (!this.service.importedMeshes.includes(m)) this.service.importedMeshes.push(m);
              }
            }
            this.service.selectMesh(added[0]);
          },
        });
      }
    }

    if (options.replaceScene) {
      this.service.focusOnAll();
    }
    this.service.updateStats();
    this.service.events.onSceneModified?.();
    return added;
  }

  /**
   * Imports a Gaussian Splatting asset from a URL with `keepInRam: true`.
   */
  public async loadSplatFromUrl(
    url: string,
    options: { name?: string; flipY?: boolean; alignToGround?: boolean } = {}
  ): Promise<GaussianSplattingMesh[]> {
    const filename = options.name || url.split('/').pop() || 'splat.splat';
    const lastSlash = url.lastIndexOf('/');
    const rootUrl = lastSlash !== -1 ? url.substring(0, lastSlash + 1) : './';
    const file = lastSlash !== -1 ? url.substring(lastSlash + 1) : url;

    const result = await SceneLoader.ImportMeshAsync('', rootUrl, file, this.service.scene, undefined, undefined, {
      pluginOptions: {
        splat: {
          keepInRam: true,
          flipY: !!options.flipY,
          disableAutoCameraLimits: true,
        },
      },
    } as any);

    const added = (result.meshes || []).filter((m): m is GaussianSplattingMesh => isGaussianSplatMesh(m));
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const prevSelected = [...this.service.selectedNodes];

    added.forEach((m, idx) => {
      m.isPickable = true;
      if (options.name || !m.name || m.name === 'GaussianSplattingMesh') {
        m.name = added.length === 1 ? baseName : `${baseName}_${idx + 1}`;
      }
      if (options.alignToGround) {
        this.alignSplatToGround(m);
      }
      if (!this.service.importedMeshes.includes(m)) {
        this.service.importedMeshes.push(m);
      }
    });

    if (added.length > 0) {
      this.service.selectMesh(added[0]);
      this.service.recordAction({
        name: `Import Splat "${baseName}"`,
        undo: () => {
          this.service.clearSelectionProxy();
          for (const m of added) {
            if (!m.isDisposed()) m.setEnabled(false);
            const i = this.service.importedMeshes.indexOf(m);
            if (i !== -1) this.service.importedMeshes.splice(i, 1);
          }
          this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
        },
        redo: () => {
          this.service.clearSelectionProxy();
          for (const m of added) {
            if (!m.isDisposed()) {
              m.setEnabled(true);
              if (!this.service.importedMeshes.includes(m)) this.service.importedMeshes.push(m);
            }
          }
          this.service.selectMesh(added[0]);
        },
      });
    }

    this.service.updateStats();
    this.service.events.onSceneModified?.();
    return added;
  }

  /**
   * Aligns a GaussianSplattingMesh so its lowest world bounding-box Y rests at Y = 0.
   */
  public alignSplatToGround(mesh: GaussianSplattingMesh): void {
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo()?.boundingBox;
    if (bb && Number.isFinite(bb.minimumWorld.y)) {
      mesh.position.y -= bb.minimumWorld.y;
      mesh.computeWorldMatrix(true);
    }
  }

  /**
   * Creates and registers a new editable `GaussianSplattingMesh` from a 32-byte-per-splat ArrayBuffer.
   */
  public createFromSplatsBuffer(
    name: string,
    buffer: ArrayBuffer,
    options: { flipY?: boolean; shData?: Uint8Array[]; shDegree?: number; alignToGround?: boolean } = {}
  ): GaussianSplattingMesh {
    const splatMesh = new GaussianSplattingMesh(name, null, this.service.scene, true);
    this.ensureHeadlessWorkerSafety(splatMesh);
    splatMesh.isPickable = true;
    splatMesh.updateData(buffer, options.shData, { flipY: !!options.flipY }, undefined, options.shDegree);
    if (options.alignToGround) {
      this.alignSplatToGround(splatMesh);
    }
    this.registerCreatedSplatMesh(splatMesh, `Create Splat "${name}"`);
    return splatMesh;
  }

  private registerCreatedSplatMesh(splatMesh: GaussianSplattingMesh, actionName: string): void {
    const prevSelected = [...this.service.selectedNodes];
    if (!this.service.importedMeshes.includes(splatMesh)) {
      this.service.importedMeshes.push(splatMesh);
    }
    this.service.selectMesh(splatMesh);

    this.service.recordAction({
      name: actionName,
      undo: () => {
        this.service.clearSelectionProxy();
        if (!splatMesh.isDisposed()) splatMesh.setEnabled(false);
        const idx = this.service.importedMeshes.indexOf(splatMesh);
        if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
        this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
      },
      redo: () => {
        this.service.clearSelectionProxy();
        if (!splatMesh.isDisposed()) {
          splatMesh.setEnabled(true);
          if (!this.service.importedMeshes.includes(splatMesh)) {
            this.service.importedMeshes.push(splatMesh);
          }
          this.service.selectMesh(splatMesh);
        }
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
  }

  /**
   * Updates rendering parameters on a GaussianSplattingMesh with Undo/Redo support.
   */
  public setRenderSettings(
    mesh: GaussianSplattingMesh,
    settings: {
      shDegree?: number;
      minPixelSize?: number;
      disableDepthSort?: boolean;
      needsRotationScaleTextures?: boolean;
    }
  ): void {
    const before = {
      shDegree: mesh.shDegree,
      minPixelSize: mesh.minPixelSize,
      disableDepthSort: mesh.disableDepthSort,
      needsRotationScaleTextures: mesh.needsRotationScaleTextures,
    };

    const applySettings = (vals: typeof before) => {
      if (mesh.isDisposed()) return;
      mesh.shDegree = vals.shDegree;
      mesh.minPixelSize = vals.minPixelSize;
      mesh.disableDepthSort = typeof Worker === 'undefined' ? true : vals.disableDepthSort;
      mesh.needsRotationScaleTextures = vals.needsRotationScaleTextures;
    };

    const after = {
      shDegree: settings.shDegree !== undefined ? Math.max(0, Math.min(mesh.maxShDegree, Math.round(settings.shDegree))) : before.shDegree,
      minPixelSize: settings.minPixelSize !== undefined ? Math.max(0, settings.minPixelSize) : before.minPixelSize,
      disableDepthSort: settings.disableDepthSort !== undefined ? !!settings.disableDepthSort : before.disableDepthSort,
      needsRotationScaleTextures:
        settings.needsRotationScaleTextures !== undefined ? !!settings.needsRotationScaleTextures : before.needsRotationScaleTextures,
    };

    applySettings(after);
    this.service.recordAction({
      name: `Update Splat Settings "${mesh.name}"`,
      undo: () => applySettings(before),
      redo: () => applySettings(after),
    });
    this.service.events.onSceneModified?.();
  }

  /**
   * Forces Babylon's `_updateData` to perform a full GPU rebuild instead of reusing cached incremental buffers.
   */
  private forceFullSplatRebuild(mesh: GaussianSplattingMesh): void {
    this.ensureHeadlessWorkerSafety(mesh);
    (mesh as any)._cachedBoundingMin = null;
    (mesh as any)._cachedBoundingMax = null;
  }

  /**
   * Helper to mutate `splatsData` with snapshot Undo/Redo and GPU refresh.
   */
  private applySplatsDataUpdate(
    mesh: GaussianSplattingMesh,
    newBuffer: ArrayBuffer,
    newShData: Uint8Array[] | undefined,
    actionName: string
  ): void {
    const beforeBuffer = mesh.splatsData ? mesh.splatsData.slice(0) : null;
    const beforeSh = mesh.shData ? mesh.shData.map((arr) => new Uint8Array(arr)) : undefined;
    const shDegree = mesh.shDegree;

    this.forceFullSplatRebuild(mesh);
    mesh.updateData(newBuffer, newShData, { flipY: false }, undefined, shDegree);

    if (beforeBuffer) {
      const afterBuffer = newBuffer.slice(0);
      const afterSh = newShData ? newShData.map((arr) => new Uint8Array(arr)) : undefined;
      this.service.recordAction({
        name: actionName,
        undo: () => {
          if (mesh.isDisposed()) return;
          this.forceFullSplatRebuild(mesh);
          mesh.updateData(beforeBuffer.slice(0), beforeSh?.map((a) => new Uint8Array(a)), { flipY: false }, undefined, shDegree);
          this.service.updateStats();
        },
        redo: () => {
          if (mesh.isDisposed()) return;
          this.forceFullSplatRebuild(mesh);
          mesh.updateData(afterBuffer.slice(0), afterSh?.map((a) => new Uint8Array(a)), { flipY: false }, undefined, shDegree);
          this.service.updateStats();
        },
      });
    }

    this.service.updateStats();
    this.service.events.onSceneModified?.();
  }

  /**
   * Filters floaters, crops by bounding box or sphere radius, and optionally decimates a GaussianSplattingMesh.
   */
  public cleanupSplats(
    mesh: GaussianSplattingMesh,
    options: SplatCleanupOptions
  ): { beforeCount: number; afterCount: number; removedCount: number } {
    const raw = mesh.splatsData;
    if (!raw) {
      throw new Error(`"${mesh.name}" does not have splat data retained in RAM (keepInRam must be enabled).`);
    }

    const total = getSplatCount(mesh);
    if (total === 0) {
      return { beforeCount: 0, afterCount: 0, removedCount: 0 };
    }

    const srcF = new Float32Array(raw);
    const srcU = new Uint8Array(raw);

    const minOpacity = options.minOpacity ?? 0;
    const minScale = options.minScale ?? 0;
    const maxScale = options.maxScale && options.maxScale > 0 ? options.maxScale : Infinity;
    const step = Math.max(1, Math.round(options.sampleStep ?? 1));
    const hasBox = Array.isArray(options.cropBoxMin) && Array.isArray(options.cropBoxMax);
    const hasRadius = typeof options.cropRadius === 'number' && options.cropRadius > 0;
    const rSq = hasRadius ? options.cropRadius! * options.cropRadius! : Infinity;
    const cCenter = options.cropCenter || [0, 0, 0];

    const keptIndices: number[] = [];
    let keptIdxCounter = 0;

    for (let i = 0; i < total; i++) {
      const fOff = i * 8;
      const uOff = i * SPLAT_RECORD_BYTES;
      const x = srcF[fOff];
      const y = srcF[fOff + 1];
      const z = srcF[fOff + 2];
      const sx = srcF[fOff + 3];
      const sy = srcF[fOff + 4];
      const sz = srcF[fOff + 5];
      const maxAxisScale = Math.max(sx, sy, sz);
      const minAxisScale = Math.min(sx, sy, sz);
      const opacity = srcU[uOff + 27] / 255;

      if (opacity < minOpacity) continue;
      if (minAxisScale < minScale || maxAxisScale > maxScale) continue;

      if (hasBox) {
        const bMin = options.cropBoxMin!;
        const bMax = options.cropBoxMax!;
        if (
          x < bMin[0] || x > bMax[0] ||
          y < bMin[1] || y > bMax[1] ||
          z < bMin[2] || z > bMax[2]
        ) {
          continue;
        }
      }

      if (hasRadius) {
        const dx = x - cCenter[0];
        const dy = y - cCenter[1];
        const dz = z - cCenter[2];
        if (dx * dx + dy * dy + dz * dz > rSq) {
          continue;
        }
      }

      if (step > 1 && keptIdxCounter % step !== 0) {
        keptIdxCounter++;
        continue;
      }
      keptIdxCounter++;
      keptIndices.push(i);
    }

    if (keptIndices.length === 0) {
      throw new Error('Cleanup/crop filters would remove every splat. Relax thresholds or crop bounds.');
    }

    const nextCount = keptIndices.length;
    if (nextCount === total) {
      return { beforeCount: total, afterCount: total, removedCount: 0 };
    }

    const nextBuf = new ArrayBuffer(nextCount * SPLAT_RECORD_BYTES);
    const srcBytes = new Uint8Array(raw);
    const dstBytes = new Uint8Array(nextBuf);
    for (let dstIdx = 0; dstIdx < nextCount; dstIdx++) {
      const srcIdx = keptIndices[dstIdx];
      dstBytes.set(
        srcBytes.subarray(srcIdx * SPLAT_RECORD_BYTES, (srcIdx + 1) * SPLAT_RECORD_BYTES),
        dstIdx * SPLAT_RECORD_BYTES
      );
    }

    let nextSh: Uint8Array[] | undefined;
    if (mesh.shData && mesh.shData.length > 0 && mesh.shDegree > 0) {
      const maxTex = this.service.engine.getCaps?.().maxTextureSize || 4096;
      const texSize = getTextureSizeForCount(nextCount, maxTex);
      const texBytes = texSize.width * texSize.height * 16;
      nextSh = mesh.shData.map((srcArr) => {
        const dstArr = new Uint8Array(texBytes).fill(128);
        for (let dstIdx = 0; dstIdx < nextCount; dstIdx++) {
          const srcIdx = keptIndices[dstIdx];
          dstArr.set(srcArr.subarray(srcIdx * 16, srcIdx * 16 + 16), dstIdx * 16);
        }
        return dstArr;
      });
    }

    this.applySplatsDataUpdate(mesh, nextBuf, nextSh, `Clean Splats "${mesh.name}"`);
    return {
      beforeCount: total,
      afterCount: nextCount,
      removedCount: total - nextCount,
    };
  }

  /**
   * Adjusts splat scale, opacity, brightness, or color tint across all splats in the mesh.
   */
  public adjustSplats(mesh: GaussianSplattingMesh, options: SplatAdjustOptions): number {
    const raw = mesh.splatsData;
    if (!raw) {
      throw new Error(`"${mesh.name}" does not have splat data retained in RAM (keepInRam must be enabled).`);
    }

    const total = getSplatCount(mesh);
    const nextBuf = raw.slice(0, total * SPLAT_RECORD_BYTES);
    const fBuf = new Float32Array(nextBuf);
    const uBuf = new Uint8Array(nextBuf);

    const scaleMult = Math.max(0.01, options.scaleMultiplier ?? 1);
    const opacityMult = Math.max(0, options.opacityMultiplier ?? 1);
    const brightness = Math.max(0, options.brightness ?? 1);
    const tintStrength = Math.max(0, Math.min(1, options.tintStrength ?? 0));
    const tintRgb = options.colorTint ? hexToRgbBytes(options.colorTint) : null;

    for (let i = 0; i < total; i++) {
      const fOff = i * 8;
      const uOff = i * SPLAT_RECORD_BYTES;

      if (scaleMult !== 1) {
        fBuf[fOff + 3] *= scaleMult;
        fBuf[fOff + 4] *= scaleMult;
        fBuf[fOff + 5] *= scaleMult;
      }

      if (opacityMult !== 1) {
        uBuf[uOff + 27] = clampByte(uBuf[uOff + 27] * opacityMult);
      }

      if (brightness !== 1 || (tintRgb && tintStrength > 0)) {
        let r = uBuf[uOff + 24] * brightness;
        let g = uBuf[uOff + 25] * brightness;
        let b = uBuf[uOff + 26] * brightness;
        if (tintRgb && tintStrength > 0) {
          r = r * (1 - tintStrength) + tintRgb[0] * tintStrength;
          g = g * (1 - tintStrength) + tintRgb[1] * tintStrength;
          b = b * (1 - tintStrength) + tintRgb[2] * tintStrength;
        }
        uBuf[uOff + 24] = clampByte(r);
        uBuf[uOff + 25] = clampByte(g);
        uBuf[uOff + 26] = clampByte(b);
      }
    }

    const existingSh = mesh.shData ? mesh.shData.map((a) => new Uint8Array(a)) : undefined;
    this.applySplatsDataUpdate(mesh, nextBuf, existingSh, `Adjust Splats "${mesh.name}"`);
    return total;
  }

  /**
   * Bakes the mesh's current position, rotation, and scaling (including non-uniform scaling)
   * directly into `splatsData` and resets its TransformNode transform to identity.
   */
  public bakeTransform(mesh: GaussianSplattingMesh, alignToGround: boolean = false): void {
    const raw = mesh.splatsData;
    if (!raw) {
      throw new Error(`"${mesh.name}" does not have splat data retained in RAM (keepInRam must be enabled).`);
    }

    mesh.computeWorldMatrix(true);
    const total = getSplatCount(mesh);
    const beforeBuffer = raw.slice(0);
    const beforePos = mesh.position.clone();
    const beforeRot = mesh.rotation.clone();
    const beforeQuat = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;
    const beforeScale = mesh.scaling.clone();

    let bakedBuffer = transformSplatsBuffer(raw, total, mesh.getWorldMatrix());
    if (alignToGround) {
      // Shift baked Y positions so minY = 0
      const fBuf = new Float32Array(bakedBuffer);
      let minY = Infinity;
      for (let i = 0; i < total; i++) {
        if (fBuf[i * 8 + 1] < minY) minY = fBuf[i * 8 + 1];
      }
      if (Number.isFinite(minY) && Math.abs(minY) > 1e-6) {
        for (let i = 0; i < total; i++) {
          fBuf[i * 8 + 1] -= minY;
        }
      }
    }

    const shData = mesh.shData ? mesh.shData.map((a) => new Uint8Array(a)) : undefined;
    const shDegree = mesh.shDegree;

    const resetTransform = () => {
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.rotationQuaternion = null;
      mesh.scaling.set(1, 1, 1);
      mesh.computeWorldMatrix(true);
    };

    this.forceFullSplatRebuild(mesh);
    resetTransform();
    mesh.updateData(bakedBuffer, shData, { flipY: false }, undefined, shDegree);

    this.service.recordAction({
      name: `Bake Splat Transform "${mesh.name}"`,
      undo: () => {
        if (mesh.isDisposed()) return;
        mesh.position.copyFrom(beforePos);
        mesh.rotation.copyFrom(beforeRot);
        mesh.rotationQuaternion = beforeQuat ? beforeQuat.clone() : null;
        mesh.scaling.copyFrom(beforeScale);
        mesh.computeWorldMatrix(true);
        this.forceFullSplatRebuild(mesh);
        mesh.updateData(beforeBuffer.slice(0), shData?.map((a) => new Uint8Array(a)), { flipY: false }, undefined, shDegree);
        this.service.updateStats();
      },
      redo: () => {
        if (mesh.isDisposed()) return;
        resetTransform();
        this.forceFullSplatRebuild(mesh);
        mesh.updateData(bakedBuffer.slice(0), shData?.map((a) => new Uint8Array(a)), { flipY: false }, undefined, shDegree);
        this.service.updateStats();
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
  }

  /**
   * Merges multiple editable `GaussianSplattingMesh` objects into one unified `GaussianSplattingMesh`
   * by baking each source's world transform into a combined `.splat` buffer.
   */
  public mergeSplatMeshes(
    sources: GaussianSplattingMesh[],
    name?: string,
    removeSources: boolean = true
  ): GaussianSplattingMesh {
    const valid = sources.filter((m) => !m.isDisposed() && isGaussianSplatMesh(m));
    if (valid.length < 2) {
      throw new Error('At least 2 Gaussian Splat meshes are required to merge.');
    }

    let totalCount = 0;
    const bakedParts: { buffer: ArrayBuffer; count: number }[] = [];
    for (const src of valid) {
      if (!src.splatsData) {
        throw new Error(`"${src.name}" cannot be merged because keepInRam data is unavailable.`);
      }
      src.computeWorldMatrix(true);
      const count = getSplatCount(src);
      const baked = transformSplatsBuffer(src.splatsData, count, src.getWorldMatrix());
      bakedParts.push({ buffer: baked, count });
      totalCount += count;
    }

    const mergedBuf = new ArrayBuffer(totalCount * SPLAT_RECORD_BYTES);
    const dst = new Uint8Array(mergedBuf);
    let byteOffset = 0;
    for (const part of bakedParts) {
      const partBytes = new Uint8Array(part.buffer, 0, part.count * SPLAT_RECORD_BYTES);
      dst.set(partBytes, byteOffset);
      byteOffset += partBytes.byteLength;
    }

    this.splatCounter++;
    const mergedName = name?.trim() || `merged_splat_${this.splatCounter}`;
    const mergedMesh = new GaussianSplattingMesh(mergedName, null, this.service.scene, true);
    this.ensureHeadlessWorkerSafety(mergedMesh);
    mergedMesh.isPickable = true;
    mergedMesh.updateData(mergedBuf, undefined, { flipY: false });

    const prevSelected = [...this.service.selectedNodes];
    if (removeSources) {
      for (const src of valid) {
        src.setEnabled(false);
        const idx = this.service.importedMeshes.indexOf(src);
        if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
      }
    }
    this.service.importedMeshes.push(mergedMesh);
    this.service.selectMesh(mergedMesh);

    this.service.recordAction({
      name: `Merge ${valid.length} Splat Clouds into "${mergedName}"`,
      undo: () => {
        this.service.clearSelectionProxy();
        if (!mergedMesh.isDisposed()) mergedMesh.setEnabled(false);
        const mIdx = this.service.importedMeshes.indexOf(mergedMesh);
        if (mIdx !== -1) this.service.importedMeshes.splice(mIdx, 1);
        if (removeSources) {
          for (const src of valid) {
            if (!src.isDisposed()) {
              src.setEnabled(true);
              if (!this.service.importedMeshes.includes(src)) this.service.importedMeshes.push(src);
            }
          }
        }
        this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
      },
      redo: () => {
        this.service.clearSelectionProxy();
        if (removeSources) {
          for (const src of valid) {
            if (!src.isDisposed()) src.setEnabled(false);
            const idx = this.service.importedMeshes.indexOf(src);
            if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
          }
        }
        if (!mergedMesh.isDisposed()) {
          mergedMesh.setEnabled(true);
          if (!this.service.importedMeshes.includes(mergedMesh)) this.service.importedMeshes.push(mergedMesh);
          this.service.selectMesh(mergedMesh);
        }
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
    return mergedMesh;
  }

  /**
   * Samples a standard triangle Mesh (surface triangles or bounding volume) into a GaussianSplattingMesh.
   */
  public convertMeshToSplats(
    sourceMesh: Mesh,
    options: MeshToSplatsOptions = {}
  ): { splatMesh: GaussianSplattingMesh; splatCount: number } {
    if (!isTriangleMesh(sourceMesh)) {
      const label = (sourceMesh as any)?.name || 'object';
      throw new Error(`"${label}" is not a standard triangle mesh.`);
    }

    const positions = sourceMesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = sourceMesh.getIndices();
    if (!positions || positions.length < 9) {
      throw new Error(`"${sourceMesh.name}" does not contain vertex positions.`);
    }

    const colorsData = sourceMesh.getVerticesData(VertexBuffer.ColorKind);
    const normalsData = sourceMesh.getVerticesData(VertexBuffer.NormalKind);
    const uvsData = sourceMesh.getVerticesData(VertexBuffer.UVKind);

    sourceMesh.computeWorldMatrix(true);
    const worldMat = sourceMesh.getWorldMatrix();

    // Extract base color from material if no vertex colors exist
    let fallbackRgb: [number, number, number] = [210, 215, 225];
    if (options.colorHex) {
      fallbackRgb = hexToRgbBytes(options.colorHex);
    } else if (sourceMesh.material instanceof PBRMaterial) {
      const c = sourceMesh.material.albedoColor;
      fallbackRgb = [clampByte(c.r * 255), clampByte(c.g * 255), clampByte(c.b * 255)];
    } else if (sourceMesh.material instanceof StandardMaterial) {
      const c = sourceMesh.material.diffuseColor;
      fallbackRgb = [clampByte(c.r * 255), clampByte(c.g * 255), clampByte(c.b * 255)];
    }

    const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9);
    if (triCount === 0) {
      throw new Error(`"${sourceMesh.name}" has zero triangles.`);
    }

    // Compute world-space triangle areas for area-weighted sampling
    const triAreas = new Float64Array(triCount);
    const pA = new Vector3();
    const pB = new Vector3();
    const pC = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const cross = new Vector3();
    let totalArea = 0;

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;

      pA.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      pB.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      pC.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

      Vector3.TransformCoordinatesToRef(pA, worldMat, pA);
      Vector3.TransformCoordinatesToRef(pB, worldMat, pB);
      Vector3.TransformCoordinatesToRef(pC, worldMat, pC);

      pB.subtractToRef(pA, edge1);
      pC.subtractToRef(pA, edge2);
      Vector3.CrossToRef(edge1, edge2, cross);
      const area = 0.5 * cross.length();
      totalArea += area;
      triAreas[t] = totalArea;
    }

    const targetCount = Math.max(64, Math.min(200000, Math.round(options.targetSplatCount ?? 4000)));
    const avgTriArea = totalArea / Math.max(1, targetCount);
    // Cap autoScale so large meshes sample crisp splats instead of huge blurry blobs
    const autoScale = Math.max(0.006, Math.min(0.055, Math.sqrt(avgTriArea) * 0.35));
    const splatScale = options.splatScale && options.splatScale > 0 ? options.splatScale : autoScale;
    const alphaByte = clampByte((options.opacity ?? 0.92) * 255);
    const jitter = Math.max(0, options.jitter ?? 0);
    const isVolume = options.mode === 'volume';
    const splatStyle: MeshToSplatsStyle = options.splatStyle || 'default';
    const colorVar = Math.max(0, Math.min(0.5, options.colorVariation ?? (splatStyle === 'foliage' || splatStyle === 'moss' ? 0.16 : 0)));

    const rand = createSeededRandom(42 + triCount);
    const buf = new ArrayBuffer(targetCount * SPLAT_RECORD_BYTES);
    const fBuf = new Float32Array(buf);
    const uBuf = new Uint8Array(buf);

    const bb = sourceMesh.getBoundingInfo().boundingBox;
    const worldCenter = bb.centerWorld.clone();

    const nA = new Vector3();
    const nB = new Vector3();
    const nC = new Vector3();
    const samplePos = new Vector3();
    const sampleNormal = new Vector3();

    const findTriangleByArea = (target: number): number => {
      let lo = 0;
      let hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (triAreas[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    for (let s = 0; s < targetCount; s++) {
      const rArea = rand() * (totalArea > 0 ? totalArea : 1);
      const t = totalArea > 0 ? findTriangleByArea(rArea) : s % triCount;

      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;

      const u = rand();
      const v = rand();
      const sqrtU = Math.sqrt(u);
      const w0 = 1 - sqrtU;
      const w1 = sqrtU * (1 - v);
      const w2 = sqrtU * v;

      pA.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      pB.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      pC.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
      Vector3.TransformCoordinatesToRef(pA, worldMat, pA);
      Vector3.TransformCoordinatesToRef(pB, worldMat, pB);
      Vector3.TransformCoordinatesToRef(pC, worldMat, pC);

      samplePos.set(
        pA.x * w0 + pB.x * w1 + pC.x * w2,
        pA.y * w0 + pB.y * w1 + pC.y * w2,
        pA.z * w0 + pB.z * w1 + pC.z * w2
      );

      if (isVolume) {
        // Pull inward toward mesh center with cubic bias for volumetric fill
        const tVol = Math.pow(rand(), 0.45);
        Vector3.LerpToRef(worldCenter, samplePos, tVol, samplePos);
      }

      if (jitter > 0) {
        samplePos.x += (rand() - 0.5) * 2 * jitter;
        samplePos.y += (rand() - 0.5) * 2 * jitter;
        samplePos.z += (rand() - 0.5) * 2 * jitter;
      }

      if (normalsData) {
        nA.set(normalsData[i0 * 3], normalsData[i0 * 3 + 1], normalsData[i0 * 3 + 2]);
        nB.set(normalsData[i1 * 3], normalsData[i1 * 3 + 1], normalsData[i1 * 3 + 2]);
        nC.set(normalsData[i2 * 3], normalsData[i2 * 3 + 1], normalsData[i2 * 3 + 2]);
        sampleNormal.set(
          nA.x * w0 + nB.x * w1 + nC.x * w2,
          nA.y * w0 + nB.y * w1 + nC.y * w2,
          nA.z * w0 + nB.z * w1 + nC.z * w2
        );
        Vector3.TransformNormalToRef(sampleNormal, worldMat, sampleNormal);
      } else {
        pB.subtractToRef(pA, edge1);
        pC.subtractToRef(pA, edge2);
        Vector3.CrossToRef(edge1, edge2, sampleNormal);
      }
      if (sampleNormal.lengthSquared() > 1e-10) sampleNormal.normalize();
      else sampleNormal.set(0, 1, 0);

      let q: Quaternion;
      if (splatStyle === 'foliage') {
        const baseQ = quaternionFromNormal(sampleNormal);
        const twistQ = Quaternion.RotationYawPitchRoll(
          (rand() - 0.5) * 1.1,
          (rand() - 0.5) * 0.9,
          rand() * Math.PI * 2
        );
        q = baseQ.multiply(twistQ);
      } else if (isVolume) {
        q = Quaternion.RotationYawPitchRoll(rand() * Math.PI * 2, rand() * Math.PI, rand() * Math.PI);
      } else {
        q = quaternionFromNormal(sampleNormal);
      }

      let rByte = fallbackRgb[0];
      let gByte = fallbackRgb[1];
      let bByte = fallbackRgb[2];
      if (!options.colorHex && colorsData && colorsData.length >= (Math.max(i0, i1, i2) + 1) * 4) {
        rByte = clampByte((colorsData[i0 * 4] * w0 + colorsData[i1 * 4] * w1 + colorsData[i2 * 4] * w2) * 255);
        gByte = clampByte((colorsData[i0 * 4 + 1] * w0 + colorsData[i1 * 4 + 1] * w1 + colorsData[i2 * 4 + 1] * w2) * 255);
        bByte = clampByte((colorsData[i0 * 4 + 2] * w0 + colorsData[i1 * 4 + 2] * w1 + colorsData[i2 * 4 + 2] * w2) * 255);
      } else if (!options.colorHex && uvsData) {
        // Subtle spatial shading variation so untextured surfaces retain depth perception
        const shade = 0.88 + 0.12 * Math.max(-1, Math.min(1, sampleNormal.y));
        rByte = clampByte(rByte * shade);
        gByte = clampByte(gByte * shade);
        bByte = clampByte(bByte * shade);
      }

      if (colorVar > 0) {
        const lightShift = 1 + (rand() - 0.45) * 2 * colorVar;
        const warmShift = (rand() - 0.5) * colorVar * 60;
        rByte = clampByte(rByte * lightShift + warmShift);
        gByte = clampByte(gByte * lightShift + warmShift * 0.5);
        bByte = clampByte(bByte * lightShift * 0.92);
      }

      let sx = splatScale;
      let sy = splatScale;
      let sz = isVolume ? splatScale * 0.9 : splatScale * 0.25;
      if (splatStyle === 'foliage') {
        const sizeVar = 0.75 + rand() * 0.55;
        sx = splatScale * 1.85 * sizeVar;
        sy = splatScale * 0.62 * sizeVar;
        sz = splatScale * 0.16;
      } else if (splatStyle === 'moss') {
        const sizeVar = 0.7 + rand() * 0.6;
        sx = splatScale * 0.72 * sizeVar;
        sy = splatScale * 0.72 * sizeVar;
        sz = splatScale * 0.52 * sizeVar;
      } else if (splatStyle === 'fuzzy') {
        sx = splatScale;
        sy = splatScale * 0.85;
        sz = splatScale;
      }

      writeSplatRecord(fBuf, uBuf, s, {
        x: samplePos.x,
        y: samplePos.y,
        z: samplePos.z,
        sx,
        sy,
        sz,
        r: rByte,
        g: gByte,
        b: bByte,
        a: alphaByte,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      });
    }

    this.splatCounter++;
    const outName = options.name?.trim() || `${sourceMesh.name}_splats_${this.splatCounter}`;
    const splatMesh = new GaussianSplattingMesh(outName, null, this.service.scene, true);
    this.ensureHeadlessWorkerSafety(splatMesh);
    splatMesh.isPickable = true;
    splatMesh.updateData(buf, undefined, { flipY: false });

    const prevSelected = [...this.service.selectedNodes];
    if (options.removeSource) {
      sourceMesh.setEnabled(false);
      const srcIdx = this.service.importedMeshes.indexOf(sourceMesh);
      if (srcIdx !== -1) this.service.importedMeshes.splice(srcIdx, 1);
    }

    this.service.importedMeshes.push(splatMesh);
    this.service.selectMesh(splatMesh);

    this.service.recordAction({
      name: `Convert "${sourceMesh.name}" to Splats`,
      undo: () => {
        this.service.clearSelectionProxy();
        if (!splatMesh.isDisposed()) splatMesh.setEnabled(false);
        const idx = this.service.importedMeshes.indexOf(splatMesh);
        if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
        if (options.removeSource && !sourceMesh.isDisposed()) {
          sourceMesh.setEnabled(true);
          if (!this.service.importedMeshes.includes(sourceMesh)) this.service.importedMeshes.push(sourceMesh);
        }
        this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
      },
      redo: () => {
        this.service.clearSelectionProxy();
        if (options.removeSource && !sourceMesh.isDisposed()) {
          sourceMesh.setEnabled(false);
          const idx = this.service.importedMeshes.indexOf(sourceMesh);
          if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
        }
        if (!splatMesh.isDisposed()) {
          splatMesh.setEnabled(true);
          if (!this.service.importedMeshes.includes(splatMesh)) this.service.importedMeshes.push(splatMesh);
          this.service.selectMesh(splatMesh);
        }
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
    return { splatMesh, splatCount: targetCount };
  }

  /**
   * Generates a procedural volumetric Gaussian Splatting preset (cloud, foliage, fire, galaxy, nebula, bush).
   */
  public createProceduralPreset(
    preset: GaussianSplatPresetKind,
    options: SplatPresetOptions = {}
  ): GaussianSplattingMesh {
    const count = Math.max(64, Math.min(100000, Math.round(options.splatCount ?? 2500)));
    const radius = Math.max(0.1, options.radius ?? 1.2);
    const baseOpacity = Math.max(0.05, Math.min(1, options.opacity ?? 0.72));
    const rand = createSeededRandom(options.seed ?? Math.round(count * 7 + radius * 100));
    const customColor = options.colorHex ? hexToRgbBytes(options.colorHex) : null;

    const buf = new ArrayBuffer(count * SPLAT_RECORD_BYTES);
    const fBuf = new Float32Array(buf);
    const uBuf = new Uint8Array(buf);

    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      let sx = radius * 0.08;
      let sy = radius * 0.08;
      let sz = radius * 0.08;
      let r = 240;
      let g = 245;
      let b = 255;
      let a = baseOpacity;

      if (preset === 'cloud') {
        // Multi-lobe cumulus cloud
        const lobe = i % 5;
        const lobeOffX = (lobe - 2) * radius * 0.38;
        const lobeOffY = (lobe === 2 ? 0.28 : lobe === 1 || lobe === 3 ? 0.14 : 0) * radius;
        const u = Math.pow(rand(), 0.55) * radius * 0.55;
        const theta = rand() * Math.PI * 2;
        const phi = Math.acos(2 * rand() - 1);
        x = lobeOffX + u * Math.sin(phi) * Math.cos(theta) * 1.2;
        y = radius * 0.5 + lobeOffY + u * Math.cos(phi) * 0.65;
        z = u * Math.sin(phi) * Math.sin(theta) * 0.9;
        const s = radius * (0.09 + rand() * 0.1);
        sx = s * 1.25;
        sy = s * 0.85;
        sz = s;
        const shade = 0.84 + 0.16 * Math.max(0, Math.min(1, (y / Math.max(0.1, radius))));
        r = 242 * shade;
        g = 246 * shade;
        b = 252 * shade;
        a = baseOpacity * (0.45 + rand() * 0.4);
      } else if (preset === 'foliage' || preset === 'bush') {
        const isBush = preset === 'bush';
        const u = (0.35 + 0.65 * Math.pow(rand(), 0.45)) * radius;
        const theta = rand() * Math.PI * 2;
        const phi = Math.acos(2 * rand() - 1);
        x = u * Math.sin(phi) * Math.cos(theta) * (isBush ? 1.15 : 1.0);
        y = radius * (isBush ? 0.65 : 1.0) + u * Math.cos(phi) * (isBush ? 0.72 : 0.85);
        z = u * Math.sin(phi) * Math.sin(theta) * (isBush ? 1.15 : 1.0);
        const s = Math.min(0.05, radius * (0.02 + rand() * 0.022));
        sx = s * 1.9;
        sy = s * 0.65;
        sz = s * 0.18;
        const sunMix = Math.max(0, Math.min(1, y / Math.max(0.1, radius * 1.8)));
        r = 34 + sunMix * 72 + rand() * 20;
        g = 90 + sunMix * 92 + rand() * 26;
        b = 24 + sunMix * 26 + rand() * 12;
        a = Math.max(0.75, baseOpacity) * (0.78 + rand() * 0.22);
      } else if (preset === 'fire') {
        const h = Math.pow(rand(), 0.75);
        const taper = (1 - h * 0.82) * radius * 0.45;
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand()) * taper;
        x = Math.cos(ang) * rad;
        y = h * radius * 1.8;
        z = Math.sin(ang) * rad;
        const s = radius * (0.04 + (1 - h * 0.5) * 0.07);
        sx = s;
        sy = s * 1.65;
        sz = s;
        r = 255;
        g = Math.max(30, 235 * (1 - h * 0.75));
        b = Math.max(10, 140 * Math.pow(1 - h, 2.2));
        a = baseOpacity * (1 - h * 0.65);
      } else if (preset === 'galaxy') {
        const arm = i % 3;
        const dist = Math.pow(rand(), 0.7) * radius;
        const spin = (dist / radius) * Math.PI * 3.4 + (arm * Math.PI * 2) / 3;
        const spread = (rand() - 0.5) * radius * 0.22 * (0.35 + dist / radius);
        x = Math.cos(spin) * dist + spread;
        y = radius * 0.25 + (rand() - 0.5) * radius * 0.14 * (1 - (dist / radius) * 0.6);
        z = Math.sin(spin) * dist + (rand() - 0.5) * radius * 0.22;
        const s = radius * (0.02 + rand() * 0.045);
        sx = s;
        sy = s * 0.65;
        sz = s;
        const core = 1 - dist / radius;
        r = 120 + core * 135;
        g = 150 + core * 95;
        b = 240;
        a = baseOpacity * (0.5 + core * 0.45);
      } else {
        // nebula
        const t = rand() * Math.PI * 2;
        const rShell = Math.pow(rand(), 0.5) * radius;
        const phi = Math.acos(2 * rand() - 1);
        x = rShell * Math.sin(phi) * Math.cos(t);
        y = radius + rShell * Math.cos(phi) * 0.75;
        z = rShell * Math.sin(phi) * Math.sin(t);
        const s = radius * (0.07 + rand() * 0.11);
        sx = s * 1.4;
        sy = s * 0.8;
        sz = s * 1.2;
        const blend = 0.5 + 0.5 * Math.sin(t * 2 + rShell * 2);
        r = 110 + blend * 135;
        g = 75 + (1 - blend) * 125;
        b = 215 + blend * 35;
        a = baseOpacity * (0.35 + rand() * 0.4);
      }

      if (customColor) {
        const factor = 0.65 + 0.35 * (r / 255);
        r = customColor[0] * factor;
        g = customColor[1] * factor;
        b = customColor[2] * factor;
      }

      const q = Quaternion.RotationYawPitchRoll(
        rand() * Math.PI * 2,
        (rand() - 0.5) * Math.PI,
        (rand() - 0.5) * Math.PI
      );

      writeSplatRecord(fBuf, uBuf, i, {
        x,
        y,
        z,
        sx,
        sy,
        sz,
        r,
        g,
        b,
        a: a * 255,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      });
    }

    this.splatCounter++;
    const name = options.name?.trim() || `splat_${preset}_${this.splatCounter}`;
    return this.createFromSplatsBuffer(name, buf, { alignToGround: true });
  }

  /**
   * Exports a GaussianSplattingMesh to a binary `.splat` or `.ply` Blob.
   */
  public exportSplatBlob(
    mesh: GaussianSplattingMesh,
    format: 'splat' | 'ply' = 'splat',
    bakeWorldTransform: boolean = true
  ): Blob {
    if (!mesh.splatsData) {
      throw new Error(`"${mesh.name}" does not have splat data retained in RAM for export.`);
    }
    const count = getSplatCount(mesh);
    mesh.computeWorldMatrix(true);
    const buffer = bakeWorldTransform
      ? transformSplatsBuffer(mesh.splatsData, count, mesh.getWorldMatrix())
      : mesh.splatsData.slice(0, count * SPLAT_RECORD_BYTES);

    if (format === 'ply') {
      const plyBuf = encodeSplatsToPlyBuffer(buffer, count);
      return new Blob([plyBuf], { type: 'application/octet-stream' });
    }
    return new Blob([buffer], { type: 'application/octet-stream' });
  }
}
