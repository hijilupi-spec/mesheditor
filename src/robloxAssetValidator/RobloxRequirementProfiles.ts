export type RobloxAssetProfileId = 'static_prop_mesh_v1' | 'layered_tshirt_v1';
export type RobloxAssetCategory = 'static_prop' | 'layered_tshirt';
export type RobloxRuleClassification = 'OFFICIAL_HARD_RULE' | 'OFFICIAL_GUIDANCE' | 'INTERNAL_TARGET' | 'UNRESOLVED';
export type RobloxCheckSeverity = 'error' | 'warning' | 'info';

export interface RobloxRequirementRule {
  id: string;
  category: RobloxAssetCategory;
  expected: unknown;
  severity: RobloxCheckSeverity;
  sourceUrl: string;
  sourceRevision: string;
  reviewedOn: string;
  classification: RobloxRuleClassification;
}

const general = 'https://create.roblox.com/docs/art/modeling/specifications';
const textures = 'https://create.roblox.com/docs/art/modeling/texture-specifications';
const layered = 'https://create.roblox.com/docs/avatar/layered-accessories/specifications';
const cages = 'https://create.roblox.com/docs/avatar/layered-accessories/caging-best-practices';
const reviewedOn = '2026-11-25';

function rule(id: string, category: RobloxAssetCategory, expected: unknown, severity: RobloxCheckSeverity, sourceUrl: string, classification: RobloxRuleClassification): RobloxRequirementRule {
  return { id, category, expected, severity, sourceUrl, sourceRevision: 'Creator Hub live documentation reviewed 2026-11-25', reviewedOn, classification };
}

export interface RobloxRequirementProfile {
  id: RobloxAssetProfileId;
  version: string;
  category: RobloxAssetCategory;
  label: string;
  rules: RobloxRequirementRule[];
}

export const ROBLOX_REQUIREMENT_PROFILES: Record<RobloxAssetProfileId, RobloxRequirementProfile> = {
  static_prop_mesh_v1: {
    id: 'static_prop_mesh_v1', version: '1.0.0', category: 'static_prop', label: 'Static Prop Mesh v1',
    rules: [
      rule('STATIC.MESH.TRIANGLES.MAX', 'static_prop', 20000, 'error', general, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.MESH.WATERTIGHT', 'static_prop', 'watertight with no exposed holes or backfaces', 'error', general, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.MESH.NONZERO_VOLUME', 'static_prop', 'non-zero volume', 'error', general, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.MESH.QUADS_GUIDANCE', 'static_prop', 'use quads where possible', 'info', general, 'OFFICIAL_GUIDANCE'),
      rule('STATIC.MATERIAL.COUNT', 'static_prop', 1, 'error', textures, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.UV.SET_COUNT', 'static_prop', 1, 'error', textures, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.UV.RANGE', 'static_prop', [0, 1], 'error', textures, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.UV.OVERLAP', 'static_prop', 'allowed', 'info', textures, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.TEXTURE.FORMAT', 'static_prop', ['png', 'jpg', 'jpeg', 'tga', 'bmp'], 'error', textures, 'OFFICIAL_HARD_RULE'),
      rule('STATIC.TEXTURE.RESOLUTION_POLICY', 'static_prop', 'report actual dimensions; no static hard maximum encoded', 'warning', textures, 'UNRESOLVED'),
      rule('STATIC.TRANSFORM.UNITS', 'static_prop', 'unit conversion is not assumed', 'info', general, 'UNRESOLVED'),
    ],
  },
  layered_tshirt_v1: {
    id: 'layered_tshirt_v1', version: '1.0.0', category: 'layered_tshirt', label: 'Layered T-Shirt v1',
    rules: [
      rule('LAYERED.MESH.SINGLE', 'layered_tshirt', 1, 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.MESH.TRIANGLES.MAX', 'layered_tshirt', 4000, 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.MESH.WATERTIGHT', 'layered_tshirt', 'watertight with no exposed holes or backfaces', 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.MESH.DIMENSIONS', 'layered_tshirt', { maxStuds: [8, 8, 8], centeredOnAttachment: true }, 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.TEXTURE.MARKETPLACE_MAX', 'layered_tshirt', [2048, 2048], 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.ATTACHMENT.BODY_FRONT', 'layered_tshirt', 'BodyFrontAttachment', 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.RIG.R15', 'layered_tshirt', 'weighted and bound to R15', 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.WEIGHTS.MAX_INFLUENCES', 'layered_tshirt', 4, 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.WEIGHTS.NO_ROOT', 'layered_tshirt', 'Root has no vertex influence', 'error', general, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.CAGE.NAMES', 'layered_tshirt', ['<asset>_InnerCage', '<asset>_OuterCage'], 'error', layered, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.CAGE.TOPOLOGY', 'layered_tshirt', 'matches pinned official cage fixture', 'error', cages, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.CAGE.UV', 'layered_tshirt', 'matches pinned official cage UV fixture', 'error', cages, 'OFFICIAL_HARD_RULE'),
      rule('LAYERED.TRANSFORM.STUDS', 'layered_tshirt', 'verified unit conversion and attachment-relative dimensions', 'error', layered, 'UNRESOLVED'),
    ],
  },
};

export function getRobloxRequirementProfile(id: string): RobloxRequirementProfile {
  if (!Object.prototype.hasOwnProperty.call(ROBLOX_REQUIREMENT_PROFILES, id)) throw new Error(`Unknown Roblox asset profile: ${id}`);
  return ROBLOX_REQUIREMENT_PROFILES[id as RobloxAssetProfileId];
}
