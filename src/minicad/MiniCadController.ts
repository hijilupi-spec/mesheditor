import {
  Color3,
  Engine,
  LinesMesh,
  Material,
  Mesh,
  MeshBuilder,
  Nullable,
  Observer,
  PBRMaterial,
  Plane,
  PointerEventTypes,
  PointerInfo,
  StandardMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { STLExport } from '@babylonjs/serializers';
import type { MeshEditorService } from '../MeshEditorService';
import {
  buildMeshFromMiniCadRecipe,
  classifyCardinalFace,
  generateCutList,
  getFaceBasis,
  getMiniCadRecipe,
  getProfileConfig,
  inspectMeshPrintability,
  mmToWorld,
  roundMm,
  worldToMm,
} from './MiniCadGeometry';
import {
  MINICAD_HOLE_PRESETS,
  MiniCadAlignAction,
  MiniCadCutListItem,
  MiniCadDimensionsMm,
  MiniCadFaceDir,
  MiniCadFacePickResult,
  MiniCadFeatureOp,
  MiniCadHoleFeature,
  MiniCadHolePresetId,
  MiniCadInteractionMode,
  MiniCadPrintabilityReport,
  MiniCadProfileConfig,
  MiniCadProfileId,
  MiniCadRecipe,
  MiniCadShapeKind,
  MiniCadSmartGuide,
  MiniCadStarterTemplateId,
} from './types';

export interface MiniCadCreatePartOptions {
  name?: string;
  shape: MiniCadShapeKind;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  innerDiameterMm?: number;
  wallThicknessMm?: number;
  cornerRadiusMm?: number;
  positionMm?: { x: number; y: number; z: number };
  groundToFloor?: boolean;
  color?: string;
  shellWallMm?: number;
  shellOpenFace?: MiniCadFaceDir | 'none';
  bevelWidthMm?: number;
  bevelSegments?: number;
}

interface PushPullDragState {
  mesh: Mesh;
  faceDir: MiniCadFaceDir;
  worldNormal: Vector3;
  startRayPoint: Vector3;
  initialDims: MiniCadDimensionsMm;
  initialPos: Vector3;
  initialScale: Vector3;
  initialRecipe: MiniCadRecipe | null;
  lastAppliedDeltaMm: number;
}

interface PlaneMoveDragState {
  mesh: Mesh;
  dragPlane: Plane;
  startHitWorld: Vector3;
  initialPos: Vector3;
}

export class MiniCadController {
  private service: MeshEditorService;
  public isActive: boolean = false;
  public profileId: MiniCadProfileId = '3d_print';
  public interactionMode: MiniCadInteractionMode = 'select';
  public snapMm: number = 1.0;
  public holePresetId: MiniCadHolePresetId = 'm3';
  public holeThroughAll: boolean = true;
  public holeDepthMm: number = 10;
  public holeSymmetricCorners: boolean = false;
  public holeCornerInsetMm: number = 6;
  public defaultColor: string = '#3b82f6';

  public hoveredFace: MiniCadFacePickResult | null = null;
  public activeGuides: MiniCadSmartGuide[] = [];
  public lastLiveActionLabel: string = '';

  private pointerObserver: Nullable<Observer<PointerInfo>> = null;
  private renderObserver: Nullable<Observer<any>> = null;
  private faceHighlightMesh: Mesh | null = null;
  private faceOutlineMesh: LinesMesh | null = null;
  private guideLineMeshes: LinesMesh[] = [];
  private pushPullDrag: PushPullDragState | null = null;
  private planeMoveDrag: PlaneMoveDragState | null = null;
  private cameraDetachedForDrag: boolean = false;

  public onStateChanged?: () => void;
  public onHudRefresh?: () => void;

  constructor(service: MeshEditorService) {
    this.service = service;
  }

  public getProfile(): MiniCadProfileConfig {
    return getProfileConfig(this.profileId);
  }

  public setProfile(profileId: MiniCadProfileId): void {
    this.profileId = profileId;
    this.snapMm = this.getProfile().defaultSnapMm;
    this.refreshGuidesAndHud();
    this.onStateChanged?.();
  }

  public setInteractionMode(mode: MiniCadInteractionMode): void {
    this.interactionMode = mode;
    this.lastLiveActionLabel = '';
    this.updateFaceHighlightVisual();
    this.onStateChanged?.();
    this.onHudRefresh?.();
  }

  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;

    if (active) {
      this.service.deactivateOtherInteractive3DTools('minicad');
      this.attachObservers();
      this.refreshGuidesAndHud();
    } else {
      this.cancelActiveDrags();
      this.detachObservers();
      this.clearVisualHelpers();
    }

    this.onStateChanged?.();
    this.onHudRefresh?.();
  }

  public dispose(): void {
    this.setActive(false);
    if (this.faceHighlightMesh && !this.faceHighlightMesh.isDisposed()) {
      this.faceHighlightMesh.dispose();
    }
    this.faceHighlightMesh = null;
    if (this.faceOutlineMesh && !this.faceOutlineMesh.isDisposed()) {
      this.faceOutlineMesh.dispose();
    }
    this.faceOutlineMesh = null;
    this.clearGuideLines();
  }

  private attachObservers(): void {
    if (!this.pointerObserver) {
      this.pointerObserver = this.service.scene.onPointerObservable.add((info) =>
        this.handlePointer(info)
      );
    }
    if (!this.renderObserver) {
      this.renderObserver = this.service.scene.onAfterRenderObservable.add(() => {
        if (this.isActive && this.activeGuides.length > 0) {
          this.onHudRefresh?.();
        }
      });
    }
  }

  private detachObservers(): void {
    if (this.pointerObserver) {
      this.service.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.renderObserver) {
      this.service.scene.onAfterRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }

  private clearVisualHelpers(): void {
    this.hoveredFace = null;
    this.activeGuides = [];
    this.lastLiveActionLabel = '';
    if (this.faceHighlightMesh) {
      this.faceHighlightMesh.setEnabled(false);
    }
    if (this.faceOutlineMesh) {
      this.faceOutlineMesh.setEnabled(false);
    }
    this.clearGuideLines();
  }

  private clearGuideLines(): void {
    for (const line of this.guideLineMeshes) {
      if (!line.isDisposed()) line.dispose();
    }
    this.guideLineMeshes = [];
  }

  private ensureFaceHighlightMesh(): Mesh {
    if (this.faceHighlightMesh && !this.faceHighlightMesh.isDisposed()) {
      return this.faceHighlightMesh;
    }
    // Single-sided geometry + backFaceCulling=false avoids double-quad alpha overdraw
    const plane = MeshBuilder.CreatePlane(
      'minicad_face_highlight',
      { width: 1, height: 1, sideOrientation: Mesh.FRONTSIDE },
      this.service.scene
    );
    const mat = new StandardMaterial('minicad_face_highlight_mat', this.service.scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.15, 0.72, 1.0);
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.alphaMode = Engine.ALPHA_COMBINE;
    mat.alpha = 0.28;
    mat.backFaceCulling = false;
    plane.material = mat;
    plane.isPickable = false;
    plane.metadata = { isEditorHelper: true };
    plane.setEnabled(false);
    this.service.highlightLayer?.addExcludedMesh(plane);
    this.faceHighlightMesh = plane;

    const outline = MeshBuilder.CreateLines(
      'minicad_face_outline',
      {
        points: [
          new Vector3(-0.5, -0.5, 0),
          new Vector3(0.5, -0.5, 0),
          new Vector3(0.5, 0.5, 0),
          new Vector3(-0.5, 0.5, 0),
          new Vector3(-0.5, -0.5, 0),
        ],
      },
      this.service.scene
    );
    outline.color = new Color3(0.25, 0.85, 1.0);
    outline.isPickable = false;
    outline.metadata = { isEditorHelper: true };
    outline.setEnabled(false);
    this.service.highlightLayer?.addExcludedMesh(outline);
    this.faceOutlineMesh = outline;

    return plane;
  }

  private updateFaceHighlightVisual(): void {
    const hl = this.ensureFaceHighlightMesh();
    const outline = this.faceOutlineMesh;
    if (!this.isActive || !this.hoveredFace) {
      hl.setEnabled(false);
      outline?.setEnabled(false);
      return;
    }

    const mesh = this.hoveredFace.mesh as Mesh;
    if (!mesh || mesh.isDisposed()) {
      hl.setEnabled(false);
      outline?.setEnabled(false);
      return;
    }

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const bb = mesh.getBoundingInfo().boundingBox;
    const center = bb.centerWorld;
    const half = bb.extendSizeWorld;
    const dir = this.hoveredFace.faceDir;

    let offset = Vector3.Zero();
    let w = 1;
    let h = 1;
    let rotX = 0;
    let rotY = 0;

    if (dir === 'top') {
      offset = new Vector3(0, half.y + 0.005, 0);
      w = half.x * 2;
      h = half.z * 2;
      rotX = Math.PI / 2;
    } else if (dir === 'bottom') {
      offset = new Vector3(0, -half.y - 0.005, 0);
      w = half.x * 2;
      h = half.z * 2;
      rotX = -Math.PI / 2;
    } else if (dir === 'front') {
      offset = new Vector3(0, 0, half.z + 0.005);
      w = half.x * 2;
      h = half.y * 2;
      rotY = 0;
    } else if (dir === 'back') {
      offset = new Vector3(0, 0, -half.z - 0.005);
      w = half.x * 2;
      h = half.y * 2;
      rotY = Math.PI;
    } else if (dir === 'right') {
      offset = new Vector3(half.x + 0.005, 0, 0);
      w = half.z * 2;
      h = half.y * 2;
      rotY = Math.PI / 2;
    } else if (dir === 'left') {
      offset = new Vector3(-half.x - 0.005, 0, 0);
      w = half.z * 2;
      h = half.y * 2;
      rotY = -Math.PI / 2;
    }

    const mat = hl.material as StandardMaterial;
    let accentColor = new Color3(0.15, 0.78, 1.0);
    if (this.interactionMode === 'punch_hole') {
      accentColor = new Color3(1.0, 0.45, 0.2);
    } else if (this.interactionMode === 'push_pull') {
      accentColor = new Color3(0.2, 0.9, 0.55);
    }
    mat.emissiveColor = accentColor;
    if (outline) {
      outline.color = accentColor;
    }

    const scaleX = Math.max(0.05, w);
    const scaleY = Math.max(0.05, h);
    hl.position.copyFrom(center.add(offset));
    hl.rotation.set(rotX, rotY, 0);
    hl.scaling.set(scaleX, scaleY, 1);
    hl.setEnabled(true);

    if (outline) {
      outline.position.copyFrom(hl.position);
      outline.rotation.copyFrom(hl.rotation);
      outline.scaling.copyFrom(hl.scaling);
      outline.setEnabled(true);
    }
  }

  public pickMeshFace(pointerX: number, pointerY: number): MiniCadFacePickResult | null {
    const pick = this.service.scene.pick(
      pointerX,
      pointerY,
      (m) =>
        m instanceof Mesh &&
        !m.isDisposed() &&
        !this.service.isEditorHelper(m) &&
        m !== this.service.gridMesh &&
        m.isEnabled() &&
        m.isPickable
    );
    if (!pick || !pick.hit || !pick.pickedMesh || !pick.pickedPoint) {
      return null;
    }

    const mesh = pick.pickedMesh as Mesh;
    const worldNormal = pick.getNormal(true, true) || new Vector3(0, 1, 0);
    const faceDir = classifyCardinalFace(worldNormal);
    const dims = this.getMeshDimensionsMm(mesh);
    const basis = getFaceBasis(faceDir, dims);

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const relWorld = pick.pickedPoint.subtract(center);

    const offsetUMm = roundMm(worldToMm(Vector3.Dot(relWorld, basis.uAxis), this.profileId), 1);
    const offsetVMm = roundMm(worldToMm(Vector3.Dot(relWorld, basis.vAxis), this.profileId), 1);

    return {
      mesh,
      faceDir,
      worldPoint: [pick.pickedPoint.x, pick.pickedPoint.y, pick.pickedPoint.z],
      worldNormal: [basis.normal.x, basis.normal.y, basis.normal.z],
      localUWorld: [basis.uAxis.x, basis.uAxis.y, basis.uAxis.z],
      localVWorld: [basis.vAxis.x, basis.vAxis.y, basis.vAxis.z],
      offsetUMm,
      offsetVMm,
      faceWidthMm: basis.faceWidthMm,
      faceHeightMm: basis.faceHeightMm,
    };
  }

  private getValidSceneMeshes(excludeMesh?: Mesh | null): Mesh[] {
    return this.service.importedMeshes.filter(
      (m) =>
        m instanceof Mesh &&
        !m.isDisposed() &&
        m.isEnabled() &&
        m !== excludeMesh &&
        !this.service.isEditorHelper(m) &&
        m !== this.service.gridMesh &&
        m.getTotalVertices() > 0
    );
  }

  public snapValueMm(valMm: number): number {
    if (!this.snapMm || this.snapMm <= 0) return roundMm(valMm, 2);
    return roundMm(Math.round(valMm / this.snapMm) * this.snapMm, 2);
  }

  private detachCameraTemporary(): void {
    if (this.cameraDetachedForDrag) return;
    if (this.service.camera && this.service.canvas) {
      this.service.camera.detachControl();
      this.cameraDetachedForDrag = true;
    }
  }

  private reattachCameraAfterDrag(): void {
    if (!this.cameraDetachedForDrag) return;
    this.cameraDetachedForDrag = false;
    if (this.service.camera && this.service.canvas) {
      this.service.camera.attachControl(this.service.canvas, true);
    }
  }

  private cancelActiveDrags(): void {
    this.pushPullDrag = null;
    this.planeMoveDrag = null;
    this.reattachCameraAfterDrag();
  }

  private intersectPointerWithPlane(plane: Plane): Vector3 | null {
    const ray = this.service.scene.createPickingRay(
      this.service.scene.pointerX,
      this.service.scene.pointerY,
      null,
      this.service.camera
    );
    const dist = ray.intersectsPlane(plane);
    if (dist === null || dist < 0) return null;
    return ray.origin.add(ray.direction.scale(dist));
  }

  private handlePointer(pointerInfo: PointerInfo): void {
    if (!this.isActive || this.service.isSceneInteractionLocked) return;
    const evt = pointerInfo.event as PointerEvent | MouseEvent | undefined;
    const isLeftButton = !evt || evt.button === 0;

    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
      if (this.pushPullDrag) {
        this.updatePushPullDrag();
        return;
      }
      if (this.planeMoveDrag) {
        this.updatePlaneMoveDrag();
        return;
      }
      this.hoveredFace = this.pickMeshFace(this.service.scene.pointerX, this.service.scene.pointerY);
      this.updateFaceHighlightVisual();
      this.onHudRefresh?.();
      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
      if (!isLeftButton) return;
      const pick = pointerInfo.pickInfo;
      if (this.service.isGizmoMesh(pick?.pickedMesh)) return;

      const facePick = this.pickMeshFace(this.service.scene.pointerX, this.service.scene.pointerY);
      this.hoveredFace = facePick;
      this.updateFaceHighlightVisual();

      if (this.interactionMode === 'draw_box' || this.interactionMode === 'draw_cylinder') {
        const shape: MiniCadShapeKind = this.interactionMode === 'draw_box' ? 'box' : 'cylinder';
        this.placePartAtPointer(shape, facePick);
        return;
      }

      if (this.interactionMode === 'punch_hole') {
        if (facePick) {
          this.punchHoleAtFacePick(facePick);
          this.updateFaceHighlightVisual();
        }
        return;
      }

      if (this.interactionMode === 'push_pull') {
        if (facePick) {
          this.startPushPullDrag(facePick);
        }
        return;
      }

      // 'select' mode: select mesh and allow direct smart-plane drag
      if (facePick) {
        const target = facePick.mesh as Mesh;
        if (this.service.selectedMesh !== target) {
          this.service.selectMesh(target);
        }
        this.startPlaneMoveDrag(target, facePick);
      } else {
        const groundPick = this.service.scene.pick(
          this.service.scene.pointerX,
          this.service.scene.pointerY,
          (m) => m === this.service.gridMesh
        );
        if (groundPick?.hit) {
          this.service.selectNodes([]);
          this.refreshGuidesAndHud();
        }
      }
      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERUP) {
      if (this.pushPullDrag) {
        this.finishPushPullDrag();
      }
      if (this.planeMoveDrag) {
        this.finishPlaneMoveDrag();
      }
    }
  }

  private startPlaneMoveDrag(mesh: Mesh, facePick: MiniCadFacePickResult): void {
    const planeY = facePick.worldPoint[1];
    const dragPlane = Plane.FromPositionAndNormal(new Vector3(0, planeY, 0), new Vector3(0, 1, 0));
    const hit = this.intersectPointerWithPlane(dragPlane);
    if (!hit) return;

    this.planeMoveDrag = {
      mesh,
      dragPlane,
      startHitWorld: hit,
      initialPos: mesh.position.clone(),
    };
    this.detachCameraTemporary();
  }

  private updatePlaneMoveDrag(): void {
    const drag = this.planeMoveDrag;
    if (!drag || drag.mesh.isDisposed()) return;
    const hit = this.intersectPointerWithPlane(drag.dragPlane);
    if (!hit) return;

    const deltaWorld = hit.subtract(drag.startHitWorld);
    let nextX = drag.initialPos.x + deltaWorld.x;
    let nextZ = drag.initialPos.z + deltaWorld.z;

    if (this.snapMm > 0) {
      nextX = mmToWorld(this.snapValueMm(worldToMm(nextX, this.profileId)), this.profileId);
      nextZ = mmToWorld(this.snapValueMm(worldToMm(nextZ, this.profileId)), this.profileId);
    }

    drag.mesh.position.x = nextX;
    drag.mesh.position.z = nextZ;
    drag.mesh.computeWorldMatrix(true);

    // Apply Figma-style magnetic smart snapping against sibling centers & edges
    const snapThreshWorld = mmToWorld(Math.max(1.5, this.snapMm * 1.5), this.profileId);
    const siblings = this.getValidSceneMeshes(drag.mesh);
    if (siblings.length > 0) {
      drag.mesh.refreshBoundingInfo();
      const myBB = drag.mesh.getBoundingInfo().boundingBox;
      const myCenter = myBB.centerWorld;
      const myHalf = myBB.extendSizeWorld;

      for (const sib of siblings) {
        sib.computeWorldMatrix(true);
        sib.refreshBoundingInfo();
        const sBB = sib.getBoundingInfo().boundingBox;
        const sCenter = sBB.centerWorld;

        if (Math.abs(myCenter.x - sCenter.x) < snapThreshWorld) {
          drag.mesh.position.x += sCenter.x - myCenter.x;
        } else if (Math.abs(myBB.minimumWorld.x - sBB.minimumWorld.x) < snapThreshWorld) {
          drag.mesh.position.x += sBB.minimumWorld.x - myBB.minimumWorld.x;
        } else if (Math.abs(myBB.maximumWorld.x - sBB.maximumWorld.x) < snapThreshWorld) {
          drag.mesh.position.x += sBB.maximumWorld.x - myBB.maximumWorld.x;
        } else if (Math.abs(myBB.minimumWorld.x - sBB.maximumWorld.x) < snapThreshWorld) {
          drag.mesh.position.x += sBB.maximumWorld.x - myBB.minimumWorld.x;
        } else if (Math.abs(myBB.maximumWorld.x - sBB.minimumWorld.x) < snapThreshWorld) {
          drag.mesh.position.x += sBB.minimumWorld.x - myBB.maximumWorld.x;
        }

        if (Math.abs(myCenter.z - sCenter.z) < snapThreshWorld) {
          drag.mesh.position.z += sCenter.z - myCenter.z;
        } else if (Math.abs(myBB.minimumWorld.z - sBB.minimumWorld.z) < snapThreshWorld) {
          drag.mesh.position.z += sBB.minimumWorld.z - myBB.minimumWorld.z;
        } else if (Math.abs(myBB.maximumWorld.z - sBB.maximumWorld.z) < snapThreshWorld) {
          drag.mesh.position.z += sBB.maximumWorld.z - myBB.maximumWorld.z;
        } else if (Math.abs(myBB.minimumWorld.z - sBB.maximumWorld.z) < snapThreshWorld) {
          drag.mesh.position.z += sBB.maximumWorld.z - myBB.minimumWorld.z;
        } else if (Math.abs(myBB.maximumWorld.z - sBB.minimumWorld.z) < snapThreshWorld) {
          drag.mesh.position.z += sBB.minimumWorld.z - myBB.maximumWorld.z;
        }
        // Check first matching sibling proximity cleanly
        if (Math.abs(myCenter.x - sCenter.x) < myHalf.x * 4) break;
      }
    }

    this.lastLiveActionLabel = `Pos X: ${roundMm(worldToMm(drag.mesh.position.x, this.profileId), 1)} mm · Z: ${roundMm(worldToMm(drag.mesh.position.z, this.profileId), 1)} mm`;
    this.refreshGuidesAndHud();
  }

  private finishPlaneMoveDrag(): void {
    const drag = this.planeMoveDrag;
    this.planeMoveDrag = null;
    this.reattachCameraAfterDrag();
    if (!drag || drag.mesh.isDisposed()) return;

    const endPos = drag.mesh.position.clone();
    if (Vector3.Distance(drag.initialPos, endPos) > 1e-4) {
      const targetMesh = drag.mesh;
      const beforePos = drag.initialPos.clone();
      this.service.recordAction({
        name: `MiniCAD Move "${targetMesh.name}"`,
        undo: () => {
          if (!targetMesh.isDisposed()) {
            targetMesh.position.copyFrom(beforePos);
            targetMesh.computeWorldMatrix(true);
            this.refreshGuidesAndHud();
          }
        },
        redo: () => {
          if (!targetMesh.isDisposed()) {
            targetMesh.position.copyFrom(endPos);
            targetMesh.computeWorldMatrix(true);
            this.refreshGuidesAndHud();
          }
        },
      });
      this.service.events.onSceneModified?.();
    }
    this.refreshGuidesAndHud();
  }

  private startPushPullDrag(facePick: MiniCadFacePickResult): void {
    const mesh = facePick.mesh as Mesh;
    const camPos = this.service.camera?.position || new Vector3(0, 5, -10);
    const n = new Vector3(facePick.worldNormal[0], facePick.worldNormal[1], facePick.worldNormal[2]);
    const toCam = camPos.subtract(new Vector3(...facePick.worldPoint));
    // Plane containing the normal and facing as close to the camera as possible
    let tangent = Vector3.Cross(n, toCam);
    if (tangent.lengthSquared() < 1e-5) {
      tangent = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    }
    const planeNormal = Vector3.Cross(tangent, n).normalize();
    const dragPlane = Plane.FromPositionAndNormal(new Vector3(...facePick.worldPoint), planeNormal);
    const hit = this.intersectPointerWithPlane(dragPlane);
    if (!hit) return;

    const recipe = getMiniCadRecipe(mesh);
    this.service.selectMesh(mesh);
    this.pushPullDrag = {
      mesh,
      faceDir: facePick.faceDir,
      worldNormal: n,
      startRayPoint: hit,
      initialDims: this.getMeshDimensionsMm(mesh),
      initialPos: mesh.position.clone(),
      initialScale: mesh.scaling.clone(),
      initialRecipe: recipe ? JSON.parse(JSON.stringify(recipe)) : null,
      lastAppliedDeltaMm: 0,
    };
    this.detachCameraTemporary();
  }

  private updatePushPullDrag(): void {
    const drag = this.pushPullDrag;
    if (!drag || drag.mesh.isDisposed()) return;

    const camPos = this.service.camera?.position || new Vector3(0, 5, -10);
    const toCam = camPos.subtract(drag.startRayPoint);
    let tangent = Vector3.Cross(drag.worldNormal, toCam);
    if (tangent.lengthSquared() < 1e-5) tangent = new Vector3(1, 0, 0);
    const planeNormal = Vector3.Cross(tangent, drag.worldNormal).normalize();
    const dragPlane = Plane.FromPositionAndNormal(drag.startRayPoint, planeNormal);
    const hit = this.intersectPointerWithPlane(dragPlane);
    if (!hit) return;

    const deltaWorld = Vector3.Dot(hit.subtract(drag.startRayPoint), drag.worldNormal);
    let deltaMm = worldToMm(deltaWorld, this.profileId);
    if (this.snapMm > 0) {
      deltaMm = this.snapValueMm(deltaMm);
    }
    if (Math.abs(deltaMm - drag.lastAppliedDeltaMm) < 0.05) return;
    drag.lastAppliedDeltaMm = deltaMm;

    this.applyPushPullDelta(drag, deltaMm);
  }

  private applyPushPullDelta(drag: PushPullDragState, rawDeltaMm: number): void {
    const axisKey: 'width' | 'height' | 'depth' =
      drag.faceDir === 'left' || drag.faceDir === 'right'
        ? 'width'
        : drag.faceDir === 'top' || drag.faceDir === 'bottom'
          ? 'height'
          : 'depth';

    const origSpanMm = drag.initialDims[axisKey];
    const nextSpanMm = Math.max(1, roundMm(origSpanMm + rawDeltaMm, 2));
    const clampedDeltaMm = nextSpanMm - origSpanMm;
    const shiftWorld = mmToWorld(clampedDeltaMm * 0.5, this.profileId);

    if (drag.initialRecipe) {
      const nextRecipe: MiniCadRecipe = JSON.parse(JSON.stringify(drag.initialRecipe));
      nextRecipe.dimensionsMm[axisKey] = nextSpanMm;
      buildMeshFromMiniCadRecipe(drag.mesh.name, nextRecipe, this.service.scene, drag.mesh);
      drag.mesh.position.copyFrom(drag.initialPos.add(drag.worldNormal.scale(shiftWorld)));
    } else {
      const ratio = nextSpanMm / Math.max(0.1, origSpanMm);
      drag.mesh.scaling.copyFrom(drag.initialScale);
      if (axisKey === 'width') drag.mesh.scaling.x *= ratio;
      else if (axisKey === 'height') drag.mesh.scaling.y *= ratio;
      else drag.mesh.scaling.z *= ratio;
      drag.mesh.position.copyFrom(drag.initialPos.add(drag.worldNormal.scale(shiftWorld)));
    }

    drag.mesh.computeWorldMatrix(true);
    drag.mesh.refreshBoundingInfo();
    const sign = clampedDeltaMm >= 0 ? '+' : '';
    this.lastLiveActionLabel = `Push/Pull ${drag.faceDir.toUpperCase()}: ${sign}${roundMm(clampedDeltaMm, 1)} mm → ${roundMm(nextSpanMm, 1)} mm`;
    this.refreshGuidesAndHud();
  }

  private finishPushPullDrag(): void {
    const drag = this.pushPullDrag;
    this.pushPullDrag = null;
    this.reattachCameraAfterDrag();
    if (!drag || drag.mesh.isDisposed()) return;

    if (Math.abs(drag.lastAppliedDeltaMm) >= 0.1) {
      const mesh = drag.mesh;
      const beforePos = drag.initialPos.clone();
      const beforeScale = drag.initialScale.clone();
      const beforeRecipe = drag.initialRecipe ? JSON.parse(JSON.stringify(drag.initialRecipe)) : null;
      const afterPos = mesh.position.clone();
      const afterScale = mesh.scaling.clone();
      const afterRecipe = getMiniCadRecipe(mesh) ? JSON.parse(JSON.stringify(getMiniCadRecipe(mesh))) : null;

      this.service.recordAction({
        name: `MiniCAD Push/Pull ${drag.faceDir} on "${mesh.name}"`,
        undo: () => {
          if (mesh.isDisposed()) return;
          if (beforeRecipe) {
            buildMeshFromMiniCadRecipe(mesh.name, beforeRecipe, this.service.scene, mesh);
          } else {
            mesh.scaling.copyFrom(beforeScale);
          }
          mesh.position.copyFrom(beforePos);
          mesh.computeWorldMatrix(true);
          this.refreshGuidesAndHud();
        },
        redo: () => {
          if (mesh.isDisposed()) return;
          if (afterRecipe) {
            buildMeshFromMiniCadRecipe(mesh.name, afterRecipe, this.service.scene, mesh);
          } else {
            mesh.scaling.copyFrom(afterScale);
          }
          mesh.position.copyFrom(afterPos);
          mesh.computeWorldMatrix(true);
          this.refreshGuidesAndHud();
        },
      });
      this.service.updateStats();
      this.service.events.onSceneModified?.();
    }
    this.refreshGuidesAndHud();
  }

  /**
   * Places a new parametric CAD part flush onto a picked mesh face or the ground grid.
   */
  public placePartAtPointer(shape: MiniCadShapeKind, facePick: MiniCadFacePickResult | null): Mesh | null {
    const profile = this.getProfile();
    const wMm = profile.defaultSizeMm.width;
    const hMm = profile.defaultSizeMm.height;
    const dMm = shape === 'cylinder' ? wMm : profile.defaultSizeMm.depth;

    let posMm = { x: 0, y: hMm * 0.5, z: 0 };
    if (facePick) {
      const n = new Vector3(...facePick.worldNormal);
      const spanAlongN =
        facePick.faceDir === 'left' || facePick.faceDir === 'right'
          ? wMm
          : facePick.faceDir === 'top' || facePick.faceDir === 'bottom'
            ? hMm
            : dMm;
      const snappedX = this.snapValueMm(worldToMm(facePick.worldPoint[0], this.profileId));
      const snappedY = this.snapValueMm(worldToMm(facePick.worldPoint[1], this.profileId));
      const snappedZ = this.snapValueMm(worldToMm(facePick.worldPoint[2], this.profileId));
      posMm = {
        x: snappedX + n.x * spanAlongN * 0.5,
        y: snappedY + n.y * spanAlongN * 0.5,
        z: snappedZ + n.z * spanAlongN * 0.5,
      };
    } else {
      const groundPick = this.service.scene.pick(
        this.service.scene.pointerX,
        this.service.scene.pointerY,
        (m) => m === this.service.gridMesh
      );
      if (groundPick?.hit && groundPick.pickedPoint) {
        posMm = {
          x: this.snapValueMm(worldToMm(groundPick.pickedPoint.x, this.profileId)),
          y: hMm * 0.5,
          z: this.snapValueMm(worldToMm(groundPick.pickedPoint.z, this.profileId)),
        };
      }
    }

    const mesh = this.createPart({
      shape,
      widthMm: wMm,
      heightMm: hMm,
      depthMm: dMm,
      positionMm: posMm,
      groundToFloor: false,
      color: this.defaultColor,
    });
    this.interactionMode = 'select';
    this.lastLiveActionLabel = `Placed ${shape} (${wMm}×${hMm}×${dMm} mm)`;
    this.refreshGuidesAndHud();
    this.onStateChanged?.();
    return mesh;
  }

  /**
   * Punches a non-destructive hardware hole (or 2x2 symmetric corner pattern) at the picked face.
   */
  public punchHoleAtFacePick(facePick: MiniCadFacePickResult): Mesh | null {
    const mesh = facePick.mesh as Mesh;
    const preset = MINICAD_HOLE_PRESETS[this.holePresetId] || MINICAD_HOLE_PRESETS.m3;
    const dims = this.getMeshDimensionsMm(mesh);
    const basis = getFaceBasis(facePick.faceDir, dims);

    let offsetUMm = this.snapValueMm(facePick.offsetUMm);
    let offsetVMm = this.snapValueMm(facePick.offsetVMm);
    let pattern: MiniCadHoleFeature['pattern'] | undefined;

    if (this.holeSymmetricCorners) {
      const inset = Math.max(2, this.holeCornerInsetMm);
      const spacingU = Math.max(4, roundMm(basis.faceWidthMm - inset * 2, 1));
      const spacingV = Math.max(4, roundMm(basis.faceHeightMm - inset * 2, 1));
      offsetUMm = 0;
      offsetVMm = 0;
      pattern = { cols: 2, rows: 2, spacingUMm: spacingU, spacingVMm: spacingV };
    } else if (Math.abs(offsetUMm) <= this.snapMm) {
      offsetUMm = 0;
    }
    if (!this.holeSymmetricCorners && Math.abs(offsetVMm) <= this.snapMm) {
      offsetVMm = 0;
    }

    const feat: MiniCadHoleFeature = {
      id: `hole_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
      kind: 'hole',
      label: this.holeSymmetricCorners ? `${preset.label} (2×2 Corners)` : preset.label,
      preset: preset.id,
      shape: preset.shape,
      face: facePick.faceDir,
      offsetUMm,
      offsetVMm,
      diameterMm: preset.diameterMm,
      widthMm: preset.widthMm,
      depthMm: this.holeDepthMm,
      throughAll: this.holeThroughAll,
      headDiameterMm: preset.headDiameterMm,
      headDepthMm: preset.headDepthMm,
      pattern,
    };

    return this.addFeatureToMesh(mesh, feat);
  }

  /**
   * Creates a parametric CAD part and adds it to the scene with full Undo/Redo support.
   */
  public createPart(opts: MiniCadCreatePartOptions): Mesh {
    const profile = this.getProfile();
    const widthMm = Math.max(1, opts.widthMm ?? profile.defaultSizeMm.width);
    const heightMm = Math.max(1, opts.heightMm ?? profile.defaultSizeMm.height);
    const depthMm = Math.max(1, opts.depthMm ?? profile.defaultSizeMm.depth);
    const wallMm = opts.wallThicknessMm ?? profile.defaultWallMm;

    const features: MiniCadFeatureOp[] = [];
    if (opts.shellWallMm && opts.shellWallMm > 0) {
      features.push({
        id: `shell_${Date.now().toString(36)}`,
        kind: 'shell',
        label: `Shell (${opts.shellWallMm} mm)`,
        wallThicknessMm: opts.shellWallMm,
        openFace: opts.shellOpenFace ?? 'top',
      });
    }
    if (opts.bevelWidthMm && opts.bevelWidthMm > 0) {
      features.push({
        id: `bevel_${Date.now().toString(36)}`,
        kind: 'bevel',
        label: `Bevel (${opts.bevelWidthMm} mm)`,
        widthMm: opts.bevelWidthMm,
        segments: opts.bevelSegments ?? 2,
        angleThresholdDeg: 30,
      });
    }

    const recipe: MiniCadRecipe = {
      version: 1,
      profileId: this.profileId,
      baseShape: opts.shape,
      dimensionsMm: {
        width: widthMm,
        height: heightMm,
        depth: depthMm,
        wallThickness: wallMm,
        innerDiameter: opts.innerDiameterMm,
        cornerRadius: opts.cornerRadiusMm ?? (opts.shape === 'rounded_box' ? 3 : opts.shape === 'plate' ? 2 : 0),
      },
      features,
      color: opts.color || this.defaultColor,
    };

    const rawName = (opts.name || `CAD_${opts.shape}`).replace(/\s+/g, '_');
    const uniqueName = this.service.importedMeshes.some((m) => m.name === rawName)
      ? `${rawName}_${Date.now().toString().slice(-4)}`
      : rawName;

    const mesh = buildMeshFromMiniCadRecipe(uniqueName, recipe, this.service.scene);

    if (opts.positionMm) {
      mesh.position.set(
        mmToWorld(opts.positionMm.x, this.profileId),
        mmToWorld(opts.positionMm.y, this.profileId),
        mmToWorld(opts.positionMm.z, this.profileId)
      );
    } else if (opts.groundToFloor !== false) {
      mesh.position.set(0, mmToWorld(heightMm * 0.5, this.profileId), 0);
    }
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();

    const prevSelected = [...this.service.selectedNodes];
    this.service.importedMeshes.push(mesh);
    this.service.selectMesh(mesh);

    this.service.recordAction({
      name: `MiniCAD Create "${uniqueName}"`,
      undo: () => {
        if (!mesh.isDisposed()) mesh.setEnabled(false);
        const idx = this.service.importedMeshes.indexOf(mesh);
        if (idx !== -1) this.service.importedMeshes.splice(idx, 1);
        this.service.selectNodes(prevSelected.filter((n) => !n.isDisposed()));
        this.refreshGuidesAndHud();
      },
      redo: () => {
        if (!mesh.isDisposed()) {
          mesh.setEnabled(true);
          if (!this.service.importedMeshes.includes(mesh)) {
            this.service.importedMeshes.push(mesh);
          }
          this.service.selectMesh(mesh);
          this.refreshGuidesAndHud();
        }
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
    this.refreshGuidesAndHud();
    return mesh;
  }

  /**
   * Creates 1-click multi-part parametric starter assemblies for 3D printing, woodwork, or mechanics.
   */
  public createStarterTemplate(templateId: MiniCadStarterTemplateId): Mesh[] {
    const created: Mesh[] = [];
    if (templateId === 'enclosure') {
      this.setProfile('3d_print');
      const base = this.createPart({
        name: 'Enclosure_Base',
        shape: 'rounded_box',
        widthMm: 80,
        heightMm: 30,
        depthMm: 50,
        cornerRadiusMm: 4,
        shellWallMm: 2.5,
        shellOpenFace: 'top',
        color: '#3b82f6',
      });
      this.addFeatureToMesh(base, {
        id: `cable_${Date.now().toString(36)}`,
        kind: 'hole',
        label: 'Cable Port (12 mm)',
        preset: 'cable_pass',
        shape: 'cylinder',
        face: 'front',
        offsetUMm: 0,
        offsetVMm: 2,
        diameterMm: 12,
        depthMm: 8,
        throughAll: false,
      });
      const lid = this.createPart({
        name: 'Enclosure_Lid',
        shape: 'rounded_box',
        widthMm: 80,
        heightMm: 4,
        depthMm: 50,
        cornerRadiusMm: 4,
        positionMm: { x: 95, y: 2, z: 0 },
        color: '#60a5fa',
      });
      this.addFeatureToMesh(lid, {
        id: `lid_holes_${Date.now().toString(36)}`,
        kind: 'hole',
        label: 'M3 Corner Mounts',
        preset: 'countersunk_m3',
        shape: 'countersunk',
        face: 'top',
        offsetUMm: 0,
        offsetVMm: 0,
        diameterMm: 3.2,
        headDiameterMm: 6.2,
        headDepthMm: 2.0,
        depthMm: 6,
        throughAll: true,
        pattern: { cols: 2, rows: 2, spacingUMm: 68, spacingVMm: 38 },
      });
      created.push(base, lid);
      this.service.selectMesh(base);
    } else if (templateId === 'bracket') {
      this.setProfile('mechanics');
      const bracket = this.createPart({
        name: 'Mounting_Bracket',
        shape: 'l_bracket',
        widthMm: 50,
        heightMm: 40,
        depthMm: 35,
        wallThicknessMm: 4,
        color: '#64748b',
      });
      this.addFeatureToMesh(bracket, {
        id: `m4_base_${Date.now().toString(36)}`,
        kind: 'hole',
        label: 'M4 Base Mounts',
        preset: 'm4',
        shape: 'cylinder',
        face: 'bottom',
        offsetUMm: 0,
        offsetVMm: -4,
        diameterMm: 4.3,
        depthMm: 10,
        throughAll: false,
        pattern: { cols: 2, rows: 1, spacingUMm: 30, spacingVMm: 0 },
      });
      this.addFeatureToMesh(bracket, {
        id: `m4_wall_${Date.now().toString(36)}`,
        kind: 'hole',
        label: 'M4 Wall Mounts',
        preset: 'm4',
        shape: 'cylinder',
        face: 'back',
        offsetUMm: 0,
        offsetVMm: 5,
        diameterMm: 4.3,
        depthMm: 10,
        throughAll: false,
        pattern: { cols: 2, rows: 1, spacingUMm: 30, spacingVMm: 0 },
      });
      created.push(bracket);
    } else if (templateId === 'shelf_unit') {
      this.setProfile('woodwork');
      const t = 18;
      const w = 600;
      const h = 400;
      const d = 280;
      const leftSide = this.createPart({
        name: 'Shelf_Side_Left',
        shape: 'box',
        widthMm: t,
        heightMm: h,
        depthMm: d,
        positionMm: { x: -w * 0.5 + t * 0.5, y: h * 0.5, z: 0 },
        color: '#b45309',
      });
      const rightSide = this.createPart({
        name: 'Shelf_Side_Right',
        shape: 'box',
        widthMm: t,
        heightMm: h,
        depthMm: d,
        positionMm: { x: w * 0.5 - t * 0.5, y: h * 0.5, z: 0 },
        color: '#b45309',
      });
      const topBoard = this.createPart({
        name: 'Shelf_Top',
        shape: 'box',
        widthMm: w - t * 2,
        heightMm: t,
        depthMm: d,
        positionMm: { x: 0, y: h - t * 0.5, z: 0 },
        color: '#d97706',
      });
      const bottomBoard = this.createPart({
        name: 'Shelf_Bottom',
        shape: 'box',
        widthMm: w - t * 2,
        heightMm: t,
        depthMm: d,
        positionMm: { x: 0, y: t * 0.5, z: 0 },
        color: '#d97706',
      });
      created.push(leftSide, rightSide, topBoard, bottomBoard);
      this.service.selectMesh(topBoard);
    } else {
      this.setProfile('3d_print');
      const spacer = this.createPart({
        name: 'Spacer_Hub',
        shape: 'tube',
        widthMm: 32,
        heightMm: 16,
        depthMm: 32,
        innerDiameterMm: 10,
        bevelWidthMm: 0.6,
        bevelSegments: 2,
        color: '#10b981',
      });
      created.push(spacer);
    }

    this.refreshGuidesAndHud();
    return created;
  }

  public getMeshDimensionsMm(mesh: Mesh): MiniCadDimensionsMm {
    const recipe = getMiniCadRecipe(mesh);
    if (recipe) {
      return { ...recipe.dimensionsMm };
    }
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const size = mesh.getBoundingInfo().boundingBox.maximumWorld.subtract(
      mesh.getBoundingInfo().boundingBox.minimumWorld
    );
    return {
      width: Math.max(0.5, roundMm(worldToMm(size.x, this.profileId), 2)),
      height: Math.max(0.5, roundMm(worldToMm(size.y, this.profileId), 2)),
      depth: Math.max(0.5, roundMm(worldToMm(size.z, this.profileId), 2)),
    };
  }

  /**
   * Ensures a mesh has a MiniCadRecipe (converts simple meshes if needed) and applies a recipe mutation with Undo/Redo.
   */
  public applyRecipeMutation(
    mesh: Mesh,
    actionLabel: string,
    mutator: (recipe: MiniCadRecipe) => void
  ): Mesh {
    const existing = getMiniCadRecipe(mesh);
    const beforeSnapshot = existing
      ? JSON.parse(JSON.stringify(existing))
      : null;
    const beforeVertexData = !existing ? VertexData.ExtractFromMesh(mesh, true) : null;
    const beforePos = mesh.position.clone();
    const beforeScale = mesh.scaling.clone();

    const workingRecipe: MiniCadRecipe = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          version: 1,
          profileId: this.profileId,
          baseShape: 'box',
          dimensionsMm: this.getMeshDimensionsMm(mesh),
          features: [],
        };

    mutator(workingRecipe);
    buildMeshFromMiniCadRecipe(mesh.name, workingRecipe, this.service.scene, mesh);

    // Keep bottom anchored if height changed and object was sitting near Y=0
    if (beforeSnapshot) {
      const oldH = beforeSnapshot.dimensionsMm.height;
      const newH = workingRecipe.dimensionsMm.height;
      if (Math.abs(oldH - newH) > 1e-4) {
        const halfDeltaY = mmToWorld((newH - oldH) * 0.5, workingRecipe.profileId);
        mesh.position.y += halfDeltaY;
      }
    }
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();

    const afterSnapshot: MiniCadRecipe = JSON.parse(JSON.stringify(workingRecipe));
    const afterPos = mesh.position.clone();

    this.service.recordAction({
      name: actionLabel,
      undo: () => {
        if (mesh.isDisposed()) return;
        if (beforeSnapshot) {
          buildMeshFromMiniCadRecipe(mesh.name, beforeSnapshot, this.service.scene, mesh);
        } else if (beforeVertexData) {
          beforeVertexData.applyToMesh(mesh, true);
          mesh.scaling.copyFrom(beforeScale);
          if (mesh.metadata) delete mesh.metadata.miniCadRecipe;
        }
        mesh.position.copyFrom(beforePos);
        mesh.computeWorldMatrix(true);
        this.refreshGuidesAndHud();
      },
      redo: () => {
        if (mesh.isDisposed()) return;
        buildMeshFromMiniCadRecipe(mesh.name, afterSnapshot, this.service.scene, mesh);
        mesh.position.copyFrom(afterPos);
        mesh.computeWorldMatrix(true);
        this.refreshGuidesAndHud();
      },
    });

    this.service.updateStats();
    this.service.events.onSceneModified?.();
    this.refreshGuidesAndHud();
    return mesh;
  }

  public updateSelectedDimensions(dims: Partial<MiniCadDimensionsMm>): Mesh | null {
    const mesh = this.service.selectedMesh;
    if (!mesh || this.service.isEditorHelper(mesh)) return null;
    return this.applyRecipeMutation(mesh, `MiniCAD Resize "${mesh.name}"`, (recipe) => {
      if (dims.width !== undefined && dims.width > 0) recipe.dimensionsMm.width = roundMm(dims.width, 2);
      if (dims.height !== undefined && dims.height > 0) recipe.dimensionsMm.height = roundMm(dims.height, 2);
      if (dims.depth !== undefined && dims.depth > 0) recipe.dimensionsMm.depth = roundMm(dims.depth, 2);
      if (dims.cornerRadius !== undefined && dims.cornerRadius >= 0) {
        recipe.dimensionsMm.cornerRadius = roundMm(dims.cornerRadius, 2);
      }
      if (dims.innerDiameter !== undefined && dims.innerDiameter > 0) {
        recipe.dimensionsMm.innerDiameter = roundMm(dims.innerDiameter, 2);
      }
      if (dims.wallThickness !== undefined && dims.wallThickness > 0) {
        recipe.dimensionsMm.wallThickness = roundMm(dims.wallThickness, 2);
      }
    });
  }

  public setShellOnMesh(
    mesh: Mesh,
    wallThicknessMm: number,
    openFace: MiniCadFaceDir | 'none' = 'top'
  ): Mesh {
    return this.applyRecipeMutation(mesh, `MiniCAD Shell "${mesh.name}"`, (recipe) => {
      const existing = recipe.features.find((f) => f.kind === 'shell');
      if (wallThicknessMm <= 0) {
        recipe.features = recipe.features.filter((f) => f.kind !== 'shell');
        return;
      }
      if (existing && existing.kind === 'shell') {
        existing.wallThicknessMm = roundMm(wallThicknessMm, 2);
        existing.openFace = openFace;
        existing.label = `Shell (${existing.wallThicknessMm} mm, open ${openFace})`;
      } else {
        recipe.features.unshift({
          id: `shell_${Date.now().toString(36)}`,
          kind: 'shell',
          label: `Shell (${roundMm(wallThicknessMm, 2)} mm, open ${openFace})`,
          wallThicknessMm: roundMm(wallThicknessMm, 2),
          openFace,
        });
      }
    });
  }

  public setBevelOnMesh(
    mesh: Mesh,
    widthMm: number,
    segments: number = 2,
    angleThresholdDeg: number = 30
  ): Mesh {
    return this.applyRecipeMutation(mesh, `MiniCAD Bevel "${mesh.name}"`, (recipe) => {
      if (widthMm <= 0) {
        recipe.features = recipe.features.filter((f) => f.kind !== 'bevel');
        return;
      }
      const existing = recipe.features.find((f) => f.kind === 'bevel');
      if (existing && existing.kind === 'bevel') {
        existing.widthMm = roundMm(widthMm, 2);
        existing.segments = segments;
        existing.angleThresholdDeg = angleThresholdDeg;
        existing.label = `Bevel (${existing.widthMm} mm)`;
      } else {
        recipe.features.push({
          id: `bevel_${Date.now().toString(36)}`,
          kind: 'bevel',
          label: `Bevel (${roundMm(widthMm, 2)} mm)`,
          widthMm: roundMm(widthMm, 2),
          segments,
          angleThresholdDeg,
        });
      }
    });
  }

  public addFeatureToMesh(mesh: Mesh, feature: MiniCadFeatureOp): Mesh {
    return this.applyRecipeMutation(
      mesh,
      `MiniCAD Add ${feature.kind} on "${mesh.name}"`,
      (recipe) => {
        recipe.features.push(feature);
      }
    );
  }

  public removeFeatureFromMesh(mesh: Mesh, featureId: string): Mesh {
    return this.applyRecipeMutation(mesh, `MiniCAD Remove Feature on "${mesh.name}"`, (recipe) => {
      recipe.features = recipe.features.filter((f) => f.id !== featureId);
    });
  }

  public bakeMeshToStatic(mesh: Mesh): boolean {
    if (!mesh || mesh.isDisposed() || !mesh.metadata?.miniCadRecipe) return false;
    const prevRecipe = JSON.parse(JSON.stringify(mesh.metadata.miniCadRecipe));
    delete mesh.metadata.miniCadRecipe;
    this.service.recordAction({
      name: `MiniCAD Bake "${mesh.name}"`,
      undo: () => {
        if (!mesh.isDisposed()) {
          mesh.metadata = { ...(mesh.metadata || {}), miniCadRecipe: prevRecipe };
          this.refreshGuidesAndHud();
        }
      },
      redo: () => {
        if (!mesh.isDisposed() && mesh.metadata) {
          delete mesh.metadata.miniCadRecipe;
          this.refreshGuidesAndHud();
        }
      },
    });
    this.refreshGuidesAndHud();
    return true;
  }

  public dropMeshToFloor(mesh: Mesh): void {
    if (!mesh || mesh.isDisposed()) return;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
    if (Math.abs(minY) < 1e-5) return;
    const beforePos = mesh.position.clone();
    mesh.position.y -= minY;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const afterPos = mesh.position.clone();

    this.service.recordAction({
      name: `MiniCAD Drop "${mesh.name}" to Floor`,
      undo: () => {
        if (!mesh.isDisposed()) {
          mesh.position.copyFrom(beforePos);
          mesh.computeWorldMatrix(true);
          this.refreshGuidesAndHud();
        }
      },
      redo: () => {
        if (!mesh.isDisposed()) {
          mesh.position.copyFrom(afterPos);
          mesh.computeWorldMatrix(true);
          this.refreshGuidesAndHud();
        }
      },
    });
    this.service.events.onSceneModified?.();
    this.refreshGuidesAndHud();
  }

  /**
   * Aligns or spaces targetMesh relative to anchorMesh with exact millimeter precision.
   */
  public alignMeshes(
    targetMesh: Mesh,
    anchorMesh: Mesh,
    action: MiniCadAlignAction,
    gapMm: number = 0
  ): { deltaMm: [number, number, number] } {
    targetMesh.computeWorldMatrix(true);
    targetMesh.refreshBoundingInfo();
    anchorMesh.computeWorldMatrix(true);
    anchorMesh.refreshBoundingInfo();

    const tBB = targetMesh.getBoundingInfo().boundingBox;
    const aBB = anchorMesh.getBoundingInfo().boundingBox;
    const beforePos = targetMesh.position.clone();
    const gapWorld = mmToWorld(gapMm, this.profileId);

    switch (action) {
      case 'center_x':
        targetMesh.position.x += aBB.centerWorld.x - tBB.centerWorld.x;
        break;
      case 'center_z':
        targetMesh.position.z += aBB.centerWorld.z - tBB.centerWorld.z;
        break;
      case 'center_xz':
        targetMesh.position.x += aBB.centerWorld.x - tBB.centerWorld.x;
        targetMesh.position.z += aBB.centerWorld.z - tBB.centerWorld.z;
        break;
      case 'flush_left':
        targetMesh.position.x += aBB.minimumWorld.x - tBB.minimumWorld.x;
        break;
      case 'flush_right':
        targetMesh.position.x += aBB.maximumWorld.x - tBB.maximumWorld.x;
        break;
      case 'flush_front':
        targetMesh.position.z += aBB.maximumWorld.z - tBB.maximumWorld.z;
        break;
      case 'flush_back':
        targetMesh.position.z += aBB.minimumWorld.z - tBB.minimumWorld.z;
        break;
      case 'flush_bottom':
        targetMesh.position.y += aBB.minimumWorld.y - tBB.minimumWorld.y;
        break;
      case 'stack_on_top':
        targetMesh.position.y += aBB.maximumWorld.y - tBB.minimumWorld.y + gapWorld;
        break;
      case 'gap_x': {
        if (tBB.centerWorld.x >= aBB.centerWorld.x) {
          targetMesh.position.x += aBB.maximumWorld.x + gapWorld - tBB.minimumWorld.x;
        } else {
          targetMesh.position.x += aBB.minimumWorld.x - gapWorld - tBB.maximumWorld.x;
        }
        break;
      }
      case 'gap_y': {
        if (tBB.centerWorld.y >= aBB.centerWorld.y) {
          targetMesh.position.y += aBB.maximumWorld.y + gapWorld - tBB.minimumWorld.y;
        } else {
          targetMesh.position.y += aBB.minimumWorld.y - gapWorld - tBB.maximumWorld.y;
        }
        break;
      }
      case 'gap_z': {
        if (tBB.centerWorld.z >= aBB.centerWorld.z) {
          targetMesh.position.z += aBB.maximumWorld.z + gapWorld - tBB.minimumWorld.z;
        } else {
          targetMesh.position.z += aBB.minimumWorld.z - gapWorld - tBB.maximumWorld.z;
        }
        break;
      }
    }

    targetMesh.computeWorldMatrix(true);
    targetMesh.refreshBoundingInfo();
    const afterPos = targetMesh.position.clone();
    const delta = afterPos.subtract(beforePos);

    if (delta.lengthSquared() > 1e-7) {
      this.service.recordAction({
        name: `MiniCAD Align (${action}) "${targetMesh.name}"`,
        undo: () => {
          if (!targetMesh.isDisposed()) {
            targetMesh.position.copyFrom(beforePos);
            targetMesh.computeWorldMatrix(true);
            this.refreshGuidesAndHud();
          }
        },
        redo: () => {
          if (!targetMesh.isDisposed()) {
            targetMesh.position.copyFrom(afterPos);
            targetMesh.computeWorldMatrix(true);
            this.refreshGuidesAndHud();
          }
        },
      });
      this.service.events.onSceneModified?.();
    }

    this.refreshGuidesAndHud();
    return {
      deltaMm: [
        roundMm(worldToMm(delta.x, this.profileId), 2),
        roundMm(worldToMm(delta.y, this.profileId), 2),
        roundMm(worldToMm(delta.z, this.profileId), 2),
      ],
    };
  }

  /**
   * Computes Figma-style alignment & gap guides from the selected mesh to its nearest sibling.
   */
  public computeSmartGuides(mesh: Mesh | null | undefined): MiniCadSmartGuide[] {
    if (!mesh || mesh.isDisposed()) return [];
    const siblings = this.getValidSceneMeshes(mesh);
    if (siblings.length === 0) return [];

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const mBB = mesh.getBoundingInfo().boundingBox;

    // Pick nearest sibling by center-to-center distance
    let nearest: Mesh | null = null;
    let bestDist = Infinity;
    for (const s of siblings) {
      s.computeWorldMatrix(true);
      s.refreshBoundingInfo();
      const d = Vector3.Distance(mBB.centerWorld, s.getBoundingInfo().boundingBox.centerWorld);
      if (d < bestDist) {
        bestDist = d;
        nearest = s;
      }
    }
    if (!nearest) return [];

    const sBB = nearest.getBoundingInfo().boundingBox;
    const guides: MiniCadSmartGuide[] = [];
    const tolWorld = mmToWorld(0.25, this.profileId);

    // X axis relation
    if (Math.abs(mBB.centerWorld.x - sBB.centerWorld.x) <= tolWorld) {
      guides.push({
        id: 'guide_x_center',
        axis: 'x',
        kind: 'center',
        label: 'Centered X',
        distanceMm: 0,
        fromWorld: [sBB.centerWorld.x, mBB.centerWorld.y, mBB.centerWorld.z],
        toWorld: [sBB.centerWorld.x, sBB.centerWorld.y, sBB.centerWorld.z],
        referenceMeshName: nearest.name,
      });
    } else if (mBB.minimumWorld.x >= sBB.maximumWorld.x - tolWorld) {
      const gap = Math.max(0, roundMm(worldToMm(mBB.minimumWorld.x - sBB.maximumWorld.x, this.profileId), 1));
      guides.push({
        id: 'guide_x_gap',
        axis: 'x',
        kind: 'distance',
        label: `Gap X: ${gap} mm`,
        distanceMm: gap,
        fromWorld: [sBB.maximumWorld.x, mBB.centerWorld.y, mBB.centerWorld.z],
        toWorld: [mBB.minimumWorld.x, mBB.centerWorld.y, mBB.centerWorld.z],
        referenceMeshName: nearest.name,
      });
    } else if (sBB.minimumWorld.x >= mBB.maximumWorld.x - tolWorld) {
      const gap = Math.max(0, roundMm(worldToMm(sBB.minimumWorld.x - mBB.maximumWorld.x, this.profileId), 1));
      guides.push({
        id: 'guide_x_gap',
        axis: 'x',
        kind: 'distance',
        label: `Gap X: ${gap} mm`,
        distanceMm: gap,
        fromWorld: [mBB.maximumWorld.x, mBB.centerWorld.y, mBB.centerWorld.z],
        toWorld: [sBB.minimumWorld.x, mBB.centerWorld.y, mBB.centerWorld.z],
        referenceMeshName: nearest.name,
      });
    }

    // Z axis relation
    if (Math.abs(mBB.centerWorld.z - sBB.centerWorld.z) <= tolWorld) {
      guides.push({
        id: 'guide_z_center',
        axis: 'z',
        kind: 'center',
        label: 'Centered Z',
        distanceMm: 0,
        fromWorld: [mBB.centerWorld.x, mBB.centerWorld.y, sBB.centerWorld.z],
        toWorld: [sBB.centerWorld.x, sBB.centerWorld.y, sBB.centerWorld.z],
        referenceMeshName: nearest.name,
      });
    } else if (mBB.minimumWorld.z >= sBB.maximumWorld.z - tolWorld) {
      const gap = Math.max(0, roundMm(worldToMm(mBB.minimumWorld.z - sBB.maximumWorld.z, this.profileId), 1));
      guides.push({
        id: 'guide_z_gap',
        axis: 'z',
        kind: 'distance',
        label: `Gap Z: ${gap} mm`,
        distanceMm: gap,
        fromWorld: [mBB.centerWorld.x, mBB.centerWorld.y, sBB.maximumWorld.z],
        toWorld: [mBB.centerWorld.x, mBB.centerWorld.y, mBB.minimumWorld.z],
        referenceMeshName: nearest.name,
      });
    } else if (sBB.minimumWorld.z >= mBB.maximumWorld.z - tolWorld) {
      const gap = Math.max(0, roundMm(worldToMm(sBB.minimumWorld.z - mBB.maximumWorld.z, this.profileId), 1));
      guides.push({
        id: 'guide_z_gap',
        axis: 'z',
        kind: 'distance',
        label: `Gap Z: ${gap} mm`,
        distanceMm: gap,
        fromWorld: [mBB.centerWorld.x, mBB.centerWorld.y, mBB.maximumWorld.z],
        toWorld: [mBB.centerWorld.x, mBB.centerWorld.y, sBB.minimumWorld.z],
        referenceMeshName: nearest.name,
      });
    }

    // Y elevation gap
    if (mBB.minimumWorld.y >= sBB.maximumWorld.y - tolWorld) {
      const gapY = Math.max(0, roundMm(worldToMm(mBB.minimumWorld.y - sBB.maximumWorld.y, this.profileId), 1));
      guides.push({
        id: 'guide_y_gap',
        axis: 'y',
        kind: 'distance',
        label: gapY === 0 ? 'Flush Top' : `Gap Y: ${gapY} mm`,
        distanceMm: gapY,
        fromWorld: [mBB.centerWorld.x, sBB.maximumWorld.y, mBB.centerWorld.z],
        toWorld: [mBB.centerWorld.x, mBB.minimumWorld.y, mBB.centerWorld.z],
        referenceMeshName: nearest.name,
      });
    }

    return guides;
  }

  public refreshGuidesAndHud(): void {
    this.clearGuideLines();
    if (!this.isActive) {
      this.activeGuides = [];
      this.onHudRefresh?.();
      return;
    }

    const sel = this.service.selectedMesh;
    this.activeGuides = this.computeSmartGuides(sel);

    for (let i = 0; i < this.activeGuides.length; i++) {
      const g = this.activeGuides[i];
      const p0 = new Vector3(...g.fromWorld);
      const p1 = new Vector3(...g.toWorld);
      if (Vector3.Distance(p0, p1) < 1e-4) continue;
      const line = MeshBuilder.CreateLines(
        `minicad_guide_${i}`,
        { points: [p0, p1] },
        this.service.scene
      );
      line.color = g.kind === 'center' ? new Color3(0.95, 0.35, 0.85) : new Color3(0.2, 0.9, 1.0);
      line.isPickable = false;
      line.metadata = { isEditorHelper: true };
      this.guideLineMeshes.push(line);
    }

    this.onHudRefresh?.();
    this.onStateChanged?.();
  }

  public inspectSelectedPrintability(): MiniCadPrintabilityReport | null {
    const mesh = this.service.selectedMesh;
    if (!mesh || this.service.isEditorHelper(mesh)) return null;
    return inspectMeshPrintability(mesh, this.profileId);
  }

  public getWoodworkCutList(): MiniCadCutListItem[] {
    return generateCutList(this.getValidSceneMeshes(), this.profileId);
  }

  /**
   * Exports valid scene meshes (or selected mesh) as a binary STL scaled cleanly to true millimeters.
   */
  public exportStlInTrueMm(selectedOnly: boolean = false, filename: string = 'minicad_part'): Blob | null {
    const sourceMeshes = selectedOnly && this.service.selectedMesh
      ? [this.service.selectedMesh]
      : this.getValidSceneMeshes();
    if (sourceMeshes.length === 0) return null;

    const mmPerUnit = this.getProfile().mmPerUnit;
    const clones: Mesh[] = [];
    try {
      for (const m of sourceMeshes) {
        const clone = m.clone(`${m.name}_stl_mm`, null, true);
        if (!clone) continue;
        clone.computeWorldMatrix(true);
        clone.position.scaleInPlace(mmPerUnit);
        clone.scaling.scaleInPlace(mmPerUnit);
        clone.computeWorldMatrix(true);
        clones.push(clone);
      }
      if (clones.length === 0) return null;
      const stlData = STLExport.CreateSTL(clones, false, filename, true, true);
      return new Blob([stlData as any], { type: 'application/sla' });
    } finally {
      for (const c of clones) {
        if (!c.isDisposed()) c.dispose();
      }
    }
  }
}
