import type { Nullable } from '@babylonjs/core';
import {
  BaseTexture,
  Color3,
  CreateGroundFromHeightMapVertexData,
  Engine,
  GroundMesh,
  Material,
  Mesh,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  StandardMaterial,
  Texture,
  Vector2,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials';
import type { MeshEditorService } from '../MeshEditorService';
import { ImageUtils } from '../ImageUtils';
import { ProceduralTextureType, synthesizePbrTextureBuffers } from '../tools/textureUtils';

export type HeightmapPresetKind =
  | 'black'
  | 'flat'
  | 'island'
  | 'mountains'
  | 'peak'
  | 'volcano'
  | 'canyon'
  | 'dunes';

export type MixBrushChannel = 'r' | 'g' | 'b' | 'custom';

export interface HeightmapTextureOption {
  id: string;
  name: string;
  url: string;
  category: 'builtin' | 'scene' | 'ai' | 'custom';
  previewDataUrl: string;
  rgbaBuffer?: Uint8ClampedArray;
  width?: number;
  height?: number;
}

export interface HeightmapBrushStroke {
  points: Array<[number, number]>;
  size?: number;
  smoothness?: number;
  value?: number; // 0..255 grayscale target
  opacity?: number; // 0..1
}

export interface MixmapBrushStroke {
  points: Array<[number, number]>;
  channel?: MixBrushChannel;
  color?: [number, number, number];
  size?: number;
  smoothness?: number;
  opacity?: number;
}

/**
 * Configuration for 3D terrain generated from a grayscale heightmap image.
 * Supports multi-texture RGB splatting (mix textures) and terrain path integration.
 */
export class HeightMapConfig {
  /** Mesh name in the scene. */
  public name: string = 'gdhm';
  /** World space position of the terrain mesh. */
  public position: Vector3 = Vector3.Zero();
  /** Total terrain width in world units along the X-axis. */
  public width: number = 100;
  /** Total terrain length/depth in world units along the Z-axis. */
  public height: number = 100;
  /** Number of grid subdivisions along each axis. */
  public subdivisions: number = 100;
  /** Maximum elevation height in world units at pure white (255) pixels. */
  public maxHeight: number = 10;
  /** Minimum elevation height in world units at pure black (0) pixels. */
  public minHeight: number = 0;
  /** Whether the ground mesh vertex buffer is updatable dynamically at runtime. */
  public updatable: boolean = true;
  /** URL or data URL of the grayscale heightmap image source. */
  public heightMapImageUrl: string = '';
  /** URL or data URL of the RGB splat mixmap image source. */
  public mixMapImageUrl: string = '';
  /** Specular highlight color for the terrain material. */
  public specularColor: Color3 = new Color3(0.2, 0.2, 0.2);
  /** Diffuse base color for the terrain material. */
  public diffuseColor: Color3 = new Color3(0.8, 0.8, 0.8);
  /** UV scaling factor applied to terrain splat textures (x = Tex1, y = Tex2, z = Tex3). */
  public terrainTextureScale: Vector3 = new Vector3(10, 10, 10);
  /** Direct texture instance for the red channel terrain splat layer. */
  public terrainTexture1?: Texture;
  /** Direct texture instance for the green channel terrain splat layer. */
  public terrainTexture2?: Texture;
  /** Direct texture instance for the blue channel terrain splat layer. */
  public terrainTexture3?: Texture;
  /** Optional texture atlas name containing the terrain textures. */
  public terrainTextureAtlas?: string;
  /** Texture asset name or ID for the red channel terrain splat layer (High / Peaks). */
  public terrainTextureName1: string = 'rock';
  /** Texture asset name or ID for the green channel terrain splat layer (Mid / Path). */
  public terrainTextureName2: string = 'grass';
  /** Texture asset name or ID for the blue channel terrain splat layer (Low / Base). */
  public terrainTextureName3: string = 'sand';
  /** Splatmap texture that blends the terrain textures across RGB channels. */
  public mixTexture?: Texture;
  /** Whether backface culling is enabled on the terrain material. */
  public backFaceCulling: boolean = false;
  /** Optional custom map assigning grayscale elevation stops to RGB splat weights. */
  public mixColorMap?: Map<number, number[]>;
  /** Optional callback function to procedurally override terrain elevation at 2D world coordinates. */
  public lowerPoint?: (point: Vector2) => number | undefined;
  /** Waypoint positions used to carve or align a pathway corridor into the terrain. */
  public pathPoints?: Vector3[];
  /** Width of the flat pathway corridor in world units. */
  public pathWidth: number = 10;
  /** Width of the transition slope blending the pathway into surrounding terrain. */
  public pathTransitionWidth: number = 5;
  /** Vertical height offset relative to the path elevation. */
  public pathYOffset?: number;
  /** Whether to project the path onto the green channel of the mixmap. */
  public pathProjection: boolean = true;
  /** Active material reference. */
  public material?: Material;

  constructor(partial?: Partial<HeightMapConfig>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}

interface BuiltinTerrainTextureRecipe {
  id: string;
  name: string;
  type: ProceduralTextureType;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  scale: number;
  seed: number;
}

const BUILTIN_TERRAIN_TEXTURES: BuiltinTerrainTextureRecipe[] = [
  {
    id: 'rock',
    name: 'Mountain Rock (Stone)',
    type: 'stone',
    primaryColor: '#6b7078',
    secondaryColor: '#484d54',
    accentColor: '#8e939c',
    scale: 2,
    seed: 101,
  },
  {
    id: 'grass',
    name: 'Meadow Grass',
    type: 'grass',
    primaryColor: '#4b7d35',
    secondaryColor: '#335923',
    accentColor: '#6fa04d',
    scale: 2,
    seed: 202,
  },
  {
    id: 'sand',
    name: 'Beach & Desert Sand',
    type: 'sand',
    primaryColor: '#d9c08c',
    secondaryColor: '#c2a46b',
    accentColor: '#ebd7aa',
    scale: 2,
    seed: 303,
  },
  {
    id: 'snow',
    name: 'Alpine Snow & Ice',
    type: 'noise',
    primaryColor: '#e8eff7',
    secondaryColor: '#cbd8e6',
    accentColor: '#f5f9ff',
    scale: 2,
    seed: 404,
  },
  {
    id: 'dirt',
    name: 'Forest Dirt & Soil',
    type: 'stone',
    primaryColor: '#694b34',
    secondaryColor: '#4a3220',
    accentColor: '#876548',
    scale: 3,
    seed: 505,
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone Path',
    type: 'tiles',
    primaryColor: '#7c7e82',
    secondaryColor: '#4f5257',
    accentColor: '#9c9fa3',
    scale: 2,
    seed: 606,
  },
  {
    id: 'gravel',
    name: 'River Gravel & Pebbles',
    type: 'stone',
    primaryColor: '#8c887e',
    secondaryColor: '#5e5b53',
    accentColor: '#b0aba0',
    scale: 4,
    seed: 707,
  },
  {
    id: 'volcanic',
    name: 'Volcanic Basalt & Ash',
    type: 'stone',
    primaryColor: '#36363c',
    secondaryColor: '#222226',
    accentColor: '#5c4138',
    scale: 2,
    seed: 808,
  },
  {
    id: 'moss',
    name: 'Mossy Ground',
    type: 'foliage',
    primaryColor: '#3d632c',
    secondaryColor: '#27421c',
    accentColor: '#5d8542',
    scale: 2,
    seed: 909,
  },
  {
    id: 'water',
    name: 'Shallow Water / Seabed',
    type: 'marble',
    primaryColor: '#2c6e8a',
    secondaryColor: '#1d4f66',
    accentColor: '#5aa3bd',
    scale: 2,
    seed: 1010,
  },
];

export interface BuildHeightmapOptions {
  targetMesh?: GroundMesh | Mesh | string;
  createNew?: boolean;
  name?: string;
  width?: number;
  height?: number;
  subdivisions?: number;
  minHeight?: number;
  maxHeight?: number;
  preset?: HeightmapPresetKind;
  texture1?: string;
  texture2?: string;
  texture3?: string;
  textureScale?: [number, number, number];
  position?: [number, number, number];
  pathPoints?: Vector3[];
  pathWidth?: number;
  pathTransitionWidth?: number;
  pathYOffset?: number;
  pathProjection?: boolean;
  recordHistory?: boolean;
  selectAfterBuild?: boolean;
}

interface PaintSnapshot {
  heightmap: Uint8ClampedArray;
  mixmap: Uint8ClampedArray;
  hasCustomMixMap: boolean;
}

/**
 * Controller for 3D Heightmap Terrain creation, grayscale heightmap painting,
 * RGB mixmap splat painting, 3-texture assignment, and GLB export compatibility.
 */
export class HeightmapController {
  private service: MeshEditorService;
  public readonly mapSize: number = 256;

  public config: HeightMapConfig = new HeightMapConfig();
  public heightmapRgba: Uint8ClampedArray;
  public mixmapRgba: Uint8ClampedArray;

  public autoGenerateMixMap: boolean = true;
  public hasCustomMixMap: boolean = false;

  // Interactive paint brush parameters
  public brushSize: number = 28;
  public brushSmoothness: number = 0.75; // 0..1
  public brushGrayValue: number = 255; // 0..255 (white default)
  public brushOpacity: number = 1.0; // 0..1
  public brushRgbChannel: MixBrushChannel = 'g';
  public brushCustomRgb: [number, number, number] = [0, 255, 0];

  // Cached procedural and custom textures
  private static builtinTexturesCache: HeightmapTextureOption[] | null = null;
  private customTextures: HeightmapTextureOption[] = [];
  private decodedRgbaCache: Map<string, { rgba: Uint8ClampedArray; width: number; height: number }> = new Map();
  private activeTerrainMesh: GroundMesh | null = null;
  private terrainCounter: number = 1;

  // Stroke tracking for uniform radial falloff & undo
  private strokeTarget: 'height' | 'mix' | null = null;
  private strokeStartBuffer: Uint8ClampedArray | null = null;
  private strokeCoverage: Float32Array | null = null;
  private strokePreSnapshot: PaintSnapshot | null = null;
  private paintUndoStack: PaintSnapshot[] = [];

  // Export backup map (TerrainMaterial -> temporary PBRMaterial during GLB/glTF export)
  private exportBackupMaterials: Map<Mesh, Nullable<Material>> = new Map();

  public onTerrainUpdated?: (mesh: GroundMesh) => void;
  public onMapsChanged?: () => void;

  constructor(service: MeshEditorService) {
    this.service = service;
    const pixelBytes = this.mapSize * this.mapSize * 4;
    this.heightmapRgba = new Uint8ClampedArray(pixelBytes);
    this.mixmapRgba = new Uint8ClampedArray(pixelBytes);
    this.clearHeightmapToBlack(false);
  }

  /**
   * Checks if a mesh is a Heightmap Terrain GroundMesh managed by this controller.
   */
  public isHeightmapMesh(mesh: any): mesh is GroundMesh {
    return Boolean(mesh && mesh instanceof Mesh && mesh.metadata && mesh.metadata.isHeightmapTerrain);
  }

  /**
   * Returns the active heightmap terrain mesh (selected terrain or most recent live terrain).
   */
  public getActiveTerrainMesh(): GroundMesh | null {
    const sel = this.service.selectedMesh;
    if (sel && !sel.isDisposed() && this.isHeightmapMesh(sel)) {
      this.activeTerrainMesh = sel;
      return sel;
    }
    if (this.activeTerrainMesh && !this.activeTerrainMesh.isDisposed()) {
      return this.activeTerrainMesh;
    }
    const existing = this.service.importedMeshes.find((m) => !m.isDisposed() && this.isHeightmapMesh(m));
    if (existing && this.isHeightmapMesh(existing)) {
      this.activeTerrainMesh = existing;
      return existing;
    }
    return null;
  }

  /**
   * Loads a terrain mesh's stored config and heightmap/mixmap buffers into the controller.
   */
  public syncFromMesh(mesh: GroundMesh): void {
    if (!this.isHeightmapMesh(mesh)) return;
    this.activeTerrainMesh = mesh;
    const meta = mesh.metadata.heightmapData;
    if (!meta) return;

    if (meta.width) this.config.width = Number(meta.width);
    if (meta.height) this.config.height = Number(meta.height);
    if (meta.subdivisions) this.config.subdivisions = Number(meta.subdivisions);
    if (meta.minHeight !== undefined) this.config.minHeight = Number(meta.minHeight);
    if (meta.maxHeight !== undefined) this.config.maxHeight = Number(meta.maxHeight);
    if (meta.texture1) this.config.terrainTextureName1 = String(meta.texture1);
    if (meta.texture2) this.config.terrainTextureName2 = String(meta.texture2);
    if (meta.texture3) this.config.terrainTextureName3 = String(meta.texture3);
    if (Array.isArray(meta.textureScale) && meta.textureScale.length >= 3) {
      this.config.terrainTextureScale.set(
        Number(meta.textureScale[0]) || 10,
        Number(meta.textureScale[1]) || 10,
        Number(meta.textureScale[2]) || 10,
      );
    }
    if (meta.heightmapBuffer instanceof Uint8ClampedArray && meta.heightmapBuffer.length === this.heightmapRgba.length) {
      this.heightmapRgba.set(meta.heightmapBuffer);
    }
    if (meta.mixmapBuffer instanceof Uint8ClampedArray && meta.mixmapBuffer.length === this.mixmapRgba.length) {
      this.mixmapRgba.set(meta.mixmapBuffer);
    }
    if (meta.hasCustomMixMap !== undefined) {
      this.hasCustomMixMap = Boolean(meta.hasCustomMixMap);
      this.autoGenerateMixMap = !this.hasCustomMixMap;
    }
  }

  private isInternalHeightmapTextureName(name?: string | null): boolean {
    const lower = (name || '').toLowerCase();
    if (!lower) return false;
    return (
      lower === 'gridmat' ||
      lower.startsWith('editor_') ||
      lower.includes('envbrdf') ||
      lower.includes('effectlayer') ||
      lower.includes('highlightlayer') ||
      lower.includes('shadowmap') ||
      lower.includes('postprocess') ||
      lower.endsWith('_mixmap') ||
      lower.endsWith('_compositealbedo.png') ||
      lower.endsWith('_bakedterrainalbedo')
    );
  }

  /**
   * Returns all available textures for the 3 terrain splat channels (built-in, custom uploaded, AI, and scene textures).
   */
  public getAvailableTextures(): HeightmapTextureOption[] {
    if (!HeightmapController.builtinTexturesCache) {
      HeightmapController.builtinTexturesCache = BUILTIN_TERRAIN_TEXTURES.map((recipe) => {
        const buffers = synthesizePbrTextureBuffers({
          type: recipe.type,
          primaryColor: recipe.primaryColor,
          secondaryColor: recipe.secondaryColor,
          accentColor: recipe.accentColor,
          size: 256,
          scale: recipe.scale,
          seed: recipe.seed,
        });
        const url = ImageUtils.rgbaBufferToDataUrl(buffers.albedoRgba, buffers.width, buffers.height);
        return {
          id: recipe.id,
          name: recipe.name,
          url,
          category: 'builtin' as const,
          previewDataUrl: url,
          rgbaBuffer: buffers.albedoRgba,
          width: buffers.width,
          height: buffers.height,
        };
      });
    }

    const list: HeightmapTextureOption[] = [...HeightmapController.builtinTexturesCache, ...this.customTextures];
    const seenUrls = new Set(list.map((t) => t.url).filter(Boolean));
    const usedIds = new Set(list.map((t) => t.id));

    const makeUniqueSceneId = (baseLabel: string, fallbackKey?: string): string => {
      const cleanLabel = (baseLabel || fallbackKey || 'texture').trim();
      let candidate = `scene_${cleanLabel}`;
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
      if (fallbackKey) {
        candidate = `scene_${cleanLabel}_${fallbackKey}`;
      }
      let idx = 2;
      while (usedIds.has(candidate)) {
        candidate = `scene_${cleanLabel}_${idx++}`;
      }
      usedIds.add(candidate);
      return candidate;
    };

    const aiHistory = this.service.aiTextureGenerator?.getHistory() || [];
    const aiAuxNames = new Set<string>();
    for (const item of aiHistory) {
      if (item.embeddedNormalName) aiAuxNames.add(item.embeddedNormalName);
      if (item.embeddedOrmName) aiAuxNames.add(item.embeddedOrmName);
      if (item.embeddedAoName) aiAuxNames.add(item.embeddedAoName);
      if (item.albedoDataUrl && !seenUrls.has(item.albedoDataUrl)) {
        seenUrls.add(item.albedoDataUrl);
        const optId = `ai_${item.id}`;
        usedIds.add(optId);
        list.push({
          id: optId,
          name: `[AI] ${item.name}`,
          url: item.albedoDataUrl,
          category: 'ai',
          previewDataUrl: item.albedoDataUrl,
        });
      }
    }

    const sceneTextures = this.service.getEmbeddedTexturesInfo?.() || [];
    for (const tex of sceneTextures) {
      if (!tex.url || tex.isAtlas) continue;
      if (this.isInternalHeightmapTextureName(tex.name) || aiAuxNames.has(tex.name)) continue;
      if (!seenUrls.has(tex.url)) {
        seenUrls.add(tex.url);
        list.push({
          id: makeUniqueSceneId(tex.name, tex.id),
          name: `[Scene] ${tex.name}`,
          url: tex.url,
          category: 'scene',
          previewDataUrl: tex.url,
        });
      }
    }

    // Fallback scan across scene materials and raw scene textures to ensure every texture in any loaded file is selectable
    const extraTextures: Texture[] = [];
    for (const mat of this.service.scene.materials) {
      const matName = (mat?.name || '').toLowerCase();
      if (!mat || matName === 'gridmat' || matName.startsWith('editor_')) continue;
      if (mat instanceof PBRMaterial) {
        if (mat.albedoTexture instanceof Texture) extraTextures.push(mat.albedoTexture);
        if (mat.emissiveTexture instanceof Texture) extraTextures.push(mat.emissiveTexture);
      } else if (mat instanceof StandardMaterial) {
        if (mat.diffuseTexture instanceof Texture) extraTextures.push(mat.diffuseTexture);
        if (mat.emissiveTexture instanceof Texture) extraTextures.push(mat.emissiveTexture);
      } else if (mat instanceof TerrainMaterial) {
        if (mat.diffuseTexture1 instanceof Texture) extraTextures.push(mat.diffuseTexture1);
        if (mat.diffuseTexture2 instanceof Texture) extraTextures.push(mat.diffuseTexture2);
        if (mat.diffuseTexture3 instanceof Texture) extraTextures.push(mat.diffuseTexture3);
      }
    }
    for (const t of this.service.scene.textures) {
      if (t instanceof Texture) extraTextures.push(t);
    }

    for (const tex of extraTextures) {
      if ((tex as any).isRenderTarget || (tex as any)._isRenderTarget || (tex as any).isCube) continue;
      if (this.isInternalHeightmapTextureName(tex.name) || aiAuxNames.has(tex.name)) continue;
      const lowerUrl = (tex.url || '').toLowerCase();
      if (
        lowerUrl.startsWith('data:application/') ||
        lowerUrl.startsWith('data:text/') ||
        lowerUrl.startsWith('data:environment') ||
        lowerUrl.includes('environment') ||
        lowerUrl.endsWith('.env') ||
        lowerUrl.endsWith('.dds')
      ) {
        continue;
      }

      const resolvedUrl = this.service.resolveTextureImageUrl?.(tex) || '';
      if (!resolvedUrl || seenUrls.has(resolvedUrl)) continue;
      seenUrls.add(resolvedUrl);
      const displayName = tex.name && !tex.name.startsWith('data:') ? tex.name : `Texture_${tex.uniqueId}`;
      list.push({
        id: makeUniqueSceneId(displayName, String(tex.uniqueId)),
        name: `[Scene] ${displayName}`,
        url: resolvedUrl,
        category: 'scene',
        previewDataUrl: resolvedUrl,
      });
    }

    return list;
  }

  /**
   * Resolves a texture ID, name, or URL into a HeightmapTextureOption.
   */
  public resolveTextureOption(nameOrIdOrUrl?: string, fallbackId: string = 'rock'): HeightmapTextureOption {
    const available = this.getAvailableTextures();
    if (!nameOrIdOrUrl) {
      return available.find((t) => t.id === fallbackId) || available[0];
    }

    const raw = nameOrIdOrUrl.trim();
    const lower = raw.toLowerCase();

    const exactIdOrName = available.find(
      (t) =>
        t.id.toLowerCase() === lower ||
        t.name.toLowerCase() === lower ||
        t.id.toLowerCase() === `ai_${lower}` ||
        t.id.toLowerCase() === `scene_${lower}` ||
        (t.url && t.url === raw),
    );
    if (exactIdOrName) return exactIdOrName;

    if (raw.startsWith('data:image/') || raw.startsWith('blob:')) {
      return {
        id: raw,
        name: 'Custom Texture',
        url: raw,
        category: 'custom',
        previewDataUrl: raw,
      };
    }

    const partial = available.find((t) => t.id.toLowerCase().includes(lower) || t.name.toLowerCase().includes(lower));
    if (partial) return partial;

    if (raw.includes('/') && (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('./') || raw.startsWith('/'))) {
      return {
        id: raw,
        name: 'Custom Texture',
        url: raw,
        category: 'custom',
        previewDataUrl: raw,
      };
    }

    return available.find((t) => t.id === fallbackId) || available[0];
  }

  /**
   * Registers an uploaded custom texture file and optionally assigns it to a terrain slot (1, 2, or 3).
   */
  public async addCustomTextureFromFile(file: File, assignSlot?: 1 | 2 | 3): Promise<HeightmapTextureOption> {
    const texInfo = await this.service.addTextureFromFile(file);
    const url = texInfo.url || '';
    const loadedRgba = url ? await ImageUtils.loadImageRgba(url, 256, 256) : null;
    const option: HeightmapTextureOption = {
      id: `custom_${Date.now()}_${file.name}`,
      name: file.name,
      url,
      category: 'custom',
      previewDataUrl: url,
      rgbaBuffer: loadedRgba?.rgba,
      width: loadedRgba?.width,
      height: loadedRgba?.height,
    };
    this.customTextures.push(option);

    if (assignSlot) {
      await this.setTerrainTexture(assignSlot, option.id, option.name, true);
    }
    return option;
  }

  /**
   * Assigns one of the 3 TerrainMaterial splat textures individually (1 = Red, 2 = Green, 3 = Blue).
   * When `rebuildImmediately` is true, immediately rebuilds/updates and re-renders the terrain mesh.
   */
  public async setTerrainTexture(
    slot: 1 | 2 | 3,
    textureIdOrUrl: string,
    customName?: string,
    rebuildImmediately: boolean = true,
  ): Promise<GroundMesh | null> {
    const fallback = slot === 1 ? 'rock' : slot === 2 ? 'grass' : 'sand';
    const resolved = this.resolveTextureOption(textureIdOrUrl, fallback);
    const valueToStore =
      resolved.category === 'custom' && customName
        ? resolved.url
        : resolved.id || resolved.url;

    if (slot === 1) {
      this.config.terrainTextureName1 = valueToStore;
    } else if (slot === 2) {
      this.config.terrainTextureName2 = valueToStore;
    } else {
      this.config.terrainTextureName3 = valueToStore;
    }

    if (!rebuildImmediately) {
      return null;
    }

    const active = this.getActiveTerrainMesh();
    const mesh = await this.buildOrUpdateTerrainMesh({
      targetMesh: active || undefined,
      recordHistory: false,
    });
    this.service.scene.render();
    return mesh;
  }

  /**
   * Updates UV tiling scale for one or all 3 terrain splat textures and immediately re-renders if a terrain exists.
   */
  public async setTerrainTextureScale(
    slot: 1 | 2 | 3,
    scale: number,
    rebuildImmediately: boolean = true,
  ): Promise<void> {
    const safeScale = Math.max(0.1, Math.min(200, Number(scale) || 1));
    if (slot === 1) this.config.terrainTextureScale.x = safeScale;
    else if (slot === 2) this.config.terrainTextureScale.y = safeScale;
    else this.config.terrainTextureScale.z = safeScale;

    if (!rebuildImmediately) return;

    const active = this.getActiveTerrainMesh();
    if (active && active.material instanceof TerrainMaterial) {
      const tm = active.material;
      if (slot === 1 && tm.diffuseTexture1) {
        tm.diffuseTexture1.uScale = tm.diffuseTexture1.vScale = safeScale;
      } else if (slot === 2 && tm.diffuseTexture2) {
        tm.diffuseTexture2.uScale = tm.diffuseTexture2.vScale = safeScale;
      } else if (slot === 3 && tm.diffuseTexture3) {
        tm.diffuseTexture3.uScale = tm.diffuseTexture3.vScale = safeScale;
      }
      if (active.metadata?.heightmapData) {
        active.metadata.heightmapData.textureScale = [
          this.config.terrainTextureScale.x,
          this.config.terrainTextureScale.y,
          this.config.terrainTextureScale.z,
        ];
      }
      tm.markAsDirty(Material.TextureDirtyFlag);
      this.service.scene.render();
      this.onTerrainUpdated?.(active);
    }
  }

  /**
   * Resets the grayscale heightmap to pure black (0, 0, 0, 255) for freehand brush painting.
   */
  public clearHeightmapToBlack(notify: boolean = true): void {
    const len = this.heightmapRgba.length;
    for (let i = 0; i < len; i += 4) {
      this.heightmapRgba[i] = 0;
      this.heightmapRgba[i + 1] = 0;
      this.heightmapRgba[i + 2] = 0;
      this.heightmapRgba[i + 3] = 255;
    }
    this.config.heightMapImageUrl = ImageUtils.rgbaBufferToDataUrl(this.heightmapRgba, this.mapSize, this.mapSize);
    if (!this.hasCustomMixMap) {
      this.regenerateMixmapFromHeightmap(false);
    }
    if (notify) {
      this.onMapsChanged?.();
    }
  }

  /**
   * Regenerates the RGB mixmap buffer from the current grayscale heightmap.
   */
  public regenerateMixmapFromHeightmap(notify: boolean = true): void {
    const mix = ImageUtils.generateMixMapBufferFromHeightMapBuffer(
      this.heightmapRgba,
      this.mapSize,
      this.mapSize,
      this.config.mixColorMap,
    );
    this.mixmapRgba.set(mix);
    this.hasCustomMixMap = false;
    this.autoGenerateMixMap = true;
    this.config.mixMapImageUrl = ImageUtils.rgbaBufferToDataUrl(this.mixmapRgba, this.mapSize, this.mapSize);
    if (notify) {
      this.onMapsChanged?.();
    }
  }

  /**
   * Applies a procedural terrain heightmap preset into the 2D grayscale buffer.
   */
  public applyPreset(preset: HeightmapPresetKind, notify: boolean = true): void {
    this.pushPaintSnapshot();
    const size = this.mapSize;

    const hash = (ix: number, iy: number, seed: number): number => {
      let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };

    const smoothNoise = (x: number, y: number, seed: number): number => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const n00 = hash(ix, iy, seed);
      const n10 = hash(ix + 1, iy, seed);
      const n01 = hash(ix, iy + 1, seed);
      const n11 = hash(ix + 1, iy + 1, seed);
      const nx0 = n00 + sx * (n10 - n00);
      const nx1 = n01 + sx * (n11 - n01);
      return nx0 + sy * (nx1 - nx0);
    };

    const fbm = (u: number, v: number, octaves: number, freq: number, seed: number): number => {
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      let f = freq;
      for (let o = 0; o < octaves; o++) {
        sum += smoothNoise(u * f, v * f, seed + o * 73) * amp;
        norm += amp;
        f *= 2.02;
        amp *= 0.5;
      }
      return sum / (norm || 1);
    };

    const ridgedFbm = (u: number, v: number, octaves: number, freq: number, seed: number): number => {
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      let f = freq;
      for (let o = 0; o < octaves; o++) {
        const n = 1 - Math.abs(smoothNoise(u * f, v * f, seed + o * 97) * 2 - 1);
        sum += n * n * amp;
        norm += amp;
        f *= 2.05;
        amp *= 0.5;
      }
      return sum / (norm || 1);
    };

    if (preset === 'black' || preset === 'flat') {
      this.clearHeightmapToBlack(notify);
      return;
    }

    for (let y = 0; y < size; y++) {
      const v = y / (size - 1);
      const dy = (v - 0.5) * 2;
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        const dx = (u - 0.5) * 2;
        const dist = Math.hypot(dx, dy);
        let h = 0;

        switch (preset) {
          case 'island': {
            const coastNoise = fbm(u, v, 5, 4.0, 17) * 0.45;
            const radial = Math.max(0, 1 - Math.pow(dist / (0.82 + (coastNoise - 0.22)), 2.2));
            const peaks = ridgedFbm(u, v, 4, 3.5, 41);
            h = radial * (0.35 + peaks * 0.75);
            break;
          }
          case 'mountains': {
            const ridge = ridgedFbm(u, v, 5, 3.2, 103);
            const detail = fbm(u, v, 4, 6.0, 211);
            const edgeFade = Math.max(0.1, 1 - Math.pow(Math.max(Math.abs(dx), Math.abs(dy)), 4));
            h = (ridge * 0.78 + detail * 0.22) * edgeFade;
            break;
          }
          case 'peak': {
            const cone = Math.max(0, 1 - dist / 0.85);
            const ridge = ridgedFbm(u, v, 4, 4.5, 313);
            h = Math.pow(cone, 1.45) * (0.68 + ridge * 0.45);
            break;
          }
          case 'volcano': {
            const cone = Math.max(0, 1 - dist / 0.9);
            const rim = Math.exp(-Math.pow((dist - 0.22) / 0.14, 2)) * 0.45;
            const crater = dist < 0.22 ? Math.max(0, (0.22 - dist) / 0.22) * 0.55 : 0;
            const detail = ridgedFbm(u, v, 4, 4.0, 419) * 0.2;
            h = Math.max(0, Math.pow(cone, 1.35) * 0.72 + rim - crater + detail * cone);
            break;
          }
          case 'canyon': {
            const curveX = 0.5 + Math.sin(v * Math.PI * 2.2) * 0.16;
            const canyonDist = Math.abs(u - curveX);
            const riverMask = Math.min(1, Math.max(0, (canyonDist - 0.06) / 0.16));
            const plateau = 0.65 + fbm(u, v, 4, 4.0, 521) * 0.35;
            h = plateau * (0.12 + 0.88 * (riverMask * riverMask * (3 - 2 * riverMask)));
            break;
          }
          case 'dunes': {
            const wave = 0.5 + 0.5 * Math.sin((u * 4.5 + v * 1.8 + fbm(u, v, 3, 2.5, 631) * 1.4) * Math.PI * 2);
            const ridgeWave = Math.pow(wave, 1.3);
            const fine = fbm(u, v, 3, 6.0, 701) * 0.2;
            h = ridgeWave * 0.7 + fine + 0.1;
            break;
          }
        }

        const byte = Math.max(0, Math.min(255, Math.round(h * 255)));
        const idx = (y * size + x) * 4;
        this.heightmapRgba[idx] = byte;
        this.heightmapRgba[idx + 1] = byte;
        this.heightmapRgba[idx + 2] = byte;
        this.heightmapRgba[idx + 3] = 255;
      }
    }

    this.config.heightMapImageUrl = ImageUtils.rgbaBufferToDataUrl(this.heightmapRgba, size, size);
    if (!this.hasCustomMixMap) {
      this.regenerateMixmapFromHeightmap(false);
    }
    if (notify) {
      this.onMapsChanged?.();
    }
  }

  /**
   * Loads an uploaded or URL grayscale heightmap image into the 256x256 buffer.
   */
  public async loadHeightmapFromUrl(url: string): Promise<void> {
    this.pushPaintSnapshot();
    const loaded = await ImageUtils.loadImageRgba(url, this.mapSize, this.mapSize);
    if (loaded) {
      for (let i = 0; i < this.heightmapRgba.length; i += 4) {
        const gray = Math.round((loaded.rgba[i] + loaded.rgba[i + 1] + loaded.rgba[i + 2]) / 3);
        this.heightmapRgba[i] = gray;
        this.heightmapRgba[i + 1] = gray;
        this.heightmapRgba[i + 2] = gray;
        this.heightmapRgba[i + 3] = 255;
      }
    }
    this.config.heightMapImageUrl = url;
    if (this.autoGenerateMixMap && !this.hasCustomMixMap) {
      this.regenerateMixmapFromHeightmap(false);
    }
    this.onMapsChanged?.();
  }

  /**
   * Loads an uploaded or URL RGB mixmap image into the 256x256 buffer.
   */
  public async loadMixmapFromUrl(url: string): Promise<void> {
    this.pushPaintSnapshot();
    const loaded = await ImageUtils.loadImageRgba(url, this.mapSize, this.mapSize);
    if (loaded) {
      this.mixmapRgba.set(loaded.rgba.subarray(0, this.mixmapRgba.length));
    }
    this.hasCustomMixMap = true;
    this.autoGenerateMixMap = false;
    this.config.mixMapImageUrl = url;
    this.onMapsChanged?.();
  }

  /**
   * Captures a snapshot on the paint undo stack.
   */
  public pushPaintSnapshot(): void {
    this.paintUndoStack.push({
      heightmap: new Uint8ClampedArray(this.heightmapRgba),
      mixmap: new Uint8ClampedArray(this.mixmapRgba),
      hasCustomMixMap: this.hasCustomMixMap,
    });
    if (this.paintUndoStack.length > 25) {
      this.paintUndoStack.shift();
    }
  }

  /**
   * Undoes the last paint stroke or preset change in the Paint Editor.
   */
  public undoPaintSnapshot(): boolean {
    const snap = this.paintUndoStack.pop();
    if (!snap) return false;
    this.heightmapRgba.set(snap.heightmap);
    this.mixmapRgba.set(snap.mixmap);
    this.hasCustomMixMap = snap.hasCustomMixMap;
    this.autoGenerateMixMap = !snap.hasCustomMixMap;
    this.onMapsChanged?.();
    return true;
  }

  public canUndoPaint(): boolean {
    return this.paintUndoStack.length > 0;
  }

  /**
   * Begins an interactive drag paint stroke (prevents soft-edge over-saturation during dragging).
   */
  public beginPaintStroke(target: 'height' | 'mix'): void {
    this.strokeTarget = target;
    this.strokePreSnapshot = {
      heightmap: new Uint8ClampedArray(this.heightmapRgba),
      mixmap: new Uint8ClampedArray(this.mixmapRgba),
      hasCustomMixMap: this.hasCustomMixMap,
    };
    this.strokeStartBuffer = new Uint8ClampedArray(target === 'height' ? this.heightmapRgba : this.mixmapRgba);
    this.strokeCoverage = new Float32Array(this.mapSize * this.mapSize);
  }

  /**
   * Ends an active paint stroke and commits it to the paint undo stack.
   */
  public endPaintStroke(): void {
    if (this.strokePreSnapshot) {
      this.paintUndoStack.push(this.strokePreSnapshot);
      if (this.paintUndoStack.length > 25) {
        this.paintUndoStack.shift();
      }
    }
    this.strokeTarget = null;
    this.strokeStartBuffer = null;
    this.strokeCoverage = null;
    this.strokePreSnapshot = null;

    if (this.autoGenerateMixMap && !this.hasCustomMixMap) {
      this.regenerateMixmapFromHeightmap(false);
    }
    this.onMapsChanged?.();
  }

  private computeBrushFalloff(dist: number, radius: number, smoothness: number): number {
    if (dist > radius) return 0;
    const s = Math.max(0, Math.min(1, smoothness));
    const innerR = radius * (1 - s);
    if (dist <= innerR) return 1;
    const span = Math.max(1e-5, radius - innerR);
    const t = (dist - innerR) / span;
    return 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.max(0, t))));
  }

  /**
   * Stamps a grayscale brush dab at pixel coordinates (px, py) on the heightmap buffer.
   */
  public paintHeightmapStamp(
    px: number,
    py: number,
    opts?: { size?: number; smoothness?: number; value?: number; opacity?: number },
  ): void {
    const size = Math.max(1, opts?.size ?? this.brushSize);
    const radius = size * 0.5;
    const smoothness = opts?.smoothness ?? this.brushSmoothness;
    const targetGray = Math.max(0, Math.min(255, Math.round(opts?.value ?? this.brushGrayValue)));
    const opacity = Math.max(0, Math.min(1, opts?.opacity ?? this.brushOpacity));

    const minX = Math.max(0, Math.floor(px - radius));
    const maxX = Math.min(this.mapSize - 1, Math.ceil(px + radius));
    const minY = Math.max(0, Math.floor(py - radius));
    const maxY = Math.min(this.mapSize - 1, Math.ceil(py + radius));

    const useStrokeAccum =
      this.strokeTarget === 'height' && this.strokeStartBuffer !== null && this.strokeCoverage !== null;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - px, y - py);
        if (dist > radius) continue;
        const falloff = this.computeBrushFalloff(dist, radius, smoothness) * opacity;
        if (falloff <= 0) continue;

        const pIdx = y * this.mapSize + x;
        const rgbaIdx = pIdx * 4;

        if (useStrokeAccum) {
          const prevCov = this.strokeCoverage![pIdx];
          if (falloff <= prevCov) continue;
          this.strokeCoverage![pIdx] = falloff;
          const baseVal = this.strokeStartBuffer![rgbaIdx];
          const val = Math.max(0, Math.min(255, Math.round(baseVal * (1 - falloff) + targetGray * falloff)));
          this.heightmapRgba[rgbaIdx] = val;
          this.heightmapRgba[rgbaIdx + 1] = val;
          this.heightmapRgba[rgbaIdx + 2] = val;
          this.heightmapRgba[rgbaIdx + 3] = 255;
        } else {
          const curVal = this.heightmapRgba[rgbaIdx];
          const val = Math.max(0, Math.min(255, Math.round(curVal * (1 - falloff) + targetGray * falloff)));
          this.heightmapRgba[rgbaIdx] = val;
          this.heightmapRgba[rgbaIdx + 1] = val;
          this.heightmapRgba[rgbaIdx + 2] = val;
          this.heightmapRgba[rgbaIdx + 3] = 255;
        }
      }
    }
  }

  /**
   * Interpolates a grayscale brush stroke along a segment [(x0, y0) -> (x1, y1)] or polyline.
   */
  public paintHeightmapStroke(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    opts?: { size?: number; smoothness?: number; value?: number; opacity?: number },
  ): void {
    const ownStroke = this.strokeTarget !== 'height';
    if (ownStroke) {
      this.beginPaintStroke('height');
    }
    const size = Math.max(1, opts?.size ?? this.brushSize);
    const step = Math.max(1, size * 0.2);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintHeightmapStamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, opts);
    }
    if (ownStroke) {
      this.endPaintStroke();
    }
  }

  /**
   * Resolves the RGB color tuple for the Mix Texture brush.
   */
  public resolveMixBrushRgb(channel?: MixBrushChannel, customColor?: [number, number, number]): [number, number, number] {
    if (customColor && customColor.length >= 3) {
      return [
        Math.max(0, Math.min(255, Math.round(customColor[0]))),
        Math.max(0, Math.min(255, Math.round(customColor[1]))),
        Math.max(0, Math.min(255, Math.round(customColor[2]))),
      ];
    }
    const ch = channel ?? this.brushRgbChannel;
    if (ch === 'r') return [255, 0, 0];
    if (ch === 'g') return [0, 255, 0];
    if (ch === 'b') return [0, 0, 255];
    return [...this.brushCustomRgb] as [number, number, number];
  }

  /**
   * Stamps an RGB brush dab at pixel coordinates (px, py) on the mixmap buffer.
   */
  public paintMixmapStamp(
    px: number,
    py: number,
    opts?: { size?: number; smoothness?: number; channel?: MixBrushChannel; color?: [number, number, number]; opacity?: number },
  ): void {
    const size = Math.max(1, opts?.size ?? this.brushSize);
    const radius = size * 0.5;
    const smoothness = opts?.smoothness ?? this.brushSmoothness;
    const targetRgb = this.resolveMixBrushRgb(opts?.channel, opts?.color);
    const opacity = Math.max(0, Math.min(1, opts?.opacity ?? this.brushOpacity));

    this.hasCustomMixMap = true;
    this.autoGenerateMixMap = false;

    const minX = Math.max(0, Math.floor(px - radius));
    const maxX = Math.min(this.mapSize - 1, Math.ceil(px + radius));
    const minY = Math.max(0, Math.floor(py - radius));
    const maxY = Math.min(this.mapSize - 1, Math.ceil(py + radius));

    const useStrokeAccum =
      this.strokeTarget === 'mix' && this.strokeStartBuffer !== null && this.strokeCoverage !== null;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - px, y - py);
        if (dist > radius) continue;
        const falloff = this.computeBrushFalloff(dist, radius, smoothness) * opacity;
        if (falloff <= 0) continue;

        const pIdx = y * this.mapSize + x;
        const rgbaIdx = pIdx * 4;

        if (useStrokeAccum) {
          const prevCov = this.strokeCoverage![pIdx];
          if (falloff <= prevCov) continue;
          this.strokeCoverage![pIdx] = falloff;
          const r0 = this.strokeStartBuffer![rgbaIdx];
          const g0 = this.strokeStartBuffer![rgbaIdx + 1];
          const b0 = this.strokeStartBuffer![rgbaIdx + 2];
          this.mixmapRgba[rgbaIdx] = Math.round(r0 * (1 - falloff) + targetRgb[0] * falloff);
          this.mixmapRgba[rgbaIdx + 1] = Math.round(g0 * (1 - falloff) + targetRgb[1] * falloff);
          this.mixmapRgba[rgbaIdx + 2] = Math.round(b0 * (1 - falloff) + targetRgb[2] * falloff);
          this.mixmapRgba[rgbaIdx + 3] = 255;
        } else {
          const r0 = this.mixmapRgba[rgbaIdx];
          const g0 = this.mixmapRgba[rgbaIdx + 1];
          const b0 = this.mixmapRgba[rgbaIdx + 2];
          this.mixmapRgba[rgbaIdx] = Math.round(r0 * (1 - falloff) + targetRgb[0] * falloff);
          this.mixmapRgba[rgbaIdx + 1] = Math.round(g0 * (1 - falloff) + targetRgb[1] * falloff);
          this.mixmapRgba[rgbaIdx + 2] = Math.round(b0 * (1 - falloff) + targetRgb[2] * falloff);
          this.mixmapRgba[rgbaIdx + 3] = 255;
        }
      }
    }
  }

  /**
   * Interpolates an RGB brush stroke along a segment [(x0, y0) -> (x1, y1)].
   */
  public paintMixmapStroke(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    opts?: { size?: number; smoothness?: number; channel?: MixBrushChannel; color?: [number, number, number]; opacity?: number },
  ): void {
    const ownStroke = this.strokeTarget !== 'mix';
    if (ownStroke) {
      this.beginPaintStroke('mix');
    }
    const size = Math.max(1, opts?.size ?? this.brushSize);
    const step = Math.max(1, size * 0.2);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintMixmapStamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, opts);
    }
    if (ownStroke) {
      this.endPaintStroke();
    }
  }

  /**
   * Applies normalized [0..1] or pixel [0..mapSize] brush stroke polylines to the heightmap.
   */
  public applyHeightStrokes(strokes: HeightmapBrushStroke[]): void {
    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      const toPixel = (pt: [number, number]): [number, number] => {
        const px = pt[0] <= 1 && pt[1] <= 1 && pt[0] >= 0 && pt[1] >= 0 ? pt[0] * (this.mapSize - 1) : pt[0];
        const py = pt[0] <= 1 && pt[1] <= 1 && pt[0] >= 0 && pt[1] >= 0 ? pt[1] * (this.mapSize - 1) : pt[1];
        return [px, py];
      };
      this.beginPaintStroke('height');
      const opts = {
        size: stroke.size ?? this.brushSize,
        smoothness: stroke.smoothness ?? this.brushSmoothness,
        value: stroke.value ?? 255,
        opacity: stroke.opacity ?? 1.0,
      };
      if (stroke.points.length === 1) {
        const [px, py] = toPixel(stroke.points[0]);
        this.paintHeightmapStamp(px, py, opts);
      } else {
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const [x0, y0] = toPixel(stroke.points[i]);
          const [x1, y1] = toPixel(stroke.points[i + 1]);
          this.paintHeightmapStroke(x0, y0, x1, y1, opts);
        }
      }
      this.endPaintStroke();
    }
  }

  /**
   * Applies normalized [0..1] or pixel [0..mapSize] RGB brush stroke polylines to the mixmap.
   */
  public applyMixStrokes(strokes: MixmapBrushStroke[]): void {
    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      const toPixel = (pt: [number, number]): [number, number] => {
        const px = pt[0] <= 1 && pt[1] <= 1 && pt[0] >= 0 && pt[1] >= 0 ? pt[0] * (this.mapSize - 1) : pt[0];
        const py = pt[0] <= 1 && pt[1] <= 1 && pt[0] >= 0 && pt[1] >= 0 ? pt[1] * (this.mapSize - 1) : pt[1];
        return [px, py];
      };
      this.beginPaintStroke('mix');
      const opts = {
        size: stroke.size ?? this.brushSize,
        smoothness: stroke.smoothness ?? this.brushSmoothness,
        channel: stroke.channel ?? this.brushRgbChannel,
        color: stroke.color,
        opacity: stroke.opacity ?? 1.0,
      };
      if (stroke.points.length === 1) {
        const [px, py] = toPixel(stroke.points[0]);
        this.paintMixmapStamp(px, py, opts);
      } else {
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const [x0, y0] = toPixel(stroke.points[i]);
          const [x1, y1] = toPixel(stroke.points[i + 1]);
          this.paintMixmapStroke(x0, y0, x1, y1, opts);
        }
      }
      this.endPaintStroke();
    }
  }

  /**
   * Carves/levels a pathway corridor into the ground mesh vertices along `pathPoints`.
   */
  public applyPathToVertices(
    mesh: GroundMesh,
    pathPoints: Vector3[],
    pathWidth: number,
    pathTransitionWidth: number,
    pathYOffset: number = 0,
  ): void {
    if (!pathPoints || pathPoints.length < 2 || pathWidth <= 0) return;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions) return;

    const halfWidth = pathWidth * 0.5;
    const trans = Math.max(0, pathTransitionWidth);

    const closestOnPolyline = (wx: number, wz: number): { dist: number; pathY: number } => {
      let bestDistSq = Infinity;
      let bestY = 0;
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const a = pathPoints[i];
        const b = pathPoints[i + 1];
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        const lenSq = vx * vx + vz * vz;
        let t = 0;
        if (lenSq > 1e-8) {
          t = Math.max(0, Math.min(1, ((wx - a.x) * vx + (wz - a.z) * vz) / lenSq));
        }
        const px = a.x + t * vx;
        const pz = a.z + t * vz;
        const dSq = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestY = a.y + t * (b.y - a.y);
        }
      }
      return { dist: Math.sqrt(bestDistSq), pathY: bestY };
    };

    for (let i = 0; i < positions.length; i += 3) {
      const vx = positions[i];
      const vy = positions[i + 1];
      const vz = positions[i + 2];
      const { dist, pathY } = closestOnPolyline(vx, vz);
      const targetY = pathY + pathYOffset;

      if (dist <= halfWidth) {
        positions[i + 1] = targetY;
      } else if (trans > 0 && dist < halfWidth + trans) {
        const t = (dist - halfWidth) / trans;
        const smooth = t * t * (3 - 2 * t);
        positions[i + 1] = targetY * (1 - smooth) + vy * smooth;
      }
    }

    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    if (indices) {
      const normals = new Float32Array(positions.length);
      VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
    mesh.refreshBoundingInfo();
  }

  /**
   * Builds a new GroundMesh or updates an existing GroundMesh in-place from the current heightmap/mixmap buffers.
   */
  public async buildOrUpdateTerrainMesh(options: BuildHeightmapOptions = {}): Promise<GroundMesh> {
    if (options.preset) {
      this.applyPreset(options.preset, false);
    }
    if (options.width !== undefined) this.config.width = Math.max(1, Number(options.width) || 100);
    if (options.height !== undefined) this.config.height = Math.max(1, Number(options.height) || 100);
    if (options.subdivisions !== undefined) {
      this.config.subdivisions = Math.max(2, Math.min(256, Math.round(Number(options.subdivisions) || 100)));
    }
    if (options.minHeight !== undefined) this.config.minHeight = Number(options.minHeight) || 0;
    if (options.maxHeight !== undefined) this.config.maxHeight = Number(options.maxHeight) || 10;
    if (options.texture1) this.config.terrainTextureName1 = options.texture1;
    if (options.texture2) this.config.terrainTextureName2 = options.texture2;
    if (options.texture3) this.config.terrainTextureName3 = options.texture3;
    if (options.textureScale && options.textureScale.length >= 3) {
      this.config.terrainTextureScale.set(
        Number(options.textureScale[0]) || 10,
        Number(options.textureScale[1]) || 10,
        Number(options.textureScale[2]) || 10,
      );
    }
    if (options.pathPoints !== undefined) this.config.pathPoints = options.pathPoints;
    if (options.pathWidth !== undefined) this.config.pathWidth = options.pathWidth;
    if (options.pathTransitionWidth !== undefined) this.config.pathTransitionWidth = options.pathTransitionWidth;
    if (options.pathYOffset !== undefined) this.config.pathYOffset = options.pathYOffset;
    if (options.pathProjection !== undefined) this.config.pathProjection = options.pathProjection;

    const scene = this.service.scene;

    // Resolve target mesh if updating an existing terrain
    let existingMesh: GroundMesh | null = null;
    if (!options.createNew) {
      if (typeof options.targetMesh === 'string') {
        const found = this.service.importedMeshes.find((m) => m.name === options.targetMesh || m.id === options.targetMesh);
        if (found && found instanceof GroundMesh) existingMesh = found;
      } else if (options.targetMesh && options.targetMesh instanceof GroundMesh && !options.targetMesh.isDisposed()) {
        existingMesh = options.targetMesh;
      } else if (options.targetMesh === undefined) {
        const active = this.getActiveTerrainMesh();
        if (active && !active.isDisposed()) existingMesh = active;
      }
    }

    // Ensure mixmap is up-to-date
    if (this.autoGenerateMixMap && !this.hasCustomMixMap) {
      const autoMix = ImageUtils.generateMixMapBufferFromHeightMapBuffer(
        this.heightmapRgba,
        this.mapSize,
        this.mapSize,
        this.config.mixColorMap,
      );
      this.mixmapRgba.set(autoMix);
    }

    // Apply optional path projection onto green channel of a working mixmap buffer
    let finalMixRgba: Uint8ClampedArray = new Uint8ClampedArray(this.mixmapRgba);
    if (this.config.pathProjection && this.config.pathPoints && this.config.pathPoints.length > 1) {
      const projWidth = this.config.pathWidth > 0 ? this.config.pathWidth : 10;
      finalMixRgba = ImageUtils.paintPathOnMixMapBuffer(
        finalMixRgba,
        this.mapSize,
        this.mapSize,
        this.config.pathPoints,
        this.config.width,
        this.config.height,
        projWidth,
      );
      this.mixmapRgba.set(finalMixRgba);
    }

    const heightDataBytes = new Uint8Array(this.heightmapRgba);
    const heightMapDataUrl = ImageUtils.rgbaBufferToDataUrl(this.heightmapRgba, this.mapSize, this.mapSize);
    const mixMapDataUrl = ImageUtils.rgbaBufferToDataUrl(finalMixRgba, this.mapSize, this.mapSize);
    this.config.heightMapImageUrl = heightMapDataUrl;
    this.config.mixMapImageUrl = mixMapDataUrl;

    const finalizeTerrainMesh = (mesh: GroundMesh) => {
      // Apply path corridor carving (Schneise/Sockel) if configured
      if (this.config.pathPoints && this.config.pathPoints.length > 1 && this.config.pathWidth > 0 && this.config.pathYOffset !== undefined) {
        this.applyPathToVertices(
          mesh,
          this.config.pathPoints,
          this.config.pathWidth,
          this.config.pathTransitionWidth ?? 5,
          this.config.pathYOffset,
        );
      }

      // Optional procedural lowerPoint callback
      if (this.config.lowerPoint) {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        const indices = mesh.getIndices();
        if (positions) {
          const position = Vector3.Zero();
          for (let index = 0; index < positions.length; index += 3) {
            Vector3.FromArrayToRef(positions, index, position);
            const point = new Vector2(mesh.position.x + position.x, mesh.position.z + position.z);
            const y = this.config.lowerPoint(point);
            if (y !== undefined) {
              position.y = y;
              position.toArray(positions, index);
            }
          }
          mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
          if (indices) {
            const normals = new Float32Array(positions.length);
            VertexData.ComputeNormals(positions, indices, normals);
            mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
          }
          mesh.refreshBoundingInfo();
        }
      }

      if (options.position) {
        mesh.position.set(options.position[0], options.position[1], options.position[2]);
      }

      // Create/update TerrainMaterial with 3 splat textures & mixTexture
      const tex1Opt = this.resolveTextureOption(this.config.terrainTextureName1, 'rock');
      const tex2Opt = this.resolveTextureOption(this.config.terrainTextureName2, 'grass');
      const tex3Opt = this.resolveTextureOption(this.config.terrainTextureName3, 'sand');

      const matName = `${mesh.name}_TerrainMaterial`;
      let terrainMat = mesh.material instanceof TerrainMaterial ? mesh.material : null;
      if (!terrainMat) {
        terrainMat = new TerrainMaterial(matName, scene);
      }

      terrainMat.backFaceCulling = this.config.backFaceCulling;
      terrainMat.specularColor = this.config.specularColor.clone();
      terrainMat.diffuseColor = this.config.diffuseColor.clone();

      const mixTex = new Texture(mixMapDataUrl, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
      mixTex.name = `${mesh.name}_Mixmap`;
      mixTex.wrapU = Texture.CLAMP_ADDRESSMODE;
      mixTex.wrapV = Texture.CLAMP_ADDRESSMODE;
      if (terrainMat.mixTexture && terrainMat.mixTexture !== mixTex) {
        terrainMat.mixTexture.dispose();
      }
      terrainMat.mixTexture = mixTex;
      this.config.mixTexture = mixTex;

      const createSplatTex = (opt: HeightmapTextureOption, scale: number, slotLabel: string): Texture => {
        const t = new Texture(opt.url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
        t.name = `${mesh.name}_${slotLabel}_${opt.id}`;
        t.wrapU = Texture.WRAP_ADDRESSMODE;
        t.wrapV = Texture.WRAP_ADDRESSMODE;
        t.uScale = scale;
        t.vScale = scale;
        if (!t.isReady()) {
          t.onLoadObservable.addOnce(() => {
            if (!scene.isDisposed) {
              scene.render();
            }
          });
        }
        return t;
      };

      const oldT1 = terrainMat.diffuseTexture1;
      const oldT2 = terrainMat.diffuseTexture2;
      const oldT3 = terrainMat.diffuseTexture3;

      const t1 = createSplatTex(tex1Opt, this.config.terrainTextureScale.x, 'tex1');
      const t2 = createSplatTex(tex2Opt, this.config.terrainTextureScale.y, 'tex2');
      const t3 = createSplatTex(tex3Opt, this.config.terrainTextureScale.z, 'tex3');

      terrainMat.diffuseTexture1 = t1;
      terrainMat.diffuseTexture2 = t2;
      terrainMat.diffuseTexture3 = t3;
      this.config.terrainTexture1 = t1;
      this.config.terrainTexture2 = t2;
      this.config.terrainTexture3 = t3;

      if (oldT1 && oldT1 !== t1) oldT1.dispose();
      if (oldT2 && oldT2 !== t2) oldT2.dispose();
      if (oldT3 && oldT3 !== t3) oldT3.dispose();

      terrainMat.markAsDirty(Material.TextureDirtyFlag);
      mesh.material = terrainMat;
      this.config.material = terrainMat;

      mesh.isPickable = true;
      mesh.receiveShadows = true;
      mesh.checkCollisions = true;

      mesh.metadata = {
        ...(mesh.metadata || {}),
        isHeightmapTerrain: true,
        heightmapData: {
          width: this.config.width,
          height: this.config.height,
          subdivisions: this.config.subdivisions,
          minHeight: this.config.minHeight,
          maxHeight: this.config.maxHeight,
          texture1: this.config.terrainTextureName1,
          texture2: this.config.terrainTextureName2,
          texture3: this.config.terrainTextureName3,
          textureScale: [
            this.config.terrainTextureScale.x,
            this.config.terrainTextureScale.y,
            this.config.terrainTextureScale.z,
          ],
          hasCustomMixMap: this.hasCustomMixMap,
          heightmapBuffer: new Uint8ClampedArray(this.heightmapRgba),
          mixmapBuffer: new Uint8ClampedArray(this.mixmapRgba),
          heightMapImageUrl: heightMapDataUrl,
          mixMapImageUrl: mixMapDataUrl,
        },
      };
    };

    let resultMesh: GroundMesh;
    if (existingMesh) {
      const preVertexData = VertexData.ExtractFromMesh(existingMesh);
      const preMeta = existingMesh.metadata?.heightmapData
        ? { ...existingMesh.metadata.heightmapData }
        : null;

      const vertexData = CreateGroundFromHeightMapVertexData({
        width: this.config.width,
        height: this.config.height,
        subdivisions: this.config.subdivisions,
        minHeight: this.config.minHeight,
        maxHeight: this.config.maxHeight,
        colorFilter: new Color3(0.3, 0.59, 0.11),
        buffer: heightDataBytes,
        bufferWidth: this.mapSize,
        bufferHeight: this.mapSize,
        alphaFilter: 0,
      });
      vertexData.applyToMesh(existingMesh, true);
      (existingMesh as any)._width = this.config.width;
      (existingMesh as any)._height = this.config.height;
      (existingMesh as any)._subdivisionsX = this.config.subdivisions;
      (existingMesh as any)._subdivisionsY = this.config.subdivisions;
      existingMesh.refreshBoundingInfo();
      finalizeTerrainMesh(existingMesh);
      resultMesh = existingMesh;

      if (options.recordHistory !== false) {
        const postVertexData = VertexData.ExtractFromMesh(resultMesh);
        const postMeta = { ...resultMesh.metadata.heightmapData };
        this.service.recordAction({
          name: `Update Heightmap Terrain "${resultMesh.name}"`,
          undo: () => {
            if (resultMesh.isDisposed()) return;
            preVertexData.applyToMesh(resultMesh, true);
            resultMesh.refreshBoundingInfo();
            if (preMeta) {
              resultMesh.metadata = { ...(resultMesh.metadata || {}), heightmapData: preMeta };
              this.syncFromMesh(resultMesh);
            }
            this.service.updateStats();
            this.service.events.onSceneModified?.();
          },
          redo: () => {
            if (resultMesh.isDisposed()) return;
            postVertexData.applyToMesh(resultMesh, true);
            resultMesh.refreshBoundingInfo();
            resultMesh.metadata = { ...(resultMesh.metadata || {}), heightmapData: postMeta };
            this.syncFromMesh(resultMesh);
            this.service.updateStats();
            this.service.events.onSceneModified?.();
          },
        });
      }
    } else {
      const baseName = options.name || this.config.name || 'gdhm';
      const isNameTaken = this.service.importedMeshes.some((m) => !m.isDisposed() && m.name === baseName);
      const uniqueName = isNameTaken ? `${baseName}_${this.terrainCounter++}` : baseName;

      resultMesh = await new Promise<GroundMesh>((resolve) => {
        MeshBuilder.CreateGroundFromHeightMap(
          uniqueName,
          {
            data: heightDataBytes,
            width: this.mapSize,
            height: this.mapSize,
          },
          {
            width: this.config.width,
            height: this.config.height,
            subdivisions: this.config.subdivisions,
            minHeight: this.config.minHeight,
            maxHeight: this.config.maxHeight,
            updatable: this.config.updatable,
            onReady: (mesh: GroundMesh) => {
              finalizeTerrainMesh(mesh);
              resolve(mesh);
            },
          },
          scene,
        );
      });

      if (!this.service.importedMeshes.includes(resultMesh)) {
        this.service.importedMeshes.push(resultMesh);
      }

      if (options.recordHistory !== false) {
        const createdMesh = resultMesh;
        this.service.recordAction({
          name: `Create Heightmap Terrain "${createdMesh.name}"`,
          undo: () => {
            if (!createdMesh.isDisposed()) {
              createdMesh.setEnabled(false);
              const idx = this.service.importedMeshes.indexOf(createdMesh);
              if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
              if (this.service.selectedMesh === createdMesh) {
                this.service.selectMesh(null);
              }
              this.service.updateStats();
              this.service.events.onSceneModified?.();
            }
          },
          redo: () => {
            if (!createdMesh.isDisposed()) {
              createdMesh.setEnabled(true);
              if (!this.service.importedMeshes.includes(createdMesh)) {
                this.service.importedMeshes.push(createdMesh);
              }
              this.service.selectMesh(createdMesh);
              this.service.updateStats();
              this.service.events.onSceneModified?.();
            }
          },
        });
      }
    }

    this.activeTerrainMesh = resultMesh;
    if (options.selectAfterBuild !== false) {
      this.service.selectMesh(resultMesh);
    }
    this.service.updateStats();
    this.service.events.onSceneModified?.();
    this.service.scene.render();
    this.onTerrainUpdated?.(resultMesh);

    return resultMesh;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const sub = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
      binary += String.fromCharCode.apply(null, Array.from(sub));
    }
    if (typeof btoa === 'function') return btoa(binary);
    const nodeBuffer = (
      globalThis as unknown as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }
    ).Buffer;
    if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64');
    return '';
  }

  private base64ToBytes(b64: string): Uint8Array | null {
    try {
      if (typeof atob === 'function') {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
      const nodeBuffer = (
        globalThis as unknown as { Buffer?: { from(data: string, encoding: string): ArrayLike<number> } }
      ).Buffer;
      if (nodeBuffer) {
        return new Uint8Array(nodeBuffer.from(b64, 'base64'));
      }
    } catch {
      // Ignore decode failure
    }
    return null;
  }

  private async ensureTextureOptionRgba(
    opt: HeightmapTextureOption,
    liveTex?: BaseTexture | null,
    size: number = 256,
  ): Promise<HeightmapTextureOption> {
    if (opt.rgbaBuffer && opt.width && opt.height) {
      if (opt.url) {
        this.decodedRgbaCache.set(opt.url, { rgba: opt.rgbaBuffer, width: opt.width, height: opt.height });
      }
      return opt;
    }

    const resolvedLiveUrl = liveTex instanceof Texture ? this.service.resolveTextureImageUrl?.(liveTex) || '' : '';
    const imageUrl = resolvedLiveUrl || opt.url || opt.previewDataUrl || '';

    if (imageUrl) {
      const cached = this.decodedRgbaCache.get(imageUrl);
      if (cached) {
        opt.rgbaBuffer = cached.rgba;
        opt.width = cached.width;
        opt.height = cached.height;
        return opt;
      }

      const loaded = await ImageUtils.loadImageRgba(imageUrl, size, size);
      if (loaded) {
        this.decodedRgbaCache.set(imageUrl, loaded);
        opt.rgbaBuffer = loaded.rgba;
        opt.width = loaded.width;
        opt.height = loaded.height;
        return opt;
      }
    }

    if (liveTex && typeof (liveTex as any).readPixels === 'function') {
      try {
        const texSize = liveTex.getSize();
        if (texSize.width > 0 && texSize.height > 0) {
          const raw = await (liveTex as any).readPixels();
          if (raw && raw.length >= texSize.width * texSize.height * 4) {
            const rgba = new Uint8ClampedArray(texSize.width * texSize.height * 4);
            for (let i = 0; i < rgba.length; i++) {
              rgba[i] = raw instanceof Float32Array ? Math.max(0, Math.min(255, Math.round(raw[i] * 255))) : raw[i];
            }
            const entry = { rgba, width: texSize.width, height: texSize.height };
            if (imageUrl) this.decodedRgbaCache.set(imageUrl, entry);
            opt.rgbaBuffer = entry.rgba;
            opt.width = entry.width;
            opt.height = entry.height;
            return opt;
          }
        }
      } catch {
        // Ignore readPixels error in headless engines
      }
    }

    // Headless fallback when no 2D canvas or GPU readback is available: preserve distinct texture tones
    let primary = '#7d8280';
    let secondary = '#5f6462';
    let accent = '#9ca3a0';
    if (opt.category === 'ai') {
      const aiHistory = this.service.aiTextureGenerator?.getHistory() || [];
      const matched = aiHistory.find((item) => `ai_${item.id}` === opt.id || item.albedoDataUrl === imageUrl);
      if (matched) {
        if (matched.primaryColor) primary = matched.primaryColor;
        if (matched.secondaryColor) secondary = matched.secondaryColor;
        if (matched.accentColor) accent = matched.accentColor;
      }
    }
    const synth = synthesizePbrTextureBuffers({
      type: 'stone',
      primaryColor: primary,
      secondaryColor: secondary,
      accentColor: accent,
      size: 64,
      scale: 4,
      seed: opt.name.length * 37 + 13,
    });
    const entry = { rgba: synth.albedoRgba, width: synth.width, height: synth.height };
    if (imageUrl) this.decodedRgbaCache.set(imageUrl, entry);
    opt.rgbaBuffer = entry.rgba;
    opt.width = entry.width;
    opt.height = entry.height;
    return opt;
  }

  private async waitForTextureReady(tex: BaseTexture, timeoutMs: number = 5000): Promise<void> {
    const isNullEngine = this.service.engine instanceof NullEngine;
    const isReadyWithSize = () => {
      if (!tex.isReady()) return false;
      if (isNullEngine) return true;
      const sz = tex.getSize();
      return sz.width > 0 && sz.height > 0;
    };

    if (isReadyWithSize()) return;

    await new Promise<void>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;
      let loadObs: any = null;
      let internalLoadObs: any = null;
      let errObs: any = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        if (loadObs && tex instanceof Texture) {
          tex.onLoadObservable.remove(loadObs);
        }
        const internal = tex.getInternalTexture?.();
        if (internalLoadObs && internal?.onLoadedObservable) {
          internal.onLoadedObservable.remove(internalLoadObs);
        }
        if (errObs) {
          Texture.OnTextureLoadErrorObservable.remove(errObs);
        }
        resolve();
      };

      timer = setTimeout(finish, timeoutMs);
      poll = setInterval(() => {
        if (isReadyWithSize()) finish();
      }, 25);

      if (tex instanceof Texture) {
        loadObs = tex.onLoadObservable.add(() => {
          if (isReadyWithSize()) finish();
        });
      }
      const internal = tex.getInternalTexture?.();
      if (internal?.onLoadedObservable) {
        internalLoadObs = internal.onLoadedObservable.add(() => {
          if (isReadyWithSize()) finish();
        });
      }
      errObs = Texture.OnTextureLoadErrorObservable.add((erroredTex) => {
        if (erroredTex === tex) finish();
      });
    });
  }

  /**
   * Composites a blended RGBA buffer from the 3 terrain splat textures weighted by the mixmap RGB channels.
   */
  public compositeTerrainAlbedoRgba(
    size: number = 256,
    overrides?: {
      mixmap?: Uint8ClampedArray;
      tex1?: HeightmapTextureOption;
      tex2?: HeightmapTextureOption;
      tex3?: HeightmapTextureOption;
      scale?: Vector3;
      flipY?: boolean;
    },
  ): Uint8ClampedArray {
    const tex1 = overrides?.tex1 || this.resolveTextureOption(this.config.terrainTextureName1, 'rock');
    const tex2 = overrides?.tex2 || this.resolveTextureOption(this.config.terrainTextureName2, 'grass');
    const tex3 = overrides?.tex3 || this.resolveTextureOption(this.config.terrainTextureName3, 'sand');
    const mixmap = overrides?.mixmap || this.mixmapRgba;
    const scaleVec = overrides?.scale || this.config.terrainTextureScale;
    const flipY = Boolean(overrides?.flipY);

    const sampleBuffer = (
      opt: HeightmapTextureOption,
      u: number,
      v: number,
      scale: number,
      fallbackRgb: [number, number, number],
    ): [number, number, number] => {
      if (!opt.rgbaBuffer || !opt.width || !opt.height) return fallbackRgb;
      const su = ((u * scale) % 1 + 1) % 1;
      const sv = ((v * scale) % 1 + 1) % 1;
      const tx = Math.min(opt.width - 1, Math.floor(su * opt.width));
      const ty = Math.min(opt.height - 1, Math.floor(sv * opt.height));
      const idx = (ty * opt.width + tx) * 4;
      return [opt.rgbaBuffer[idx], opt.rgbaBuffer[idx + 1], opt.rgbaBuffer[idx + 2]];
    };

    const out = new Uint8ClampedArray(size * size * 4);
    const sx = scaleVec.x || 10;
    const sy = scaleVec.y || 10;
    const sz = scaleVec.z || 10;

    for (let y = 0; y < size; y++) {
      const v = y / size;
      const my = Math.min(this.mapSize - 1, Math.floor(v * this.mapSize));
      const outY = flipY ? size - 1 - y : y;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const mx = Math.min(this.mapSize - 1, Math.floor(u * this.mapSize));
        const mIdx = (my * this.mapSize + mx) * 4;
        const w1 = mixmap[mIdx] / 255;
        const w2 = mixmap[mIdx + 1] / 255;
        const w3 = mixmap[mIdx + 2] / 255;
        const wSum = w1 + w2 + w3 || 1;

        const c1 = sampleBuffer(tex1, u, v, sx, [110, 112, 118]);
        const c2 = sampleBuffer(tex2, u, v, sy, [75, 125, 55]);
        const c3 = sampleBuffer(tex3, u, v, sz, [215, 190, 140]);

        const outIdx = (outY * size + x) * 4;
        out[outIdx] = Math.min(255, Math.round((c1[0] * w1 + c2[0] * w2 + c3[0] * w3) / wSum));
        out[outIdx + 1] = Math.min(255, Math.round((c1[1] * w1 + c2[1] * w2 + c3[1] * w3) / wSum));
        out[outIdx + 2] = Math.min(255, Math.round((c1[2] * w1 + c2[2] * w2 + c3[2] * w3) / wSum));
        out[outIdx + 3] = 255;
      }
    }

    return out;
  }

  private getHeightmapMeshes(): GroundMesh[] {
    const meshes = new Set<GroundMesh>();
    for (const m of this.service.importedMeshes) {
      if (m && !m.isDisposed() && this.isHeightmapMesh(m)) {
        meshes.add(m);
      }
    }
    if (this.activeTerrainMesh && !this.activeTerrainMesh.isDisposed() && this.isHeightmapMesh(this.activeTerrainMesh)) {
      meshes.add(this.activeTerrainMesh);
    }
    return Array.from(meshes);
  }

  private resolveSlotOptionForMesh(
    slotName: string | undefined,
    fallbackId: string,
    liveTex?: BaseTexture | null,
  ): HeightmapTextureOption {
    if (slotName) {
      return this.resolveTextureOption(slotName, fallbackId);
    }
    if (liveTex instanceof Texture) {
      const liveUrl = this.service.resolveTextureImageUrl?.(liveTex) || liveTex.url || '';
      if (liveUrl) {
        return this.resolveTextureOption(liveUrl, fallbackId);
      }
    }
    return this.resolveTextureOption(undefined, fallbackId);
  }

  /**
   * Temporarily swaps TerrainMaterial with a composite PBRMaterial prior to glTF/GLB export
   * so exported terrain meshes carry valid, fully decoded PBR textures in standard 3D viewers and on reload.
   */
  public async prepareMeshesForExport(): Promise<void> {
    this.exportBackupMaterials.clear();
    const isHeadless =
      this.service.engine instanceof NullEngine ||
      typeof document === 'undefined' ||
      !document.createElement('canvas').getContext('2d');
    const compSize = isHeadless ? 128 : 512;

    for (const mesh of this.getHeightmapMeshes()) {
      if (!(mesh.material instanceof TerrainMaterial)) continue;

      const terrainMat = mesh.material;
      this.exportBackupMaterials.set(mesh, terrainMat);
      this.syncFromMesh(mesh);

      const meta = mesh.metadata?.heightmapData || {};
      const meshMixmap =
        meta.mixmapBuffer instanceof Uint8ClampedArray && meta.mixmapBuffer.length === this.mixmapRgba.length
          ? meta.mixmapBuffer
          : this.mixmapRgba;
      const meshScale = Array.isArray(meta.textureScale) && meta.textureScale.length >= 3
        ? new Vector3(
            Number(meta.textureScale[0]) || 10,
            Number(meta.textureScale[1]) || 10,
            Number(meta.textureScale[2]) || 10,
          )
        : this.config.terrainTextureScale;

      const tex1Opt = this.resolveSlotOptionForMesh(meta.texture1, 'rock', terrainMat.diffuseTexture1);
      const tex2Opt = this.resolveSlotOptionForMesh(meta.texture2, 'grass', terrainMat.diffuseTexture2);
      const tex3Opt = this.resolveSlotOptionForMesh(meta.texture3, 'sand', terrainMat.diffuseTexture3);

      await Promise.all([
        this.ensureTextureOptionRgba(tex1Opt, terrainMat.diffuseTexture1, 256),
        this.ensureTextureOptionRgba(tex2Opt, terrainMat.diffuseTexture2, 256),
        this.ensureTextureOptionRgba(tex3Opt, terrainMat.diffuseTexture3, 256),
      ]);

      const pbr = new PBRMaterial(`${mesh.name}_ExportPBR`, this.service.scene);
      pbr.backFaceCulling = false;
      pbr.twoSidedLighting = true;
      pbr.roughness = 0.88;
      pbr.metallic = 0.0;

      // Flip Y so uv.v = 0..1 aligns directly with glTF/GLB invertY=false texture coordinates
      const compRgba = this.compositeTerrainAlbedoRgba(compSize, {
        mixmap: meshMixmap,
        tex1: tex1Opt,
        tex2: tex2Opt,
        tex3: tex3Opt,
        scale: meshScale,
        flipY: true,
      });

      const compUrl = ImageUtils.rgbaBufferToDataUrl(compRgba, compSize, compSize);
      const tex = new Texture(compUrl, this.service.scene, {
        noMipmap: false,
        invertY: false,
        samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
        mimeType: 'image/png',
      });
      tex.name = `${mesh.name}_CompositeAlbedo.png`;
      tex.wrapU = Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      tex.hasAlpha = false;

      await this.waitForTextureReady(tex, 5000);

      pbr.albedoTexture = tex;
      pbr.albedoColor = Color3.White();

      mesh.material = pbr;
    }
  }

  /**
   * Ensures all TerrainMaterial textures use self-contained data:image/ URLs before .babylon serialization.
   */
  public async prepareTexturesForBabylonSerialization(): Promise<void> {
    for (const mesh of this.getHeightmapMeshes()) {
      if (!(mesh.material instanceof TerrainMaterial)) continue;
      const mat = mesh.material;
      const texList: Array<BaseTexture | null | undefined> = [
        mat.mixTexture,
        mat.diffuseTexture1,
        mat.diffuseTexture2,
        mat.diffuseTexture3,
      ];
      for (const tex of texList) {
        if (!(tex instanceof Texture)) continue;
        if (tex.url && tex.url.startsWith('data:image/')) continue;
        const resolved = this.service.resolveTextureImageUrl?.(tex);
        if (resolved && resolved.startsWith('data:image/')) {
          tex.updateURL(resolved);
          await this.waitForTextureReady(tex, 3000);
        }
      }
    }
  }

  /**
   * Serializes heightmap terrain state (buffers, config, and texture URLs) for .babylon project save files.
   */
  public exportState(): any {
    const meshes = this.getHeightmapMeshes();
    if (meshes.length === 0) return undefined;

    const entries = meshes.map((mesh) => {
      this.syncFromMesh(mesh);
      const meta = mesh.metadata?.heightmapData || {};
      const tex1Opt = this.resolveSlotOptionForMesh(meta.texture1 || this.config.terrainTextureName1, 'rock');
      const tex2Opt = this.resolveSlotOptionForMesh(meta.texture2 || this.config.terrainTextureName2, 'grass');
      const tex3Opt = this.resolveSlotOptionForMesh(meta.texture3 || this.config.terrainTextureName3, 'sand');
      const hBuf =
        meta.heightmapBuffer instanceof Uint8ClampedArray ? meta.heightmapBuffer : this.heightmapRgba;
      const mBuf =
        meta.mixmapBuffer instanceof Uint8ClampedArray ? meta.mixmapBuffer : this.mixmapRgba;

      return {
        meshName: mesh.name,
        width: meta.width ?? this.config.width,
        height: meta.height ?? this.config.height,
        subdivisions: meta.subdivisions ?? this.config.subdivisions,
        minHeight: meta.minHeight ?? this.config.minHeight,
        maxHeight: meta.maxHeight ?? this.config.maxHeight,
        texture1: meta.texture1 ?? this.config.terrainTextureName1,
        texture2: meta.texture2 ?? this.config.terrainTextureName2,
        texture3: meta.texture3 ?? this.config.terrainTextureName3,
        texture1Name: tex1Opt.name,
        texture2Name: tex2Opt.name,
        texture3Name: tex3Opt.name,
        texture1DataUrl: tex1Opt.category !== 'builtin' ? tex1Opt.url : undefined,
        texture2DataUrl: tex2Opt.category !== 'builtin' ? tex2Opt.url : undefined,
        texture3DataUrl: tex3Opt.category !== 'builtin' ? tex3Opt.url : undefined,
        textureScale: Array.isArray(meta.textureScale)
          ? [...meta.textureScale]
          : [
              this.config.terrainTextureScale.x,
              this.config.terrainTextureScale.y,
              this.config.terrainTextureScale.z,
            ],
        hasCustomMixMap: Boolean(meta.hasCustomMixMap ?? this.hasCustomMixMap),
        mapSize: this.mapSize,
        heightmapBase64: this.bytesToBase64(new Uint8Array(hBuf.buffer, hBuf.byteOffset, hBuf.byteLength)),
        mixmapBase64: this.bytesToBase64(new Uint8Array(mBuf.buffer, mBuf.byteOffset, mBuf.byteLength)),
      };
    });

    return { meshes: entries };
  }

  /**
   * Restores saved heightmap terrain state from a loaded .babylon project file.
   */
  public restoreState(state: any): void {
    if (!state || !Array.isArray(state.meshes) || state.meshes.length === 0) return;

    for (const entry of state.meshes) {
      const targetMesh = this.service.importedMeshes.find(
        (m): m is GroundMesh => m instanceof Mesh && m.name === entry.meshName,
      ) || this.service.importedMeshes.find((m): m is GroundMesh => m instanceof GroundMesh);

      const hBytes = typeof entry.heightmapBase64 === 'string' ? this.base64ToBytes(entry.heightmapBase64) : null;
      const mBytes = typeof entry.mixmapBase64 === 'string' ? this.base64ToBytes(entry.mixmapBase64) : null;

      if (hBytes && hBytes.length === this.heightmapRgba.length) {
        this.heightmapRgba.set(hBytes);
      }
      if (mBytes && mBytes.length === this.mixmapRgba.length) {
        this.mixmapRgba.set(mBytes);
      }

      const registerRestoredCustom = (slotId: string | undefined, slotName: string | undefined, dataUrl: string | undefined) => {
        if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
        const available = this.getAvailableTextures();
        if (available.some((t) => t.id === slotId || t.url === dataUrl)) return;
        this.customTextures.push({
          id: slotId || `custom_restored_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: slotName || 'Restored Texture',
          url: dataUrl,
          category: 'custom',
          previewDataUrl: dataUrl,
        });
      };

      registerRestoredCustom(entry.texture1, entry.texture1Name, entry.texture1DataUrl);
      registerRestoredCustom(entry.texture2, entry.texture2Name, entry.texture2DataUrl);
      registerRestoredCustom(entry.texture3, entry.texture3Name, entry.texture3DataUrl);

      if (entry.width) this.config.width = Number(entry.width);
      if (entry.height) this.config.height = Number(entry.height);
      if (entry.subdivisions) this.config.subdivisions = Number(entry.subdivisions);
      if (entry.minHeight !== undefined) this.config.minHeight = Number(entry.minHeight);
      if (entry.maxHeight !== undefined) this.config.maxHeight = Number(entry.maxHeight);
      if (entry.texture1) this.config.terrainTextureName1 = String(entry.texture1);
      if (entry.texture2) this.config.terrainTextureName2 = String(entry.texture2);
      if (entry.texture3) this.config.terrainTextureName3 = String(entry.texture3);
      if (Array.isArray(entry.textureScale) && entry.textureScale.length >= 3) {
        this.config.terrainTextureScale.set(
          Number(entry.textureScale[0]) || 10,
          Number(entry.textureScale[1]) || 10,
          Number(entry.textureScale[2]) || 10,
        );
      }
      this.hasCustomMixMap = Boolean(entry.hasCustomMixMap);
      this.autoGenerateMixMap = !this.hasCustomMixMap;

      if (targetMesh) {
        const mixUrl = ImageUtils.rgbaBufferToDataUrl(this.mixmapRgba, this.mapSize, this.mapSize);
        const heightUrl = ImageUtils.rgbaBufferToDataUrl(this.heightmapRgba, this.mapSize, this.mapSize);
        const tex1Opt = this.resolveTextureOption(entry.texture1 || entry.texture1DataUrl, 'rock');
        const tex2Opt = this.resolveTextureOption(entry.texture2 || entry.texture2DataUrl, 'grass');
        const tex3Opt = this.resolveTextureOption(entry.texture3 || entry.texture3DataUrl, 'sand');

        let terrainMat = targetMesh.material instanceof TerrainMaterial ? targetMesh.material : null;
        if (!terrainMat) {
          terrainMat = new TerrainMaterial(`${targetMesh.name}_TerrainMaterial`, this.service.scene);
          targetMesh.material = terrainMat;
        }
        terrainMat.backFaceCulling = this.config.backFaceCulling;

        const mixTex = new Texture(mixUrl, this.service.scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
        mixTex.name = `${targetMesh.name}_Mixmap`;
        mixTex.wrapU = Texture.CLAMP_ADDRESSMODE;
        mixTex.wrapV = Texture.CLAMP_ADDRESSMODE;
        if (terrainMat.mixTexture && terrainMat.mixTexture !== mixTex) terrainMat.mixTexture.dispose();
        terrainMat.mixTexture = mixTex;

        const bindSplat = (opt: HeightmapTextureOption, scale: number, label: string, prev?: Nullable<BaseTexture>): Texture => {
          const t = new Texture(opt.url, this.service.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
          t.name = `${targetMesh.name}_${label}_${opt.id}`;
          t.wrapU = Texture.WRAP_ADDRESSMODE;
          t.wrapV = Texture.WRAP_ADDRESSMODE;
          t.uScale = scale;
          t.vScale = scale;
          if (prev && prev !== t) prev.dispose();
          return t;
        };

        terrainMat.diffuseTexture1 = bindSplat(tex1Opt, this.config.terrainTextureScale.x, 'tex1', terrainMat.diffuseTexture1);
        terrainMat.diffuseTexture2 = bindSplat(tex2Opt, this.config.terrainTextureScale.y, 'tex2', terrainMat.diffuseTexture2);
        terrainMat.diffuseTexture3 = bindSplat(tex3Opt, this.config.terrainTextureScale.z, 'tex3', terrainMat.diffuseTexture3);
        terrainMat.markAsDirty(Material.TextureDirtyFlag);

        targetMesh.metadata = {
          ...(targetMesh.metadata || {}),
          isHeightmapTerrain: true,
          heightmapData: {
            width: this.config.width,
            height: this.config.height,
            subdivisions: this.config.subdivisions,
            minHeight: this.config.minHeight,
            maxHeight: this.config.maxHeight,
            texture1: this.config.terrainTextureName1,
            texture2: this.config.terrainTextureName2,
            texture3: this.config.terrainTextureName3,
            textureScale: [
              this.config.terrainTextureScale.x,
              this.config.terrainTextureScale.y,
              this.config.terrainTextureScale.z,
            ],
            hasCustomMixMap: this.hasCustomMixMap,
            heightmapBuffer: new Uint8ClampedArray(this.heightmapRgba),
            mixmapBuffer: new Uint8ClampedArray(this.mixmapRgba),
            heightMapImageUrl: heightUrl,
            mixMapImageUrl: mixUrl,
          },
        };
        this.activeTerrainMesh = targetMesh;
      }
    }

    this.onMapsChanged?.();
  }

  /**
   * Restores the live TerrainMaterial after glTF/GLB export completes.
   */
  public restoreMeshesAfterExport(): void {
    for (const [mesh, origMat] of this.exportBackupMaterials.entries()) {
      if (!mesh.isDisposed()) {
        const tempMat = mesh.material;
        mesh.material = origMat;
        if (tempMat && tempMat !== origMat) {
          if (tempMat instanceof PBRMaterial && tempMat.albedoTexture) {
            tempMat.albedoTexture.dispose();
          }
          tempMat.dispose();
        }
      }
    }
    this.exportBackupMaterials.clear();
  }

  public dispose(): void {
    this.restoreMeshesAfterExport();
    this.activeTerrainMesh = null;
  }
}
