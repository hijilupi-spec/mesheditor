import { Nullable, Quaternion, TransformNode, Vector3, Mesh, AnimationGroup } from '@babylonjs/core';

export interface TextureOptimizationInfo {
  name: string;
  originalSize: number;
  newSize: number;
  width: number;
  height: number;
}

export interface TransformSnapshot {
  position: Vector3;
  rotation: Vector3;
  rotationQuaternion: Nullable<Quaternion>;
  scaling: Vector3;
}

export interface ActionRecord {
  name: string;
  undo: () => void;
  redo: () => void;
}

export type PrimitiveShape =
  | 'Box'
  | 'Sphere'
  | 'Cylinder'
  | 'Cone'
  | 'Capsule'
  | 'Torus'
  | 'TorusKnot'
  | 'Plane'
  | 'Disc'
  | 'Ground'
  | 'Polyhedron';

export interface PrimitiveConfig {
  shape: PrimitiveShape;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  depth?: number;
  diameter?: number;
  thickness?: number;
  subdivisions?: number;
  tessellation?: number;
  polyType?: number;
  color?: string;
  roughness?: number;
  metallic?: number;
}

export type CSGOperationType = 'subtract' | 'union' | 'intersect' | 'slice';

export interface ExportOptions {
  format: 'glb' | 'gltf' | 'obj' | 'stl' | 'babylon';
  filename: string;
  selectedOnly?: boolean;
}

export type ScreenshotMode = 'current' | '4-directions' | '8-directions';

export interface ScreenshotCaptureResult {
  blob: Blob;
  filename: string;
  count: number;
  mode: ScreenshotMode;
}

export interface MeshEditorServiceEvents {
  onSelectionChanged?: (nodes: TransformNode[], activeMesh: Mesh | null, subMeshId: number | null) => void;
  onSceneModified?: () => void;
  onHistoryChanged?: (canUndo: boolean, canRedo: boolean) => void;
  onStatusChanged?: (text: string, isBusy?: boolean) => void;
  onToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  onModelLoaded?: (filename: string) => void;
  onTexturesChanged?: () => void;
  onStatsUpdated?: (meshCount: number, polyCount: number) => void;
  onFaceSelected?: (faceId: number | null, isQuad?: boolean) => void;
  onVertexSelected?: (vertexIndex: number | null, position?: Vector3) => void;
  onFacetEditModeChanged?: (mode: 'face' | 'vertex') => void;
  onFacetEditorStateChanged?: (active: boolean) => void;
  onAnimationsLoaded?: (names: string[], currentGroup: AnimationGroup | null) => void;
  onAnimProgress?: (currentFrame: number) => void;
  onExportModel?: (blob: Blob, filename: string, format: ExportOptions['format']) => Promise<boolean> | boolean;
}

export type Neural3DBackendId = 'trellis' | 'hunyuan3d' | 'hi3d';

export type Neural3DProtocol =
  | 'omlx'
  | 'local_rest'
  | 'gradio'
  | 'fal'
  | 'replicate';

export interface Neural3DProviderConfig {
  id: Neural3DBackendId;
  name: string;
  enabled: boolean;
  protocol: Neural3DProtocol;
  endpointUrl: string;
  apiKey?: string;
  modelId?: string;
}

export type Neural3DProvidersMap = Record<Neural3DBackendId, Neural3DProviderConfig>;

export type ImageGeneratorBackendId =
  | 'pollinations'
  | 'openai'
  | 'imagen'
  | 'fal'
  | 'replicate'
  | 'sd_webui'
  | 'comfyui'
  | 'custom';

export type ImageGeneratorProtocol =
  | 'pollinations'
  | 'openai'
  | 'imagen'
  | 'fal'
  | 'replicate'
  | 'sd_webui'
  | 'comfyui'
  | 'custom_rest';

export interface ImageGeneratorProviderConfig {
  id: ImageGeneratorBackendId;
  name: string;
  enabled: boolean;
  protocol: ImageGeneratorProtocol;
  endpointUrl: string;
  apiKey?: string;
  modelId?: string;
}

export type ImageGeneratorProvidersMap = Record<ImageGeneratorBackendId, ImageGeneratorProviderConfig>;

export interface ImageGenerationRequest {
  backend?: ImageGeneratorBackendId | 'auto';
  prompt: string;
  style?: string;
  size?: number;
  seamless?: boolean;
  seed?: number;
  enhancePrompt?: boolean;
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  providerId: ImageGeneratorBackendId;
  providerName: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface AIAgentEndpointConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxIterations?: number;
  minPolygons?: number;
  maxPolygons?: number;
  createTextures?: boolean;
  createNormalMaps?: boolean;
  visualCritique?: boolean;
  checkZFighting?: boolean;
  promptSuffix?: string;
  neural3DProviders?: Neural3DProvidersMap;
  imageGeneratorEnabled?: boolean;
  imageGeneratorActiveBackend?: ImageGeneratorBackendId | 'procedural';
  imageGeneratorProviders?: ImageGeneratorProvidersMap;
  skillStates?: Record<string, boolean>;
}

export interface AIAgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
}

export interface AIAgentToolExecutionStep {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result: string;
  isError?: boolean;
  durationMs?: number;
}

export interface AIAgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
  toolSteps?: AIAgentToolExecutionStep[];
  timestamp: number;
}

export interface AIAgentRequestOptions {
  prompt: string;
  images?: string[];
  mode?: 'create_or_update' | 'replace_scene';
  includeViewportSnapshot?: boolean;
  visualCritique?: boolean;
  checkZFighting?: boolean;
  signal?: AbortSignal;
  onStep?: (step: AIAgentToolExecutionStep) => void;
  onStatus?: (statusText: string) => void;
}

export interface MeshEditorVoxelProjectState {
  voxelSize: number;
  paletteId: string;
  atlasId?: string | null;
  voxelData: any;
}

export interface ActiveTextureSlotInfo {
  slot: 'albedo' | 'diffuse' | 'normal' | 'emissive' | 'metallic' | 'terrain1' | 'terrain2' | 'terrain3';
  label: string;
  name: string;
  url: string;
  width: number;
  height: number;
}

export interface ActiveMaterialTexturesInfo {
  hasMaterial: boolean;
  materialName: string;
  materialType: string;
  albedo: ActiveTextureSlotInfo | null;
  bump: ActiveTextureSlotInfo | null;
  emissive: ActiveTextureSlotInfo | null;
  metallic: ActiveTextureSlotInfo | null;
  extra: ActiveTextureSlotInfo[];
}

export interface MeshEditorProjectData {
  version: number;
  generator?: string;
  timestamp?: number;
  tools?: {
    voxelPainter?: MeshEditorVoxelProjectState;
    pathExtrusion?: any[];
    pathWays?: any[];
    heightmap?: any;
    [key: string]: any;
  };
}

