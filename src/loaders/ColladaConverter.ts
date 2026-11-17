import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const FALLBACK_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

const TEXTURE_LOAD_TIMEOUT_MS = 15000;

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|bmp|gif|tga|dds|ktx2?)$/i;

export interface ColladaConversionResult {
  glbFile: File;
  glbBlob: Blob;
  originalName: string;
  consumedFiles: Set<File>;
  warnings: string[];
}

export interface ColladaBatchPreprocessResult {
  files: File[];
  convertedFromDae: boolean;
  convertedCount: number;
  consumedTextureFiles: Set<File>;
  warnings: string[];
  originalNames: Map<File, string>;
}

/**
 * Converts Collada (.dae) assets into binary glTF (.glb) files using an offscreen Three.js scene
 * (`ColladaLoader` + `GLTFExporter`), resolving companion textures from multi-file imports.
 */
export class ColladaConverter {
  /**
   * Returns true if the given File or filename/URL refers to a Collada (.dae) asset.
   */
  public static isColladaFile(fileOrName: File | string): boolean {
    const rawName = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
    const withoutQuery = rawName.split('?')[0].split('#')[0];
    return withoutQuery.toLowerCase().endsWith('.dae');
  }

  /**
   * Returns true if any file in the list is a Collada (.dae) file.
   */
  public static hasColladaFiles(files: File[]): boolean {
    return files.some((f) => !f.name.startsWith('.') && this.isColladaFile(f));
  }

  /**
   * Pre-processes an import/open file batch. If any `.dae` files are present, each `.dae` is
   * converted into an embedded `.glb` `File` (using all companion files in the batch to resolve
   * textures) before Babylon.js loads the result. If no `.dae` files are present, returns the
   * input list unchanged.
   */
  public static async preprocessImportFiles(files: File[]): Promise<ColladaBatchPreprocessResult> {
    const validFiles = files.filter((f) => !f.name.startsWith('.'));
    const daeFiles = validFiles.filter((f) => this.isColladaFile(f));

    if (daeFiles.length === 0) {
      return {
        files: validFiles,
        convertedFromDae: false,
        convertedCount: 0,
        consumedTextureFiles: new Set<File>(),
        warnings: [],
        originalNames: new Map<File, string>(),
      };
    }

    const companionFiles = validFiles.filter((f) => !this.isColladaFile(f));
    const convertedMap = new Map<File, ColladaConversionResult>();
    const consumedTextureFiles = new Set<File>();
    const warnings: string[] = [];
    const originalNames = new Map<File, string>();

    for (const daeFile of daeFiles) {
      const result = await this.convertToGlbFile(daeFile, companionFiles);
      convertedMap.set(daeFile, result);
      originalNames.set(result.glbFile, daeFile.name);
      for (const consumed of result.consumedFiles) {
        consumedTextureFiles.add(consumed);
      }
      warnings.push(...result.warnings);
    }

    const processedFiles: File[] = [];
    for (const file of validFiles) {
      const converted = convertedMap.get(file);
      if (converted) {
        processedFiles.push(converted.glbFile);
      } else {
        processedFiles.push(file);
      }
    }

    return {
      files: processedFiles,
      convertedFromDae: true,
      convertedCount: daeFiles.length,
      consumedTextureFiles,
      warnings,
      originalNames,
    };
  }

  /**
   * Converts a single `.dae` `File` together with optional companion texture files into a `.glb` `File`.
   */
  public static async convertToGlbFile(
    daeFile: File,
    companionFiles: File[] = []
  ): Promise<ColladaConversionResult> {
    const daeText = await daeFile.text();
    return await this.convertColladaTextToGlb(daeText, daeFile.name, companionFiles, '');
  }

