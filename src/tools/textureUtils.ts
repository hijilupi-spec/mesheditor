import { Color3, PBRMaterial, Texture, Vector2 } from '@babylonjs/core';

export type ProceduralTextureType =
  | 'wood'
  | 'stone'
  | 'sand'
  | 'tiles'
  | 'grass'
  | 'fabric'
  | 'marble'
  | 'brick'
  | 'metal'
  | 'checker'
  | 'grid'
  | 'noise'
  | 'gradient'
  | 'skin'
  | 'leather'
  | 'velvet'
  | 'fur'
  | 'hair'
  | 'ceramic'
  | 'foliage'
  | 'bone'
  | 'painted_metal'
  | 'candy_coat'
  | 'bark'
  | 'carbon'
  | 'scales'
  | 'rust';

export interface ProceduralTextureOptions {
  type: ProceduralTextureType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  palette?: string[];
  scale?: number;
  size?: number;
  seed?: number;
}

export interface ProceduralNormalMapOptions {
  type: ProceduralTextureType;
  scale?: number;
  strength?: number;
  invertY?: boolean;
  size?: number;
  seed?: number;
}

export interface ColorGradientSpec {
  mode?: 'linear' | 'radial';
  directionDeg?: number;
  stops?: string[];
  strength?: number;
}

export interface PbrTextureSynthesisOptions {
  type: ProceduralTextureType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  palette?: string[];
  colorGradient?: ColorGradientSpec;
  scale?: number;
  size?: number;
  baseRoughness?: number;
  roughnessVariation?: number;
  metallic?: number;
  normalStrength?: number;
  aoStrength?: number;
  invertY?: boolean;
  seed?: number;
}

export interface PbrTextureBuffers {
  width: number;
  height: number;
  albedoRgba: Uint8ClampedArray;
  normalRgba: Uint8ClampedArray;
  ormRgba: Uint8ClampedArray;
  aoRgba: Uint8ClampedArray;
  roughnessRgba: Uint8ClampedArray;
  heights: Float32Array;
}

export interface PbrTextureSetResult {
  size: number;
  albedoDataUrl: string;
  normalDataUrl: string;
  ormDataUrl: string;
  aoDataUrl: string;
  roughnessDataUrl: string;
}

export type CanonicalMaterialPresetName =
  | 'skin'
  | 'hair'
  | 'fur'
  | 'fabric'
  | 'velvet'
  | 'silk_satin'
  | 'leather'
  | 'polished_steel'
  | 'brushed_steel'
  | 'aluminium'
  | 'copper'
  | 'brass'
  | 'gold'
  | 'painted_metal'
  | 'candy_coat'
  | 'glossy_plastic'
  | 'matte_plastic'
  | 'rubber'
  | 'unfinished_wood'
  | 'varnished_wood'
  | 'natural_stone'
  | 'marble'
  | 'glazed_ceramic'
  | 'clear_glass'
  | 'frosted_glass'
  | 'gemstone'
  | 'foliage'
  | 'bone_horn'
  | 'clay';

export interface CanonicalMaterialPreset {
  name: CanonicalMaterialPresetName;
  metallic: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColorHex?: string;
  anisotropy?: number;
  anisotropyAngleRad?: number;
  subsurfaceTranslucency?: number;
  subsurfaceTintHex?: string;
  transmission?: number;
  ior?: number;
  alpha?: number;
  defaultColorHex: string;
  defaultTextureType?: ProceduralTextureType;
}

export interface CanonicalPresetOverrides {
  baseColorHex?: string;
  roughness?: number;
  metallic?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColorHex?: string;
  sheenRoughness?: number;
  anisotropy?: number;
  anisotropyAngleRad?: number;
  subsurfaceTranslucency?: number;
  subsurfaceTintHex?: string;
  ior?: number;
}

export const FALLBACK_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

export const FALLBACK_FLAT_NORMAL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Clamps a 0..255 albedo channel to physically plausible PBR bounds [30, 240]
 * so dielectrics never clip to pure black (0) or blown white (255).
 */
export function clampAlbedoByte(v: number): number {
  return Math.max(30, Math.min(240, Math.round(v)));
}

/**
 * Clamps a Color3's channels into physically plausible PBR albedo range [30/255, 240/255].
 */
export function clampPbrColor3(color: Color3, isMetallic = false): Color3 {
  if (isMetallic) {
    return new Color3(
      Math.max(0.08, Math.min(0.98, color.r)),
      Math.max(0.08, Math.min(0.98, color.g)),
      Math.max(0.08, Math.min(0.98, color.b))
    );
  }
  const minVal = 30 / 255;
  const maxVal = 240 / 255;
  return new Color3(
    Math.max(minVal, Math.min(maxVal, color.r)),
    Math.max(minVal, Math.min(maxVal, color.g)),
    Math.max(minVal, Math.min(maxVal, color.b))
  );
}

