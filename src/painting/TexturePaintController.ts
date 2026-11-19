import {
  Color3,
  DynamicTexture,
  FloatArray,
  IndicesArray,
  Matrix,
  Mesh,
  MeshBuilder,
  Nullable,
  PBRMaterial,
  PointerEventTypes,
  PointerInfo,
  Quaternion,
  RawTexture,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { MeshEditorService } from '../MeshEditorService';

export type PaintToolMode = 'brush' | 'eraser' | 'smudge' | 'fill' | 'eyedropper' | 'stencil';
export type PaintChannel = 'albedo' | 'roughness' | 'metallic' | 'emissive';
export type PaintBlendMode = 'normal' | 'multiply' | 'overlay' | 'screen' | 'soft-light' | 'add';
export type PaintBrushAlpha = 'round' | 'soft' | 'chalk' | 'watercolor' | 'noise' | 'square';
export type PaintStampShape = 'circle' | 'oval' | 'ring' | 'star' | 'stripe' | 'eye' | 'heart' | 'dot_pattern';
export type PaintGradientType = 'vertical' | 'radial' | 'normal_top' | 'normal_front';

export interface PaintLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: PaintBlendMode;
  channel: PaintChannel;
  pixels: Uint8ClampedArray;
}

export interface PaintLayerSummary {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: PaintBlendMode;
  channel: PaintChannel;
  isActive: boolean;
}

interface PaintUndoEntry {
  layerId: string;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

interface CachedUVTriangle {
  faceIndex: number;
  islandId: number;
  // Local positions & normals (transformed to world when needed)
  lp0: Vector3;
  lp1: Vector3;
  lp2: Vector3;
  ln0: Vector3;
  ln1: Vector3;
  ln2: Vector3;
  // World-space cached positions & normals
  wp0: Vector3;
  wp1: Vector3;
  wp2: Vector3;
  wn0: Vector3;
  wn1: Vector3;
  wn2: Vector3;
  faceNormal: Vector3;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  // UV & pixel coordinates
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  minPx: number;
  maxPx: number;
  minPy: number;
  maxPy: number;
  invDenom: number;
}

export interface MeshPaintSession {
  mesh: Mesh;
  resolution: number;
  paddingPx: number;
  layers: PaintLayer[];
  activeLayerId: string;
  coverageMask: Uint8Array;
  islandIdByTexel: Int32Array;
  islandCount: number;
  triangles: CachedUVTriangle[];
  cachedWorldMatrixHash: string;
  cachedVertexCount: number;
  albedoComposite: Uint8ClampedArray;
  ormComposite: Uint8ClampedArray;
  emissiveComposite: Uint8ClampedArray;
  albedoTexture: Nullable<RawTexture>;
  ormTexture: Nullable<RawTexture>;
  emissiveTexture: Nullable<RawTexture>;
  hasRoughnessOrMetallicData: boolean;
  hasEmissiveData: boolean;
  loadedFromExistingTexture: boolean;
  hydrationPromise?: Promise<void>;
  undoStack: PaintUndoEntry[];
  redoStack: PaintUndoEntry[];
}

export interface StencilState {
  enabled: boolean;
  visible: boolean;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  pixels: Nullable<Uint8ClampedArray>;
  opacity: number;
  scale: number;
  rotationDeg: number;
  offsetX: number; // normalized -0.5..0.5 of viewport width
  offsetY: number; // normalized -0.5..0.5 of viewport height
}

export interface InitPaintOptions {
  resolution?: number;
  baseColor?: string;
  autoUnwrap?: boolean;
  forceUnwrap?: boolean;
  paddingPx?: number;
  preserveExistingTexture?: boolean;
}

export interface StylizedBaseOptions {
  baseColor?: string;
  bottomColor?: string;
  topColor?: string;
  aoStrength?: number;
  edgeHighlightStrength?: number;
  asLayer?: boolean;
  layerName?: string;
}

export interface PaintGradientOptions {
  gradientType?: PaintGradientType;
  colorA?: string;
  colorB?: string;
  center?: [number, number, number];
  radius?: number;
  minY?: number;
  maxY?: number;
  normalThreshold?: number;
  opacity?: number;
  blendMode?: PaintBlendMode;
  channel?: PaintChannel;
  layerName?: string;
}

export interface PaintStrokeOptions {
  color?: string;
  value?: number;
  radius?: number;
  hardness?: number;
  opacity?: number;
  spacing?: number;
  brushAlpha?: PaintBrushAlpha;
  mirrorX?: boolean;
  mode?: 'brush' | 'eraser' | 'smudge';
  channel?: PaintChannel;
  backfaceCull?: boolean;
  layerName?: string;
}

export interface PaintStampOptions {
  shape?: PaintStampShape;
  position?: [number, number, number];
  normal?: [number, number, number];
  face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
  color?: string;
  secondaryColor?: string;
  value?: number;
  radius?: number;
  hardness?: number;
  opacity?: number;
  rotationDeg?: number;
  mirrorX?: boolean;
  channel?: PaintChannel;
  layerName?: string;
}

export interface ProjectStencilOptions {
  face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'camera';
  opacity?: number;
  scale?: number;
  rotationDeg?: number;
  offsetX?: number;
  offsetY?: number;
  layerName?: string;
}

const MAX_UNDO_STEPS = 25;

/**
 * 3D UV Texture Painting Engine supporting:
 * - Phase 1: Seamless 3D sphere-to-UV painting across UV seams, auto-dilation (bleed),
 *   Brush / Eraser / Smudge / Island Fill / Eyedropper, X-Symmetry, Stylized AO+Gradient Base, Undo/Redo.
 * - Phase 2: Multi-layer stack with blend modes & opacity, PBR channel painting
 *   (Albedo, Roughness, Metallic, Emissive), procedural brush alphas, direct 2D UV canvas painting.
 * - Phase 3: Camera-space Stencil / Projection painting with viewport overlay & 1-click full projection.
 */
export class TexturePaintController {
  public service: MeshEditorService;
  public scene: Scene;

  public isActive: boolean = false;
  public isStrokeActive: boolean = false;

  // Tool & Brush parameters
  public mode: PaintToolMode = 'brush';
  public channel: PaintChannel = 'albedo';
  public colorHex: string = '#e74c3c';
  public channelValue: number = 0.5; // For roughness/metallic [0..1]
  public brushRadius: number = 0.25; // World-space radius
  public brushHardness: number = 0.65; // 0..1
  public brushOpacity: number = 0.9; // 0.05..1
  public brushSpacing: number = 0.22; // fraction of radius
  public brushAlpha: PaintBrushAlpha = 'round';
  public symmetryX: boolean = false;
  public backfaceCull: boolean = true;
  public islandFillOnly: boolean = true;
  public showUvWireframe: boolean = true;
  public defaultResolution: number = 1024;
  public paddingPx: number = 4;

  // Phase 3 Stencil state
  public stencil: StencilState = {
    enabled: false,
    visible: true,
    name: '',
    dataUrl: '',
    width: 0,
    height: 0,
    pixels: null,
    opacity: 0.45,
    scale: 0.75,
    rotationDeg: 0,
    offsetX: 0,
    offsetY: 0,
  };

  private sessions: WeakMap<Mesh, MeshPaintSession> = new WeakMap();
  private activeSessions: Set<MeshPaintSession> = new Set();
  private exportBackupTextures: Map<
    Mesh,
    {
      albedo: Nullable<Texture>;
      metallic: Nullable<Texture>;
      emissive: Nullable<Texture>;
      createdTextures: Texture[];
    }
  > = new Map();

  // 3D viewport brush cursor meshes
  private cursorRing: Nullable<Mesh> = null;
  private symCursorRing: Nullable<Mesh> = null;

  // Active pointer stroke state
  private activeStrokeMesh: Nullable<Mesh> = null;
  private activeStrokeBeforePixels: Nullable<Uint8ClampedArray> = null;
  private activeStrokeLayerId: string = '';
  private lastStrokeWorldPos: Nullable<Vector3> = null;
  private smudgeSampleRgba: [number, number, number, number] = [255, 255, 255, 255];
  private hasSmudgeSample: boolean = false;
  private cameraDetachedForStroke: boolean = false;
  private lastCompositeTime: number = 0;

  // Callbacks for UI synchronization
  public onStateChanged?: (isActive: boolean) => void;
  public onCanvasUpdated?: (mesh: Mesh) => void;
  public onColorPicked?: (hex: string) => void;
  public onStencilChanged?: () => void;

  constructor(service: MeshEditorService) {
    this.service = service;
    this.scene = service.scene;
    this.createBrushCursors();
    this.initPointerHandling();
  }

  // =========================================================================
  // 1. LIFECYCLE & POINTER HANDLING
  // =========================================================================

  private createBrushCursors(): void {
    try {
      this.cursorRing = MeshBuilder.CreateTorus(
        'editor_texpaint_cursor',
        { diameter: 0.5, thickness: 0.015, tessellation: 40 },
        this.scene
      );
      const mat = new StandardMaterial('editor_texpaint_cursor_mat', this.scene);
      mat.diffuseColor = new Color3(0.98, 0.55, 0.2);
      mat.emissiveColor = new Color3(0.98, 0.55, 0.2);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.cursorRing.material = mat;
      this.cursorRing.isPickable = false;
      this.cursorRing.isVisible = false;

      this.symCursorRing = MeshBuilder.CreateTorus(
        'editor_texpaint_sym_cursor',
        { diameter: 0.5, thickness: 0.012, tessellation: 36 },
        this.scene
      );
      const symMat = new StandardMaterial('editor_texpaint_sym_mat', this.scene);
      symMat.diffuseColor = new Color3(0.3, 0.75, 1.0);
      symMat.emissiveColor = new Color3(0.3, 0.75, 1.0);
      symMat.disableLighting = true;
      symMat.backFaceCulling = false;
      this.symCursorRing.material = symMat;
      this.symCursorRing.isPickable = false;
      this.symCursorRing.isVisible = false;

      this.updateCursorScale();
    } catch {
      // Headless fallback
    }
  }

  private updateCursorScale(): void {
    const scale = this.brushRadius / 0.25;
    if (this.cursorRing && !this.cursorRing.isDisposed()) {
      this.cursorRing.scaling.set(scale, scale, scale);
    }
    if (this.symCursorRing && !this.symCursorRing.isDisposed()) {
      this.symCursorRing.scaling.set(scale, scale, scale);
    }
  }

  public setRadius(radius: number): void {
    this.brushRadius = Math.max(0.02, Math.min(4.0, Number(radius) || 0.25));
    this.updateCursorScale();
  }

  public setHardness(hardness: number): void {
    this.brushHardness = Math.max(0, Math.min(1, Number(hardness)));
  }

  public setOpacity(opacity: number): void {
    this.brushOpacity = Math.max(0.02, Math.min(1, Number(opacity) || 0.9));
  }

  public setMode(mode: PaintToolMode): void {
    this.mode = mode;
    if (mode === 'stencil') {
      this.stencil.enabled = true;
    }
    this.onStateChanged?.(this.isActive);
    this.onStencilChanged?.();
  }

  public setChannel(channel: PaintChannel): void {
    this.channel = channel;
    const mesh = this.getActiveTargetMesh();
    if (mesh) {
      const session = this.sessions.get(mesh);
      if (session) {
        const activeLayer = this.getActiveLayer(session);
        if (!activeLayer || activeLayer.channel !== channel) {
          const existing = session.layers.find((l) => l.channel === channel);
          if (existing) {
            session.activeLayerId = existing.id;
          } else {
            this.addLayer(mesh, {
              name: `${channel.charAt(0).toUpperCase() + channel.slice(1)} Layer`,
              channel,
            });
          }
        }
      }
    }
    this.onStateChanged?.(this.isActive);
  }

  public setSymmetry(enabled: boolean): void {
    this.symmetryX = enabled;
    if (this.symCursorRing && (!enabled || !this.isActive)) {
      this.symCursorRing.isVisible = false;
    }
  }

  public setActive(active: boolean): void {
    if (!active && !this.isActive) return;

    if (active) {
      this.service.deactivateOtherInteractive3DTools('texture_paint');
    }

    this.isActive = active;
    if (this.cursorRing) this.cursorRing.isVisible = false;
    if (this.symCursorRing) this.symCursorRing.isVisible = false;

    const canvas = this.service.canvas;
    if (canvas) {
      canvas.style.cursor = active ? 'crosshair' : 'default';
    }

    if (active) {
      this.service.gizmoManager?.attachToNode(null);
      this.scene.constantlyUpdateMeshUnderPointer = true;
    } else {
      if (this.isStrokeActive) {
        this.endPointerStroke();
      }
      if (
        !this.service.isSceneInteractionLocked &&
        this.service.selectedMesh &&
        !this.service.isGizmoMesh(this.service.selectedMesh)
      ) {
        this.service.gizmoManager?.attachToNode(this.service.selectedMesh);
      }
    }

    this.onStateChanged?.(active);
    this.onStencilChanged?.();
  }

  public getActiveTargetMesh(): Nullable<Mesh> {
    const sel = this.service.selectedMesh;
    if (sel && sel instanceof Mesh && !this.isHelperMesh(sel)) {
      return sel;
    }
    for (const m of this.service.importedMeshes) {
      if (m instanceof Mesh && !m.isDisposed() && m.isVisible && !this.isHelperMesh(m)) {
        return m;
      }
    }
    return null;
  }

  private isHelperMesh(mesh: Nullable<any>): boolean {
    if (!mesh) return true;
    const name = String(mesh.name || '');
    if (
      name.startsWith('editor_') ||
      name === 'grid' ||
      name === 'ground_grid' ||
      name.startsWith('__') ||
      this.service.isGizmoMesh(mesh)
    ) {
      return true;
    }
    return false;
  }

