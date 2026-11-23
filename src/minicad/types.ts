export type MiniCadProfileId = '3d_print' | 'woodwork' | 'mechanics';

export type MiniCadInteractionMode =
  | 'select'
  | 'push_pull'
  | 'draw_box'
  | 'draw_cylinder'
  | 'punch_hole';

export type MiniCadShapeKind =
  | 'box'
  | 'rounded_box'
  | 'cylinder'
  | 'tube'
  | 'l_bracket'
  | 'plate';

export type MiniCadFaceDir = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export type MiniCadHolePresetId =
  | 'custom'
  | 'm2'
  | 'm3'
  | 'm4'
  | 'm5'
  | 'm6'
  | 'countersunk_m3'
  | 'countersunk_m4'
  | 'dowel_8mm'
  | 'cable_pass'
  | 'slot';

export interface MiniCadProfileConfig {
  id: MiniCadProfileId;
  label: string;
  displayUnit: 'mm' | 'cm';
  /** Number of millimeters represented by 1 Babylon world unit */
  mmPerUnit: number;
  defaultSnapMm: number;
  defaultWallMm: number;
  defaultClearanceMm: number;
  defaultBevelMm: number;
  defaultSizeMm: { width: number; height: number; depth: number };
}

export const MINICAD_PROFILES: Record<MiniCadProfileId, MiniCadProfileConfig> = {
  '3d_print': {
    id: '3d_print',
    label: '3D Print (mm)',
    displayUnit: 'mm',
    mmPerUnit: 10, // 20x20 grid = 200x200 mm print bed
    defaultSnapMm: 1,
    defaultWallMm: 2.0,
    defaultClearanceMm: 0.25,
    defaultBevelMm: 0.8,
    defaultSizeMm: { width: 40, height: 20, depth: 30 },
  },
  woodwork: {
    id: 'woodwork',
    label: 'Woodwork & Furniture (mm)',
    displayUnit: 'mm',
    mmPerUnit: 100, // 20x20 grid = 2000x2000 mm workspace
    defaultSnapMm: 10,
    defaultWallMm: 18, // Standard 18mm plywood/MDF
    defaultClearanceMm: 1.0,
    defaultBevelMm: 2.0,
    defaultSizeMm: { width: 600, height: 18, depth: 300 },
  },
  mechanics: {
    id: 'mechanics',
    label: 'Mechanics & Hardware (mm)',
    displayUnit: 'mm',
    mmPerUnit: 10,
    defaultSnapMm: 0.5,
    defaultWallMm: 3.0,
    defaultClearanceMm: 0.15,
    defaultBevelMm: 0.5,
    defaultSizeMm: { width: 50, height: 12, depth: 30 },
  },
};

export interface MiniCadHolePresetSpec {
  id: MiniCadHolePresetId;
  label: string;
  diameterMm: number;
  shape: 'cylinder' | 'box' | 'countersunk';
  headDiameterMm?: number;
  headDepthMm?: number;
  widthMm?: number;
}

export const MINICAD_HOLE_PRESETS: Record<MiniCadHolePresetId, MiniCadHolePresetSpec> = {
  custom: { id: 'custom', label: 'Custom Round Hole', diameterMm: 6.0, shape: 'cylinder' },
  m2: { id: 'm2', label: 'M2 Through (2.2 mm)', diameterMm: 2.2, shape: 'cylinder' },
  m3: { id: 'm3', label: 'M3 Through (3.2 mm)', diameterMm: 3.2, shape: 'cylinder' },
  m4: { id: 'm4', label: 'M4 Through (4.3 mm)', diameterMm: 4.3, shape: 'cylinder' },
  m5: { id: 'm5', label: 'M5 Through (5.3 mm)', diameterMm: 5.3, shape: 'cylinder' },
  m6: { id: 'm6', label: 'M6 Through (6.4 mm)', diameterMm: 6.4, shape: 'cylinder' },
  countersunk_m3: {
    id: 'countersunk_m3',
    label: 'M3 Countersunk',
    diameterMm: 3.2,
    shape: 'countersunk',
    headDiameterMm: 6.2,
    headDepthMm: 2.0,
  },
  countersunk_m4: {
    id: 'countersunk_m4',
    label: 'M4 Countersunk',
    diameterMm: 4.3,
    shape: 'countersunk',
    headDiameterMm: 8.4,
    headDepthMm: 2.6,
  },
  dowel_8mm: { id: 'dowel_8mm', label: '8 mm Wood Dowel', diameterMm: 8.1, shape: 'cylinder' },
  cable_pass: { id: 'cable_pass', label: 'Cable Pass-Through (14 mm)', diameterMm: 14.0, shape: 'cylinder' },
  slot: { id: 'slot', label: 'Rectangular Slot (12×4 mm)', diameterMm: 4.0, widthMm: 12.0, shape: 'box' },
};