export function normalizeHexString(hex: string, fallback = '#888888'): string {
  const raw = (hex || fallback).trim();
  let clean = raw.startsWith('#') ? raw.slice(1) : raw;
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return fallback;
  }
  return `#${clean.toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const norm = normalizeHexString(hex).slice(1);
  const num = parseInt(norm, 16) || 0x888888;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function clampHexAlbedo(hex: string, isMetallic = false): Color3 {
  const c = Color3.FromHexString(normalizeHexString(hex));
  return clampPbrColor3(c, isMetallic);
}

/**
 * Smooth multi-stop linear palette mixer (adapted from img2threejs mixPalette).
 */
export function mixPalette(
  stops: Array<[number, number, number]>,
  t: number
): [number, number, number] {
  if (!stops || stops.length === 0) return [180, 180, 180];
  if (stops.length === 1) return [...stops[0]];
  const k = Math.max(0, Math.min(1, t));
  const scaled = k * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    a[0] + (b[0] - a[0]) * localT,
    a[1] + (b[1] - a[1]) * localT,
    a[2] + (b[2] - a[2]) * localT,
  ];
}

/**
 * Canonical PBR material preset library derived from img2threejs reference priors.
 */
export const CANONICAL_MATERIAL_PRESETS: Record<CanonicalMaterialPresetName, CanonicalMaterialPreset> = {
  skin: {
    name: 'skin',
    metallic: 0.0,
    roughness: 0.54,
    clearcoat: 0.18,
    clearcoatRoughness: 0.36,
    subsurfaceTranslucency: 0.24,
    subsurfaceTintHex: '#ff9b7a',
    ior: 1.4,
    defaultColorHex: '#e0ad8c',
    defaultTextureType: 'skin',
  },
  hair: {
    name: 'hair',
    metallic: 0.0,
    roughness: 0.4,
    anisotropy: 0.78,
    anisotropyAngleRad: Math.PI * 0.5,
    sheen: 0.55,
    sheenRoughness: 0.32,
    sheenColorHex: '#fff6e8',
    ior: 1.52,
    defaultColorHex: '#4b3324',
    defaultTextureType: 'hair',
  },
  fur: {
    name: 'fur',
    metallic: 0.0,
    roughness: 0.78,
    sheen: 0.5,
    sheenRoughness: 0.72,
    sheenColorHex: '#f5ece0',
    ior: 1.48,
    defaultColorHex: '#8c6747',
    defaultTextureType: 'fur',
  },
  fabric: {
    name: 'fabric',
    metallic: 0.0,
    roughness: 0.86,
    sheen: 0.68,
    sheenRoughness: 0.8,
    sheenColorHex: '#f2ece2',
    ior: 1.5,
    defaultColorHex: '#496387',
    defaultTextureType: 'fabric',
  },
  velvet: {
    name: 'velvet',
    metallic: 0.0,
    roughness: 0.72,
    sheen: 0.95,
    sheenRoughness: 0.65,
    sheenColorHex: '#f5d9df',
    ior: 1.5,
    defaultColorHex: '#7d2948',
    defaultTextureType: 'velvet',
  },
  silk_satin: {
    name: 'silk_satin',
    metallic: 0.0,
    roughness: 0.32,
    sheen: 0.85,
    sheenRoughness: 0.4,
    sheenColorHex: '#fff5e6',
    anisotropy: 0.45,
    anisotropyAngleRad: 0.0,
    ior: 1.5,
    defaultColorHex: '#c8a879',
    defaultTextureType: 'fabric',
  },
  leather: {
    name: 'leather',
    metallic: 0.0,
    roughness: 0.62,
    clearcoat: 0.1,
    clearcoatRoughness: 0.45,
    ior: 1.48,
    defaultColorHex: '#6b422a',
    defaultTextureType: 'leather',
  },
  polished_steel: {
    name: 'polished_steel',
    metallic: 1.0,
    roughness: 0.14,
    anisotropy: 0.0,
    defaultColorHex: '#c8cdd3',
    defaultTextureType: 'metal',
  },
  brushed_steel: {
    name: 'brushed_steel',
    metallic: 1.0,
    roughness: 0.34,
    anisotropy: 0.85,
    anisotropyAngleRad: 0.0,
    defaultColorHex: '#aab2bc',
    defaultTextureType: 'metal',
  },
  aluminium: {
    name: 'aluminium',
    metallic: 1.0,
    roughness: 0.3,
    anisotropy: 0.2,
    defaultColorHex: '#c5cbd3',
    defaultTextureType: 'metal',
  },
  copper: {
    name: 'copper',
    metallic: 1.0,
    roughness: 0.28,
    defaultColorHex: '#cf7d5c',
    defaultTextureType: 'metal',
  },
  brass: {
    name: 'brass',
    metallic: 1.0,
    roughness: 0.3,
    defaultColorHex: '#c7a455',
    defaultTextureType: 'metal',
  },
  gold: {
    name: 'gold',
    metallic: 1.0,
    roughness: 0.22,
    defaultColorHex: '#dcb658',
    defaultTextureType: 'metal',
  },
  painted_metal: {
    name: 'painted_metal',
    metallic: 0.0,
    roughness: 0.45,
    clearcoat: 0.75,
    clearcoatRoughness: 0.12,
    ior: 1.5,
    defaultColorHex: '#3c6ea5',
    defaultTextureType: 'painted_metal',
  },
  candy_coat: {
    name: 'candy_coat',
    metallic: 0.12,
    roughness: 0.28,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06,
    ior: 1.54,
    defaultColorHex: '#b8253a',
    defaultTextureType: 'candy_coat',
  },
  glossy_plastic: {
    name: 'glossy_plastic',
    metallic: 0.0,
    roughness: 0.28,
    clearcoat: 0.22,
    clearcoatRoughness: 0.18,
    ior: 1.5,
    defaultColorHex: '#4b86b4',
    defaultTextureType: 'noise',
  },
  matte_plastic: {
    name: 'matte_plastic',
    metallic: 0.0,
    roughness: 0.68,
    ior: 1.5,
    defaultColorHex: '#6c757d',
    defaultTextureType: 'noise',
  },
  rubber: {
    name: 'rubber',
    metallic: 0.0,
    roughness: 0.88,
    ior: 1.48,
    defaultColorHex: '#2f3338',
    defaultTextureType: 'noise',
  },
  unfinished_wood: {
    name: 'unfinished_wood',
    metallic: 0.0,
    roughness: 0.72,
    anisotropy: 0.14,
    anisotropyAngleRad: Math.PI * 0.5,
    defaultColorHex: '#9c6e44',
    defaultTextureType: 'wood',
  },
  varnished_wood: {
    name: 'varnished_wood',
    metallic: 0.0,
    roughness: 0.42,
    clearcoat: 0.75,
    clearcoatRoughness: 0.16,
    anisotropy: 0.12,
    ior: 1.5,
    defaultColorHex: '#7d4e2a',
    defaultTextureType: 'wood',
  },
  natural_stone: {
    name: 'natural_stone',
    metallic: 0.0,
    roughness: 0.78,
    defaultColorHex: '#7c8187',
    defaultTextureType: 'stone',
  },
  marble: {
    name: 'marble',
    metallic: 0.0,
    roughness: 0.24,
    clearcoat: 0.35,
    clearcoatRoughness: 0.18,
    subsurfaceTranslucency: 0.12,
    subsurfaceTintHex: '#f0ece4',
    ior: 1.49,
    defaultColorHex: '#dedad2',
    defaultTextureType: 'marble',
  },
  glazed_ceramic: {
    name: 'glazed_ceramic',
    metallic: 0.0,
    roughness: 0.26,
    clearcoat: 0.75,
    clearcoatRoughness: 0.1,
    ior: 1.5,
    defaultColorHex: '#dfd9cc',
    defaultTextureType: 'ceramic',
  },
  clear_glass: {
    name: 'clear_glass',
    metallic: 0.0,
    roughness: 0.05,
    transmission: 0.92,
    ior: 1.5,
    alpha: 0.35,
    defaultColorHex: '#dcecf2',
  },
  frosted_glass: {
    name: 'frosted_glass',
    metallic: 0.0,
    roughness: 0.52,
    transmission: 0.8,
    ior: 1.5,
    alpha: 0.65,
    defaultColorHex: '#d4e2e8',
  },
  gemstone: {
    name: 'gemstone',
    metallic: 0.0,
    roughness: 0.06,
    clearcoat: 0.85,
    clearcoatRoughness: 0.05,
    transmission: 0.85,
    ior: 1.56,
    alpha: 0.78,
    defaultColorHex: '#3fa796',
  },
  foliage: {
    name: 'foliage',
    metallic: 0.0,
    roughness: 0.62,
    subsurfaceTranslucency: 0.42,
    subsurfaceTintHex: '#84b84a',
    ior: 1.42,
    defaultColorHex: '#4f7a38',
    defaultTextureType: 'foliage',
  },
  bone_horn: {
    name: 'bone_horn',
    metallic: 0.0,
    roughness: 0.52,
    clearcoat: 0.16,
    clearcoatRoughness: 0.32,
    subsurfaceTranslucency: 0.1,
    subsurfaceTintHex: '#e6d8bd',
    ior: 1.46,
    defaultColorHex: '#d9ccb2',
    defaultTextureType: 'bone',
  },
  clay: {
    name: 'clay',
    metallic: 0.0,
    roughness: 0.74,
    clearcoat: 0.08,
    clearcoatRoughness: 0.48,
    ior: 1.45,
    defaultColorHex: '#c8b6a2',
    defaultTextureType: 'stone',
  },
};

export function resolveCanonicalPreset(name?: string): CanonicalMaterialPreset | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, '_') as CanonicalMaterialPresetName;
  if (CANONICAL_MATERIAL_PRESETS[key]) return CANONICAL_MATERIAL_PRESETS[key];
  const aliases: Record<string, CanonicalMaterialPresetName> = {
    human_skin: 'skin',
    cloth: 'fabric',
    woven_matte: 'fabric',
    satin: 'silk_satin',
    silk: 'silk_satin',
    steel: 'brushed_steel',
    chrome: 'polished_steel',
    aluminum: 'aluminium',
    bronze: 'brass',
    car_paint: 'candy_coat',
    candy: 'candy_coat',
    plastic: 'matte_plastic',
    wood: 'unfinished_wood',
    stone: 'natural_stone',
    rock: 'natural_stone',
    ceramic: 'glazed_ceramic',
    porcelain: 'glazed_ceramic',
    glass: 'clear_glass',
    crystal: 'gemstone',
    leaf: 'foliage',
    leaves: 'foliage',
    bone: 'bone_horn',
    horn: 'bone_horn',
  };
  const mapped = aliases[key];
  return mapped ? CANONICAL_MATERIAL_PRESETS[mapped] : null;
}

/**
 * Configures a Babylon.js PBRMaterial using a canonical physical preset and/or explicit layer parameters
 * (clearCoat, sheen with energy compensation 1 / (1 - 0.157 * sheen), anisotropy, and subSurface).
 */
export function applyCanonicalPbrPreset(
  pbr: PBRMaterial,
  presetName?: string,
  overrides: CanonicalPresetOverrides = {}
): CanonicalMaterialPreset | null {
  const preset = resolveCanonicalPreset(presetName);
  const metallic =
    overrides.metallic !== undefined
      ? Math.max(0, Math.min(1, overrides.metallic))
      : preset
        ? preset.metallic
        : pbr.metallic ?? 0.0;
  const roughness =
    overrides.roughness !== undefined
      ? Math.max(0.04, Math.min(1, overrides.roughness))
      : preset
        ? preset.roughness
        : pbr.roughness ?? 0.5;

  pbr.metallic = metallic;
  pbr.roughness = roughness;

  if (overrides.ior !== undefined || preset?.ior !== undefined) {
    const targetIor = overrides.ior ?? preset?.ior ?? 1.5;
    pbr.indexOfRefraction = Math.max(1.0, Math.min(2.333, targetIor));
  }

  const baseHex = overrides.baseColorHex || preset?.defaultColorHex;
  if (baseHex) {
    pbr.albedoColor = clampHexAlbedo(baseHex, metallic > 0.5);
  } else if (pbr.albedoColor) {
    pbr.albedoColor = clampPbrColor3(pbr.albedoColor, metallic > 0.5);
  }

  // Clearcoat dual-lobe layer (skin sebum sheen, candy coat, painted metal, glazed ceramic, varnished wood)
  const ccIntensity = overrides.clearcoat ?? preset?.clearcoat ?? 0;
  if (ccIntensity > 0) {
    pbr.clearCoat.isEnabled = true;
    pbr.clearCoat.intensity = Math.max(0, Math.min(1, ccIntensity));
    pbr.clearCoat.roughness = Math.max(
      0.0525,
      Math.min(1, overrides.clearcoatRoughness ?? preset?.clearcoatRoughness ?? 0.25)
    );
    if (overrides.ior ?? preset?.ior) {
      pbr.clearCoat.indexOfRefraction = Math.max(1.1, Math.min(2.33, overrides.ior ?? preset?.ior ?? 1.5));
    }
  } else if (overrides.clearcoat === 0) {
    pbr.clearCoat.isEnabled = false;
  }

  // Sheen microfiber grazing rim layer with img2threejs energy compensation
  const sheenIntensity = overrides.sheen ?? preset?.sheen ?? 0;
  if (sheenIntensity > 0) {
    const clampedSheen = Math.max(0, Math.min(1, sheenIntensity));
    pbr.sheen.isEnabled = true;
    pbr.sheen.intensity = clampedSheen;
    pbr.sheen.roughness = Math.max(0.1, Math.min(1, overrides.sheenRoughness ?? preset?.sheenRoughness ?? 0.7));
    pbr.sheen.albedoScaling = true;
    const sheenHex = overrides.sheenColorHex || preset?.sheenColorHex || '#f2ece2';
    pbr.sheen.color = Color3.FromHexString(normalizeHexString(sheenHex));

    // Apply img2threejs Sheen Energy Compensation when no texture drives albedoColor
    if (!pbr.albedoTexture && pbr.albedoColor && metallic < 0.2) {
      const comp = 1 / Math.max(0.55, 1 - 0.157 * clampedSheen);
      pbr.albedoColor = new Color3(
        Math.min(0.96, pbr.albedoColor.r * comp),
        Math.min(0.96, pbr.albedoColor.g * comp),
        Math.min(0.96, pbr.albedoColor.b * comp)
      );
    }
  } else if (overrides.sheen === 0) {
    pbr.sheen.isEnabled = false;
  }

  // Directional Anisotropy (hair strands, silk, brushed steel)
  const anisoIntensity = overrides.anisotropy ?? preset?.anisotropy ?? 0;
  if (anisoIntensity > 0) {
    pbr.anisotropy.isEnabled = true;
    pbr.anisotropy.intensity = Math.max(0, Math.min(1, anisoIntensity));
    const ang = overrides.anisotropyAngleRad ?? preset?.anisotropyAngleRad ?? 0;
    pbr.anisotropy.direction = new Vector2(Math.cos(ang), Math.sin(ang));
  } else if (overrides.anisotropy === 0) {
    pbr.anisotropy.isEnabled = false;
  }

  // Subsurface Translucency & Refraction (skin, leaves, marble, glass, gemstone)
  const translucency = overrides.subsurfaceTranslucency ?? preset?.subsurfaceTranslucency ?? 0;
  if (translucency > 0) {
    pbr.subSurface.isTranslucencyEnabled = true;
    pbr.subSurface.translucencyIntensity = Math.max(0, Math.min(1, translucency));
    pbr.subSurface.useAlbedoToTintTranslucency = true;
    const tintHex = overrides.subsurfaceTintHex || preset?.subsurfaceTintHex || '#ff9b7a';
    pbr.subSurface.tintColor = Color3.FromHexString(normalizeHexString(tintHex));
    pbr.subSurface.translucencyColor = Color3.FromHexString(normalizeHexString(tintHex));
  } else if (overrides.subsurfaceTranslucency === 0) {
    pbr.subSurface.isTranslucencyEnabled = false;
  }

  if (preset?.transmission && preset.transmission > 0) {
    pbr.subSurface.isRefractionEnabled = true;
    pbr.subSurface.refractionIntensity = preset.transmission;
    pbr.subSurface.indexOfRefraction = preset.ior ?? 1.5;
    if (preset.alpha !== undefined && pbr.alpha === 1) {
      pbr.alpha = preset.alpha;
    }
  }

  return preset;
}

// =========================================================================
// MULTI-BAND DETERMINISTIC SEAMLESS NOISE SYNTHESIS
// =========================================================================

function hash2DPeriodic(ix: number, iy: number, periodX: number, periodY: number, seed: number): number {
  const px = Math.max(1, periodX);
  const py = Math.max(1, periodY);
  const wx = ((ix % px) + px) % px;
  const wy = ((iy % py) + py) % py;
  let n = Math.imul(wx, 374761393) + Math.imul(wy, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function periodicNoise(u: number, v: number, freqX: number, freqY: number, seed: number): number {
  const px = Math.max(2, Math.round(freqX));
  const py = Math.max(2, Math.round(freqY));
  const gx = u * px;
  const gy = v * py;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2DPeriodic(ix, iy, px, py, seed);
  const n10 = hash2DPeriodic(ix + 1, iy, px, py, seed);
  const n01 = hash2DPeriodic(ix, iy + 1, px, py, seed);
  const n11 = hash2DPeriodic(ix + 1, iy + 1, px, py, seed);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sy * (nx1 - nx0);
}

interface NoiseBand {
  freq: number;
  amp: number;
  stretchX?: number;
  stretchY?: number;
  ridge?: boolean;
}

function evalBands(u: number, v: number, bands: NoiseBand[], seed: number): number {
  let sum = 0;
  let ampSum = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const sx = b.stretchX ?? 1;
    const sy = b.stretchY ?? 1;
    let val = periodicNoise(u, v, b.freq * sx, b.freq * sy, seed + i * 313);
    if (b.ridge) {
      val = 1 - Math.abs(val * 2 - 1);
    }
    sum += val * b.amp;
    ampSum += Math.abs(b.amp);
  }
  if (ampSum <= 1e-6) return 0.5;
  return Math.max(0, Math.min(1, sum / ampSum));
}

function pseudoNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = pseudoNoise(ix, iy);
  const b = pseudoNoise(ix + 1, iy);
  const c = pseudoNoise(ix, iy + 1);
  const d = pseudoNoise(ix + 1, iy + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

interface TextureStyleRecipe {
  palette: [string, string, string];
  bands: NoiseBand[];
  roughBands: NoiseBand[];
  defaultRoughness: number;
  roughnessVariation: number;
  heightCorrelation: number;
}

const STYLE_RECIPES: Partial<Record<ProceduralTextureType, TextureStyleRecipe>> = {
  skin: {
    palette: ['#c98d6b', '#e2ad8d', '#ecc2a6'],
    bands: [
      { freq: 3, amp: 0.42 },
      { freq: 14, amp: 0.24 },
      { freq: 48, amp: 0.14 },
    ],
    roughBands: [
      { freq: 5, amp: 0.5 },
      { freq: 24, amp: 0.35 },
    ],
    defaultRoughness: 0.54,
    roughnessVariation: 0.14,
    heightCorrelation: 0.25,
  },
  leather: {
    palette: ['#4c2b1a', '#6d4129', '#8a583c'],
    bands: [
      { freq: 4, amp: 0.36 },
      { freq: 18, amp: 0.32, ridge: true },
      { freq: 52, amp: 0.16, ridge: true },
    ],
    roughBands: [
      { freq: 6, amp: 0.55 },
      { freq: 28, amp: 0.3 },
    ],
    defaultRoughness: 0.62,
    roughnessVariation: 0.2,
    heightCorrelation: 0.34,
  },
  velvet: {
    palette: ['#4e192f', '#7a2849', '#993e63'],
    bands: [
      { freq: 3, amp: 0.48 },
      { freq: 16, amp: 0.24 },
      { freq: 56, amp: 0.12 },
    ],
    roughBands: [
      { freq: 4, amp: 0.6 },
      { freq: 20, amp: 0.25 },
    ],
    defaultRoughness: 0.72,
    roughnessVariation: 0.18,
    heightCorrelation: 0.3,
  },
  fur: {
    palette: ['#5c422c', '#8b6647', '#b58d67'],
    bands: [
      { freq: 4, amp: 0.3, stretchY: 0.35 },
      { freq: 24, amp: 0.42, stretchX: 3.5, stretchY: 0.35, ridge: true },
      { freq: 64, amp: 0.2, stretchX: 4.0, stretchY: 0.45 },
    ],
    roughBands: [
      { freq: 12, amp: 0.55, stretchX: 2.5, stretchY: 0.5 },
      { freq: 44, amp: 0.3 },
    ],
    defaultRoughness: 0.78,
    roughnessVariation: 0.2,
    heightCorrelation: 0.4,
  },
  hair: {
    palette: ['#2e2017', '#4e3525', '#73513a'],
    bands: [
      { freq: 6, amp: 0.28, stretchX: 4.0, stretchY: 0.25 },
      { freq: 32, amp: 0.48, stretchX: 5.0, stretchY: 0.3, ridge: true },
      { freq: 72, amp: 0.2, stretchX: 6.0, stretchY: 0.4 },
    ],
    roughBands: [
      { freq: 16, amp: 0.5, stretchX: 4.0, stretchY: 0.3 },
      { freq: 48, amp: 0.35 },
    ],
    defaultRoughness: 0.4,
    roughnessVariation: 0.18,
    heightCorrelation: 0.42,
  },
  ceramic: {
    palette: ['#c7c1b4', '#dfd9cc', '#ece7dd'],
    bands: [
      { freq: 2, amp: 0.52 },
      { freq: 10, amp: 0.24 },
      { freq: 40, amp: 0.08 },
    ],
    roughBands: [
      { freq: 4, amp: 0.55 },
      { freq: 18, amp: 0.25 },
    ],
    defaultRoughness: 0.26,
    roughnessVariation: 0.14,
    heightCorrelation: 0.2,
  },
  foliage: {
    palette: ['#2c4f22', '#4c7835', '#74a152'],
    bands: [
      { freq: 4, amp: 0.36 },
      { freq: 18, amp: 0.32, stretchY: 0.6, ridge: true },
      { freq: 52, amp: 0.18 },
    ],
    roughBands: [
      { freq: 8, amp: 0.5 },
      { freq: 32, amp: 0.3 },
    ],
    defaultRoughness: 0.62,
    roughnessVariation: 0.2,
    heightCorrelation: 0.36,
  },
  bone: {
    palette: ['#b5a589', '#d6cab2', '#e8decb'],
    bands: [
      { freq: 3, amp: 0.35, stretchX: 2.0, stretchY: 0.4 },
      { freq: 16, amp: 0.32, stretchX: 2.8, stretchY: 0.45, ridge: true },
      { freq: 54, amp: 0.16 },
    ],
    roughBands: [
      { freq: 6, amp: 0.5 },
      { freq: 26, amp: 0.3 },
    ],
    defaultRoughness: 0.52,
    roughnessVariation: 0.18,
    heightCorrelation: 0.32,
  },
  painted_metal: {
    palette: ['#2c517a', '#3d6ea3', '#5689bd'],
    bands: [
      { freq: 3, amp: 0.45 },
      { freq: 14, amp: 0.22 },
      { freq: 48, amp: 0.1 },
    ],
    roughBands: [
      { freq: 5, amp: 0.5 },
      { freq: 22, amp: 0.32 },
    ],
    defaultRoughness: 0.45,
    roughnessVariation: 0.18,
    heightCorrelation: 0.25,
  },
  candy_coat: {
    palette: ['#8e1e2e', '#b8283c', '#d94558'],
    bands: [
      { freq: 2, amp: 0.5 },
      { freq: 10, amp: 0.22 },
      { freq: 42, amp: 0.08 },
    ],
    roughBands: [
      { freq: 4, amp: 0.5 },
      { freq: 20, amp: 0.22 },
    ],
    defaultRoughness: 0.28,
    roughnessVariation: 0.12,
    heightCorrelation: 0.2,
  },
  bark: {
    palette: ['#402e20', '#5e4431', '#7d5f47'],
    bands: [
      { freq: 4, amp: 0.34, stretchX: 2.5, stretchY: 0.3 },
      { freq: 16, amp: 0.42, stretchX: 3.0, stretchY: 0.3, ridge: true },
      { freq: 52, amp: 0.18, stretchX: 2.0, stretchY: 0.5 },
    ],
    roughBands: [
      { freq: 8, amp: 0.5 },
      { freq: 30, amp: 0.32 },
    ],
    defaultRoughness: 0.88,
    roughnessVariation: 0.16,
    heightCorrelation: 0.45,
  },
  wood: {
    palette: ['#5e3c1f', '#8c5c32', '#b37d4e'],
    bands: [
      { freq: 4, amp: 0.32, stretchX: 3.0, stretchY: 0.25 },
      { freq: 16, amp: 0.4, stretchX: 3.5, stretchY: 0.3, ridge: true },
      { freq: 48, amp: 0.14, stretchX: 4.0, stretchY: 0.3 },
    ],
    roughBands: [
      { freq: 6, amp: 0.55, stretchX: 2.5, stretchY: 0.4 },
      { freq: 28, amp: 0.28 },
    ],
    defaultRoughness: 0.68,
    roughnessVariation: 0.2,
    heightCorrelation: 0.35,
  },
  stone: {
    palette: ['#585d64', '#7e848d', '#a2a8b0'],
    bands: [
      { freq: 3, amp: 0.4 },
      { freq: 14, amp: 0.32, ridge: true },
      { freq: 52, amp: 0.18 },
    ],
    roughBands: [
      { freq: 6, amp: 0.5 },
      { freq: 28, amp: 0.35 },
    ],
    defaultRoughness: 0.78,
    roughnessVariation: 0.22,
    heightCorrelation: 0.38,
  },
  fabric: {
    palette: ['#2e4057', '#486588', '#6a89ae'],
    bands: [
      { freq: 4, amp: 0.32 },
      { freq: 24, amp: 0.28 },
      { freq: 56, amp: 0.12 },
    ],
    roughBands: [
      { freq: 8, amp: 0.5 },
      { freq: 36, amp: 0.3 },
    ],
    defaultRoughness: 0.86,
    roughnessVariation: 0.18,
    heightCorrelation: 0.3,
  },
  metal: {
    palette: ['#6e7680', '#9ca5b0', '#c4ccd6'],
    bands: [
      { freq: 3, amp: 0.35, stretchY: 0.35 },
      { freq: 24, amp: 0.35, stretchX: 0.4, stretchY: 4.0 },
      { freq: 60, amp: 0.16, stretchX: 0.5, stretchY: 4.5 },
    ],
    roughBands: [
      { freq: 8, amp: 0.55, stretchY: 2.0 },
      { freq: 32, amp: 0.3 },
    ],
    defaultRoughness: 0.34,
    roughnessVariation: 0.2,
    heightCorrelation: 0.3,
  },
  rust: {
    palette: ['#4d5258', '#8c4424', '#c26330'],
    bands: [
      { freq: 4, amp: 0.42 },
      { freq: 16, amp: 0.34, ridge: true },
      { freq: 56, amp: 0.16 },
    ],
    roughBands: [
      { freq: 6, amp: 0.6 },
      { freq: 26, amp: 0.3 },
    ],
    defaultRoughness: 0.72,
    roughnessVariation: 0.28,
    heightCorrelation: 0.42,
  },
  scales: {
    palette: ['#244f3c', '#3b7a5e', '#76ab7e'],
    bands: [
      { freq: 4, amp: 0.3 },
      { freq: 16, amp: 0.38, ridge: true },
      { freq: 48, amp: 0.14 },
    ],
    roughBands: [
      { freq: 8, amp: 0.5 },
      { freq: 28, amp: 0.3 },
    ],
    defaultRoughness: 0.42,
    roughnessVariation: 0.2,
    heightCorrelation: 0.35,
  },
  carbon: {
    palette: ['#22262b', '#333840', '#484f59'],
    bands: [
      { freq: 6, amp: 0.25 },
      { freq: 32, amp: 0.45, ridge: true },
      { freq: 64, amp: 0.12 },
    ],
    roughBands: [
      { freq: 16, amp: 0.5 },
      { freq: 48, amp: 0.3 },
    ],
    defaultRoughness: 0.35,
    roughnessVariation: 0.18,
    heightCorrelation: 0.3,
  },
};

export function sampleProceduralHeight(
  type: ProceduralTextureType,
  x: number,
  y: number,
  size: number,
  scale: number,
  seed = 1337
): number {
  const safeSize = Math.max(1, size);
  const u = (x / safeSize) * scale;
  const v = (y / safeSize) * scale;

  switch (type) {
    case 'wood': {
      const n = smoothNoise(u * 8, v * 2) * 0.35;
      const ring = 0.5 + 0.5 * Math.sin((u * 14 + n * 5) * Math.PI * 2);
      const bands = evalBands(u, v, STYLE_RECIPES.wood!.bands, seed + 101);
      return Math.min(1, Math.max(0, ring * 0.55 + bands * 0.45));
    }
    case 'sand': {
      const grain = pseudoNoise(x, y) * 0.35;
      const wave = smoothNoise(u * 8, v * 4) * 0.4;
      const ripple = 0.5 + 0.5 * Math.sin((u * 12 + wave * 3) * Math.PI * 2);
      return Math.min(1, Math.max(0, grain * 0.4 + ripple * 0.35 + wave * 0.25));
    }
    case 'tiles': {
      const count = Math.max(2, Math.round(6 * scale));
      const step = safeSize / count;
      const border = Math.max(2, Math.round(safeSize * 0.014));
      const isGrout = x % step < border || y % step < border;
      const n = (smoothNoise(x * 0.1, y * 0.1) - 0.5) * 0.12;
      return isGrout ? 0.15 : Math.min(1, Math.max(0, 0.78 + n));
    }
    case 'grass': {
      const n1 = smoothNoise(u * 14, v * 14) * 0.5;
      const n2 = smoothNoise(u * 30, v * 30) * 0.3;
      const blades = pseudoNoise(x, y) * 0.2;
      return Math.min(1, Math.max(0, n1 + n2 + blades));
    }
    case 'fabric': {
      const freq = Math.max(4, Math.round(28 * scale));
      const wx = Math.sin((x / safeSize) * freq * Math.PI * 2);
      const wy = Math.sin((y / safeSize) * freq * Math.PI * 2);
      const weave = 0.5 + 0.22 * wx * wy + 0.12 * (wx - wy);
      const macro = evalBands(u, v, STYLE_RECIPES.fabric!.bands, seed + 101);
      return Math.min(1, Math.max(0, weave * 0.65 + macro * 0.35));
    }
    case 'marble': {
      const turb =
        smoothNoise(u * 5, v * 5) * 0.5 +
        smoothNoise(u * 11, v * 11) * 0.25 +
        smoothNoise(u * 23, v * 23) * 0.125;
      return Math.pow(0.5 + 0.5 * Math.sin((u * 5 + v * 3.5 + turb * 4.5) * Math.PI), 0.65);
    }
    case 'brick': {
      const rows = Math.max(2, Math.round(8 * scale));
      const cols = Math.max(2, Math.round(4 * scale));
      const rowH = safeSize / rows;
      const colW = safeSize / cols;
      const rowIdx = Math.floor(y / rowH);
      const offsetX = (rowIdx % 2) * (colW * 0.5);
      const localY = y % rowH;
      const localX = (x + offsetX) % colW;
      const border = Math.max(2, Math.round(safeSize * 0.012));
      const mortar = localY < border || localX < border;
      const n = (smoothNoise(x * 0.14, y * 0.14) - 0.5) * 0.2;
      return mortar ? 0.12 : Math.min(0.95, Math.max(0.25, 0.72 + n));
    }
    case 'checker': {
      const cells = Math.max(2, Math.round(8 * scale));
      const cx = Math.floor((x / safeSize) * cells);
      const cy = Math.floor((y / safeSize) * cells);
      return (cx + cy) % 2 === 0 ? 0.15 : 0.85;
    }
    case 'grid': {
      const cells = Math.max(2, Math.round(8 * scale));
      const cellSize = safeSize / cells;
      const border = Math.max(2, Math.round(safeSize * 0.01));
      const isLine = x % cellSize < border || y % cellSize < border;
      return isLine ? 0.9 : 0.18;
    }
    case 'gradient':
      return y / Math.max(1, safeSize - 1);
    case 'scales': {
      const rows = Math.max(4, Math.round(8 * scale));
      const sy = (y / safeSize) * rows;
      const row = Math.floor(sy);
      const sx = ((x / safeSize) * rows + (row % 2) * 0.5) % 1;
      const fy = sy % 1;
      const dist = Math.hypot(sx - 0.5, fy * 0.85);
      const dome = Math.max(0, Math.min(1, (0.54 - dist) * 2.2));
      const micro = evalBands(u, v, STYLE_RECIPES.scales!.bands, seed + 101);
      return Math.min(1, Math.max(0, dome * 0.72 + micro * 0.28));
    }
    case 'carbon': {
      const f = Math.max(8, Math.round(24 * scale));
      const weave = 0.5 + 0.4 * Math.sin(((x + y) / safeSize) * f * Math.PI) * Math.cos(((x - y) / safeSize) * f * Math.PI);
      const micro = evalBands(u, v, STYLE_RECIPES.carbon!.bands, seed + 101);
      return Math.min(1, Math.max(0, weave * 0.75 + micro * 0.25));
    }
    default: {
      const recipe = STYLE_RECIPES[type] || STYLE_RECIPES.stone!;
      return evalBands(u, v, recipe.bands, seed + 101);
    }
  }
}

/**
 * Pure pixel-buffer synthesis for 4-channel PBR texture generation (img2threejs multi-band pipeline):
 * - Albedo clamped to [30, 240] with multi-stop palette mixing, spatial gradient, mottling, and height correlation
 * - Roughness variation map using independent seed (seed + 7001)
 * - Cavity AO via Laplacian local curvature
 * - Sobel tangent-space Normal + Height alpha map
 * - Packed ORM map (R=AO, G=Roughness Multiplier, B=Metallic)
 */
export function synthesizePbrTextureBuffers(opts: PbrTextureSynthesisOptions): PbrTextureBuffers {
  const size = Math.max(16, Math.min(2048, Math.round(opts.size ?? 512)));
  const scale = Math.max(0.25, opts.scale ?? 1.0);
  const seed = Math.round(opts.seed ?? 1337);
  const type = opts.type || 'stone';
  const recipe = STYLE_RECIPES[type] || STYLE_RECIPES.stone!;
  const normalStrength = typeof opts.normalStrength === 'number' ? opts.normalStrength : 2.2;
  const aoStrength = typeof opts.aoStrength === 'number' ? opts.aoStrength : 0.75;
  const roughVar = typeof opts.roughnessVariation === 'number' ? opts.roughnessVariation : recipe.roughnessVariation;
  const baseRoughness = typeof opts.baseRoughness === 'number' ? opts.baseRoughness : recipe.defaultRoughness;
  const metallic = Math.max(0, Math.min(1, opts.metallic ?? 0));
  const invertY = !!opts.invertY;

  // Resolve multi-stop palette
  let paletteHexes: string[] = [];
  if (opts.palette && opts.palette.length >= 2) {
    paletteHexes = opts.palette;
  } else if (opts.primaryColor || opts.secondaryColor || opts.accentColor) {
    const p = opts.primaryColor || recipe.palette[1];
    const s = opts.secondaryColor || recipe.palette[0];
    const a = opts.accentColor || recipe.palette[2];
    paletteHexes = [s, p, a];
  } else {
    paletteHexes = recipe.palette;
  }
  const paletteRgb = paletteHexes.map((h) => hexToRgb(h));

  // Optional spatial linear/radial gradient
  const gradStopsRgb =
    opts.colorGradient?.stops && opts.colorGradient.stops.length >= 2
      ? opts.colorGradient.stops.map((h) => hexToRgb(h))
      : null;
  const gradMode = opts.colorGradient?.mode === 'radial' ? 'radial' : 'linear';
  const gradAngleRad = ((opts.colorGradient?.directionDeg ?? 90) * Math.PI) / 180;
  const gradCos = Math.cos(gradAngleRad);
  const gradSin = Math.sin(gradAngleRad);
  const gradStrength = opts.colorGradient?.strength ?? 0.65;

  const pixelCount = size * size;
  const heights = new Float32Array(pixelCount);
  const roughField = new Float32Array(pixelCount);
  const colorMottle = new Float32Array(pixelCount);

  for (let y = 0; y < size; y++) {
    const v = (y / size) * scale;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * scale;
      const i = y * size + x;
      heights[i] = sampleProceduralHeight(type, x, y, size, scale, seed);
      roughField[i] = evalBands(u, v, recipe.roughBands, seed + 7001);
      colorMottle[i] = evalBands(
        u,
        v,
        [
          { freq: 3, amp: 0.55 },
          { freq: 11, amp: 0.3 },
          { freq: 32, amp: 0.15 },
        ],
        seed + 15013
      );
    }
  }

  const albedoRgba = new Uint8ClampedArray(pixelCount * 4);
  const normalRgba = new Uint8ClampedArray(pixelCount * 4);
  const ormRgba = new Uint8ClampedArray(pixelCount * 4);
  const aoRgba = new Uint8ClampedArray(pixelCount * 4);
  const roughnessRgba = new Uint8ClampedArray(pixelCount * 4);

  const heightCorr = recipe.heightCorrelation;
  const metalByte = Math.round(metallic * 255);

  for (let y = 0; y < size; y++) {
    const yUp = (y - 1 + size) % size;
    const yDown = (y + 1) % size;
    const nv = y / Math.max(1, size - 1);

    for (let x = 0; x < size; x++) {
      const xLeft = (x - 1 + size) % size;
      const xRight = (x + 1) % size;
      const nu = x / Math.max(1, size - 1);
      const i = y * size + x;
      const idx = i * 4;

      const hCenter = heights[i];
      const hL = heights[y * size + xLeft];
      const hR = heights[y * size + xRight];
      const hU = heights[yUp * size + x];
      const hD = heights[yDown * size + x];

      // 1. Albedo with multi-stop palette, height correlation & optional gradient, clamped [30, 240]
      let colorT = colorMottle[i] * (1 - heightCorr) + hCenter * heightCorr;
      if (type === 'checker' || type === 'grid' || type === 'brick' || type === 'tiles' || type === 'gradient') {
        colorT = hCenter;
      }
      let rgb = mixPalette(paletteRgb, colorT);

      if (gradStopsRgb) {
        let gt = 0.5;
        if (gradMode === 'radial') {
          gt = Math.min(1, Math.hypot(nu - 0.5, nv - 0.5) * 2.0);
        } else {
          gt = Math.max(0, Math.min(1, (nu - 0.5) * gradCos + (nv - 0.5) * gradSin + 0.5));
        }
        const gradCol = mixPalette(gradStopsRgb, gt);
        rgb = [
          rgb[0] * (1 - gradStrength) + gradCol[0] * gradStrength,
          rgb[1] * (1 - gradStrength) + gradCol[1] * gradStrength,
          rgb[2] * (1 - gradStrength) + gradCol[2] * gradStrength,
        ];
      }

      // Skip [30,240] compression only for metals with explicitly dark/bright palette accents if needed; still guard against pure 0/255
      albedoRgba[idx] = clampAlbedoByte(rgb[0]);
      albedoRgba[idx + 1] = clampAlbedoByte(rgb[1]);
      albedoRgba[idx + 2] = clampAlbedoByte(rgb[2]);
      albedoRgba[idx + 3] = 255;

      // 2. Cavity Ambient Occlusion via Laplacian neighbor curvature (adapted from img2threejs)
      const neighborAvg = (hL + hR + hU + hD) * 0.25;
      const cavity = Math.max(0, neighborAvg - hCenter);
      const ao = Math.max(0, Math.min(1, 1 - aoStrength * (cavity * 12 + (1 - hCenter) * 0.16)));
      const aoByte = Math.round(ao * 255);
      aoRgba[idx] = aoByte;
      aoRgba[idx + 1] = aoByte;
      aoRgba[idx + 2] = aoByte;
      aoRgba[idx + 3] = 255;

      // 3. Independent Roughness / ORM maps
      // Relative multiplier in [1 - roughVar, 1.0] for Babylon scalar * green channel compatibility
      const roughCentered = roughField[i] * 0.7 + (1 - hCenter) * 0.3;
      const absRough = Math.max(0.04, Math.min(0.98, baseRoughness + (roughCentered - 0.5) * roughVar));
      const absRoughByte = Math.round(absRough * 255);
      roughnessRgba[idx] = absRoughByte;
      roughnessRgba[idx + 1] = absRoughByte;
      roughnessRgba[idx + 2] = absRoughByte;
      roughnessRgba[idx + 3] = 255;

      const ormGreen = Math.max(0.25, Math.min(1.0, 1.0 - roughVar * (1.0 - roughCentered)));
      ormRgba[idx] = aoByte;
      ormRgba[idx + 1] = Math.round(ormGreen * 255);
      ormRgba[idx + 2] = metalByte;
      ormRgba[idx + 3] = 255;

      // 4. Sobel Tangent-Space Normal + Height in alpha
      const tl = heights[yUp * size + xLeft];
      const tr = heights[yUp * size + xRight];
      const bl = heights[yDown * size + xLeft];
      const br = heights[yDown * size + xRight];
      const dx = (tr + 2 * hR + br - (tl + 2 * hL + bl)) * (normalStrength / 8);
      const dy = (bl + 2 * hD + br - (tl + 2 * hU + tr)) * (normalStrength / 8) * (invertY ? -1 : 1);
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz) || 1.0;
      normalRgba[idx] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 3] = Math.round(Math.max(0, Math.min(1, hCenter)) * 255);
    }
  }

  return {
    width: size,
    height: size,
    albedoRgba,
    normalRgba,
    ormRgba,
    aoRgba,
    roughnessRgba,
    heights,
  };
}

function encodeRgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl && dataUrl.startsWith('data:image') ? dataUrl : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Generates a full 4-map PBR texture set (albedo, normal, ORM, AO, roughness) using multi-band synthesis.
 */
export function generatePbrTextureSet(opts: PbrTextureSynthesisOptions): PbrTextureSetResult {
  const buffers = synthesizePbrTextureBuffers(opts);
  return {
    size: buffers.width,
    albedoDataUrl: encodeRgbaToDataUrl(buffers.albedoRgba, buffers.width, buffers.height, FALLBACK_1X1_PNG),
    normalDataUrl: encodeRgbaToDataUrl(buffers.normalRgba, buffers.width, buffers.height, FALLBACK_FLAT_NORMAL_PNG),
    ormDataUrl: encodeRgbaToDataUrl(buffers.ormRgba, buffers.width, buffers.height, FALLBACK_1X1_PNG),
    aoDataUrl: encodeRgbaToDataUrl(buffers.aoRgba, buffers.width, buffers.height, FALLBACK_1X1_PNG),
    roughnessDataUrl: encodeRgbaToDataUrl(buffers.roughnessRgba, buffers.width, buffers.height, FALLBACK_1X1_PNG),
  };
}

/**
 * Removes low-frequency directional lighting gradients and shadows from an RGBA buffer
 * using separable box blur luminance division (adapted from img2threejs delight_albedo.py)
 * and clamps all albedo channels into [30, 240].
 */
export function delightImageDataPixels(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.75,
  blurRadiusRatio = 0.08
): Uint8ClampedArray {
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(srcRgba.length);
  if (pixelCount === 0) return out;

  const luma = new Float32Array(pixelCount);
  let lumaSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const y = 0.2126 * srcRgba[idx] + 0.7152 * srcRgba[idx + 1] + 0.0722 * srcRgba[idx + 2];
    luma[i] = y;
    lumaSum += y;
  }
  const targetY = Math.max(90, Math.min(185, lumaSum / pixelCount));

  // Separable periodic box blur to estimate low-frequency illumination field
  const radius = Math.max(2, Math.round(Math.min(width, height) * blurRadiusRatio));
  const horiz = new Float32Array(pixelCount);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = ((dx % width) + width) % width;
      sum += luma[rowOff + sx];
    }
    for (let x = 0; x < width; x++) {
      horiz[rowOff + x] = sum / windowSize;
      const removeX = (((x - radius) % width) + width) % width;
      const addX = (((x + radius + 1) % width) + width) % width;
      sum += luma[rowOff + addX] - luma[rowOff + removeX];
    }
  }

  const lowFreq = new Float32Array(pixelCount);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const sy = ((dy % height) + height) % height;
      sum += horiz[sy * width + x];
    }
    for (let y = 0; y < height; y++) {
      lowFreq[y * width + x] = sum / windowSize;
      const removeY = (((y - radius) % height) + height) % height;
      const addY = (((y + radius + 1) % height) + height) % height;
      sum += horiz[addY * width + x] - horiz[removeY * width + x];
    }
  }

  const k = Math.max(0, Math.min(1, strength));
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const lf = Math.max(16, lowFreq[i]);
    const scale = Math.max(0.55, Math.min(1.65, 1 + (targetY / lf - 1) * k));
    out[idx] = clampAlbedoByte(srcRgba[idx] * scale);
    out[idx + 1] = clampAlbedoByte(srcRgba[idx + 1] * scale);
    out[idx + 2] = clampAlbedoByte(srcRgba[idx + 2] * scale);
    out[idx + 3] = srcRgba[idx + 3];
  }

  return out;
}

/**
 * Measures how discontinuous the opposite edges of an RGBA image are compared
 * to typical adjacent-pixel steps in the interior. Values near 1.0 indicate
 * the image already wraps seamlessly; values noticeably > 1.35 indicate a hard seam.
 */
export function measureEdgeSeamRatio(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): number {
  if (width < 8 || height < 8) return 1.0;

  let seamSum = 0;
  let seamCount = 0;
  for (let y = 0; y < height; y++) {
    const leftIdx = (y * width) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    seamSum +=
      Math.abs(rgba[leftIdx] - rgba[rightIdx]) +
      Math.abs(rgba[leftIdx + 1] - rgba[rightIdx + 1]) +
      Math.abs(rgba[leftIdx + 2] - rgba[rightIdx + 2]);
    seamCount++;
  }
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    seamSum +=
      Math.abs(rgba[topIdx] - rgba[botIdx]) +
      Math.abs(rgba[topIdx + 1] - rgba[botIdx + 1]) +
      Math.abs(rgba[topIdx + 2] - rgba[botIdx + 2]);
    seamCount++;
  }

  let interiorSum = 0;
  let interiorCount = 0;
  const stepY = Math.max(1, Math.floor(height / 32));
  const stepX = Math.max(1, Math.floor(width / 32));
  for (let y = 0; y < height - 1; y += stepY) {
    for (let x = 0; x < width - 1; x += stepX) {
      const idx = (y * width + x) * 4;
      const rightIdx = idx + 4;
      const downIdx = ((y + 1) * width + x) * 4;
      interiorSum +=
        Math.abs(rgba[idx] - rgba[rightIdx]) +
        Math.abs(rgba[idx + 1] - rgba[rightIdx + 1]) +
        Math.abs(rgba[idx + 2] - rgba[rightIdx + 2]);
      interiorSum +=
        Math.abs(rgba[idx] - rgba[downIdx]) +
        Math.abs(rgba[idx + 1] - rgba[downIdx + 1]) +
        Math.abs(rgba[idx + 2] - rgba[downIdx + 2]);
      interiorCount += 2;
    }
  }

  const meanSeam = seamCount > 0 ? seamSum / seamCount : 0;
  const meanInterior = interiorCount > 0 ? interiorSum / interiorCount : 0;
  return meanSeam / Math.max(3.0, meanInterior);
}

/**
 * Converts any RGBA image buffer into a seamlessly tileable 2D texture using a
 * 2-pass 1D toroidal half-shift cosine crossfade along X then Y.
 * Preserves the central (1 - blendFraction) region untouched while guaranteeing
 * continuous wraparound across all four borders with zero internal cross seams.
 */
export function makeSeamlessTileableRgba(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  blendFraction: number = 0.22
): Uint8ClampedArray {
  if (width < 4 || height < 4) {
    return new Uint8ClampedArray(srcRgba);
  }
  const bf = Math.max(0.05, Math.min(0.45, blendFraction));
  const keepThreshold = 1.0 - bf;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  // Pass 1: Horizontal toroidal blend
  const horiz = new Uint8ClampedArray(srcRgba.length);
  for (let x = 0; x < width; x++) {
    const u = Math.abs((2 * (x + 0.5)) / width - 1);
    let w = 1.0;
    if (u > keepThreshold) {
      const t = Math.min(1.0, (u - keepThreshold) / bf);
      w = 0.5 * (1.0 + Math.cos(Math.PI * t));
    }
    const shiftX = (x + halfW) % width;
    const invW = 1.0 - w;

    for (let y = 0; y < height; y++) {
      const dstIdx = (y * width + x) * 4;
      const altIdx = (y * width + shiftX) * 4;
      horiz[dstIdx] = Math.round(srcRgba[dstIdx] * w + srcRgba[altIdx] * invW);
      horiz[dstIdx + 1] = Math.round(srcRgba[dstIdx + 1] * w + srcRgba[altIdx + 1] * invW);
      horiz[dstIdx + 2] = Math.round(srcRgba[dstIdx + 2] * w + srcRgba[altIdx + 2] * invW);
      horiz[dstIdx + 3] = Math.round(srcRgba[dstIdx + 3] * w + srcRgba[altIdx + 3] * invW);
    }
  }

  // Pass 2: Vertical toroidal blend on horizontally seamless buffer
  const out = new Uint8ClampedArray(srcRgba.length);
  for (let y = 0; y < height; y++) {
    const v = Math.abs((2 * (y + 0.5)) / height - 1);
    let w = 1.0;
    if (v > keepThreshold) {
      const t = Math.min(1.0, (v - keepThreshold) / bf);
      w = 0.5 * (1.0 + Math.cos(Math.PI * t));
    }
    const shiftY = (y + halfH) % height;
    const invW = 1.0 - w;

    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const altIdx = (shiftY * width + x) * 4;
      out[dstIdx] = Math.round(horiz[dstIdx] * w + horiz[altIdx] * invW);
      out[dstIdx + 1] = Math.round(horiz[dstIdx + 1] * w + horiz[altIdx + 1] * invW);
      out[dstIdx + 2] = Math.round(horiz[dstIdx + 2] * w + horiz[altIdx + 2] * invW);
      out[dstIdx + 3] = Math.round(horiz[dstIdx + 3] * w + horiz[altIdx + 3] * invW);
    }
  }

  return out;
}

/**
 * Checks whether an RGBA image already wraps cleanly at its borders; if not,
 * applies toroidal seamless blending so 3D UV tiling shows no hard seams.
 */
export function ensureSeamlessTileableRgba(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = 1.35
): { rgba: Uint8ClampedArray; blended: boolean; seamRatio: number } {
  const seamRatio = measureEdgeSeamRatio(srcRgba, width, height);
  if (seamRatio <= threshold) {
    return { rgba: new Uint8ClampedArray(srcRgba), blended: false, seamRatio };
  }
  return {
    rgba: makeSeamlessTileableRgba(srcRgba, width, height),
    blended: true,
    seamRatio,
  };
}

/**
 * Extracts a full 4-channel PBR map set (optionally de-lit Albedo, Normal, ORM, Cavity AO, Roughness)
 * from any source RGBA buffer (AI image, reference crop, or imported texture).
 */
export function extractPbrBuffersFromRgba(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    delight?: boolean;
    delightStrength?: number;
    ensureSeamless?: boolean;
    baseRoughness?: number;
    roughnessVariation?: number;
    metallic?: number;
    normalStrength?: number;
    aoStrength?: number;
    invertY?: boolean;
  } = {}
): PbrTextureBuffers {
  const pixelCount = width * height;
  const seamlessRgba = options.ensureSeamless
    ? ensureSeamlessTileableRgba(srcRgba, width, height).rgba
    : srcRgba;
  const doDelight = options.delight !== false;
  const albedoRgba = doDelight
    ? delightImageDataPixels(seamlessRgba, width, height, options.delightStrength ?? 0.75)
    : new Uint8ClampedArray(seamlessRgba);

  const heights = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    heights[i] =
      (albedoRgba[idx] * 0.2126 + albedoRgba[idx + 1] * 0.7152 + albedoRgba[idx + 2] * 0.0722) / 255.0;
  }

  const normalRgba = new Uint8ClampedArray(pixelCount * 4);
  const ormRgba = new Uint8ClampedArray(pixelCount * 4);
  const aoRgba = new Uint8ClampedArray(pixelCount * 4);
  const roughnessRgba = new Uint8ClampedArray(pixelCount * 4);

  const normalStrength = options.normalStrength ?? 2.2;
  const aoStrength = options.aoStrength ?? 0.72;
  const baseRough = options.baseRoughness ?? 0.6;
  const roughVar = options.roughnessVariation ?? 0.2;
  const metalByte = Math.round(Math.max(0, Math.min(1, options.metallic ?? 0)) * 255);
  const invertY = !!options.invertY;

  for (let y = 0; y < height; y++) {
    const yUp = (y - 1 + height) % height;
    const yDown = (y + 1) % height;
    for (let x = 0; x < width; x++) {
      const xLeft = (x - 1 + width) % width;
      const xRight = (x + 1) % width;
      const i = y * width + x;
      const idx = i * 4;

      const hCenter = heights[i];
      const hL = heights[y * width + xLeft];
      const hR = heights[y * width + xRight];
      const hU = heights[yUp * width + x];
      const hD = heights[yDown * width + x];

      const neighborAvg = (hL + hR + hU + hD) * 0.25;
      const cavity = Math.max(0, neighborAvg - hCenter);
      const ao = Math.max(0, Math.min(1, 1 - aoStrength * (cavity * 12 + (1 - hCenter) * 0.14)));
      const aoByte = Math.round(ao * 255);
      aoRgba[idx] = aoByte;
      aoRgba[idx + 1] = aoByte;
      aoRgba[idx + 2] = aoByte;
      aoRgba[idx + 3] = 255;

      const localDetail = 0.5 + (hCenter - neighborAvg) * 3.0;
      const roughSample = Math.max(0, Math.min(1, 1 - localDetail));
      const absRough = Math.max(0.04, Math.min(0.98, baseRough + (roughSample - 0.5) * roughVar));
      const absRoughByte = Math.round(absRough * 255);
      roughnessRgba[idx] = absRoughByte;
      roughnessRgba[idx + 1] = absRoughByte;
      roughnessRgba[idx + 2] = absRoughByte;
      roughnessRgba[idx + 3] = 255;

      const ormGreen = Math.max(0.25, Math.min(1.0, 1.0 - roughVar * (1.0 - roughSample)));
      ormRgba[idx] = aoByte;
      ormRgba[idx + 1] = Math.round(ormGreen * 255);
      ormRgba[idx + 2] = metalByte;
      ormRgba[idx + 3] = 255;

      const tl = heights[yUp * width + xLeft];
      const tr = heights[yUp * width + xRight];
      const bl = heights[yDown * width + xLeft];
      const br = heights[yDown * width + xRight];
      const dx = (tr + 2 * hR + br - (tl + 2 * hL + bl)) * (normalStrength / 8);
      const dy = (bl + 2 * hD + br - (tl + 2 * hU + tr)) * (normalStrength / 8) * (invertY ? -1 : 1);
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz) || 1.0;
      normalRgba[idx] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      normalRgba[idx + 3] = Math.round(Math.max(0, Math.min(1, hCenter)) * 255);
    }
  }

  return {
    width,
    height,
    albedoRgba,
    normalRgba,
    ormRgba,
    aoRgba,
    roughnessRgba,
    heights,
  };
}

/**
 * Extracts a full 4-map PBR texture set (optionally de-lit) from an HTMLCanvasElement.
 */
export function extractPbrMapsFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  options: {
    delight?: boolean;
    delightStrength?: number;
    ensureSeamless?: boolean;
    baseRoughness?: number;
    roughnessVariation?: number;
    metallic?: number;
    normalStrength?: number;
    aoStrength?: number;
    invertY?: boolean;
  } = {}
): PbrTextureSetResult {
  if (typeof document === 'undefined') {
    return {
      size: 1,
      albedoDataUrl: FALLBACK_1X1_PNG,
      normalDataUrl: FALLBACK_FLAT_NORMAL_PNG,
      ormDataUrl: FALLBACK_1X1_PNG,
      aoDataUrl: FALLBACK_1X1_PNG,
      roughnessDataUrl: FALLBACK_1X1_PNG,
    };
  }
  try {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = sourceCanvas.getContext('2d');
    if (!srcCtx || w <= 0 || h <= 0) {
      throw new Error('Canvas 2D context unavailable');
    }
    const imgData = srcCtx.getImageData(0, 0, w, h);
    const buffers = extractPbrBuffersFromRgba(imgData.data, w, h, options);
    return {
      size: Math.max(w, h),
      albedoDataUrl: encodeRgbaToDataUrl(buffers.albedoRgba, w, h, FALLBACK_1X1_PNG),
      normalDataUrl: encodeRgbaToDataUrl(buffers.normalRgba, w, h, FALLBACK_FLAT_NORMAL_PNG),
      ormDataUrl: encodeRgbaToDataUrl(buffers.ormRgba, w, h, FALLBACK_1X1_PNG),
      aoDataUrl: encodeRgbaToDataUrl(buffers.aoRgba, w, h, FALLBACK_1X1_PNG),
      roughnessDataUrl: encodeRgbaToDataUrl(buffers.roughnessRgba, w, h, FALLBACK_1X1_PNG),
    };
  } catch {
    return {
      size: 1,
      albedoDataUrl: FALLBACK_1X1_PNG,
      normalDataUrl: FALLBACK_FLAT_NORMAL_PNG,
      ormDataUrl: FALLBACK_1X1_PNG,
      aoDataUrl: FALLBACK_1X1_PNG,
      roughnessDataUrl: FALLBACK_1X1_PNG,
    };
  }
}

/**
 * Helper to bind a full 4-map PbrTextureSetResult onto a Babylon PBRMaterial while preserving
 * explicit roughness/metallic scalar contracts and non-alpha stability.
 */
export function attachPbrTextureSetToMaterial(
  mat: PBRMaterial,
  texSet: PbrTextureSetResult,
  baseName: string,
  options: {
    uScale?: number;
    vScale?: number;
    bumpLevel?: number;
    aoStrength?: number;
    attachRoughnessOrm?: boolean;
  } = {}
): void {
  const scene = mat.getScene();
  const uScale = options.uScale ?? 1;
  const vScale = options.vScale ?? 1;

  const albedoTex = new Texture(texSet.albedoDataUrl, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  albedoTex.name = `${baseName}_albedo.png`;
  albedoTex.hasAlpha = false;
  albedoTex.uScale = uScale;
  albedoTex.vScale = vScale;
  mat.useAlphaFromAlbedoTexture = false;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  mat.albedoTexture = albedoTex;

  if (!mat.bumpTexture && texSet.normalDataUrl) {
    const normTex = new Texture(texSet.normalDataUrl, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    normTex.name = `${baseName}_normal.png`;
    normTex.hasAlpha = false;
    normTex.uScale = uScale;
    normTex.vScale = vScale;
    if (options.bumpLevel !== undefined) {
      normTex.level = options.bumpLevel;
    }
    mat.bumpTexture = normTex;
  }

  if (options.attachRoughnessOrm !== false && texSet.ormDataUrl) {
    const ormTex = new Texture(texSet.ormDataUrl, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    ormTex.name = `${baseName}_orm.png`;
    ormTex.hasAlpha = false;
    ormTex.uScale = uScale;
    ormTex.vScale = vScale;
    mat.metallicTexture = ormTex;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = false;
    mat.useAmbientOcclusionFromMetallicTextureRed = false;
  }

  if (texSet.aoDataUrl) {
    const aoTex = new Texture(texSet.aoDataUrl, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    aoTex.name = `${baseName}_ao.png`;
    aoTex.hasAlpha = false;
    aoTex.uScale = uScale;
    aoTex.vScale = vScale;
    mat.ambientTexture = aoTex;
    mat.useAmbientInGrayScale = true;
    mat.ambientTextureStrength = options.aoStrength ?? 0.72;
  }
}

export function generateProceduralTextureDataUrl(opts: ProceduralTextureOptions): string {
  const buffers = synthesizePbrTextureBuffers({
    type: opts.type,
    primaryColor: opts.primaryColor,
    secondaryColor: opts.secondaryColor,
    accentColor: opts.accentColor,
    palette: opts.palette,
    scale: opts.scale,
    size: opts.size ?? 512,
    seed: opts.seed,
  });
  return encodeRgbaToDataUrl(buffers.albedoRgba, buffers.width, buffers.height, FALLBACK_1X1_PNG);
}

export function generateProceduralNormalMapDataUrl(opts: ProceduralNormalMapOptions): string {
  const buffers = synthesizePbrTextureBuffers({
    type: opts.type,
    scale: opts.scale,
    size: opts.size ?? 512,
    normalStrength: opts.strength ?? 2.2,
    invertY: opts.invertY,
    seed: opts.seed,
  });
  return encodeRgbaToDataUrl(buffers.normalRgba, buffers.width, buffers.height, FALLBACK_FLAT_NORMAL_PNG);
}

export function generateNormalMapFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  strength: number = 2.0,
  invertY: boolean = false
): string {
  if (typeof document === 'undefined') {
    return FALLBACK_FLAT_NORMAL_PNG;
  }
  try {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = sourceCanvas.getContext('2d');
    if (!srcCtx) return FALLBACK_FLAT_NORMAL_PNG;

    const srcImgData = srcCtx.getImageData(0, 0, w, h);
    const buffers = extractPbrBuffersFromRgba(srcImgData.data, w, h, {
      delight: false,
      normalStrength: strength,
      invertY,
    });
    return encodeRgbaToDataUrl(buffers.normalRgba, w, h, FALLBACK_FLAT_NORMAL_PNG);
  } catch {
    return FALLBACK_FLAT_NORMAL_PNG;
  }
}