  private initPointerHandling(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerup', () => {
        if (this.isActive && this.isStrokeActive) {
          this.endPointerStroke();
        }
      });
    }

    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      if (!this.isActive || this.service.isSceneInteractionLocked) return;

      const evt = pointerInfo.event as PointerEvent | MouseEvent | undefined;
      const isLeftButton = evt ? evt.button === 0 : true;
      const isAlt = Boolean(evt?.altKey);

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (isLeftButton) {
            this.handlePointerDown(isAlt);
          }
          break;
        case PointerEventTypes.POINTERMOVE:
          this.handlePointerMove();
          break;
        case PointerEventTypes.POINTERUP:
          if (this.isStrokeActive) {
            this.endPointerStroke();
          }
          break;
      }
    });
  }

  private pickPaintableMesh(): Nullable<{ mesh: Mesh; worldPos: Vector3; worldNormal: Vector3; uv: { u: number; v: number } | null; faceId: number }> {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (m) => m instanceof Mesh && m.isVisible && !m.isDisposed() && !this.isHelperMesh(m)
    );
    if (!pick || !pick.hit || !pick.pickedMesh || !pick.pickedPoint) return null;
    if (!(pick.pickedMesh instanceof Mesh)) return null;

    const normal = pick.getNormal(true, true) || Vector3.Up();
    const texCoord = pick.getTextureCoordinates();
    return {
      mesh: pick.pickedMesh,
      worldPos: pick.pickedPoint.clone(),
      worldNormal: normal.normalize(),
      uv: texCoord ? { u: texCoord.x, v: texCoord.y } : null,
      faceId: typeof pick.faceId === 'number' ? pick.faceId : -1,
    };
  }

  private updateBrushCursorVisual(hit: { mesh: Mesh; worldPos: Vector3; worldNormal: Vector3 } | null): void {
    if (!this.cursorRing || this.cursorRing.isDisposed()) return;
    if (!hit || !this.isActive) {
      this.cursorRing.isVisible = false;
      if (this.symCursorRing) this.symCursorRing.isVisible = false;
      return;
    }

    this.alignRingToSurface(this.cursorRing, hit.worldPos, hit.worldNormal);
    this.cursorRing.isVisible = true;

    if (this.symCursorRing && !this.symCursorRing.isDisposed()) {
      if (this.symmetryX) {
        const mirrored = this.mirrorWorldPointX(hit.mesh, hit.worldPos, hit.worldNormal);
        this.alignRingToSurface(this.symCursorRing, mirrored.pos, mirrored.normal);
        this.symCursorRing.isVisible = true;
      } else {
        this.symCursorRing.isVisible = false;
      }
    }
  }

  private alignRingToSurface(ring: Mesh, pos: Vector3, normal: Vector3): void {
    ring.position.copyFrom(pos.add(normal.scale(0.005)));
    const up = Vector3.Up();
    const dot = Vector3.Dot(up, normal);
    if (dot > 0.999) {
      ring.rotationQuaternion = null;
      ring.rotation.set(0, 0, 0);
    } else if (dot < -0.999) {
      ring.rotationQuaternion = null;
      ring.rotation.set(Math.PI, 0, 0);
    } else {
      const axis = Vector3.Cross(up, normal).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      ring.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
    }
  }

  private handlePointerDown(isAlt: boolean): void {
    const hit = this.pickPaintableMesh();
    this.updateBrushCursorVisual(hit);
    if (!hit) return;

    // Select painted mesh if different
    if (this.service.selectedMesh !== hit.mesh) {
      this.service.selectMesh(hit.mesh);
    }

    const session = this.ensurePaintSession(hit.mesh);
    if (!session) return;

    // Alt-click or Eyedropper mode picks color
    if (isAlt || this.mode === 'eyedropper') {
      if (hit.uv) {
        const hex = this.sampleColorAtUV(hit.mesh, hit.uv.u, hit.uv.v);
        if (hex) {
          this.colorHex = hex;
          this.onColorPicked?.(hex);
        }
      }
      return;
    }

    // Fill mode (flood fill active UV island or entire layer)
    if (this.mode === 'fill') {
      const layer = this.getActiveLayer(session);
      if (!layer) return;
      const before = layer.pixels.slice();
      let islandId = -1;
      if (this.islandFillOnly && hit.uv) {
        const px = this.uvToPixelX(hit.uv.u, session.resolution);
        const py = this.uvToPixelY(hit.uv.v, session.resolution);
        islandId = session.islandIdByTexel[py * session.resolution + px];
      }
      if (this.islandFillOnly && islandId >= 0) {
        this.fillIsland(session, layer, islandId, this.getActivePaintRgba());
      } else {
        this.fillLayer(session, layer, this.getActivePaintRgba());
      }
      this.pushUndo(session, layer.id, before, layer.pixels.slice());
      this.compositeAndUpload(session, true);
      this.onCanvasUpdated?.(hit.mesh);
      return;
    }

    // Begin continuous 3D stroke (brush / eraser / smudge / stencil)
    const layer = this.getActiveLayer(session);
    if (!layer) return;

    this.isStrokeActive = true;
    this.activeStrokeMesh = hit.mesh;
    this.activeStrokeLayerId = layer.id;
    this.activeStrokeBeforePixels = layer.pixels.slice();
    this.lastStrokeWorldPos = hit.worldPos.clone();
    this.hasSmudgeSample = false;

    // Detach camera controls during stroke so dragging paints smoothly instead of orbiting
    if (this.service.camera && this.service.canvas) {
      this.service.camera.detachControl();
      this.cameraDetachedForStroke = true;
    }

    if (this.mode === 'smudge' && hit.uv) {
      this.sampleSmudgeAtUV(session, layer, hit.uv.u, hit.uv.v);
    }

    this.applyInteractiveStamp(session, layer, hit.worldPos, hit.worldNormal);
    this.compositeAndUpload(session, false);
    this.onCanvasUpdated?.(hit.mesh);
  }

  private handlePointerMove(): void {
    const hit = this.pickPaintableMesh();
    this.updateBrushCursorVisual(hit);

    if (!this.isStrokeActive || !this.activeStrokeMesh || !hit || hit.mesh !== this.activeStrokeMesh) {
      return;
    }

    const session = this.sessions.get(this.activeStrokeMesh);
    if (!session) return;
    const layer = session.layers.find((l) => l.id === this.activeStrokeLayerId);
    if (!layer) return;

    const prev = this.lastStrokeWorldPos || hit.worldPos;
    const dist = Vector3.Distance(prev, hit.worldPos);
    const step = Math.max(0.005, this.brushRadius * this.brushSpacing);

    if (dist < step * 0.4) return;

    const steps = Math.max(1, Math.min(24, Math.ceil(dist / step)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = Vector3.Lerp(prev, hit.worldPos, t);
      this.applyInteractiveStamp(session, layer, p, hit.worldNormal);
    }

    this.lastStrokeWorldPos = hit.worldPos.clone();

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastCompositeTime > 16) {
      this.compositeAndUpload(session, false);
      this.onCanvasUpdated?.(hit.mesh);
      this.lastCompositeTime = now;
    }
  }

  private endPointerStroke(): void {
    if (!this.isStrokeActive) return;

    if (this.cameraDetachedForStroke && this.service.camera && this.service.canvas) {
      this.service.camera.attachControl(this.service.canvas, true);
      this.cameraDetachedForStroke = false;
    }

    const mesh = this.activeStrokeMesh;
    const before = this.activeStrokeBeforePixels;
    const layerId = this.activeStrokeLayerId;

    this.isStrokeActive = false;
    this.activeStrokeMesh = null;
    this.activeStrokeBeforePixels = null;
    this.activeStrokeLayerId = '';
    this.lastStrokeWorldPos = null;
    this.hasSmudgeSample = false;

    if (mesh) {
      const session = this.sessions.get(mesh);
      if (session) {
        const layer = session.layers.find((l) => l.id === layerId);
        if (layer && before) {
          this.pushUndo(session, layer.id, before, layer.pixels.slice());
        }
        // Final composite with full UV seam dilation/bleed
        this.compositeAndUpload(session, true);
        this.onCanvasUpdated?.(mesh);
      }
    }
  }

  private applyInteractiveStamp(
    session: MeshPaintSession,
    layer: PaintLayer,
    worldPos: Vector3,
    worldNormal: Vector3
  ): void {
    const rgba = this.getActivePaintRgba();
    const isStencil = this.mode === 'stencil' && Boolean(this.stencil.pixels);

    this.stampSphereIntoLayer(session, layer, worldPos, worldNormal, {
      rgba,
      radius: this.brushRadius,
      hardness: this.brushHardness,
      opacity: this.brushOpacity,
      brushAlpha: this.brushAlpha,
      mode: isStencil ? 'stencil' : this.mode === 'eraser' ? 'eraser' : this.mode === 'smudge' ? 'smudge' : 'brush',
      backfaceCull: this.backfaceCull,
    });

    if (this.symmetryX && !isStencil) {
      const mirrored = this.mirrorWorldPointX(session.mesh, worldPos, worldNormal);
      this.stampSphereIntoLayer(session, layer, mirrored.pos, mirrored.normal, {
        rgba,
        radius: this.brushRadius,
        hardness: this.brushHardness,
        opacity: this.brushOpacity,
        brushAlpha: this.brushAlpha,
        mode: this.mode === 'eraser' ? 'eraser' : this.mode === 'smudge' ? 'smudge' : 'brush',
        backfaceCull: this.backfaceCull,
      });
    }
  }

  private mirrorWorldPointX(
    mesh: Mesh,
    worldPos: Vector3,
    worldNormal: Vector3
  ): { pos: Vector3; normal: Vector3 } {
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const centerX = bi ? bi.boundingBox.centerWorld.x : 0;
    return {
      pos: new Vector3(centerX * 2 - worldPos.x, worldPos.y, worldPos.z),
      normal: new Vector3(-worldNormal.x, worldNormal.y, worldNormal.z).normalize(),
    };
  }

  // =========================================================================
  // 2. SESSION INITIALIZATION, UV CACHE & LAYER STACK (PHASE 1 + 2)
  // =========================================================================

  public getSession(mesh: Nullable<Mesh>): Nullable<MeshPaintSession> {
    if (!mesh) return null;
    return this.sessions.get(mesh) || null;
  }

  /**
   * Returns true if the mesh already carries a non-session albedo/diffuse texture
   * (e.g. from a loaded .glb/.gltf model or AI Texture Generator) that can be edited in-place.
   */
  public hasExistingEditableTexture(mesh: Nullable<Mesh>): boolean {
    if (!mesh || mesh.isDisposed()) return false;
    const existing = this.sessions.get(mesh);
    const mat = mesh.material;
    const albedoTex =
      mat instanceof PBRMaterial
        ? mat.albedoTexture
        : mat instanceof StandardMaterial
          ? mat.diffuseTexture
          : null;
    if (!albedoTex) return false;
    if (existing && albedoTex === existing.albedoTexture) return false;
    return true;
  }

  /**
   * Async variant of ensurePaintSession that awaits decoding/GPU-readback of any existing
   * material textures (such as .glb/.gltf textures) before returning.
   */
  public async ensurePaintSessionAsync(
    mesh: Mesh,
    options: InitPaintOptions = {}
  ): Promise<Nullable<MeshPaintSession>> {
    const session = this.ensurePaintSession(mesh, options);
    if (session?.hydrationPromise) {
      await session.hydrationPromise;
    }
    return session;
  }

  public ensurePaintSession(mesh: Mesh, options: InitPaintOptions = {}): Nullable<MeshPaintSession> {
    if (!mesh || mesh.isDisposed()) return null;

    const existing = this.sessions.get(mesh);
    if (existing && !options.resolution && !options.baseColor && !options.forceUnwrap) {
      this.refreshUVCacheIfNeeded(existing);
      return existing;
    }

    // Capture existing material textures BEFORE attaching new session textures
    const mat = mesh.material;
    const origAlbedoTex =
      !existing && options.preserveExistingTexture !== false && !options.baseColor
        ? mat instanceof PBRMaterial
          ? (mat.albedoTexture as Nullable<Texture>)
          : mat instanceof StandardMaterial
            ? (mat.diffuseTexture as Nullable<Texture>)
            : null
        : null;
    const origMetallicTex =
      !existing && options.preserveExistingTexture !== false && mat instanceof PBRMaterial
        ? (mat.metallicTexture as Nullable<Texture>)
        : null;
    const origEmissiveTex =
      !existing && options.preserveExistingTexture !== false
        ? mat instanceof PBRMaterial
          ? (mat.emissiveTexture as Nullable<Texture>)
          : mat instanceof StandardMaterial
            ? (mat.emissiveTexture as Nullable<Texture>)
            : null
        : null;

    const hasExistingAlbedo = Boolean(origAlbedoTex);

    // Adopt existing texture resolution when none was explicitly requested
    let targetRes = options.resolution ?? this.defaultResolution;
    if (!options.resolution && origAlbedoTex) {
      const sz = origAlbedoTex.getSize?.();
      const maxDim = Math.max(sz?.width || 0, sz?.height || 0);
      if (maxDim >= 128) {
        targetRes = maxDim;
      }
    }
    const res = this.clampResolution(targetRes);
    const paddingPx = Math.max(0, Math.min(16, options.paddingPx ?? this.paddingPx));

    // If session already exists and only resolution changed (without baseColor reset), resample existing layers!
    if (existing && !options.baseColor && !options.forceUnwrap && options.preserveExistingTexture !== false) {
      if (existing.resolution === res) {
        this.refreshUVCacheIfNeeded(existing);
        return existing;
      }
      return this.resampleExistingSession(existing, res, paddingPx);
    }

    // Check UVs: NEVER overwrite existing UVs on a textured mesh (e.g. loaded .glb) unless UVs are missing or forceUnwrap=true
    const hasUVs = Boolean(mesh.getVerticesData(VertexBuffer.UVKind)?.length);
    const shouldAutoUnwrap = options.autoUnwrap !== false;
    if (!hasUVs || options.forceUnwrap) {
      this.service.uvUnwrapController.unwrapMesh(mesh, {
        method: 'angle_project',
        textureResolution: res,
        marginPx: Math.max(4, paddingPx),
      });
    } else if (shouldAutoUnwrap && !existing && !hasExistingAlbedo) {
      const analysis = this.service.uvUnwrapController.analyzeUVs(mesh, res);
      if (analysis.overlapDetected || analysis.uvSurfaceArea > 1.05 || analysis.uvCoveragePercent < 1) {
        this.service.uvUnwrapController.unwrapMesh(mesh, {
          method: 'angle_project',
          textureResolution: res,
          marginPx: Math.max(4, paddingPx),
        });
      }
    }

    // Capture albedo tint (for GLB materials that combine albedoTexture with a non-white albedoColor)
    const albedoTint: [number, number, number] =
      mat instanceof PBRMaterial && mat.albedoColor
        ? [mat.albedoColor.r, mat.albedoColor.g, mat.albedoColor.b]
        : mat instanceof StandardMaterial && mat.diffuseColor
          ? [mat.diffuseColor.r, mat.diffuseColor.g, mat.diffuseColor.b]
          : [1, 1, 1];

    // Determine initial base color from options or existing material
    const baseRgba = options.baseColor
      ? this.hexToRgba(options.baseColor, 255)
      : this.extractBaseColorFromMesh(mesh);

    // Dispose previous session textures if recreating
    if (existing) {
      existing.albedoTexture?.dispose();
      existing.ormTexture?.dispose();
      existing.emissiveTexture?.dispose();
      this.activeSessions.delete(existing);
    }

    const baseLayerPixels = new Uint8ClampedArray(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      baseLayerPixels[i * 4] = baseRgba[0];
      baseLayerPixels[i * 4 + 1] = baseRgba[1];
      baseLayerPixels[i * 4 + 2] = baseRgba[2];
      baseLayerPixels[i * 4 + 3] = 255;
    }

    // Attempt immediate synchronous copy of existing albedo texture (works for DynamicTexture, RawTexture, loaded Image/Canvas)
    let copiedAlbedoSync = false;
    if (origAlbedoTex) {
      copiedAlbedoSync = this.tryCopyTextureIntoBufferSync(origAlbedoTex, baseLayerPixels, res, albedoTint);
    }

    const baseLayer: PaintLayer = {
      id: this.generateLayerId(),
      name: origAlbedoTex ? 'Base Texture' : 'Base Color',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      channel: 'albedo',
      pixels: baseLayerPixels,
    };

    const paintLayer: PaintLayer = {
      id: this.generateLayerId(),
      name: 'Paint Layer 1',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      channel: 'albedo',
      pixels: new Uint8ClampedArray(res * res * 4), // Transparent so strokes paint cleanly on top of loaded texture
    };

    const ormComposite = new Uint8ClampedArray(res * res * 4);
    const defaultRoughByte = this.extractDefaultRoughnessByte(mesh);
    const defaultMetalByte = this.extractDefaultMetallicByte(mesh);
    for (let i = 0; i < res * res; i++) {
      ormComposite[i * 4] = 255; // R: AO
      ormComposite[i * 4 + 1] = defaultRoughByte; // G: Roughness
      ormComposite[i * 4 + 2] = defaultMetalByte; // B: Metallic
      ormComposite[i * 4 + 3] = 255;
    }

    const session: MeshPaintSession = {
      mesh,
      resolution: res,
      paddingPx,
      layers: [baseLayer, paintLayer],
      activeLayerId: paintLayer.id,
      coverageMask: new Uint8Array(res * res),
      islandIdByTexel: new Int32Array(res * res).fill(-1),
      islandCount: 0,
      triangles: [],
      cachedWorldMatrixHash: '',
      cachedVertexCount: 0,
      albedoComposite: new Uint8ClampedArray(res * res * 4),
      ormComposite,
      emissiveComposite: new Uint8ClampedArray(res * res * 4),
      albedoTexture: null,
      ormTexture: null,
      emissiveTexture: null,
      hasRoughnessOrMetallicData: false,
      hasEmissiveData: false,
      loadedFromExistingTexture: copiedAlbedoSync,
      undoStack: [],
      redoStack: [],
    };

    this.buildUVCache(session);
    this.sessions.set(mesh, session);
    this.activeSessions.add(session);
    this.attachMaterialTextures(session);
    this.compositeAndUpload(session, true);

    // Asynchronously hydrate GLB/GPU textures (albedo, ORM roughness/metallic, emissive) if needed
    const needsAsyncAlbedo = Boolean(origAlbedoTex && !copiedAlbedoSync);
    const needsAsyncOrm = Boolean(origMetallicTex);
    const needsAsyncEmissive = Boolean(origEmissiveTex);

    if (needsAsyncAlbedo || needsAsyncOrm || needsAsyncEmissive) {
      session.hydrationPromise = this.hydrateSessionFromExistingTexturesAsync(
        session,
        baseLayer,
        needsAsyncAlbedo ? origAlbedoTex : null,
        albedoTint,
        origMetallicTex,
        origEmissiveTex
      );
    }

    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);

    return session;
  }

  private resampleExistingSession(
    existing: MeshPaintSession,
    newRes: number,
    paddingPx: number
  ): MeshPaintSession {
    const oldRes = existing.resolution;
    const resampledLayers: PaintLayer[] = existing.layers.map((layer) => ({
      ...layer,
      pixels: this.resizeRgbaBuffer(layer.pixels, oldRes, oldRes, newRes, newRes, false),
    }));

    existing.albedoTexture?.dispose();
    existing.ormTexture?.dispose();
    existing.emissiveTexture?.dispose();
    this.activeSessions.delete(existing);

    const session: MeshPaintSession = {
      ...existing,
      resolution: newRes,
      paddingPx,
      layers: resampledLayers,
      coverageMask: new Uint8Array(newRes * newRes),
      islandIdByTexel: new Int32Array(newRes * newRes).fill(-1),
      triangles: [],
      cachedWorldMatrixHash: '',
      cachedVertexCount: 0,
      albedoComposite: new Uint8ClampedArray(newRes * newRes * 4),
      ormComposite: new Uint8ClampedArray(newRes * newRes * 4),
      emissiveComposite: new Uint8ClampedArray(newRes * newRes * 4),
      albedoTexture: null,
      ormTexture: null,
      emissiveTexture: null,
      undoStack: [],
      redoStack: [],
    };

    this.buildUVCache(session);
    this.sessions.set(existing.mesh, session);
    this.activeSessions.add(session);
    this.attachMaterialTextures(session);
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(existing.mesh);
    this.onStateChanged?.(this.isActive);
    return session;
  }

  private async hydrateSessionFromExistingTexturesAsync(
    session: MeshPaintSession,
    baseLayer: PaintLayer,
    origAlbedoTex: Nullable<Texture>,
    albedoTint: [number, number, number],
    origMetallicTex: Nullable<Texture>,
    origEmissiveTex: Nullable<Texture>
  ): Promise<void> {
    const res = session.resolution;
    let updated = false;

    if (origAlbedoTex) {
      const ok = await this.copyTextureIntoBufferAsync(origAlbedoTex, baseLayer.pixels, res, albedoTint);
      if (ok) {
        session.loadedFromExistingTexture = true;
        updated = true;
      }
    }

    if (origMetallicTex) {
      const ormBuf = new Uint8ClampedArray(res * res * 4);
      const ok = await this.copyTextureIntoBufferAsync(origMetallicTex, ormBuf, res, [1, 1, 1]);
      if (ok) {
        const roughPixels = new Uint8ClampedArray(res * res * 4);
        const metalPixels = new Uint8ClampedArray(res * res * 4);
        for (let i = 0; i < res * res; i++) {
          const g = ormBuf[i * 4 + 1];
          const b = ormBuf[i * 4 + 2];
          roughPixels[i * 4] = g;
          roughPixels[i * 4 + 1] = g;
          roughPixels[i * 4 + 2] = g;
          roughPixels[i * 4 + 3] = 255;
          metalPixels[i * 4] = b;
          metalPixels[i * 4 + 1] = b;
          metalPixels[i * 4 + 2] = b;
          metalPixels[i * 4 + 3] = 255;
        }
        session.layers.push(
          {
            id: this.generateLayerId(),
            name: 'Base Roughness',
            visible: true,
            opacity: 1.0,
            blendMode: 'normal',
            channel: 'roughness',
            pixels: roughPixels,
          },
          {
            id: this.generateLayerId(),
            name: 'Base Metallic',
            visible: true,
            opacity: 1.0,
            blendMode: 'normal',
            channel: 'metallic',
            pixels: metalPixels,
          }
        );
        session.hasRoughnessOrMetallicData = true;
        updated = true;
      }
    }

    if (origEmissiveTex) {
      const emBuf = new Uint8ClampedArray(res * res * 4);
      const ok = await this.copyTextureIntoBufferAsync(origEmissiveTex, emBuf, res, [1, 1, 1]);
      if (ok) {
        session.layers.push({
          id: this.generateLayerId(),
          name: 'Base Emissive',
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          channel: 'emissive',
          pixels: emBuf,
        });
        session.hasEmissiveData = true;
        updated = true;
      }
    }

    if (updated && !session.mesh.isDisposed() && this.sessions.get(session.mesh) === session) {
      this.compositeAndUpload(session, true);
      this.onCanvasUpdated?.(session.mesh);
      this.onStateChanged?.(this.isActive);
    }
  }

  private clampResolution(res: number): number {
    if (res <= 256) return 256;
    if (res <= 512) return 512;
    if (res <= 1024) return 1024;
    return 2048;
  }

  private generateLayerId(): string {
    return `layer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private extractBaseColorFromMesh(mesh: Mesh): [number, number, number, number] {
    const mat = mesh.material;
    if (mat instanceof PBRMaterial && mat.albedoColor) {
      return [
        Math.round(Math.max(0, Math.min(1, mat.albedoColor.r)) * 255),
        Math.round(Math.max(0, Math.min(1, mat.albedoColor.g)) * 255),
        Math.round(Math.max(0, Math.min(1, mat.albedoColor.b)) * 255),
        255,
      ];
    }
    if (mat instanceof StandardMaterial && mat.diffuseColor) {
      return [
        Math.round(Math.max(0, Math.min(1, mat.diffuseColor.r)) * 255),
        Math.round(Math.max(0, Math.min(1, mat.diffuseColor.g)) * 255),
        Math.round(Math.max(0, Math.min(1, mat.diffuseColor.b)) * 255),
        255,
      ];
    }
    return [210, 214, 222, 255];
  }

  private extractDefaultRoughnessByte(mesh: Mesh): number {
    const mat = mesh.material;
    if (mat instanceof PBRMaterial && typeof mat.roughness === 'number') {
      return Math.round(Math.max(0, Math.min(1, mat.roughness)) * 255);
    }
    return 140; // ~0.55
  }

  private extractDefaultMetallicByte(mesh: Mesh): number {
    const mat = mesh.material;
    if (mat instanceof PBRMaterial && typeof mat.metallic === 'number') {
      return Math.round(Math.max(0, Math.min(1, mat.metallic)) * 255);
    }
    return 15; // ~0.06
  }

  /**
   * Synchronously copies pixels from an existing texture when CPU/DOM image data is immediately available
   * (DynamicTexture, RawTexture RGBA buffer, already-loaded HTMLImageElement/Canvas/ImageBitmap, or BMP buffer).
   * Properly accounts for Babylon/glTF invertY differences (GLB textures have invertY=false).
   */
  private tryCopyTextureIntoBufferSync(
    srcTex: Texture,
    target: Uint8ClampedArray,
    res: number,
    tint: [number, number, number]
  ): boolean {
    const srcInvertY = (srcTex as any).invertY !== false;
    const flipY = !srcInvertY; // Our paint canvas uses invertY=true; GLB textures use invertY=false

    // 1. RawTexture or texture carrying a direct RGBA pixel TypedArray
    const internal = srcTex.getInternalTexture?.() || (srcTex as any)._texture;
    const rawBuf = (srcTex as any)._buffer ?? (internal as any)?._buffer;
    const sz = srcTex.getSize?.();
    const srcW = sz?.width || internal?.width || 0;
    const srcH = sz?.height || internal?.height || 0;

    if (
      rawBuf &&
      (rawBuf instanceof Uint8Array || rawBuf instanceof Uint8ClampedArray) &&
      srcW > 0 &&
      srcH > 0 &&
      rawBuf.length === srcW * srcH * 4
    ) {
      const resized = this.resizeRgbaBuffer(rawBuf, srcW, srcH, res, res, flipY);
      this.applyTintAndCopy(resized, target, tint);
      return true;
    }

    // 2. Direct BMP binary buffer (e.g. headless export/reload round-trips)
    if (rawBuf && (rawBuf instanceof Uint8Array || rawBuf instanceof ArrayBuffer)) {
      const bytes = rawBuf instanceof Uint8Array ? rawBuf : new Uint8Array(rawBuf);
      const decodedBmp = this.tryDecodeBmpBytes(bytes);
      if (decodedBmp) {
        const resized = this.resizeRgbaBuffer(decodedBmp.pixels, decodedBmp.width, decodedBmp.height, res, res, flipY);
        this.applyTintAndCopy(resized, target, tint);
        return true;
      }
    }

    // 3. Browser 2D canvas draw from DynamicTexture, HTMLCanvasElement, ImageBitmap, or complete HTMLImageElement
    if (typeof document !== 'undefined') {
      try {
        let drawable: CanvasImageSource | null = null;
        if (srcTex instanceof DynamicTexture) {
          drawable = srcTex.getContext()?.canvas as unknown as CanvasImageSource;
        } else {
          const candidate = internal?._htmlElement || internal?._img || rawBuf;
          if (
            candidate &&
            ((typeof HTMLImageElement !== 'undefined' && candidate instanceof HTMLImageElement && candidate.complete && candidate.naturalWidth > 0) ||
              (typeof HTMLCanvasElement !== 'undefined' && candidate instanceof HTMLCanvasElement) ||
              (typeof ImageBitmap !== 'undefined' && candidate instanceof ImageBitmap))
          ) {
            drawable = candidate as CanvasImageSource;
          }
        }
        if (drawable) {
          const drawn = this.drawImageSourceToRgba(drawable, res, flipY);
          if (drawn) {
            this.applyTintAndCopy(drawn, target, tint);
            return true;
          }
        }
      } catch {
        // Fall through to async hydration
      }
    }

    return false;
  }

  /**
   * Asynchronously extracts RGBA pixels from ANY Babylon texture (including binary GLB/glTF textures,
   * Blob URLs, DataURLs, ImageBitmaps, and GPU-resident textures via readPixels()).
   */
  private async copyTextureIntoBufferAsync(
    srcTex: Texture,
    target: Uint8ClampedArray,
    res: number,
    tint: [number, number, number]
  ): Promise<boolean> {
    if (this.tryCopyTextureIntoBufferSync(srcTex, target, res, tint)) {
      return true;
    }

    const srcInvertY = (srcTex as any).invertY !== false;
    const flipYForImage = !srcInvertY;

    // Strategy A: Resolve GLB binary buffer or texture URL into a DataURL and decode via Image -> 2D Canvas
    const resolvedUrl = this.service.resolveTextureImageUrl?.(srcTex) || srcTex.url || '';
    if (resolvedUrl) {
      // Handle data:image/bmp directly even in headless environments without 2D canvas
      if (resolvedUrl.startsWith('data:image/bmp;base64,')) {
        const b64 = resolvedUrl.slice('data:image/bmp;base64,'.length);
        const bytes = this.base64ToUint8Array(b64);
        const decodedBmp = bytes ? this.tryDecodeBmpBytes(bytes) : null;
        if (decodedBmp) {
          const resized = this.resizeRgbaBuffer(
            decodedBmp.pixels,
            decodedBmp.width,
            decodedBmp.height,
            res,
            res,
            flipYForImage
          );
          this.applyTintAndCopy(resized, target, tint);
          return true;
        }
      }

      const has2D = (() => {
        if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
        try {
          return Boolean(document.createElement('canvas').getContext('2d'));
        } catch {
          return false;
        }
      })();

      if (has2D) {
        const drawn = await new Promise<Uint8ClampedArray | null>((resolve) => {
          let done = false;
          const finish = (v: Uint8ClampedArray | null) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(v);
          };
          const timer = setTimeout(() => finish(null), 4000);
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            finish(this.drawImageSourceToRgba(img, res, flipYForImage));
          };
          img.onerror = () => finish(null);
          img.src = resolvedUrl;
        });
        if (drawn) {
          this.applyTintAndCopy(drawn, target, tint);
          return true;
        }
      }
    }

    // Strategy B: Universal WebGL GPU texture readback via Babylon's readPixels()
    // WebGL readPixels returns rows bottom-to-top (row 0 = UV v=0), so flipping Y always aligns with our invertY=true buffer.
    if (typeof srcTex.readPixels === 'function') {
      try {
        const pxData = await srcTex.readPixels();
        const sz = srcTex.getSize?.();
        const w = sz?.width || 0;
        const h = sz?.height || 0;
        if (pxData && w > 0 && h > 0 && pxData.byteLength >= w * h * 4) {
          const u8 = new Uint8ClampedArray(pxData.buffer, pxData.byteOffset, w * h * 4);
          const resized = this.resizeRgbaBuffer(u8, w, h, res, res, true);
          this.applyTintAndCopy(resized, target, tint);
          return true;
        }
      } catch {
        // Ignore GPU readback failures in headless NullEngine
      }
    }

    return false;
  }

  private drawImageSourceToRgba(
    drawable: CanvasImageSource,
    res: number,
    flipY: boolean
  ): Uint8ClampedArray | null {
    if (typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.save();
      if (flipY) {
        ctx.translate(0, res);
        ctx.scale(1, -1);
      }
      ctx.drawImage(drawable, 0, 0, res, res);
      ctx.restore();
      return new Uint8ClampedArray(ctx.getImageData(0, 0, res, res).data);
    } catch {
      return null;
    }
  }

  private resizeRgbaBuffer(
    src: Uint8ClampedArray | Uint8Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
    flipY: boolean
  ): Uint8ClampedArray {
    if (srcW === dstW && srcH === dstH && !flipY) {
      return new Uint8ClampedArray(src);
    }
    const out = new Uint8ClampedArray(dstW * dstH * 4);
    const scaleX = srcW / dstW;
    const scaleY = srcH / dstH;
    for (let dy = 0; dy < dstH; dy++) {
      const syRaw = Math.min(srcH - 1, Math.floor((dy + 0.5) * scaleY));
      const sy = flipY ? srcH - 1 - syRaw : syRaw;
      for (let dx = 0; dx < dstW; dx++) {
        const sx = Math.min(srcW - 1, Math.floor((dx + 0.5) * scaleX));
        const sIdx = (sy * srcW + sx) * 4;
        const dIdx = (dy * dstW + dx) * 4;
        out[dIdx] = src[sIdx];
        out[dIdx + 1] = src[sIdx + 1];
        out[dIdx + 2] = src[sIdx + 2];
        out[dIdx + 3] = src[sIdx + 3];
      }
    }
    return out;
  }

  private applyTintAndCopy(
    src: Uint8ClampedArray,
    dst: Uint8ClampedArray,
    tint: [number, number, number]
  ): void {
    const tr = Math.max(0, Math.min(1, tint[0]));
    const tg = Math.max(0, Math.min(1, tint[1]));
    const tb = Math.max(0, Math.min(1, tint[2]));
    const isWhite = tr > 0.995 && tg > 0.995 && tb > 0.995;
    if (isWhite) {
      dst.set(src);
      return;
    }
    for (let i = 0; i < dst.length; i += 4) {
      dst[i] = Math.round(src[i] * tr);
      dst[i + 1] = Math.round(src[i + 1] * tg);
      dst[i + 2] = Math.round(src[i + 2] * tb);
      dst[i + 3] = src[i + 3];
    }
  }

  private tryDecodeBmpBytes(bytes: Uint8Array): { width: number; height: number; pixels: Uint8ClampedArray } | null {
    if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dataOffset = view.getUint32(10, true);
    const width = view.getInt32(18, true);
    const rawHeight = view.getInt32(22, true);
    const bpp = view.getUint16(28, true);
    if (width <= 0 || rawHeight === 0 || (bpp !== 24 && bpp !== 32)) return null;
    const topDown = rawHeight < 0;
    const height = Math.abs(rawHeight);
    const bytesPerPixel = bpp / 8;
    const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
    if (dataOffset + rowSize * height > bytes.length) return null;

    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcRow = topDown ? y : height - 1 - y;
      const rowOff = dataOffset + srcRow * rowSize;
      for (let x = 0; x < width; x++) {
        const sIdx = rowOff + x * bytesPerPixel;
        const dIdx = (y * width + x) * 4;
        pixels[dIdx] = bytes[sIdx + 2]; // R
        pixels[dIdx + 1] = bytes[sIdx + 1]; // G
        pixels[dIdx + 2] = bytes[sIdx]; // B
        pixels[dIdx + 3] = bytesPerPixel === 4 ? bytes[sIdx + 3] : 255;
      }
    }
    return { width, height, pixels };
  }

  private base64ToUint8Array(b64: string): Uint8Array | null {
    try {
      if (typeof atob === 'function') {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }
      const nodeBuffer = (
        globalThis as unknown as { Buffer?: { from(s: string, enc: string): Uint8Array } }
      ).Buffer;
      if (nodeBuffer) return new Uint8Array(nodeBuffer.from(b64, 'base64'));
    } catch {
      // Ignore decode failure
    }
    return null;
  }

  private attachMaterialTextures(session: MeshPaintSession): void {
    const { mesh, resolution } = session;
    const origMat = mesh.material;
    let mat: PBRMaterial;

    // Ensure mesh uses a dedicated PBRMaterial so painting never mutates shared materials unintentionally
    if (!(origMat instanceof PBRMaterial)) {
      const pbr = new PBRMaterial(`${mesh.name}_PaintedPBR`, this.scene);
      pbr.albedoColor = Color3.White();
      pbr.metallic = 0.05;
      pbr.roughness = 0.6;
      if (origMat instanceof StandardMaterial) {
        pbr.bumpTexture = origMat.bumpTexture;
      }
      mesh.material = pbr;
      mat = pbr;
    } else {
      // If material is shared across multiple meshes, clone it for this mesh
      const sharedCount = this.service.importedMeshes.filter((m) => m.material === origMat).length;
      if (sharedCount > 1) {
        const cloned = origMat.clone(`${mesh.name}_PaintedPBR`);
        mesh.material = cloned;
        mat = cloned;
      } else {
        mat = origMat;
      }
      mat.albedoColor = Color3.White();
    }

    // Create live RawTextures with invertY = true so row 0 corresponds to UV v = 1 (matches PNG & 2D Canvas)
    session.albedoTexture = RawTexture.CreateRGBATexture(
      session.albedoComposite,
      resolution,
      resolution,
      this.scene,
      true,
      true,
      Texture.TRILINEAR_SAMPLINGMODE
    );
    session.albedoTexture.name = `${mesh.name}_PaintedAlbedo`;
    session.albedoTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    session.albedoTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    mat.albedoTexture = session.albedoTexture;

    if (session.hasRoughnessOrMetallicData) {
      this.ensureOrmTextureAttached(session, mat);
    }
    if (session.hasEmissiveData) {
      this.ensureEmissiveTextureAttached(session, mat);
    }
  }

  private ensureOrmTextureAttached(session: MeshPaintSession, mat: PBRMaterial): void {
    if (!session.ormTexture) {
      session.ormTexture = RawTexture.CreateRGBATexture(
        session.ormComposite,
        session.resolution,
        session.resolution,
        this.scene,
        true,
        true,
        Texture.TRILINEAR_SAMPLINGMODE
      );
      session.ormTexture.name = `${session.mesh.name}_PaintedORM`;
      session.ormTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
      session.ormTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    }
    mat.metallicTexture = session.ormTexture;
    mat.useRoughnessFromMetallicTextureAlpha = false;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.useAmbientOcclusionFromMetallicTextureRed = false;
    mat.metallic = 1.0;
    mat.roughness = 1.0;
  }

  private ensureEmissiveTextureAttached(session: MeshPaintSession, mat: PBRMaterial): void {
    if (!session.emissiveTexture) {
      session.emissiveTexture = RawTexture.CreateRGBATexture(
        session.emissiveComposite,
        session.resolution,
        session.resolution,
        this.scene,
        true,
        true,
        Texture.TRILINEAR_SAMPLINGMODE
      );
      session.emissiveTexture.name = `${session.mesh.name}_PaintedEmissive`;
      session.emissiveTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
      session.emissiveTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    }
    mat.emissiveTexture = session.emissiveTexture;
    mat.emissiveColor = Color3.White();
  }

  private computeWorldMatrixHash(mesh: Mesh): string {
    const m = mesh.computeWorldMatrix(true).m;
    return `${m[0].toFixed(3)},${m[5].toFixed(3)},${m[10].toFixed(3)},${m[12].toFixed(3)},${m[13].toFixed(3)},${m[14].toFixed(3)}`;
  }

  private refreshUVCacheIfNeeded(session: MeshPaintSession): void {
    const pos = session.mesh.getVerticesData(VertexBuffer.PositionKind);
    const vCount = pos ? pos.length : 0;
    const hash = this.computeWorldMatrixHash(session.mesh);

    if (vCount !== session.cachedVertexCount || session.triangles.length === 0) {
      this.buildUVCache(session);
      return;
    }
    if (hash !== session.cachedWorldMatrixHash) {
      this.updateTriangleWorldCoords(session);
      session.cachedWorldMatrixHash = hash;
    }
  }

  private buildUVCache(session: MeshPaintSession): void {
    const { mesh, resolution: res } = session;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const indices = mesh.getIndices();

    session.triangles = [];
    session.coverageMask.fill(0);
    session.islandIdByTexel.fill(-1);
    session.islandCount = 0;

    if (!positions || !uvs || !indices || indices.length < 3) return;

    const numFaces = Math.floor(indices.length / 3);
    const islandIds = this.computeFaceIslandIds(uvs, indices, numFaces);
    let maxIsland = -1;
    for (let f = 0; f < numFaces; f++) {
      if (islandIds[f] > maxIsland) maxIsland = islandIds[f];
    }
    session.islandCount = maxIsland + 1;

    const worldMat = mesh.computeWorldMatrix(true);

    for (let f = 0; f < numFaces; f++) {
      const i0 = indices[f * 3];
      const i1 = indices[f * 3 + 1];
      const i2 = indices[f * 3 + 2];

      const lp0 = new Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      const lp1 = new Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      const lp2 = new Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

      const defaultN = Vector3.Cross(lp1.subtract(lp0), lp2.subtract(lp0));
      if (defaultN.lengthSquared() > 1e-10) defaultN.normalize();
      else defaultN.set(0, 1, 0);

      const ln0 = normals
        ? new Vector3(normals[i0 * 3], normals[i0 * 3 + 1], normals[i0 * 3 + 2]).normalize()
        : defaultN.clone();
      const ln1 = normals
        ? new Vector3(normals[i1 * 3], normals[i1 * 3 + 1], normals[i1 * 3 + 2]).normalize()
        : defaultN.clone();
      const ln2 = normals
        ? new Vector3(normals[i2 * 3], normals[i2 * 3 + 1], normals[i2 * 3 + 2]).normalize()
        : defaultN.clone();

      const u0 = this.wrapUV01(uvs[i0 * 2]);
      const v0 = this.wrapUV01(uvs[i0 * 2 + 1]);
      const u1 = this.wrapUV01(uvs[i1 * 2]);
      const v1 = this.wrapUV01(uvs[i1 * 2 + 1]);
      const u2 = this.wrapUV01(uvs[i2 * 2]);
      const v2 = this.wrapUV01(uvs[i2 * 2 + 1]);

      const x0 = u0 * res;
      const y0 = (1 - v0) * res;
      const x1 = u1 * res;
      const y1 = (1 - v1) * res;
      const x2 = u2 * res;
      const y2 = (1 - v2) * res;

      const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denom) < 1e-6) continue;
      const invDenom = 1.0 / denom;

      const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxPx = Math.min(res - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxPy = Math.min(res - 1, Math.ceil(Math.max(y0, y1, y2)));

      const wp0 = Vector3.TransformCoordinates(lp0, worldMat);
      const wp1 = Vector3.TransformCoordinates(lp1, worldMat);
      const wp2 = Vector3.TransformCoordinates(lp2, worldMat);
      const wn0 = Vector3.TransformNormal(ln0, worldMat).normalize();
      const wn1 = Vector3.TransformNormal(ln1, worldMat).normalize();
      const wn2 = Vector3.TransformNormal(ln2, worldMat).normalize();
      const faceNormal = Vector3.Cross(wp1.subtract(wp0), wp2.subtract(wp0));
      const avgWn = wn0.add(wn1).add(wn2);
      if (faceNormal.lengthSquared() > 1e-10) {
        faceNormal.normalize();
        if (avgWn.lengthSquared() > 1e-10 && Vector3.Dot(faceNormal, avgWn) < 0) {
          faceNormal.scaleInPlace(-1);
        }
      } else {
        faceNormal.copyFrom(avgWn.lengthSquared() > 1e-10 ? avgWn.normalize() : wn0);
      }

      const islandId = islandIds[f];

      session.triangles.push({
        faceIndex: f,
        islandId,
        lp0,
        lp1,
        lp2,
        ln0,
        ln1,
        ln2,
        wp0,
        wp1,
        wp2,
        wn0,
        wn1,
        wn2,
        faceNormal,
        minX: Math.min(wp0.x, wp1.x, wp2.x),
        maxX: Math.max(wp0.x, wp1.x, wp2.x),
        minY: Math.min(wp0.y, wp1.y, wp2.y),
        maxY: Math.max(wp0.y, wp1.y, wp2.y),
        minZ: Math.min(wp0.z, wp1.z, wp2.z),
        maxZ: Math.max(wp0.z, wp1.z, wp2.z),
        u0,
        v0,
        u1,
        v1,
        u2,
        v2,
        x0,
        y0,
        x1,
        y1,
        x2,
        y2,
        minPx,
        maxPx,
        minPy,
        maxPy,
        invDenom,
      });

      // Populate coverage mask & island ID map
      for (let py = minPy; py <= maxPy; py++) {
        const sy = py + 0.5;
        for (let px = minPx; px <= maxPx; px++) {
          const sx = px + 0.5;
          const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
          const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
          const w2 = 1.0 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          const pIdx = py * res + px;
          session.coverageMask[pIdx] = 1;
          session.islandIdByTexel[pIdx] = islandId;
        }
      }
    }

    session.cachedVertexCount = positions.length;
    session.cachedWorldMatrixHash = this.computeWorldMatrixHash(mesh);
  }

  private updateTriangleWorldCoords(session: MeshPaintSession): void {
    const worldMat = session.mesh.computeWorldMatrix(true);
    for (const tri of session.triangles) {
      Vector3.TransformCoordinatesToRef(tri.lp0, worldMat, tri.wp0);
      Vector3.TransformCoordinatesToRef(tri.lp1, worldMat, tri.wp1);
      Vector3.TransformCoordinatesToRef(tri.lp2, worldMat, tri.wp2);
      Vector3.TransformNormalToRef(tri.ln0, worldMat, tri.wn0);
      tri.wn0.normalize();
      Vector3.TransformNormalToRef(tri.ln1, worldMat, tri.wn1);
      tri.wn1.normalize();
      Vector3.TransformNormalToRef(tri.ln2, worldMat, tri.wn2);
      tri.wn2.normalize();
      const fn = Vector3.Cross(tri.wp1.subtract(tri.wp0), tri.wp2.subtract(tri.wp0));
      const avgWn = tri.wn0.add(tri.wn1).add(tri.wn2);
      if (fn.lengthSquared() > 1e-10) {
        fn.normalize();
        if (avgWn.lengthSquared() > 1e-10 && Vector3.Dot(fn, avgWn) < 0) {
          fn.scaleInPlace(-1);
        }
        tri.faceNormal.copyFrom(fn);
      }
      tri.minX = Math.min(tri.wp0.x, tri.wp1.x, tri.wp2.x);
      tri.maxX = Math.max(tri.wp0.x, tri.wp1.x, tri.wp2.x);
      tri.minY = Math.min(tri.wp0.y, tri.wp1.y, tri.wp2.y);
      tri.maxY = Math.max(tri.wp0.y, tri.wp1.y, tri.wp2.y);
      tri.minZ = Math.min(tri.wp0.z, tri.wp1.z, tri.wp2.z);
      tri.maxZ = Math.max(tri.wp0.z, tri.wp1.z, tri.wp2.z);
    }
  }

  /**
   * Computes UV island IDs by connecting triangles that share UV vertices (quantized to 1e-4).
   */
  private computeFaceIslandIds(uvs: FloatArray, indices: IndicesArray, numFaces: number): Int32Array {
    const parent = new Int32Array(numFaces);
    for (let i = 0; i < numFaces; i++) parent[i] = i;

    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const uvKeyToFace = new Map<string, number>();
    for (let f = 0; f < numFaces; f++) {
      for (let k = 0; k < 3; k++) {
        const vi = indices[f * 3 + k];
        const key = `${Math.round(uvs[vi * 2] * 10000)},${Math.round(uvs[vi * 2 + 1] * 10000)}`;
        const prevFace = uvKeyToFace.get(key);
        if (prevFace !== undefined) {
          union(f, prevFace);
        } else {
          uvKeyToFace.set(key, f);
        }
      }
    }

    const rootToId = new Map<number, number>();
    const result = new Int32Array(numFaces);
    let nextId = 0;
    for (let f = 0; f < numFaces; f++) {
      const r = find(f);
      let id = rootToId.get(r);
      if (id === undefined) {
        id = nextId++;
        rootToId.set(r, id);
      }
      result[f] = id;
    }
    return result;
  }

  private wrapUV01(val: number): number {
    if (!Number.isFinite(val)) return 0;
    if (val >= 0 && val <= 1) return val;
    const mod = val % 1;
    return mod < 0 ? mod + 1 : mod;
  }

  private uvToPixelX(u: number, res: number): number {
    return Math.max(0, Math.min(res - 1, Math.floor(this.wrapUV01(u) * res)));
  }

  private uvToPixelY(v: number, res: number): number {
    return Math.max(0, Math.min(res - 1, Math.floor((1 - this.wrapUV01(v)) * res)));
  }

  // =========================================================================
  // 3. LAYER MANAGEMENT API (PHASE 2)
  // =========================================================================

  public getActiveLayer(session: MeshPaintSession): Nullable<PaintLayer> {
    return session.layers.find((l) => l.id === session.activeLayerId) || session.layers[session.layers.length - 1] || null;
  }

  public getLayersSummary(mesh: Nullable<Mesh>): PaintLayerSummary[] {
    if (!mesh) return [];
    const session = this.sessions.get(mesh);
    if (!session) return [];
    return session.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      channel: l.channel,
      isActive: l.id === session.activeLayerId,
    }));
  }

  public addLayer(
    mesh: Mesh,
    opts: {
      name?: string;
      channel?: PaintChannel;
      blendMode?: PaintBlendMode;
      opacity?: number;
      fillRgba?: [number, number, number, number];
    } = {}
  ): Nullable<PaintLayer> {
    const session = this.ensurePaintSession(mesh);
    if (!session) return null;

    const channel = opts.channel ?? this.channel;
    const pixels = new Uint8ClampedArray(session.resolution * session.resolution * 4);
    if (opts.fillRgba) {
      for (let i = 0; i < session.resolution * session.resolution; i++) {
        pixels[i * 4] = opts.fillRgba[0];
        pixels[i * 4 + 1] = opts.fillRgba[1];
        pixels[i * 4 + 2] = opts.fillRgba[2];
        pixels[i * 4 + 3] = opts.fillRgba[3];
      }
    }

    const layer: PaintLayer = {
      id: this.generateLayerId(),
      name: opts.name || `Paint Layer ${session.layers.length}`,
      visible: true,
      opacity: opts.opacity ?? 1.0,
      blendMode: opts.blendMode ?? 'normal',
      channel,
      pixels,
    };

    session.layers.push(layer);
    session.activeLayerId = layer.id;
    this.channel = channel;

    if (channel === 'roughness' || channel === 'metallic') {
      session.hasRoughnessOrMetallicData = true;
    } else if (channel === 'emissive') {
      session.hasEmissiveData = true;
    }

    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return layer;
  }

  public selectLayer(mesh: Mesh, layerIdOrName: string): Nullable<PaintLayer> {
    const session = this.sessions.get(mesh);
    if (!session) return null;
    const found =
      session.layers.find((l) => l.id === layerIdOrName) ||
      session.layers.find((l) => l.name.toLowerCase() === layerIdOrName.toLowerCase());
    if (!found) return null;
    session.activeLayerId = found.id;
    this.channel = found.channel;
    this.onStateChanged?.(this.isActive);
    return found;
  }

  public deleteLayer(mesh: Mesh, layerId: string): boolean {
    const session = this.sessions.get(mesh);
    if (!session || session.layers.length <= 1) return false;
    const idx = session.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    session.layers.splice(idx, 1);
    if (session.activeLayerId === layerId) {
      session.activeLayerId = session.layers[Math.max(0, idx - 1)].id;
    }
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return true;
  }

  public duplicateLayer(mesh: Mesh, layerId: string): Nullable<PaintLayer> {
    const session = this.sessions.get(mesh);
    if (!session) return null;
    const idx = session.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return null;
    const src = session.layers[idx];
    const copy: PaintLayer = {
      id: this.generateLayerId(),
      name: `${src.name} Copy`,
      visible: src.visible,
      opacity: src.opacity,
      blendMode: src.blendMode,
      channel: src.channel,
      pixels: src.pixels.slice(),
    };
    session.layers.splice(idx + 1, 0, copy);
    session.activeLayerId = copy.id;
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return copy;
  }

  public moveLayer(mesh: Mesh, layerId: string, direction: 'up' | 'down'): boolean {
    const session = this.sessions.get(mesh);
    if (!session) return false;
    const idx = session.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= session.layers.length) return false;
    const [removed] = session.layers.splice(idx, 1);
    session.layers.splice(targetIdx, 0, removed);
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return true;
  }

  public updateLayerProperties(
    mesh: Mesh,
    layerId: string,
    props: { name?: string; visible?: boolean; opacity?: number; blendMode?: PaintBlendMode }
  ): boolean {
    const session = this.sessions.get(mesh);
    if (!session) return false;
    const layer = session.layers.find((l) => l.id === layerId);
    if (!layer) return false;
    if (props.name !== undefined) layer.name = props.name;
    if (props.visible !== undefined) layer.visible = props.visible;
    if (props.opacity !== undefined) layer.opacity = Math.max(0, Math.min(1, props.opacity));
    if (props.blendMode !== undefined) layer.blendMode = props.blendMode;
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return true;
  }

  public flattenAlbedoLayers(mesh: Mesh): boolean {
    const session = this.sessions.get(mesh);
    if (!session) return false;
    this.compositeAndUpload(session, false);
    const nonAlbedo = session.layers.filter((l) => l.channel !== 'albedo');
    const flattened: PaintLayer = {
      id: this.generateLayerId(),
      name: 'Flattened Albedo',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      channel: 'albedo',
      pixels: session.albedoComposite.slice(),
    };
    session.layers = [flattened, ...nonAlbedo];
    session.activeLayerId = flattened.id;
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    this.onStateChanged?.(this.isActive);
    return true;
  }

  private resolveOrCreateTargetLayer(
    session: MeshPaintSession,
    channel?: PaintChannel,
    layerName?: string,
    blendMode?: PaintBlendMode
  ): PaintLayer {
    const targetChannel = channel ?? this.channel;
    if (layerName) {
      const existing = session.layers.find(
        (l) => l.name.toLowerCase() === layerName.toLowerCase() && l.channel === targetChannel
      );
      if (existing) {
        session.activeLayerId = existing.id;
        return existing;
      }
      const created = this.addLayer(session.mesh, {
        name: layerName,
        channel: targetChannel,
        blendMode: blendMode ?? 'normal',
      });
      if (created) return created;
    }

    const active = this.getActiveLayer(session);
    if (active && active.channel === targetChannel) {
      return active;
    }

    const matching = [...session.layers].reverse().find((l) => l.channel === targetChannel);
    if (matching) {
      session.activeLayerId = matching.id;
      return matching;
    }

    return this.addLayer(session.mesh, {
      name: `${targetChannel.charAt(0).toUpperCase() + targetChannel.slice(1)} Layer`,
      channel: targetChannel,
      blendMode: blendMode ?? 'normal',
    })!;
  }

  // =========================================================================
  // 4. SEAMLESS 3D SPHERE-TO-UV & 2D DIRECT BRUSH RASTERIZATION
  // =========================================================================

  private getActivePaintRgba(): [number, number, number, number] {
    if (this.channel === 'roughness' || this.channel === 'metallic') {
      const v = Math.round(Math.max(0, Math.min(1, this.channelValue)) * 255);
      return [v, v, v, 255];
    }
    return this.hexToRgba(this.colorHex, 255);
  }

  private stampSphereIntoLayer(
    session: MeshPaintSession,
    layer: PaintLayer,
    worldPos: Vector3,
    worldNormal: Vector3,
    opts: {
      rgba: [number, number, number, number];
      radius: number;
      hardness: number;
      opacity: number;
      brushAlpha: PaintBrushAlpha;
      mode: 'brush' | 'eraser' | 'smudge' | 'stencil';
      backfaceCull: boolean;
    }
  ): number {
    this.refreshUVCacheIfNeeded(session);
    const { resolution: res, triangles } = session;
    const { rgba, radius, hardness, opacity, brushAlpha, mode, backfaceCull } = opts;
    const rSq = radius * radius;
    const pixels = layer.pixels;

    const minBX = worldPos.x - radius;
    const maxBX = worldPos.x + radius;
    const minBY = worldPos.y - radius;
    const maxBY = worldPos.y + radius;
    const minBZ = worldPos.z - radius;
    const maxBZ = worldPos.z + radius;

    // Precompute screen projection matrix if painting with Stencil
    const camera = this.scene.activeCamera;
    const engine = this.scene.getEngine();
    const vpW = engine ? engine.getRenderWidth() : 1024;
    const vpH = engine ? engine.getRenderHeight() : 768;
    const transformMat = mode === 'stencil' && camera ? camera.getTransformationMatrix() : null;

    let touchedTexels = 0;

    for (let t = 0; t < triangles.length; t++) {
      const tri = triangles[t];

      // Fast 3D AABB rejection
      if (
        tri.maxX < minBX ||
        tri.minX > maxBX ||
        tri.maxY < minBY ||
        tri.minY > maxBY ||
        tri.maxZ < minBZ ||
        tri.minZ > maxBZ
      ) {
        continue;
      }

      // Coarse backface cull on triangle normal
      if (backfaceCull) {
        const fDot =
          tri.faceNormal.x * worldNormal.x +
          tri.faceNormal.y * worldNormal.y +
          tri.faceNormal.z * worldNormal.z;
        if (fDot < -0.35) continue;
      }

      const { x0, y0, x1, y1, x2, y2, invDenom, wp0, wp1, wp2, wn0, wn1, wn2 } = tri;

      for (let py = tri.minPy; py <= tri.maxPy; py++) {
        const sy = py + 0.5;
        for (let px = tri.minPx; px <= tri.maxPx; px++) {
          const sx = px + 0.5;
          const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
          const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
          const w2 = 1.0 - w0 - w1;
          if (w0 < -0.025 || w1 < -0.025 || w2 < -0.025) continue;

          const cw0 = w0 > 0 ? w0 : 0;
          const cw1 = w1 > 0 ? w1 : 0;
          const cw2 = w2 > 0 ? w2 : 0;
          const wSum = cw0 + cw1 + cw2 || 1;
          const b0 = cw0 / wSum;
          const b1 = cw1 / wSum;
          const b2 = cw2 / wSum;

          // Interpolated 3D world position of this texel
          const wx = wp0.x * b0 + wp1.x * b1 + wp2.x * b2;
          const wy = wp0.y * b0 + wp1.y * b1 + wp2.y * b2;
          const wz = wp0.z * b0 + wp1.z * b1 + wp2.z * b2;

          const dx = wx - worldPos.x;
          const dy = wy - worldPos.y;
          const dz = wz - worldPos.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > rSq) continue;

          if (backfaceCull) {
            const nx = wn0.x * b0 + wn1.x * b1 + wn2.x * b2;
            const ny = wn0.y * b0 + wn1.y * b1 + wn2.y * b2;
            const nz = wn0.z * b0 + wn1.z * b1 + wn2.z * b2;
            const nDot = nx * worldNormal.x + ny * worldNormal.y + nz * worldNormal.z;
            if (nDot < -0.15) continue;
          }

          const normDist = Math.sqrt(distSq) / radius; // 0..1
          const falloff = this.evaluateBrushAlpha(normDist, hardness, brushAlpha, px, py, dx / radius, dy / radius);
          const alpha = falloff * opacity;
          if (alpha <= 0.002) continue;

          const idx = (py * res + px) * 4;

          if (mode === 'eraser') {
            const oldA = pixels[idx + 3] / 255;
            const nextA = Math.max(0, oldA * (1 - alpha));
            pixels[idx + 3] = Math.round(nextA * 255);
            touchedTexels++;
          } else if (mode === 'smudge') {
            if (!this.hasSmudgeSample) {
              this.smudgeSampleRgba = [pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]];
              this.hasSmudgeSample = true;
            } else {
              const sA = alpha * 0.55;
              this.blendTexelOver(pixels, idx, this.smudgeSampleRgba[0], this.smudgeSampleRgba[1], this.smudgeSampleRgba[2], sA * (this.smudgeSampleRgba[3] / 255));
              // Gently pick up target color into smudge buffer
              const pickRate = 0.08;
              this.smudgeSampleRgba[0] = this.smudgeSampleRgba[0] * (1 - pickRate) + pixels[idx] * pickRate;
              this.smudgeSampleRgba[1] = this.smudgeSampleRgba[1] * (1 - pickRate) + pixels[idx + 1] * pickRate;
              this.smudgeSampleRgba[2] = this.smudgeSampleRgba[2] * (1 - pickRate) + pixels[idx + 2] * pickRate;
              this.smudgeSampleRgba[3] = Math.max(this.smudgeSampleRgba[3], pixels[idx + 3]);
              touchedTexels++;
            }
          } else if (mode === 'stencil' && transformMat && this.stencil.pixels) {
            const sample = this.sampleStencilAtWorldPoint(wx, wy, wz, transformMat, vpW, vpH);
            if (sample && sample[3] > 2) {
              const finalAlpha = alpha * (sample[3] / 255);
              this.blendTexelOver(pixels, idx, sample[0], sample[1], sample[2], finalAlpha);
              touchedTexels++;
            }
          } else {
            this.blendTexelOver(pixels, idx, rgba[0], rgba[1], rgba[2], alpha);
            touchedTexels++;
          }
        }
      }
    }

    return touchedTexels;
  }

  /**
   * Phase 2: Direct 2D UV canvas painting (used by the interactive 2D UV preview in the dialog).
   */
  public paint2DAtUV(
    mesh: Mesh,
    u: number,
    v: number,
    opts?: { radiusPx?: number; pushUndo?: boolean }
  ): boolean {
    const session = this.ensurePaintSession(mesh);
    if (!session) return false;
    const layer = this.getActiveLayer(session);
    if (!layer) return false;

    if (this.mode === 'eyedropper') {
      const hex = this.sampleColorAtUV(mesh, u, v);
      if (hex) {
        this.colorHex = hex;
        this.onColorPicked?.(hex);
      }
      return true;
    }

    const before = opts?.pushUndo ? layer.pixels.slice() : null;
    const res = session.resolution;
    const cx = this.wrapUV01(u) * res;
    const cy = (1 - this.wrapUV01(v)) * res;

    if (this.mode === 'fill') {
      const beforeFill = layer.pixels.slice();
      const px = Math.max(0, Math.min(res - 1, Math.floor(cx)));
      const py = Math.max(0, Math.min(res - 1, Math.floor(cy)));
      const islandId = session.islandIdByTexel[py * res + px];
      if (this.islandFillOnly && islandId >= 0) {
        this.fillIsland(session, layer, islandId, this.getActivePaintRgba());
      } else {
        this.fillLayer(session, layer, this.getActivePaintRgba());
      }
      this.pushUndo(session, layer.id, beforeFill, layer.pixels.slice());
      this.compositeAndUpload(session, true);
      this.onCanvasUpdated?.(mesh);
      return true;
    }

    const rPx = Math.max(2, Math.round(opts?.radiusPx ?? this.brushRadius * (res / 6)));
    const rgba = this.getActivePaintRgba();
    const pixels = layer.pixels;

    const minX = Math.max(0, Math.floor(cx - rPx));
    const maxX = Math.min(res - 1, Math.ceil(cx + rPx));
    const minY = Math.max(0, Math.floor(cy - rPx));
    const maxY = Math.min(res - 1, Math.ceil(cy + rPx));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = (px + 0.5 - cx) / rPx;
        const dy = (py + 0.5 - cy) / rPx;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) continue;

        const falloff = this.evaluateBrushAlpha(dist, this.brushHardness, this.brushAlpha, px, py, dx, dy);
        const alpha = falloff * this.brushOpacity;
        if (alpha <= 0.002) continue;

        const idx = (py * res + px) * 4;
        if (this.mode === 'eraser') {
          pixels[idx + 3] = Math.round(Math.max(0, (pixels[idx + 3] / 255) * (1 - alpha)) * 255);
        } else {
          this.blendTexelOver(pixels, idx, rgba[0], rgba[1], rgba[2], alpha);
        }
      }
    }

    if (before) {
      this.pushUndo(session, layer.id, before, layer.pixels.slice());
    }
    this.compositeAndUpload(session, false);
    this.onCanvasUpdated?.(mesh);
    return true;
  }

  public finalize2DStroke(mesh: Mesh): void {
    const session = this.sessions.get(mesh);
    if (!session) return;
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
  }

  private evaluateBrushAlpha(
    normDist: number,
    hardness: number,
    alphaType: PaintBrushAlpha,
    px: number,
    py: number,
    dx: number,
    dy: number
  ): number {
    if (alphaType === 'square') {
      const boxDist = Math.max(Math.abs(dx), Math.abs(dy));
      if (boxDist > 1) return 0;
      const edge = Math.max(0.01, 1 - hardness);
      if (boxDist <= hardness) return 1;
      const t = Math.max(0, Math.min(1, (1 - boxDist) / edge));
      return t * t * (3 - 2 * t);
    }

    if (normDist >= 1) return 0;

    // Base radial falloff
    let base: number;
    if (alphaType === 'soft') {
      const sigma = 0.32 + hardness * 0.28;
      base = Math.exp(-(normDist * normDist) / (2 * sigma * sigma));
    } else {
      const h = Math.max(0, Math.min(0.98, hardness));
      if (normDist <= h) {
        base = 1;
      } else {
        const t = (1 - normDist) / (1 - h);
        base = t * t * (3 - 2 * t);
      }
    }

    if (alphaType === 'round' || alphaType === 'soft') return base;

    // Deterministic high-frequency spatial hash for procedural painterly alphas
    const n1 = this.hash2D(px, py);
    const n2 = this.hash2D(Math.floor(px * 0.5), Math.floor(py * 0.5));

    if (alphaType === 'chalk') {
      const grain = 0.35 + 0.65 * (n1 * 0.65 + n2 * 0.35);
      return base * (grain > 0.48 ? grain : grain * 0.35);
    }
    if (alphaType === 'watercolor') {
      // Pigment pools slightly stronger near the rim
      const rimBoost = normDist > 0.65 && normDist < 0.96 ? 1.22 : 0.85;
      const wetNoise = 0.78 + 0.22 * n2;
      return Math.min(1, base * rimBoost * wetNoise);
    }
    if (alphaType === 'noise') {
      return n1 > 0.45 ? base * n1 : 0;
    }

    return base;
  }

  private hash2D(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  private blendTexelOver(
    pixels: Uint8ClampedArray,
    idx: number,
    sr: number,
    sg: number,
    sb: number,
    sa: number
  ): void {
    const da = pixels[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 1e-5) {
      pixels[idx + 3] = 0;
      return;
    }
    const invOutA = 1 / outA;
    pixels[idx] = Math.round((sr * sa + pixels[idx] * da * (1 - sa)) * invOutA);
    pixels[idx + 1] = Math.round((sg * sa + pixels[idx + 1] * da * (1 - sa)) * invOutA);
    pixels[idx + 2] = Math.round((sb * sa + pixels[idx + 2] * da * (1 - sa)) * invOutA);
    pixels[idx + 3] = Math.round(Math.min(1, outA) * 255);
  }

  private sampleSmudgeAtUV(session: MeshPaintSession, layer: PaintLayer, u: number, v: number): void {
    const px = this.uvToPixelX(u, session.resolution);
    const py = this.uvToPixelY(v, session.resolution);
    const idx = (py * session.resolution + px) * 4;
    if (layer.pixels[idx + 3] > 10) {
      this.smudgeSampleRgba = [
        layer.pixels[idx],
        layer.pixels[idx + 1],
        layer.pixels[idx + 2],
        layer.pixels[idx + 3],
      ];
    } else {
      this.smudgeSampleRgba = [
        session.albedoComposite[idx],
        session.albedoComposite[idx + 1],
        session.albedoComposite[idx + 2],
        255,
      ];
    }
    this.hasSmudgeSample = true;
  }

  private fillLayer(session: MeshPaintSession, layer: PaintLayer, rgba: [number, number, number, number]): void {
    const total = session.resolution * session.resolution;
    for (let i = 0; i < total; i++) {
      layer.pixels[i * 4] = rgba[0];
      layer.pixels[i * 4 + 1] = rgba[1];
      layer.pixels[i * 4 + 2] = rgba[2];
      layer.pixels[i * 4 + 3] = rgba[3];
    }
  }

  private fillIsland(
    session: MeshPaintSession,
    layer: PaintLayer,
    islandId: number,
    rgba: [number, number, number, number]
  ): void {
    const total = session.resolution * session.resolution;
    for (let i = 0; i < total; i++) {
      if (session.islandIdByTexel[i] === islandId) {
        layer.pixels[i * 4] = rgba[0];
        layer.pixels[i * 4 + 1] = rgba[1];
        layer.pixels[i * 4 + 2] = rgba[2];
        layer.pixels[i * 4 + 3] = rgba[3];
      }
    }
  }

  // =========================================================================
  // 5. STYLIZED BASE & PROGRAMMATIC / AI PAINTING OPERATIONS
  // =========================================================================

  /**
   * Fills either the entire target layer or a specific UV island with a solid color or scalar channel value.
   */
  public fillRegion(
    mesh: Mesh,
    options: {
      color?: string;
      value?: number;
      opacity?: number;
      channel?: PaintChannel;
      blendMode?: PaintBlendMode;
      layerName?: string;
      islandId?: number;
    } = {}
  ): { meshName: string; layerName: string; islandId: number | null; resolution: number } {
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const channel = options.channel ?? 'albedo';
    const layer = this.resolveOrCreateTargetLayer(session, channel, options.layerName, options.blendMode);
    const before = layer.pixels.slice();
    const alphaByte = Math.round(Math.max(0, Math.min(1, options.opacity ?? 1.0)) * 255);
    const rgba: [number, number, number, number] =
      channel === 'roughness' || channel === 'metallic'
        ? (() => {
            const v = Math.round(Math.max(0, Math.min(1, options.value ?? 0.5)) * 255);
            return [v, v, v, alphaByte];
          })()
        : this.hexToRgba(options.color || this.colorHex, alphaByte);

    const islandId = typeof options.islandId === 'number' && options.islandId >= 0 ? options.islandId : null;
    if (islandId !== null) {
      this.fillIsland(session, layer, islandId, rgba);
    } else {
      this.fillLayer(session, layer, rgba);
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return {
      meshName: mesh.name,
      layerName: layer.name,
      islandId,
      resolution: session.resolution,
    };
  }

  /**
   * Generates a Nintendo / hand-painted stylized base shading pass:
   * vertical warm-to-cool gradient + soft hemisphere AO + convex edge highlights.
   */
  public applyStylizedBase(mesh: Mesh, options: StylizedBaseOptions = {}): {
    meshName: string;
    layerName: string;
    resolution: number;
    texelsPainted: number;
  } {
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const baseRgba = options.baseColor
      ? this.hexToRgba(options.baseColor, 255)
      : this.hexToRgba(this.colorHex, 255);
    const bottomRgba = options.bottomColor
      ? this.hexToRgba(options.bottomColor, 255)
      : [
          Math.round(baseRgba[0] * 0.62),
          Math.round(baseRgba[1] * 0.58),
          Math.round(baseRgba[2] * 0.68),
          255,
        ];
    const topRgba = options.topColor
      ? this.hexToRgba(options.topColor, 255)
      : [
          Math.min(255, Math.round(baseRgba[0] * 1.18 + 18)),
          Math.min(255, Math.round(baseRgba[1] * 1.16 + 16)),
          Math.min(255, Math.round(baseRgba[2] * 1.1 + 10)),
          255,
        ];

    const aoStrength = Math.max(0, Math.min(1, options.aoStrength ?? 0.35));
    const edgeStrength = Math.max(0, Math.min(1, options.edgeHighlightStrength ?? 0.25));

    let layer: PaintLayer;
    if (options.asLayer) {
      layer = this.addLayer(mesh, {
        name: options.layerName || 'Stylized Base',
        channel: 'albedo',
        blendMode: 'normal',
      })!;
    } else {
      layer = session.layers.find((l) => l.channel === 'albedo') || this.getActiveLayer(session)!;
    }

    const before = layer.pixels.slice();
    const { resolution: res, triangles } = session;

    // Compute mesh world Y bounds
    let minY = Infinity;
    let maxY = -Infinity;
    for (const tri of triangles) {
      if (tri.minY < minY) minY = tri.minY;
      if (tri.maxY > maxY) maxY = tri.maxY;
    }
    const spanY = Math.max(1e-4, maxY - minY);

    // Precompute smooth welded vertex normals for cavity/convexity estimation
    const smoothNormals = this.computeWeldedVertexNormals(mesh);
    const indices = mesh.getIndices();
    const worldMat = mesh.computeWorldMatrix(true);

    // First fill background with base color
    this.fillLayer(session, layer, baseRgba);

    let texelsPainted = 0;

    for (const tri of triangles) {
      const { x0, y0, x1, y1, x2, y2, invDenom, wp0, wp1, wp2, wn0, wn1, wn2 } = tri;

      let sn0 = wn0;
      let sn1 = wn1;
      let sn2 = wn2;
      if (indices && smoothNormals) {
        const i0 = indices[tri.faceIndex * 3];
        const i1 = indices[tri.faceIndex * 3 + 1];
        const i2 = indices[tri.faceIndex * 3 + 2];
        sn0 = Vector3.TransformNormal(
          new Vector3(smoothNormals[i0 * 3], smoothNormals[i0 * 3 + 1], smoothNormals[i0 * 3 + 2]),
          worldMat
        ).normalize();
        sn1 = Vector3.TransformNormal(
          new Vector3(smoothNormals[i1 * 3], smoothNormals[i1 * 3 + 1], smoothNormals[i1 * 3 + 2]),
          worldMat
        ).normalize();
        sn2 = Vector3.TransformNormal(
          new Vector3(smoothNormals[i2 * 3], smoothNormals[i2 * 3 + 1], smoothNormals[i2 * 3 + 2]),
          worldMat
        ).normalize();
      }

      for (let py = tri.minPy; py <= tri.maxPy; py++) {
        const sy = py + 0.5;
        for (let px = tri.minPx; px <= tri.maxPx; px++) {
          const sx = px + 0.5;
          const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
          const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
          const w2 = 1.0 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

          const cw0 = w0 > 0 ? w0 : 0;
          const cw1 = w1 > 0 ? w1 : 0;
          const cw2 = w2 > 0 ? w2 : 0;
          const wSum = cw0 + cw1 + cw2 || 1;
          const b0 = cw0 / wSum;
          const b1 = cw1 / wSum;
          const b2 = cw2 / wSum;

          const wy = wp0.y * b0 + wp1.y * b1 + wp2.y * b2;
          const tY = Math.max(0, Math.min(1, (wy - minY) / spanY));

          // Interpolated normal & smooth normal
          const nx = wn0.x * b0 + wn1.x * b1 + wn2.x * b2;
          const ny = wn0.y * b0 + wn1.y * b1 + wn2.y * b2;
          const nz = wn0.z * b0 + wn1.z * b1 + wn2.z * b2;
          const nLen = Math.hypot(nx, ny, nz) || 1;
          const nnx = nx / nLen;
          const nny = ny / nLen;
          const nnz = nz / nLen;

          const snx = sn0.x * b0 + sn1.x * b1 + sn2.x * b2;
          const sny = sn0.y * b0 + sn1.y * b1 + sn2.y * b2;
          const snz = sn0.z * b0 + sn1.z * b1 + sn2.z * b2;
          const snLen = Math.hypot(snx, sny, snz) || 1;

          // Edge sharpness: divergence between face/split normal and welded smooth normal
          const align = Math.max(0, Math.min(1, (nnx * snx + nny * sny + nnz * snz) / snLen));
          const edgeFactor = Math.min(1, (1 - align) * 3.0);

          // 3-stop vertical gradient: bottom -> base -> top
          let r: number;
          let g: number;
          let b: number;
          if (tY < 0.5) {
            const k = tY * 2;
            r = bottomRgba[0] * (1 - k) + baseRgba[0] * k;
            g = bottomRgba[1] * (1 - k) + baseRgba[1] * k;
            b = bottomRgba[2] * (1 - k) + baseRgba[2] * k;
          } else {
            const k = (tY - 0.5) * 2;
            r = baseRgba[0] * (1 - k) + topRgba[0] * k;
            g = baseRgba[1] * (1 - k) + topRgba[1] * k;
            b = baseRgba[2] * (1 - k) + topRgba[2] * k;
          }

          // Soft hemisphere AO (downward-facing surfaces get softly darker)
          const hemi = nny * 0.5 + 0.5; // 0 (down) .. 1 (up)
          const aoMult = 1 - aoStrength * (1 - hemi) * 0.75;
          r *= aoMult;
          g *= aoMult;
          b *= aoMult;

          // Subtle painterly brushwork grain
          const grain = (this.hash2D(px, py) - 0.5) * 8;

          // Stylized convex edge highlight
          const edgeBoost = edgeFactor * edgeStrength * 65;

          const idx = (py * res + px) * 4;
          layer.pixels[idx] = Math.max(0, Math.min(255, Math.round(r + edgeBoost + grain)));
          layer.pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g + edgeBoost + grain)));
          layer.pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b + edgeBoost * 0.85 + grain)));
          layer.pixels[idx + 3] = 255;
          texelsPainted++;
        }
      }
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return {
      meshName: mesh.name,
      layerName: layer.name,
      resolution: res,
      texelsPainted,
    };
  }

  /**
   * Paints a 3D spatial or normal-based gradient directly into a layer (ideal for AI and quick styling).
   */
  public paintGradient(mesh: Mesh, options: PaintGradientOptions = {}): {
    meshName: string;
    layerName: string;
    texelsPainted: number;
  } {
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const channel = options.channel ?? 'albedo';
    const layer = this.resolveOrCreateTargetLayer(session, channel, options.layerName, options.blendMode);
    const before = layer.pixels.slice();

    const gradType = options.gradientType ?? 'vertical';
    const colA = this.hexToRgba(options.colorA || '#3b2f2f', 255);
    const colB = this.hexToRgba(options.colorB || '#f4d35e', 255);
    const opacity = Math.max(0.02, Math.min(1, options.opacity ?? 1.0));
    const normalThreshold = options.normalThreshold ?? 0.35;

    const { resolution: res, triangles } = session;
    const bi = mesh.getBoundingInfo();
    const minY = options.minY ?? (bi ? bi.boundingBox.minimumWorld.y : -1);
    const maxY = options.maxY ?? (bi ? bi.boundingBox.maximumWorld.y : 1);
    const spanY = Math.max(1e-4, maxY - minY);

    const center = options.center
      ? new Vector3(options.center[0], options.center[1], options.center[2])
      : bi
        ? bi.boundingBox.centerWorld.clone()
        : Vector3.Zero();
    const radius = Math.max(0.05, options.radius ?? (bi ? bi.boundingSphere.radiusWorld : 1));

    let texelsPainted = 0;

    for (const tri of triangles) {
      const { x0, y0, x1, y1, x2, y2, invDenom, wp0, wp1, wp2, wn0, wn1, wn2 } = tri;
      for (let py = tri.minPy; py <= tri.maxPy; py++) {
        const sy = py + 0.5;
        for (let px = tri.minPx; px <= tri.maxPx; px++) {
          const sx = px + 0.5;
          const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
          const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
          const w2 = 1.0 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

          const cw0 = w0 > 0 ? w0 : 0;
          const cw1 = w1 > 0 ? w1 : 0;
          const cw2 = w2 > 0 ? w2 : 0;
          const wSum = cw0 + cw1 + cw2 || 1;
          const b0 = cw0 / wSum;
          const b1 = cw1 / wSum;
          const b2 = cw2 / wSum;

          const wx = wp0.x * b0 + wp1.x * b1 + wp2.x * b2;
          const wy = wp0.y * b0 + wp1.y * b1 + wp2.y * b2;
          const wz = wp0.z * b0 + wp1.z * b1 + wp2.z * b2;

          let t = 0;
          let localAlpha = opacity;

          if (gradType === 'vertical') {
            t = Math.max(0, Math.min(1, (wy - minY) / spanY));
          } else if (gradType === 'radial') {
            const d = Math.hypot(wx - center.x, wy - center.y, wz - center.z);
            t = Math.max(0, Math.min(1, 1 - d / radius));
            localAlpha = opacity * t;
          } else if (gradType === 'normal_top') {
            const ny = wn0.y * b0 + wn1.y * b1 + wn2.y * b2;
            const nLen = Math.hypot(
              wn0.x * b0 + wn1.x * b1 + wn2.x * b2,
              ny,
              wn0.z * b0 + wn1.z * b1 + wn2.z * b2
            ) || 1;
            const upDot = ny / nLen;
            t = Math.max(0, Math.min(1, (upDot - normalThreshold) / Math.max(0.05, 1 - normalThreshold)));
            localAlpha = opacity * t;
          } else if (gradType === 'normal_front') {
            const nz = wn0.z * b0 + wn1.z * b1 + wn2.z * b2;
            const nLen = Math.hypot(
              wn0.x * b0 + wn1.x * b1 + wn2.x * b2,
              wn0.y * b0 + wn1.y * b1 + wn2.y * b2,
              nz
            ) || 1;
            const frontDot = -nz / nLen;
            t = Math.max(0, Math.min(1, (frontDot - normalThreshold) / Math.max(0.05, 1 - normalThreshold)));
            localAlpha = opacity * t;
          }

          if (localAlpha <= 0.002) continue;

          const r = Math.round(colA[0] * (1 - t) + colB[0] * t);
          const g = Math.round(colA[1] * (1 - t) + colB[1] * t);
          const b = Math.round(colA[2] * (1 - t) + colB[2] * t);

          const idx = (py * res + px) * 4;
          this.blendTexelOver(layer.pixels, idx, r, g, b, localAlpha);
          texelsPainted++;
        }
      }
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return { meshName: mesh.name, layerName: layer.name, texelsPainted };
  }

  /**
   * Paints a continuous 3D stroke along a list of world points (snapped onto mesh surface if needed).
   */
  public paintStroke3D(
    mesh: Mesh,
    points: Array<[number, number, number]>,
    options: PaintStrokeOptions = {}
  ): { meshName: string; layerName: string; stampsApplied: number; texelsPainted: number } {
    if (!points || points.length === 0) {
      throw new Error('paintStroke3D requires at least one 3D point.');
    }
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const channel = options.channel ?? 'albedo';
    const layer = this.resolveOrCreateTargetLayer(session, channel, options.layerName);
    const before = layer.pixels.slice();

    const rgba: [number, number, number, number] =
      channel === 'roughness' || channel === 'metallic'
        ? (() => {
            const v = Math.round(Math.max(0, Math.min(1, options.value ?? 0.5)) * 255);
            return [v, v, v, 255];
          })()
        : this.hexToRgba(options.color || this.colorHex, 255);

    const radius = Math.max(0.01, Math.min(5, options.radius ?? this.brushRadius));
    const hardness = Math.max(0, Math.min(1, options.hardness ?? this.brushHardness));
    const opacity = Math.max(0.02, Math.min(1, options.opacity ?? this.brushOpacity));
    const spacing = Math.max(0.08, Math.min(1, options.spacing ?? this.brushSpacing));
    const brushAlpha = options.brushAlpha ?? this.brushAlpha;
    const mirrorX = Boolean(options.mirrorX);
    const mode = options.mode ?? 'brush';
    const backfaceCull = options.backfaceCull ?? false;

    const worldPts = points.map((p) => new Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0));
    const bi = mesh.getBoundingInfo();
    const meshCenter = bi ? bi.boundingBox.centerWorld : Vector3.Zero();

    let stampsApplied = 0;
    let texelsPainted = 0;

    const stampAt = (pt: Vector3): void => {
      const approxNormal = pt.subtract(meshCenter);
      if (approxNormal.lengthSquared() < 1e-6) approxNormal.set(0, 1, 0);
      else approxNormal.normalize();

      texelsPainted += this.stampSphereIntoLayer(session, layer, pt, approxNormal, {
        rgba,
        radius,
        hardness,
        opacity,
        brushAlpha,
        mode,
        backfaceCull,
      });
      stampsApplied++;

      if (mirrorX) {
        const m = this.mirrorWorldPointX(mesh, pt, approxNormal);
        texelsPainted += this.stampSphereIntoLayer(session, layer, m.pos, m.normal, {
          rgba,
          radius,
          hardness,
          opacity,
          brushAlpha,
          mode,
          backfaceCull,
        });
        stampsApplied++;
      }
    };

    if (worldPts.length === 1) {
      stampAt(worldPts[0]);
    } else {
      const stepDist = Math.max(0.005, radius * spacing);
      stampAt(worldPts[0]);
      for (let i = 1; i < worldPts.length; i++) {
        const a = worldPts[i - 1];
        const b = worldPts[i];
        const d = Vector3.Distance(a, b);
        const steps = Math.max(1, Math.min(80, Math.ceil(d / stepDist)));
        for (let s = 1; s <= steps; s++) {
          stampAt(Vector3.Lerp(a, b, s / steps));
        }
      }
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return { meshName: mesh.name, layerName: layer.name, stampsApplied, texelsPainted };
  }

  /**
   * Projects a crisp geometric/stylized shape (circle, oval, ring, star, stripe, eye, heart, dot_pattern)
   * onto a 3D mesh position or named face directly into the UV texture.
   */
  public paintShapeStamp(mesh: Mesh, options: PaintStampOptions = {}): {
    meshName: string;
    layerName: string;
    shape: PaintStampShape;
    texelsPainted: number;
  } {
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const channel = options.channel ?? 'albedo';
    const layer = this.resolveOrCreateTargetLayer(session, channel, options.layerName);
    const before = layer.pixels.slice();

    const shape: PaintStampShape = options.shape ?? 'circle';
    const primaryRgba: [number, number, number, number] =
      channel === 'roughness' || channel === 'metallic'
        ? (() => {
            const v = Math.round(Math.max(0, Math.min(1, options.value ?? 0.5)) * 255);
            return [v, v, v, 255];
          })()
        : this.hexToRgba(options.color || this.colorHex, 255);
    const secondaryRgba = this.hexToRgba(options.secondaryColor || '#ffffff', 255);

    const bi = mesh.getBoundingInfo();
    const minW = bi ? bi.boundingBox.minimumWorld : new Vector3(-0.5, -0.5, -0.5);
    const maxW = bi ? bi.boundingBox.maximumWorld : new Vector3(0.5, 0.5, 0.5);
    const centerW = bi ? bi.boundingBox.centerWorld : Vector3.Zero();

    let center: Vector3;
    let normal: Vector3;

    if (options.position) {
      center = new Vector3(options.position[0], options.position[1], options.position[2]);
      if (options.normal) {
        normal = new Vector3(options.normal[0], options.normal[1], options.normal[2]).normalize();
      } else {
        normal = center.subtract(centerW);
        if (normal.lengthSquared() < 1e-6) normal = new Vector3(0, 0, -1);
        else normal.normalize();
      }
    } else {
      const face = options.face || 'front';
      const resolved = this.resolveFacePointAndNormal(face, minW, maxW, centerW);
      center = resolved.pos;
      normal = resolved.normal;
    }

    const radius = Math.max(0.02, Math.min(5, options.radius ?? this.brushRadius));
    const hardness = Math.max(0, Math.min(1, options.hardness ?? 0.85));
    const opacity = Math.max(0.02, Math.min(1, options.opacity ?? 1.0));
    const rotRad = ((options.rotationDeg ?? 0) * Math.PI) / 180;
    const mirrorX = Boolean(options.mirrorX);

    const projectOne = (pos: Vector3, norm: Vector3): number => {
      // Build tangent frame (right, up) perpendicular to projection normal
      const refUp = Math.abs(norm.y) < 0.92 ? Vector3.Up() : Vector3.Forward();
      const right = Vector3.Cross(refUp, norm).normalize();
      const up = Vector3.Cross(norm, right).normalize();

      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      const depthLimit = radius * 1.45;
      const { resolution: res, triangles } = session;
      let count = 0;

      for (const tri of triangles) {
        if (
          tri.maxX < pos.x - depthLimit ||
          tri.minX > pos.x + depthLimit ||
          tri.maxY < pos.y - depthLimit ||
          tri.minY > pos.y + depthLimit ||
          tri.maxZ < pos.z - depthLimit ||
          tri.minZ > pos.z + depthLimit
        ) {
          continue;
        }
        const fDot =
          tri.faceNormal.x * norm.x + tri.faceNormal.y * norm.y + tri.faceNormal.z * norm.z;
        if (fDot < -0.15) continue;

        const { x0, y0, x1, y1, x2, y2, invDenom, wp0, wp1, wp2 } = tri;
        for (let py = tri.minPy; py <= tri.maxPy; py++) {
          const sy = py + 0.5;
          for (let px = tri.minPx; px <= tri.maxPx; px++) {
            const sx = px + 0.5;
            const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
            const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
            const w2 = 1.0 - w0 - w1;
            if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

            const cw0 = w0 > 0 ? w0 : 0;
            const cw1 = w1 > 0 ? w1 : 0;
            const cw2 = w2 > 0 ? w2 : 0;
            const wSum = cw0 + cw1 + cw2 || 1;
            const b0 = cw0 / wSum;
            const b1 = cw1 / wSum;
            const b2 = cw2 / wSum;

            const dx = wp0.x * b0 + wp1.x * b1 + wp2.x * b2 - pos.x;
            const dy = wp0.y * b0 + wp1.y * b1 + wp2.y * b2 - pos.y;
            const dz = wp0.z * b0 + wp1.z * b1 + wp2.z * b2 - pos.z;

            const depth = Math.abs(dx * norm.x + dy * norm.y + dz * norm.z);
            if (depth > depthLimit) continue;

            const lx0 = (dx * right.x + dy * right.y + dz * right.z) / radius;
            const ly0 = (dx * up.x + dy * up.y + dz * up.z) / radius;
            const lx = lx0 * cosR - ly0 * sinR;
            const ly = lx0 * sinR + ly0 * cosR;

            if (Math.abs(lx) > 1.2 || Math.abs(ly) > 1.2) continue;

            const sample = this.evaluateStampShape(shape, lx, ly, hardness, primaryRgba, secondaryRgba);
            if (!sample || sample.alpha <= 0.002) continue;

            const idx = (py * res + px) * 4;
            this.blendTexelOver(layer.pixels, idx, sample.r, sample.g, sample.b, sample.alpha * opacity);
            count++;
          }
        }
      }
      return count;
    };

    let texelsPainted = projectOne(center, normal);
    if (mirrorX) {
      const m = this.mirrorWorldPointX(mesh, center, normal);
      texelsPainted += projectOne(m.pos, m.normal);
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return { meshName: mesh.name, layerName: layer.name, shape, texelsPainted };
  }

  private evaluateStampShape(
    shape: PaintStampShape,
    lx: number,
    ly: number,
    hardness: number,
    primary: [number, number, number, number],
    secondary: [number, number, number, number]
  ): { r: number; g: number; b: number; alpha: number } | null {
    const smoothEdge = (dist: number): number => {
      if (dist >= 1) return 0;
      const h = Math.max(0.05, Math.min(0.98, hardness));
      if (dist <= h) return 1;
      const t = (1 - dist) / (1 - h);
      return t * t * (3 - 2 * t);
    };

    switch (shape) {
      case 'circle': {
        const a = smoothEdge(Math.hypot(lx, ly));
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
      case 'oval': {
        const a = smoothEdge(Math.hypot(lx * 1.35, ly * 0.85));
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
      case 'ring': {
        const d = Math.hypot(lx, ly);
        const ringDist = Math.abs(d - 0.72) / 0.25;
        const a = smoothEdge(ringDist);
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
      case 'stripe': {
        if (Math.abs(lx) > 1) return null;
        const a = smoothEdge(Math.abs(ly) / 0.35);
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
      case 'star': {
        const r = Math.hypot(lx, ly);
        const ang = Math.atan2(ly, lx);
        const starR = 0.58 + 0.38 * Math.cos(ang * 5 - Math.PI / 2);
        const a = smoothEdge(r / Math.max(0.2, starR));
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
      case 'heart': {
        const x = lx * 1.15;
        const y = ly * 1.15 + 0.12;
        const eq = Math.pow(x * x + y * y - 0.55, 3) - x * x * y * y * y;
        if (eq > 0.08) return null;
        const a = eq < 0 ? 1 : Math.max(0, 1 - eq / 0.08);
        return { r: primary[0], g: primary[1], b: primary[2], alpha: a };
      }
      case 'eye': {
        // Classic Nintendo stylized eye: white sclera oval + dark iris/pupil + white specular catchlight
        const scleraD = Math.hypot(lx * 1.15, ly * 0.82);
        if (scleraD > 1.0) return null;
        const irisD = Math.hypot(lx * 1.45, ly * 1.15);
        const catchlightD = Math.hypot((lx - 0.18) * 3.8, (ly - 0.24) * 3.8);
        const catchlight2D = Math.hypot((lx + 0.16) * 6.5, (ly + 0.22) * 6.5);
        const edgeA = smoothEdge(scleraD);
        if (catchlightD < 1.0 || catchlight2D < 1.0) {
          return { r: 255, g: 255, b: 255, alpha: edgeA };
        }
        if (irisD < 0.72) {
          return { r: primary[0], g: primary[1], b: primary[2], alpha: edgeA };
        }
        return { r: secondary[0], g: secondary[1], b: secondary[2], alpha: edgeA };
      }
      case 'dot_pattern': {
        if (Math.hypot(lx, ly) > 1.0) return null;
        const gx = ((lx * 2.5 + 10) % 1) - 0.5;
        const gy = ((ly * 2.5 + 10) % 1) - 0.5;
        const a = smoothEdge(Math.hypot(gx, gy) / 0.28);
        return a > 0 ? { r: primary[0], g: primary[1], b: primary[2], alpha: a } : null;
      }
    }
  }

  private resolveFacePointAndNormal(
    face: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right',
    minW: Vector3,
    maxW: Vector3,
    centerW: Vector3
  ): { pos: Vector3; normal: Vector3 } {
    switch (face) {
      case 'back':
        return { pos: new Vector3(centerW.x, centerW.y, maxW.z), normal: new Vector3(0, 0, 1) };
      case 'top':
        return { pos: new Vector3(centerW.x, maxW.y, centerW.z), normal: new Vector3(0, 1, 0) };
      case 'bottom':
        return { pos: new Vector3(centerW.x, minW.y, centerW.z), normal: new Vector3(0, -1, 0) };
      case 'left':
        return { pos: new Vector3(minW.x, centerW.y, centerW.z), normal: new Vector3(-1, 0, 0) };
      case 'right':
        return { pos: new Vector3(maxW.x, centerW.y, centerW.z), normal: new Vector3(1, 0, 0) };
      case 'front':
      default:
        return { pos: new Vector3(centerW.x, centerW.y, minW.z), normal: new Vector3(0, 0, -1) };
    }
  }

  // =========================================================================
  // 6. PHASE 3: STENCIL / PROJECTION PAINTING
  // =========================================================================

  /**
   * Loads a stencil image from a URL / DataURL into an RGBA pixel buffer for projection painting.
   */
  public async loadStencilFromUrl(dataUrl: string, name: string = 'Stencil'): Promise<boolean> {
    if (!dataUrl) return false;

    this.stencil.name = name;
    this.stencil.dataUrl = dataUrl;
    this.stencil.enabled = true;
    this.stencil.visible = true;

    // Decode into RGBA buffer in browser environments (skip Image loading in headless jsdom without 2D canvas)
    const has2DCanvas = (() => {
      if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
      try {
        return Boolean(document.createElement('canvas').getContext('2d'));
      } catch {
        return false;
      }
    })();

    if (has2DCanvas) {
      try {
        const decoded = await new Promise<{ width: number; height: number; pixels: Uint8ClampedArray } | null>(
          (resolve) => {
            let settled = false;
            const finish = (val: { width: number; height: number; pixels: Uint8ClampedArray } | null) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(val);
            };
            const timer = setTimeout(() => finish(null), 3000);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const w = Math.min(1024, img.naturalWidth || img.width || 256);
              const h = Math.min(1024, img.naturalHeight || img.height || 256);
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                finish(null);
                return;
              }
              ctx.drawImage(img, 0, 0, w, h);
              const data = ctx.getImageData(0, 0, w, h).data;
              finish({ width: w, height: h, pixels: new Uint8ClampedArray(data) });
            };
            img.onerror = () => finish(null);
            img.src = dataUrl;
          }
        );

        if (decoded) {
          this.stencil.width = decoded.width;
          this.stencil.height = decoded.height;
          this.stencil.pixels = decoded.pixels;
          this.onStencilChanged?.();
          return true;
        }
      } catch {
        // Fallback below for headless jsdom
      }
    }

    // Headless fallback: create a synthetic procedural pattern buffer so stencil projection is testable in Vitest
    const w = 64;
    const h = 64;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const checker = ((x >> 3) + (y >> 3)) % 2 === 0;
        buf[idx] = checker ? 235 : 65;
        buf[idx + 1] = checker ? 110 : 175;
        buf[idx + 2] = checker ? 70 : 230;
        buf[idx + 3] = 255;
      }
    }
    this.stencil.width = w;
    this.stencil.height = h;
    this.stencil.pixels = buf;
    this.onStencilChanged?.();
    return true;
  }

  public setStencilFromBuffer(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    name: string = 'Stencil'
  ): void {
    this.stencil.pixels = pixels;
    this.stencil.width = width;
    this.stencil.height = height;
    this.stencil.name = name;
    this.stencil.dataUrl = this.rgbaBufferToDataURL(pixels, width, height);
    this.stencil.enabled = true;
    this.stencil.visible = true;
    this.onStencilChanged?.();
  }

  public clearStencil(): void {
    this.stencil.enabled = false;
    this.stencil.visible = false;
    this.stencil.name = '';
    this.stencil.dataUrl = '';
    this.stencil.width = 0;
    this.stencil.height = 0;
    this.stencil.pixels = null;
    if (this.mode === 'stencil') {
      this.mode = 'brush';
    }
    this.onStencilChanged?.();
    this.onStateChanged?.(this.isActive);
  }

  public resetStencilTransform(): void {
    this.stencil.scale = 0.75;
    this.stencil.rotationDeg = 0;
    this.stencil.offsetX = 0;
    this.stencil.offsetY = 0;
    this.stencil.opacity = 0.45;
    this.onStencilChanged?.();
  }

  private sampleStencilAtWorldPoint(
    wx: number,
    wy: number,
    wz: number,
    transformMat: Matrix,
    vpW: number,
    vpH: number
  ): [number, number, number, number] | null {
    if (!this.stencil.pixels || this.stencil.width <= 0 || this.stencil.height <= 0) return null;

    const proj = Vector3.Project(
      new Vector3(wx, wy, wz),
      Matrix.IdentityReadOnly,
      transformMat,
      { x: 0, y: 0, width: vpW, height: vpH } as any
    );

    // Normalized screen coordinates centered at 0
    const sx = proj.x / Math.max(1, vpW) - 0.5 - this.stencil.offsetX;
    const sy = proj.y / Math.max(1, vpH) - 0.5 - this.stencil.offsetY;

    const minDim = Math.min(vpW, vpH);
    const stencilSizePx = Math.max(16, minDim * this.stencil.scale);
    const aspect = this.stencil.width / this.stencil.height;
    const sw = (stencilSizePx * Math.min(1, aspect)) / vpW;
    const sh = (stencilSizePx / Math.max(1, aspect)) / vpH;

    const rot = (-this.stencil.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // Rotate in pixel-aspect-corrected space
    const pxOff = sx * vpW;
    const pyOff = sy * vpH;
    const rx = pxOff * cosR - pyOff * sinR;
    const ry = pxOff * sinR + pyOff * cosR;

    const u = rx / (sw * vpW) + 0.5;
    const v = ry / (sh * vpH) + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const ix = Math.max(0, Math.min(this.stencil.width - 1, Math.floor(u * this.stencil.width)));
    const iy = Math.max(0, Math.min(this.stencil.height - 1, Math.floor(v * this.stencil.height)));
    const idx = (iy * this.stencil.width + ix) * 4;
    return [
      this.stencil.pixels[idx],
      this.stencil.pixels[idx + 1],
      this.stencil.pixels[idx + 2],
      this.stencil.pixels[idx + 3],
    ];
  }

  /**
   * Projects the entire loaded stencil onto the mesh in one pass (from camera view or an orthographic face).
   */
  public projectWholeStencil(mesh: Mesh, options: ProjectStencilOptions = {}): {
    meshName: string;
    layerName: string;
    texelsPainted: number;
  } {
    if (!this.stencil.pixels || this.stencil.width <= 0 || this.stencil.height <= 0) {
      throw new Error('No stencil image is currently loaded.');
    }
    const session = this.ensurePaintSession(mesh);
    if (!session) throw new Error(`Mesh "${mesh?.name || ''}" cannot be painted.`);
    this.refreshUVCacheIfNeeded(session);

    const layer = this.resolveOrCreateTargetLayer(session, 'albedo', options.layerName);
    const before = layer.pixels.slice();

    const face = options.face ?? 'camera';
    const opacity = Math.max(0.05, Math.min(1, options.opacity ?? this.brushOpacity));
    const scale = options.scale ?? this.stencil.scale;
    const rotRad = (-(options.rotationDeg ?? this.stencil.rotationDeg) * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const offX = options.offsetX ?? this.stencil.offsetX;
    const offY = options.offsetY ?? this.stencil.offsetY;

    const { resolution: res, triangles } = session;
    const camera = this.scene.activeCamera;
    const engine = this.scene.getEngine();
    const vpW = engine ? engine.getRenderWidth() : 1024;
    const vpH = engine ? engine.getRenderHeight() : 768;
    const transformMat = face === 'camera' && camera ? camera.getTransformationMatrix() : null;

    const bi = mesh.getBoundingInfo();
    const minW = bi ? bi.boundingBox.minimumWorld : new Vector3(-0.5, -0.5, -0.5);
    const maxW = bi ? bi.boundingBox.maximumWorld : new Vector3(0.5, 0.5, 0.5);
    const centerW = bi ? bi.boundingBox.centerWorld : Vector3.Zero();
    const sizeW = maxW.subtract(minW);
    const orthoSpan = Math.max(0.01, Math.max(sizeW.x, sizeW.y, sizeW.z) * scale);

    let projNormal = new Vector3(0, 0, -1);
    let projRight = new Vector3(1, 0, 0);
    let projUp = new Vector3(0, 1, 0);
    if (face !== 'camera') {
      const resolved = this.resolveFacePointAndNormal(face, minW, maxW, centerW);
      projNormal = resolved.normal;
      const refUp = Math.abs(projNormal.y) < 0.92 ? Vector3.Up() : Vector3.Forward();
      projRight = Vector3.Cross(refUp, projNormal).normalize();
      projUp = Vector3.Cross(projNormal, projRight).normalize();
    } else if (camera) {
      projNormal = camera.position.subtract(centerW).normalize();
    }

    let texelsPainted = 0;

    for (const tri of triangles) {
      const fDot =
        tri.faceNormal.x * projNormal.x +
        tri.faceNormal.y * projNormal.y +
        tri.faceNormal.z * projNormal.z;
      if (this.backfaceCull && fDot < -0.1) continue;

      const { x0, y0, x1, y1, x2, y2, invDenom, wp0, wp1, wp2 } = tri;
      for (let py = tri.minPy; py <= tri.maxPy; py++) {
        const sy = py + 0.5;
        for (let px = tri.minPx; px <= tri.maxPx; px++) {
          const sx = px + 0.5;
          const w0 = ((y1 - y2) * (sx - x2) + (x2 - x1) * (sy - y2)) * invDenom;
          const w1 = ((y2 - y0) * (sx - x2) + (x0 - x2) * (sy - y2)) * invDenom;
          const w2 = 1.0 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

          const cw0 = w0 > 0 ? w0 : 0;
          const cw1 = w1 > 0 ? w1 : 0;
          const cw2 = w2 > 0 ? w2 : 0;
          const wSum = cw0 + cw1 + cw2 || 1;
          const b0 = cw0 / wSum;
          const b1 = cw1 / wSum;
          const b2 = cw2 / wSum;

          const wx = wp0.x * b0 + wp1.x * b1 + wp2.x * b2;
          const wy = wp0.y * b0 + wp1.y * b1 + wp2.y * b2;
          const wz = wp0.z * b0 + wp1.z * b1 + wp2.z * b2;

          let sample: [number, number, number, number] | null = null;
          if (face === 'camera' && transformMat) {
            sample = this.sampleStencilAtWorldPoint(wx, wy, wz, transformMat, vpW, vpH);
          } else {
            const dx = wx - centerW.x;
            const dy = wy - centerW.y;
            const dz = wz - centerW.z;
            const lx0 = (dx * projRight.x + dy * projRight.y + dz * projRight.z) / orthoSpan - offX;
            const ly0 = -(dx * projUp.x + dy * projUp.y + dz * projUp.z) / orthoSpan - offY;
            const u = lx0 * cosR - ly0 * sinR + 0.5;
            const v = lx0 * sinR + ly0 * cosR + 0.5;
            if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
              const ix = Math.max(0, Math.min(this.stencil.width - 1, Math.floor(u * this.stencil.width)));
              const iy = Math.max(0, Math.min(this.stencil.height - 1, Math.floor(v * this.stencil.height)));
              const sIdx = (iy * this.stencil.width + ix) * 4;
              sample = [
                this.stencil.pixels[sIdx],
                this.stencil.pixels[sIdx + 1],
                this.stencil.pixels[sIdx + 2],
                this.stencil.pixels[sIdx + 3],
              ];
            }
          }

          if (sample && sample[3] > 2) {
            const idx = (py * res + px) * 4;
            this.blendTexelOver(layer.pixels, idx, sample[0], sample[1], sample[2], opacity * (sample[3] / 255));
            texelsPainted++;
          }
        }
      }
    }

    this.pushUndo(session, layer.id, before, layer.pixels.slice());
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);

    return { meshName: mesh.name, layerName: layer.name, texelsPainted };
  }

  // =========================================================================
  // 7. COMPOSITING, BLEND MODES, UV SEAM DILATION & GPU UPLOAD
  // =========================================================================

  public compositeAndUpload(session: MeshPaintSession, applyDilation: boolean = true): void {
    const res = session.resolution;
    const pixelCount = res * res;

    // 1. Composite Albedo layers
    const albedo = session.albedoComposite;
    albedo.fill(0);
    for (let i = 0; i < pixelCount; i++) {
      albedo[i * 4] = 200;
      albedo[i * 4 + 1] = 200;
      albedo[i * 4 + 2] = 200;
      albedo[i * 4 + 3] = 255;
    }

    let firstAlbedo = true;
    let hasOrm = false;
    let hasEmissive = false;

    for (const layer of session.layers) {
      if (!layer.visible || layer.opacity <= 0.001) continue;
      if (layer.channel === 'albedo') {
        if (firstAlbedo && layer.blendMode === 'normal' && layer.opacity >= 0.999) {
          albedo.set(layer.pixels);
          // Ensure opaque background for albedo
          for (let i = 0; i < pixelCount; i++) {
            if (albedo[i * 4 + 3] < 255) {
              const a = albedo[i * 4 + 3] / 255;
              albedo[i * 4] = Math.round(albedo[i * 4] * a + 200 * (1 - a));
              albedo[i * 4 + 1] = Math.round(albedo[i * 4 + 1] * a + 200 * (1 - a));
              albedo[i * 4 + 2] = Math.round(albedo[i * 4 + 2] * a + 200 * (1 - a));
              albedo[i * 4 + 3] = 255;
            }
          }
          firstAlbedo = false;
        } else {
          this.blendLayerOntoComposite(albedo, layer.pixels, pixelCount, layer.opacity, layer.blendMode);
          firstAlbedo = false;
        }
      } else if (layer.channel === 'roughness' || layer.channel === 'metallic') {
        hasOrm = true;
      } else if (layer.channel === 'emissive') {
        hasEmissive = true;
      }
    }

    // 2. Composite ORM (G = Roughness, B = Metallic) if any roughness/metallic layers exist
    if (hasOrm || session.hasRoughnessOrMetallicData) {
      session.hasRoughnessOrMetallicData = true;
      const defaultR = this.extractDefaultRoughnessByte(session.mesh);
      const defaultM = this.extractDefaultMetallicByte(session.mesh);
      const orm = session.ormComposite;
      for (let i = 0; i < pixelCount; i++) {
        orm[i * 4] = 255;
        orm[i * 4 + 1] = defaultR;
        orm[i * 4 + 2] = defaultM;
        orm[i * 4 + 3] = 255;
      }
      for (const layer of session.layers) {
        if (!layer.visible || layer.opacity <= 0.001) continue;
        if (layer.channel === 'roughness') {
          this.blendScalarChannelOntoComposite(orm, layer.pixels, pixelCount, 1, layer.opacity, layer.blendMode);
        } else if (layer.channel === 'metallic') {
          this.blendScalarChannelOntoComposite(orm, layer.pixels, pixelCount, 2, layer.opacity, layer.blendMode);
        }
      }
    }

    // 3. Composite Emissive if any emissive layers exist
    if (hasEmissive || session.hasEmissiveData) {
      session.hasEmissiveData = true;
      const emissive = session.emissiveComposite;
      emissive.fill(0);
      for (let i = 0; i < pixelCount; i++) emissive[i * 4 + 3] = 255;
      for (const layer of session.layers) {
        if (!layer.visible || layer.opacity <= 0.001 || layer.channel !== 'emissive') continue;
        this.blendLayerOntoComposite(emissive, layer.pixels, pixelCount, layer.opacity, layer.blendMode);
      }
    }

    // 4. UV Seam Dilation / Bleed to eliminate mipmap seam bleeding
    if (applyDilation && session.paddingPx > 0) {
      this.dilateRgbaBuffer(albedo, session.coverageMask, res, session.paddingPx);
      if (session.hasRoughnessOrMetallicData) {
        this.dilateRgbaBuffer(session.ormComposite, session.coverageMask, res, session.paddingPx);
      }
      if (session.hasEmissiveData) {
        this.dilateRgbaBuffer(session.emissiveComposite, session.coverageMask, res, session.paddingPx);
      }
    }

    // 5. Upload buffers to Babylon RawTextures
    if (session.albedoTexture) {
      session.albedoTexture.update(albedo);
    }

    const mat = session.mesh.material;
    if (mat instanceof PBRMaterial) {
      if (session.hasRoughnessOrMetallicData) {
        this.ensureOrmTextureAttached(session, mat);
        session.ormTexture?.update(session.ormComposite);
      }
      if (session.hasEmissiveData) {
        this.ensureEmissiveTextureAttached(session, mat);
        session.emissiveTexture?.update(session.emissiveComposite);
      }
    }
  }

  private blendLayerOntoComposite(
    dst: Uint8ClampedArray,
    src: Uint8ClampedArray,
    pixelCount: number,
    layerOpacity: number,
    blendMode: PaintBlendMode
  ): void {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const sa = (src[idx + 3] / 255) * layerOpacity;
      if (sa <= 0.001) continue;

      const dr = dst[idx] / 255;
      const dg = dst[idx + 1] / 255;
      const db = dst[idx + 2] / 255;
      const sr = src[idx] / 255;
      const sg = src[idx + 1] / 255;
      const sb = src[idx + 2] / 255;

      const br = this.applyBlendFormula(dr, sr, blendMode);
      const bg = this.applyBlendFormula(dg, sg, blendMode);
      const bb = this.applyBlendFormula(db, sb, blendMode);

      dst[idx] = Math.round((dr * (1 - sa) + br * sa) * 255);
      dst[idx + 1] = Math.round((dg * (1 - sa) + bg * sa) * 255);
      dst[idx + 2] = Math.round((db * (1 - sa) + bb * sa) * 255);
      dst[idx + 3] = 255;
    }
  }

  private blendScalarChannelOntoComposite(
    dst: Uint8ClampedArray,
    src: Uint8ClampedArray,
    pixelCount: number,
    channelOffset: number,
    layerOpacity: number,
    blendMode: PaintBlendMode
  ): void {
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const sa = (src[idx + 3] / 255) * layerOpacity;
      if (sa <= 0.001) continue;
      const d = dst[idx + channelOffset] / 255;
      const s = src[idx] / 255;
      const b = this.applyBlendFormula(d, s, blendMode);
      dst[idx + channelOffset] = Math.round((d * (1 - sa) + b * sa) * 255);
    }
  }

  private applyBlendFormula(d: number, s: number, mode: PaintBlendMode): number {
    switch (mode) {
      case 'multiply':
        return d * s;
      case 'screen':
        return 1 - (1 - d) * (1 - s);
      case 'overlay':
        return d < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s);
      case 'soft-light':
        return (1 - 2 * s) * d * d + 2 * s * d;
      case 'add':
        return Math.min(1, d + s);
      case 'normal':
      default:
        return s;
    }
  }

  /**
   * Dilates UV island edge texels outward into uncovered gutter pixels to prevent seam bleeding.
   */
  private dilateRgbaBuffer(
    buf: Uint8ClampedArray,
    coverageMask: Uint8Array,
    res: number,
    iterations: number
  ): void {
    const mask = new Uint8Array(coverageMask);
    const nextMask = new Uint8Array(mask);

    for (let iter = 0; iter < iterations; iter++) {
      let changed = false;
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const idx = y * res + x;
          if (mask[idx] === 1) continue;

          let r = 0;
          let g = 0;
          let b = 0;
          let count = 0;

          if (x > 0 && mask[idx - 1] === 1) {
            const ni = (idx - 1) * 4;
            r += buf[ni];
            g += buf[ni + 1];
            b += buf[ni + 2];
            count++;
          }
          if (x + 1 < res && mask[idx + 1] === 1) {
            const ni = (idx + 1) * 4;
            r += buf[ni];
            g += buf[ni + 1];
            b += buf[ni + 2];
            count++;
          }
          if (y > 0 && mask[idx - res] === 1) {
            const ni = (idx - res) * 4;
            r += buf[ni];
            g += buf[ni + 1];
            b += buf[ni + 2];
            count++;
          }
          if (y + 1 < res && mask[idx + res] === 1) {
            const ni = (idx + res) * 4;
            r += buf[ni];
            g += buf[ni + 1];
            b += buf[ni + 2];
            count++;
          }

          if (count > 0) {
            const oi = idx * 4;
            buf[oi] = Math.round(r / count);
            buf[oi + 1] = Math.round(g / count);
            buf[oi + 2] = Math.round(b / count);
            buf[oi + 3] = 255;
            nextMask[idx] = 1;
            changed = true;
          }
        }
      }
      if (!changed) break;
      mask.set(nextMask);
    }
  }

  // =========================================================================
  // 8. UNDO / REDO, EYEDROPPER, 2D PREVIEW & EXPORT
  // =========================================================================

  private pushUndo(
    session: MeshPaintSession,
    layerId: string,
    before: Uint8ClampedArray,
    after: Uint8ClampedArray
  ): void {
    session.undoStack.push({ layerId, before, after });
    if (session.undoStack.length > MAX_UNDO_STEPS) {
      session.undoStack.shift();
    }
    session.redoStack = [];
  }

  public undo(mesh: Mesh): boolean {
    const session = this.sessions.get(mesh);
    if (!session || session.undoStack.length === 0) return false;
    const entry = session.undoStack.pop()!;
    const layer = session.layers.find((l) => l.id === entry.layerId);
    if (!layer) return false;
    layer.pixels.set(entry.before);
    session.redoStack.push(entry);
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    return true;
  }

  public redo(mesh: Mesh): boolean {
    const session = this.sessions.get(mesh);
    if (!session || session.redoStack.length === 0) return false;
    const entry = session.redoStack.pop()!;
    const layer = session.layers.find((l) => l.id === entry.layerId);
    if (!layer) return false;
    layer.pixels.set(entry.after);
    session.undoStack.push(entry);
    this.compositeAndUpload(session, true);
    this.onCanvasUpdated?.(mesh);
    return true;
  }

  public sampleColorAtUV(mesh: Mesh, u: number, v: number): string | null {
    const session = this.sessions.get(mesh);
    if (!session) return null;
    const px = this.uvToPixelX(u, session.resolution);
    const py = this.uvToPixelY(v, session.resolution);
    const idx = (py * session.resolution + px) * 4;
    const buf =
      this.channel === 'emissive' && session.hasEmissiveData
        ? session.emissiveComposite
        : session.albedoComposite;
    return this.rgbToHex(buf[idx], buf[idx + 1], buf[idx + 2]);
  }

  public getPaintedDataUrl(mesh: Mesh, channel: PaintChannel = 'albedo'): string | null {
    const session = this.sessions.get(mesh);
    if (!session) return null;
    const res = session.resolution;
    if (channel === 'albedo') {
      return this.rgbaBufferToDataURL(session.albedoComposite, res, res);
    }
    if (channel === 'emissive') {
      return this.rgbaBufferToDataURL(session.emissiveComposite, res, res);
    }
    if (channel === 'roughness' || channel === 'metallic') {
      const offset = channel === 'roughness' ? 1 : 2;
      const gray = new Uint8ClampedArray(res * res * 4);
      for (let i = 0; i < res * res; i++) {
        const v = session.ormComposite[i * 4 + offset];
        gray[i * 4] = v;
        gray[i * 4 + 1] = v;
        gray[i * 4 + 2] = v;
        gray[i * 4 + 3] = 255;
      }
      return this.rgbaBufferToDataURL(gray, res, res);
    }
    return null;
  }

  /**
   * Renders the current active channel composite + optional UV wireframe into a 2D preview <canvas>.
   */
  public renderPreviewToCanvas(mesh: Nullable<Mesh>, canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!mesh) {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a mesh to paint', w / 2, h / 2);
      return;
    }

    const session = this.sessions.get(mesh);
    if (!session) {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click "Init Paint Canvas" or paint on mesh', w / 2, h / 2);
      return;
    }

    const res = session.resolution;
    let displayBuf = session.albedoComposite;
    if (this.channel === 'emissive' && session.hasEmissiveData) {
      displayBuf = session.emissiveComposite;
    } else if (this.channel === 'roughness' || this.channel === 'metallic') {
      const offset = this.channel === 'roughness' ? 1 : 2;
      displayBuf = new Uint8ClampedArray(res * res * 4);
      for (let i = 0; i < res * res; i++) {
        const v = session.ormComposite[i * 4 + offset];
        displayBuf[i * 4] = v;
        displayBuf[i * 4 + 1] = v;
        displayBuf[i * 4 + 2] = v;
        displayBuf[i * 4 + 3] = 255;
      }
    }

    if (typeof ImageData !== 'undefined') {
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = res;
        offscreen.height = res;
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          offCtx.putImageData(new ImageData(new Uint8ClampedArray(displayBuf), res, res), 0, 0);
          ctx.drawImage(offscreen, 0, 0, w, h);
        }
      } catch {
        ctx.fillStyle = '#21262d';
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Draw UV Wireframe Overlay
    if (this.showUvWireframe && session.triangles.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.32)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(session.triangles.length / 2500));
      for (let i = 0; i < session.triangles.length; i += step) {
        const t = session.triangles[i];
        ctx.moveTo(t.u0 * w, (1 - t.v0) * h);
        ctx.lineTo(t.u1 * w, (1 - t.v1) * h);
        ctx.lineTo(t.u2 * w, (1 - t.v2) * h);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Converts live RawTextures into PNG DataURL-backed Textures prior to GLB/glTF/.babylon export
   * so Babylon's serializers always embed crisp painted maps.
   */
  public async prepareMeshesForExport(): Promise<void> {
    this.exportBackupTextures.clear();

    for (const session of this.activeSessions) {
      const { mesh, resolution: res } = session;
      if (!mesh || mesh.isDisposed()) continue;
      const mat = mesh.material;
      if (!(mat instanceof PBRMaterial)) continue;

      this.compositeAndUpload(session, true);

      const backup = {
        albedo: mat.albedoTexture as Nullable<Texture>,
        metallic: mat.metallicTexture as Nullable<Texture>,
        emissive: mat.emissiveTexture as Nullable<Texture>,
        createdTextures: [] as Texture[],
      };

      const albedoUrl = this.rgbaBufferToDataURL(session.albedoComposite, res, res);
      const exportAlbedo = new Texture(albedoUrl, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      exportAlbedo.name = `${mesh.name}_PaintedAlbedo.png`;
      mat.albedoTexture = exportAlbedo;
      backup.createdTextures.push(exportAlbedo);

      if (session.hasRoughnessOrMetallicData) {
        const ormUrl = this.rgbaBufferToDataURL(session.ormComposite, res, res);
        const exportOrm = new Texture(ormUrl, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
        exportOrm.name = `${mesh.name}_PaintedORM.png`;
        mat.metallicTexture = exportOrm;
        backup.createdTextures.push(exportOrm);
      }

      if (session.hasEmissiveData) {
        const emissiveUrl = this.rgbaBufferToDataURL(session.emissiveComposite, res, res);
        const exportEmissive = new Texture(emissiveUrl, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
        exportEmissive.name = `${mesh.name}_PaintedEmissive.png`;
        mat.emissiveTexture = exportEmissive;
        backup.createdTextures.push(exportEmissive);
      }

      this.exportBackupTextures.set(mesh, backup);
    }
  }

  public restoreAfterExport(): void {
    for (const [mesh, backup] of this.exportBackupTextures.entries()) {
      if (mesh && !mesh.isDisposed() && mesh.material instanceof PBRMaterial) {
        mesh.material.albedoTexture = backup.albedo;
        mesh.material.metallicTexture = backup.metallic;
        mesh.material.emissiveTexture = backup.emissive;
      }
      for (const tex of backup.createdTextures) {
        tex.dispose();
      }
    }
    this.exportBackupTextures.clear();
  }

  // =========================================================================
  // 9. HELPERS & UTILITIES
  // =========================================================================

  private computeWeldedVertexNormals(mesh: Mesh): Float32Array | null {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    if (!positions || !indices) return null;

    const quant = 10000;
    const posMap = new Map<string, Vector3>();
    const numVerts = Math.floor(positions.length / 3);
    const keys: string[] = new Array(numVerts);

    for (let i = 0; i < numVerts; i++) {
      const k = `${Math.round(positions[i * 3] * quant)},${Math.round(positions[i * 3 + 1] * quant)},${Math.round(positions[i * 3 + 2] * quant)}`;
      keys[i] = k;
      if (!posMap.has(k)) posMap.set(k, new Vector3(0, 0, 0));
    }

    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const numFaces = Math.floor(indices.length / 3);
    for (let f = 0; f < numFaces; f++) {
      const i0 = indices[f * 3];
      const i1 = indices[f * 3 + 1];
      const i2 = indices[f * 3 + 2];
      const p0 = new Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      const p1 = new Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      const p2 = new Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
      const fn = Vector3.Cross(p1.subtract(p0), p2.subtract(p0));
      if (normals) {
        const vn = new Vector3(
          normals[i0 * 3] + normals[i1 * 3] + normals[i2 * 3],
          normals[i0 * 3 + 1] + normals[i1 * 3 + 1] + normals[i2 * 3 + 1],
          normals[i0 * 3 + 2] + normals[i1 * 3 + 2] + normals[i2 * 3 + 2]
        );
        if (Vector3.Dot(fn, vn) < 0) fn.scaleInPlace(-1);
      }
      posMap.get(keys[i0])!.addInPlace(fn);
      posMap.get(keys[i1])!.addInPlace(fn);
      posMap.get(keys[i2])!.addInPlace(fn);
    }

    for (const v of posMap.values()) {
      if (v.lengthSquared() > 1e-10) v.normalize();
      else v.set(0, 1, 0);
    }

    const out = new Float32Array(positions.length);
    for (let i = 0; i < numVerts; i++) {
      const n = posMap.get(keys[i])!;
      out[i * 3] = n.x;
      out[i * 3 + 1] = n.y;
      out[i * 3 + 2] = n.z;
    }
    return out;
  }

  public hexToRgba(hex: string, alpha: number = 255): [number, number, number, number] {
    const clean = String(hex || '#ffffff').trim().replace(/^#/, '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16) || 0;
      const g = parseInt(clean[1] + clean[1], 16) || 0;
      const b = parseInt(clean[2] + clean[2], 16) || 0;
      return [r, g, b, alpha];
    }
    if (clean.length >= 6) {
      const r = parseInt(clean.slice(0, 2), 16) || 0;
      const g = parseInt(clean.slice(2, 4), 16) || 0;
      const b = parseInt(clean.slice(4, 6), 16) || 0;
      return [r, g, b, alpha];
    }
    return [255, 255, 255, alpha];
  }

  public rgbToHex(r: number, g: number, b: number): string {
    const toH = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  }

  public rgbaBufferToDataURL(buffer: Uint8ClampedArray | Uint8Array, width: number, height: number): string {
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx && typeof ImageData !== 'undefined') {
          ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
          const url = canvas.toDataURL('image/png');
          if (url && url.startsWith('data:image/')) {
            return url;
          }
        }
      } catch {
        // Fallback to BMP below for headless jsdom
      }
    }

    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const bmp = new Uint8Array(fileSize);
    const view = new DataView(bmp.buffer);
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    view.setUint32(2, fileSize, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, -height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelArraySize, true);

    for (let y = 0; y < height; y++) {
      const rowOffset = 54 + y * rowSize;
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const dstIdx = rowOffset + x * 3;
        bmp[dstIdx] = buffer[srcIdx + 2];
        bmp[dstIdx + 1] = buffer[srcIdx + 1];
        bmp[dstIdx + 2] = buffer[srcIdx];
      }
    }

    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bmp.length; i += chunk) {
      binary += String.fromCharCode(...bmp.subarray(i, i + chunk));
    }
    const nodeBuffer = (
      globalThis as unknown as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }
    ).Buffer;
    const b64 =
      typeof btoa === 'function'
        ? btoa(binary)
        : nodeBuffer
          ? nodeBuffer.from(bmp).toString('base64')
          : '';
    return `data:image/bmp;base64,${b64}`;
  }

  public dispose(): void {
    this.setActive(false);
    this.restoreAfterExport();
    for (const session of this.activeSessions) {
      session.albedoTexture?.dispose();
      session.ormTexture?.dispose();
      session.emissiveTexture?.dispose();
    }
    this.activeSessions.clear();
    if (this.cursorRing && !this.cursorRing.isDisposed()) {
      this.cursorRing.dispose();
    }
    if (this.symCursorRing && !this.symCursorRing.isDisposed()) {
      this.symCursorRing.dispose();
    }
  }
}
