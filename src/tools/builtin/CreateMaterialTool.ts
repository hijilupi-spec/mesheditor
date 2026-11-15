import { Color3, PBRMaterial, Texture } from '@babylonjs/core';
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';
import {
  applyCanonicalPbrPreset,
  attachPbrTextureSetToMaterial,
  CANONICAL_MATERIAL_PRESETS,
  clampPbrColor3,
  generatePbrTextureSet,
  ProceduralTextureType,
  resolveCanonicalPreset,
} from '../textureUtils';

export class CreateMaterialTool extends AbstractTool {
  public readonly name = 'modeler_create_material';
  public readonly description =
    'Creates or updates a PBRMaterial with canonical physical presets (skin, hair, fur, fabric, velvet, silk_satin, leather, brushed_steel, painted_metal, candy_coat, ceramic, marble, etc.), clearcoat, sheen, anisotropy, subsurface translucency, and multi-channel procedural textures (Albedo + Normal + Roughness ORM + Cavity AO).';

  public readonly parameters = {
    type: 'object',
    properties: {
      materialName: { type: 'string', description: 'Unique name of the material.' },
      materialPreset: {
        type: 'string',
        enum: Object.keys(CANONICAL_MATERIAL_PRESETS),
        description:
          'Canonical PBR material profile configuring roughness, metallic, clearcoat, sheen (with energy compensation), anisotropy, and subsurface translucency.',
      },
      albedoColor: { type: 'string', description: 'Hex color string, e.g. "#d4af37". Clamped to PBR-safe range for dielectrics.' },
      emissiveColor: { type: 'string', description: 'Optional glowing emissive hex color, e.g. "#00ffcc".' },
      roughness: { type: 'number', description: '0.0 (mirror smooth) to 1.0 (matte rough).' },
      metallic: { type: 'number', description: '0.0 (dielectric/wood/stone) to 1.0 (pure metal).' },
      alpha: { type: 'number', description: 'Opacity 0.0 to 1.0 (default 1.0).' },
      wireframe: { type: 'boolean' },
      clearcoat: { type: 'number', description: 'Clearcoat intensity 0.0 to 1.0 (e.g. 0.18 for skin, 0.75 for painted metal/ceramic, 0.95 for candy coat).' },
      clearcoatRoughness: { type: 'number', description: 'Clearcoat roughness 0.05 to 1.0.' },
      sheen: { type: 'number', description: 'Microfiber rim sheen intensity 0.0 to 1.0 (e.g. 0.68 for fabric, 0.95 for velvet, 0.5 for fur).' },
      sheenColor: { type: 'string', description: 'Hex tint for sheen grazing rim (default "#f2ece2").' },
      sheenRoughness: { type: 'number', description: 'Sheen roughness 0.1 to 1.0.' },
      anisotropy: { type: 'number', description: 'Directional anisotropic reflection strength 0.0 to 1.0 (e.g. 0.8 for hair/brushed steel).' },
      anisotropyAngleDeg: { type: 'number', description: 'Anisotropy highlight angle in degrees (default 0 or preset angle).' },
      subsurfaceTranslucency: { type: 'number', description: 'Subsurface scattering/translucency intensity 0.0 to 1.0 (e.g. 0.24 for skin, 0.42 for foliage).' },
      subsurfaceTintColor: { type: 'string', description: 'Subsurface translucency tint hex color (default "#ff9b7a" for skin).' },
      ior: { type: 'number', description: 'Index of refraction 1.0 to 2.333 (default 1.5).' },
      bumpLevel: { type: 'number', description: 'Bump / normal map intensity (0.0 to 5.0, default 1.0).' },
      invertNormalMapX: { type: 'boolean', description: 'Invert normal map X axis.' },
      invertNormalMapY: { type: 'boolean', description: 'Invert normal map Y axis (DirectX standard).' },
      textureUrl: {
        type: 'string',
        description: 'Optional URL or data:image base64 URI for diffuse/albedo texture.',
      },
      normalMapUrl: {
        type: 'string',
        description: 'Optional URL or data:image base64 URI for normal map texture.',
      },
      bumpTextureUrl: {
        type: 'string',
        description: 'Optional URL or data:image base64 URI for normal/bump map texture.',
      },
      useParallax: {
        type: 'boolean',
        description: 'Enable parallax mapping (uses height encoded in alpha channel of normal map).',
      },
      useParallaxOcclusion: {
        type: 'boolean',
        description: 'Enable deep parallax occlusion mapping.',
      },
      parallaxScaleBias: {
        type: 'number',
        description: 'Scale bias for parallax depth (default: 0.05).',
      },
      proceduralNormalMap: {
        type: 'boolean',
        description: 'Generate or disable automatic procedural normal, roughness ORM, and cavity AO maps when proceduralTexture is used.',
      },
      withProceduralMaps: {
        type: 'boolean',
        description: 'When true with materialPreset, automatically synthesizes multi-band Albedo + Normal + Roughness ORM + Cavity AO maps.',
      },
      uScale: { type: 'number', description: 'Horizontal texture tiling multiplier (default: 1.0).' },
      vScale: { type: 'number', description: 'Vertical texture tiling multiplier (default: 1.0).' },
      palette: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 2-5 hex color stops for multi-stop procedural texture mixing.',
      },
      colorGradient: {
        type: 'object',
        description: 'Optional spatial UV color gradient overlaid on procedural textures.',
        properties: {
          mode: { type: 'string', enum: ['linear', 'radial'] },
          directionDeg: { type: 'number' },
          stops: { type: 'array', items: { type: 'string' } },
          strength: { type: 'number' },
        },
      },
      proceduralTexture: {
        type: 'object',
        description: 'Optional generated multi-band procedural surface texture set (Albedo + Normal + Roughness + Cavity AO).',
        properties: {
          type: {
            type: 'string',
            enum: [
              'wood',
              'stone',
              'sand',
              'tiles',
              'grass',
              'fabric',
              'marble',
              'brick',
              'metal',
              'checker',
              'grid',
              'noise',
              'gradient',
              'skin',
              'leather',
              'velvet',
              'fur',
              'hair',
              'ceramic',
              'foliage',
              'bone',
              'painted_metal',
              'candy_coat',
              'bark',
              'carbon',
              'scales',
              'rust',
            ],
          },
          primaryColor: { type: 'string' },
          secondaryColor: { type: 'string' },
          accentColor: { type: 'string' },
          palette: { type: 'array', items: { type: 'string' } },
          scale: { type: 'number' },
          size: { type: 'number' },
          roughnessVariation: { type: 'number' },
          aoStrength: { type: 'number' },
          uScale: { type: 'number' },
          vScale: { type: 'number' },
        },
        required: ['type'],
      },
    },
    required: ['materialName'],
  };

  public execute(args: any, context: ToolExecutionContext): string {
    const matName = (args.materialName || `Mat_${Date.now().toString().slice(-4)}`).trim();
    let mat = context.materialRegistry.get(matName);
    if (!mat || !context.scene.materials.includes(mat)) {
      mat = new PBRMaterial(matName, context.scene);
      context.materialRegistry.set(matName, mat);
    }

    const preset = resolveCanonicalPreset(args.materialPreset);
    const hasCustomAlbedoColor = typeof args.albedoColor === 'string' && args.albedoColor.trim().length > 0;

    if (hasCustomAlbedoColor) {
      const isMetal = (args.metallic ?? preset?.metallic ?? 0.1) > 0.5;
      mat.albedoColor = clampPbrColor3(Color3.FromHexString(this.normalizeHex(args.albedoColor)), isMetal);
    } else if (!mat.albedoColor) {
      mat.albedoColor = new Color3(0.85, 0.85, 0.85);
    }
    if (args.emissiveColor) {
      mat.emissiveColor = Color3.FromHexString(this.normalizeHex(args.emissiveColor));
    }

    mat.roughness = args.roughness !== undefined ? Number(args.roughness) : (preset?.roughness ?? 0.5);
    mat.metallic = args.metallic !== undefined ? Number(args.metallic) : (preset?.metallic ?? 0.1);
    if (args.alpha !== undefined) {
      mat.alpha = Number(args.alpha);
    }
    if (args.wireframe !== undefined) {
      mat.wireframe = !!args.wireframe;
    }
    if (args.invertNormalMapX !== undefined) {
      mat.invertNormalMapX = !!args.invertNormalMapX;
    }
    if (args.invertNormalMapY !== undefined) {
      mat.invertNormalMapY = !!args.invertNormalMapY;
    }
    if (args.useParallax !== undefined) {
      mat.useParallax = !!args.useParallax;
    }
    if (args.useParallaxOcclusion !== undefined) {
      mat.useParallaxOcclusion = !!args.useParallaxOcclusion;
      if (mat.useParallaxOcclusion) mat.useParallax = true;
    }
    if (args.parallaxScaleBias !== undefined) {
      mat.parallaxScaleBias = Number(args.parallaxScaleBias);
    }
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;

    const createTexturesEnabled = context.aiAgent?.config?.createTextures !== false;
    const createNormalMapsEnabled = context.aiAgent?.config?.createNormalMaps !== false && createTexturesEnabled;

    let hasAlbedoTexture = false;
    if ((args.textureUrl || args.albedoTextureUrl) && createTexturesEnabled) {
      const url = String(args.textureUrl || args.albedoTextureUrl);
      const tex = new Texture(url, context.scene, false, false);
      tex.hasAlpha = false;
      mat.useAlphaFromAlbedoTexture = false;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      tex.uScale = typeof args.uScale === 'number' ? args.uScale : 1;
      tex.vScale = typeof args.vScale === 'number' ? args.vScale : 1;
      mat.albedoTexture = tex;
      hasAlbedoTexture = true;
      if (!hasCustomAlbedoColor) {
        mat.albedoColor = new Color3(1, 1, 1);
      }
    }

    const rawNormalUrl = args.normalMapUrl || args.bumpTextureUrl;
    if (rawNormalUrl && createNormalMapsEnabled) {
      const url = String(rawNormalUrl);
      const tex = new Texture(url, context.scene, false, false);
      tex.hasAlpha = false;
      tex.uScale = typeof args.uScale === 'number' ? args.uScale : 1;
      tex.vScale = typeof args.vScale === 'number' ? args.vScale : 1;
      mat.bumpTexture = tex;
      if (args.bumpLevel !== undefined) {
        tex.level = Number(args.bumpLevel);
      }
    }

    let resolvedProc: any = args.proceduralTexture;
    if (!resolvedProc && args.withProceduralMaps && preset?.defaultTextureType) {
      resolvedProc = {
        type: preset.defaultTextureType,
        primaryColor: hasCustomAlbedoColor ? args.albedoColor : preset.defaultColorHex,
        palette: args.palette,
      };
    }

    if (resolvedProc && createTexturesEnabled) {
      const proc =
        typeof resolvedProc === 'string'
          ? { type: resolvedProc, uScale: args.uScale, vScale: args.vScale }
          : resolvedProc;

      if (proc.type) {
        const uScale =
          proc.uScale !== undefined
            ? Number(proc.uScale)
            : args.uScale !== undefined
              ? Number(args.uScale)
              : 1;
        const vScale =
          proc.vScale !== undefined
            ? Number(proc.vScale)
            : args.vScale !== undefined
              ? Number(args.vScale)
              : 1;

        const texSet = generatePbrTextureSet({
          type: proc.type as ProceduralTextureType,
          primaryColor: proc.primaryColor || (hasCustomAlbedoColor ? args.albedoColor : undefined),
          secondaryColor: proc.secondaryColor,
          accentColor: proc.accentColor,
          palette: proc.palette || args.palette,
          colorGradient: args.colorGradient,
          scale: proc.scale,
          size: proc.size ?? 512,
          baseRoughness: mat.roughness,
          roughnessVariation: proc.roughnessVariation ?? 0.18,
          metallic: mat.metallic,
          normalStrength: typeof args.bumpLevel === 'number' ? args.bumpLevel * 2.0 : 2.2,
          aoStrength: proc.aoStrength ?? 0.72,
          invertY: !!args.invertNormalMapY,
        });

        attachPbrTextureSetToMaterial(mat, texSet, `${matName}_${proc.type}`, {
          uScale,
          vScale,
          bumpLevel: args.bumpLevel !== undefined ? Number(args.bumpLevel) : undefined,
          aoStrength: proc.aoStrength ?? 0.72,
          attachRoughnessOrm: createNormalMapsEnabled && args.proceduralNormalMap !== false,
        });

        if (!createNormalMapsEnabled || args.proceduralNormalMap === false) {
          mat.bumpTexture = null;
        }
        hasAlbedoTexture = true;
        if (!hasCustomAlbedoColor) {
          mat.albedoColor = new Color3(1, 1, 1);
        }
      }
    }

    // Apply canonical preset + explicit physical overrides (clearcoat, sheen, anisotropy, subsurface)
    if (
      preset ||
      args.clearcoat !== undefined ||
      args.sheen !== undefined ||
      args.anisotropy !== undefined ||
      args.subsurfaceTranslucency !== undefined ||
      args.ior !== undefined
    ) {
      applyCanonicalPbrPreset(mat, args.materialPreset, {
        baseColorHex: hasAlbedoTexture ? undefined : (hasCustomAlbedoColor ? args.albedoColor : undefined),
        roughness: mat.roughness,
        metallic: mat.metallic,
        clearcoat: args.clearcoat !== undefined ? Number(args.clearcoat) : undefined,
        clearcoatRoughness: args.clearcoatRoughness !== undefined ? Number(args.clearcoatRoughness) : undefined,
        sheen: args.sheen !== undefined ? Number(args.sheen) : undefined,
        sheenColorHex: args.sheenColor,
        sheenRoughness: args.sheenRoughness !== undefined ? Number(args.sheenRoughness) : undefined,
        anisotropy: args.anisotropy !== undefined ? Number(args.anisotropy) : undefined,
        anisotropyAngleRad:
          args.anisotropyAngleDeg !== undefined ? (Number(args.anisotropyAngleDeg) * Math.PI) / 180 : undefined,
        subsurfaceTranslucency:
          args.subsurfaceTranslucency !== undefined ? Number(args.subsurfaceTranslucency) : undefined,
        subsurfaceTintHex: args.subsurfaceTintColor,
        ior: args.ior !== undefined ? Number(args.ior) : undefined,
      });
    }

    if (args.bumpLevel !== undefined && mat.bumpTexture) {
      mat.bumpTexture.level = Number(args.bumpLevel);
    }

    return JSON.stringify({
      status: 'ok',
      materialName: mat.name,
      materialPreset: preset?.name || undefined,
    });
  }
}