  /**
   * Fetches a `.dae` URL and converts it (along with relative remote textures) into a `.glb` `File`.
   */
  public static async convertUrlToGlbFile(url: string, filename?: string): Promise<ColladaConversionResult> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Collada (.dae) file from "${url}": HTTP ${response.status}`);
    }
    const daeText = await response.text();
    const lastSlash = url.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? url.substring(0, lastSlash + 1) : './';
    const resolvedName = filename || url.split('/').pop()?.split('?')[0] || 'model.dae';
    return await this.convertColladaTextToGlb(daeText, resolvedName, [], basePath);
  }

  private static async convertColladaTextToGlb(
    daeText: string,
    originalName: string,
    companionFiles: File[],
    basePath: string
  ): Promise<ColladaConversionResult> {
    const fileMap = this.buildCompanionFileMap(companionFiles);
    const createdObjectUrls: string[] = [];
    const consumedFiles = new Set<File>();
    const warnings: string[] = [];

    const manager = new THREE.LoadingManager();
    let hasStartedLoading = false;
    let isLoadComplete = false;
    let resolveLoads: (() => void) | null = null;
    const loadsPromise = new Promise<void>((resolve) => {
      resolveLoads = resolve;
    });

    manager.onStart = () => {
      hasStartedLoading = true;
    };
    manager.onLoad = () => {
      isLoadComplete = true;
      resolveLoads?.();
    };
    manager.onError = (failedUrl) => {
      warnings.push(`Could not load Collada texture "${failedUrl}".`);
    };

    manager.setURLModifier((rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
      }

      const matched = this.findCompanionFile(trimmed, fileMap);
      if (matched) {
        consumedFiles.add(matched);
        const blobUrl = URL.createObjectURL(matched);
        createdObjectUrls.push(blobUrl);
        return blobUrl;
      }

      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }

      const cleanDisplay = this.normalizeUriPath(trimmed).split('/').pop() || trimmed;
      if (IMAGE_EXTENSION_RE.test(cleanDisplay)) {
        warnings.push(
          `Texture "${cleanDisplay}" referenced by "${originalName}" was not found in the imported files. Using neutral fallback.`
        );
        // TGALoader parses binary TGA bytes, so avoid returning a PNG data URI for .tga
        if (/\.tga$/i.test(cleanDisplay)) {
          return trimmed;
        }
        return FALLBACK_1X1_PNG;
      }

      return trimmed;
    });

    let parsedScene: THREE.Scene | null = null;
    let exportScene: THREE.Scene | null = null;

    try {
      const loader = new ColladaLoader(manager);
      const collada = loader.parse(daeText, basePath);

      if (!collada || !collada.scene) {
        throw new Error(`Failed to parse Collada (.dae) file "${originalName}".`);
      }

      parsedScene = collada.scene;

      if (hasStartedLoading && !isLoadComplete) {
        await this.waitWithTimeout(loadsPromise, TEXTURE_LOAD_TIMEOUT_MS);
      }

      exportScene = this.buildExportScene(parsedScene, originalName);
      this.sanitizeAndPrepareScene(exportScene, warnings);

      const exporter = new GLTFExporter();
      this.registerSkinRootRepairPlugin(exporter);
      const animations = Array.isArray((parsedScene as any).animations)
        ? ((parsedScene as any).animations as THREE.AnimationClip[])
        : [];

      const gltfResult = await exporter.parseAsync(exportScene, {
        binary: true,
        onlyVisible: true,
        embedImages: true,
        animations,
      });

      if (!(gltfResult instanceof ArrayBuffer)) {
        throw new Error(`GLTFExporter did not produce a binary .glb buffer for "${originalName}".`);
      }

      const glbBlob = new Blob([gltfResult], { type: 'model/gltf-binary' });
      const glbFilename = originalName.replace(/\.dae$/i, '') + '.glb';
      const glbFile = new File([glbBlob], glbFilename, { type: 'model/gltf-binary' });

      return {
        glbFile,
        glbBlob,
        originalName,
        consumedFiles,
        warnings: Array.from(new Set(warnings)),
      };
    } finally {
      if (exportScene) {
        this.disposeThreeScene(exportScene);
      }
      if (parsedScene && parsedScene !== exportScene) {
        this.disposeThreeScene(parsedScene);
      }
      for (const url of createdObjectUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke errors
        }
      }
    }
  }

  private static waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, timeoutMs);

      promise.then(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  private static buildCompanionFileMap(files: File[]): Map<string, File> {
    const map = new Map<string, File>();

    for (const file of files) {
      if (file.name.startsWith('.') || this.isColladaFile(file)) continue;

      const lowerName = file.name.toLowerCase();
      if (!map.has(lowerName)) {
        map.set(lowerName, file);
      }

      const relPath =
        (file as any).correctName || (file as any).fullRelativePath || file.webkitRelativePath || '';
      if (relPath) {
        const cleanPath = relPath.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').toLowerCase();
        map.set(cleanPath, file);

        let currentSub = cleanPath;
        let slashIdx = currentSub.indexOf('/');
        while (slashIdx !== -1) {
          currentSub = currentSub.substring(slashIdx + 1);
          if (currentSub && !map.has(currentSub)) {
            map.set(currentSub, file);
          }
          slashIdx = currentSub.indexOf('/');
        }
      }
    }

    return map;
  }

  private static normalizeUriPath(rawUrl: string): string {
    const withoutFileScheme = rawUrl.startsWith('file:') ? rawUrl.replace(/^file:(\/\/)?/i, '') : rawUrl;
    let decoded = withoutFileScheme;
    try {
      decoded = decodeURIComponent(withoutFileScheme);
    } catch {
      // Keep raw string if malformed percent-encoding
    }
    return decoded
      .replace(/\\/g, '/')
      .replace(/^(\.\.\/)+/, '')
      .replace(/^(\.\/|\/)+/, '');
  }

  private static findCompanionFile(rawUrl: string, fileMap: Map<string, File>): File | undefined {
    if (fileMap.size === 0) return undefined;

    const cleanUri = this.normalizeUriPath(rawUrl);
    const lowerCleanUri = cleanUri.toLowerCase();
    const fileName = cleanUri.split('/').pop() || cleanUri;
    const lowerFileName = fileName.toLowerCase();

    const direct = fileMap.get(lowerCleanUri) || fileMap.get(lowerFileName);
    if (direct) return direct;

    for (const [key, file] of fileMap.entries()) {
      if (
        key === lowerCleanUri ||
        key === lowerFileName ||
        key.endsWith('/' + lowerCleanUri) ||
        key.endsWith('/' + lowerFileName)
      ) {
        return file;
      }
    }

    return undefined;
  }

  /**
   * Moves Collada root children into a fresh invisible `THREE.Scene`.
   * Preserves `ColladaLoader`'s Z-UP -> Y-UP root rotation and `asset.unit` scale on a wrapper
   * `Group`, since `GLTFExporter` does not serialize transforms on root `Scene` instances.
   */
  private static buildExportScene(colladaScene: THREE.Scene, originalName: string): THREE.Scene {
    const exportScene = new THREE.Scene();
    const hasNonIdentityTransform =
      colladaScene.position.lengthSq() > 1e-8 ||
      Math.abs(colladaScene.quaternion.x) > 1e-6 ||
      Math.abs(colladaScene.quaternion.y) > 1e-6 ||
      Math.abs(colladaScene.quaternion.z) > 1e-6 ||
      Math.abs(colladaScene.quaternion.w - 1) > 1e-6 ||
      colladaScene.scale.distanceToSquared(new THREE.Vector3(1, 1, 1)) > 1e-8;

    const children = [...colladaScene.children];
    if (hasNonIdentityTransform) {
      const rootGroup = new THREE.Group();
      rootGroup.name = originalName.replace(/\.dae$/i, '') || 'ColladaModel';
      rootGroup.position.copy(colladaScene.position);
      rootGroup.quaternion.copy(colladaScene.quaternion);
      rootGroup.scale.copy(colladaScene.scale);
      for (const child of children) {
        rootGroup.add(child);
      }
      exportScene.add(rootGroup);
    } else {
      for (const child of children) {
        exportScene.add(child);
      }
    }

    return exportScene;
  }

  /**
   * Repairs `skin.skeleton` on exported glTF skins.
   * `GLTFExporter` defaults `skin.skeleton` to `skeleton.bones[0]`, which breaks Babylon.js
   * bone hierarchies when Collada's skin joint list starts with a child bone (e.g. `wing_L`)
   * instead of the skeleton root (`skl_root`). Setting `skin.skeleton` to the lowest common
   * ancestor of all `skin.joints` matches the glTF 2.0 specification.
   */
  private static registerSkinRootRepairPlugin(exporter: GLTFExporter): void {
    exporter.register((writer) => ({
      afterParse: () => {
        const json = (writer as any).json as
          | {
              nodes?: Array<{ children?: number[] }>;
              skins?: Array<{ joints?: number[]; skeleton?: number }>;
            }
          | undefined;
        if (!json || !Array.isArray(json.skins) || !Array.isArray(json.nodes)) return;

        const parentOf = new Array<number>(json.nodes.length).fill(-1);
        json.nodes.forEach((node, idx) => {
          if (Array.isArray(node.children)) {
            for (const childIdx of node.children) {
              parentOf[childIdx] = idx;
            }
          }
        });

        const pathToRoot = (nodeIdx: number): number[] => {
          const path: number[] = [];
          let cur = nodeIdx;
          const seen = new Set<number>();
          while (cur !== -1 && cur !== undefined && !seen.has(cur)) {
            seen.add(cur);
            path.unshift(cur);
            cur = parentOf[cur] ?? -1;
          }
          return path;
        };

        for (const skin of json.skins) {
          if (!Array.isArray(skin.joints) || skin.joints.length === 0) continue;
          const paths = skin.joints.map(pathToRoot);
          if (paths[0].length === 0) {
            delete skin.skeleton;
            continue;
          }
          let lca: number | undefined = paths[0][0];
          for (let depth = 0; depth < paths[0].length; depth++) {
            const candidate = paths[0][depth];
            if (paths.every((p) => p[depth] === candidate)) {
              lca = candidate;
            } else {
              break;
            }
          }
          if (lca !== undefined) {
            skin.skeleton = lca;
          } else {
            delete skin.skeleton;
          }
        }
      },
    }));
  }

  private static isValidLoadedTexture(tex: THREE.Texture | null | undefined): tex is THREE.Texture {
    if (!tex || !tex.image) return false;
    const img = tex.image as any;
    if (img.data !== undefined) {
      return typeof img.width === 'number' && img.width > 0 && typeof img.height === 'number' && img.height > 0;
    }
    if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    }
    const width = img.naturalWidth ?? img.width ?? 0;
    const height = img.naturalHeight ?? img.height ?? 0;
    return width > 0 && height > 0;
  }

  /**
   * Flips `DataTexture` pixel rows vertically when `flipY === true` because `GLTFExporter`
   * writes `DataTexture` pixels via `ctx.putImageData()`, which ignores canvas `scale(1, -1)` flips.
   */
  private static normalizeDataTextureOrientation(tex: THREE.Texture): void {
    const img = tex.image as any;
    if (!img || !img.data || !tex.flipY) return;
    const width = img.width as number;
    const height = img.height as number;
    const data = img.data as Uint8Array | Uint8ClampedArray;
    const rowBytes = width * 4;
    if (!width || !height || data.length < rowBytes * height) return;

    const tempRow = new Uint8Array(rowBytes);
    for (let y = 0; y < Math.floor(height / 2); y++) {
      const topOffset = y * rowBytes;
      const bottomOffset = (height - 1 - y) * rowBytes;
      tempRow.set(data.subarray(topOffset, topOffset + rowBytes));
      data.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
      data.set(tempRow, bottomOffset);
    }
    tex.flipY = false;
  }

  private static isVertexColorNearBlack(colorAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): boolean {
    const sampleCount = Math.min(colorAttr.count, 64);
    if (sampleCount === 0) return false;
    const step = Math.max(1, Math.floor(colorAttr.count / sampleCount));
    let maxChannel = 0;
    for (let i = 0; i < colorAttr.count; i += step) {
      maxChannel = Math.max(maxChannel, colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
      if (maxChannel > 0.05) return false;
    }
    return true;
  }

  private static sanitizeAndPrepareScene(scene: THREE.Scene, warnings: string[]): void {
    const objectsToReplaceWithGroup: Array<THREE.Light | THREE.Camera> = [];
    const convertedMaterials = new Map<THREE.Material, THREE.Material>();
    const processedGeometries = new Set<THREE.BufferGeometry>();

    scene.traverse((obj) => {
      if (obj instanceof THREE.Light || obj instanceof THREE.Camera) {
        const hasRenderableDescendant = obj.children.some((c) => c instanceof THREE.Mesh || c.children.length > 0);
        if (hasRenderableDescendant) {
          objectsToReplaceWithGroup.push(obj);
        } else {
          obj.visible = false;
        }
        return;
      }

      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => this.prepareMaterialForGltf(mat, warnings, convertedMaterials));
      } else {
        mesh.material = this.prepareMaterialForGltf(mesh.material, warnings, convertedMaterials);
      }

      if (obj instanceof THREE.Mesh && mesh.geometry && !processedGeometries.has(mesh.geometry)) {
        processedGeometries.add(mesh.geometry);
        const geo = mesh.geometry;

        // ColladaComposer produces non-indexed BufferGeometry; generate sequential indices
        // so glTF primitives report accurate triangle counts and support mesh editing tools.
        if (!geo.index && geo.getAttribute('position')) {
          const count = geo.getAttribute('position').count;
          if (count > 0) {
            const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
            for (let i = 0; i < count; i++) {
              indices[i] = i;
            }
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
          }
        }

        if (!geo.getAttribute('normal') && geo.getAttribute('position')) {
          geo.computeVertexNormals();
        }

        // ColladaLoader leaves `vertexColors = false` on materials even when a COLOR source exists,
        // whereas GLTFExporter exports `COLOR_0` and Babylon multiplies it into albedo.
        const colorAttr = geo.getAttribute('color');
        if (colorAttr) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const anyUsesVertexColors = mats.some((m) => Boolean(m.vertexColors));
          const anyHasDiffuseMap = mats.some((m) => Boolean((m as any).map));
          if (!anyUsesVertexColors && (anyHasDiffuseMap || this.isVertexColorNearBlack(colorAttr))) {
            geo.deleteAttribute('color');
          }
        }
      }
    });

    for (const obj of objectsToReplaceWithGroup) {
      const parent = obj.parent;
      if (!parent) continue;
      const group = new THREE.Group();
      group.name = obj.name;
      group.position.copy(obj.position);
      group.quaternion.copy(obj.quaternion);
      group.scale.copy(obj.scale);
      for (const child of [...obj.children]) {
        group.add(child);
      }
      parent.remove(obj);
      parent.add(group);
    }
  }

  private static prepareMaterialForGltf(
    material: THREE.Material,
    warnings: string[],
    cache: Map<THREE.Material, THREE.Material>
  ): THREE.Material {
    const cached = cache.get(material);
    if (cached) return cached;

    const textureSlots = [
      'map',
      'normalMap',
      'bumpMap',
      'emissiveMap',
      'aoMap',
      'alphaMap',
      'roughnessMap',
      'metalnessMap',
      'lightMap',
      'specularMap',
    ] as const;

    const matAny = material as any;
    for (const slot of textureSlots) {
      const tex = matAny[slot] as THREE.Texture | null | undefined;
      if (tex && !this.isValidLoadedTexture(tex)) {
        warnings.push(`Skipped unloaded texture in slot "${slot}" on material "${material.name || 'unnamed'}".`);
        matAny[slot] = null;
      } else if (tex) {
        this.normalizeDataTextureOrientation(tex);
      }
    }

    if (material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshLambertMaterial) {
      let roughness = 0.85;
      if (material instanceof THREE.MeshPhongMaterial) {
        const shininess = Math.min(Math.max(material.shininess ?? 30, 0), 100);
        roughness = Math.min(1, Math.max(0.2, 1 - Math.sqrt(shininess / 100) * 0.75));
      }

      const pbr = new THREE.MeshStandardMaterial({
        name: material.name,
        color: material.color.clone(),
        map: material.map,
        normalMap: material.normalMap,
        bumpMap: material.bumpMap,
        bumpScale: (material as THREE.MeshPhongMaterial).bumpScale ?? 1,
        emissive: material.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
        emissiveMap: material.emissiveMap,
        emissiveIntensity: material.emissiveIntensity ?? 1,
        aoMap: material.aoMap,
        alphaMap: material.alphaMap,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        side: material.side,
        depthWrite: material.depthWrite,
        vertexColors: material.vertexColors,
        metalness: 0,
        roughness,
      });

      cache.set(material, pbr);
      material.dispose();
      return pbr;
    }

    cache.set(material, material);
    return material;
  }

  private static disposeThreeScene(scene: THREE.Scene): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        geometries.add(mesh.geometry);
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          materials.add(mat);
          const matAny = mat as any;
          for (const key of Object.keys(matAny)) {
            const val = matAny[key];
            if (val && val instanceof THREE.Texture) {
              textures.add(val);
            }
          }
        }
      }
    });

    for (const tex of textures) tex.dispose();
    for (const mat of materials) mat.dispose();
    for (const geo of geometries) geo.dispose();
  }
}