export interface MiniCadHolePattern {
  cols: number;
  rows: number;
  spacingUMm: number;
  spacingVMm: number;
}

export interface MiniCadHoleFeature {
  id: string;
  kind: 'hole';
  label?: string;
  preset: MiniCadHolePresetId;
  shape: 'cylinder' | 'box' | 'countersunk';
  face: MiniCadFaceDir;
  /** Offset along the face's local U axis in mm relative to face center */
  offsetUMm: number;
  /** Offset along the face's local V axis in mm relative to face center */
  offsetVMm: number;
  diameterMm: number;
  widthMm?: number;
  depthMm: number;
  throughAll: boolean;
  headDiameterMm?: number;
  headDepthMm?: number;
  pattern?: MiniCadHolePattern;
}

export interface MiniCadBoxOpFeature {
  id: string;
  kind: 'cutout' | 'add_boss';
  label?: string;
  shape: 'box' | 'cylinder';
  face: MiniCadFaceDir;
  offsetUMm: number;
  offsetVMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  throughAll?: boolean;
}

export interface MiniCadShellFeature {
  id: string;
  kind: 'shell';
  label?: string;
  wallThicknessMm: number;
  openFace: MiniCadFaceDir | 'none';
}

export interface MiniCadBevelFeature {
  id: string;
  kind: 'bevel';
  label?: string;
  widthMm: number;
  segments: number;
  angleThresholdDeg: number;
}

export type MiniCadFeatureOp =
  | MiniCadHoleFeature
  | MiniCadBoxOpFeature
  | MiniCadShellFeature
  | MiniCadBevelFeature;

export interface MiniCadDimensionsMm {
  width: number;
  height: number;
  depth: number;
  innerDiameter?: number;
  wallThickness?: number;
  cornerRadius?: number;
}

export interface MiniCadRecipe {
  version: 1;
  profileId: MiniCadProfileId;
  baseShape: MiniCadShapeKind;
  dimensionsMm: MiniCadDimensionsMm;
  features: MiniCadFeatureOp[];
  color?: string;
  materialPreset?: string;
}

export interface MiniCadSmartGuide {
  id: string;
  axis: 'x' | 'y' | 'z';
  kind: 'center' | 'edge' | 'distance';
  label: string;
  distanceMm: number;
  fromWorld: [number, number, number];
  toWorld: [number, number, number];
  referenceMeshName?: string;
}

export interface MiniCadFacePickResult {
  mesh: any;
  faceDir: MiniCadFaceDir;
  worldPoint: [number, number, number];
  worldNormal: [number, number, number];
  localUWorld: [number, number, number];
  localVWorld: [number, number, number];
  offsetUMm: number;
  offsetVMm: number;
  faceWidthMm: number;
  faceHeightMm: number;
}

export interface MiniCadPrintabilityReport {
  meshName: string;
  profileId: MiniCadProfileId;
  isWatertight: boolean;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  floatingAboveFloorMm: number;
  minWallEstimateMm: number;
  warnings: string[];
  stats: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
    volumeCm3: number;
    triangleCount: number;
  };
}

export interface MiniCadCutListItem {
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  quantity: number;
  shape: string;
}

export type MiniCadAlignAction =
  | 'center_x'
  | 'center_z'
  | 'center_xz'
  | 'flush_left'
  | 'flush_right'
  | 'flush_front'
  | 'flush_back'
  | 'flush_bottom'
  | 'stack_on_top'
  | 'gap_x'
  | 'gap_y'
  | 'gap_z';

export type MiniCadStarterTemplateId =
  | 'enclosure'
  | 'bracket'
  | 'shelf_unit'
  | 'spacer_hub';
