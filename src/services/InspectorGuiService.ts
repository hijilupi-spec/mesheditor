import { Color3, Material, Mesh, PBRMaterial, Quaternion, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import * as dat from 'dat.gui';
import type { PrimitiveShape } from '../types';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class InspectorGuiService {
  public guiScene!: dat.GUI;
  public guiMesh!: dat.GUI;
  public guiMaterial!: dat.GUI;
  public guiAnim!: dat.GUI;
  public guiTextures!: dat.GUI;
  public guiCreate!: dat.GUI;
  public guiCSG!: dat.GUI;
  public guiFacet!: dat.GUI;

  public sceneControllers: { [key: string]: dat.GUIController } = {};
  public meshControllers: { [key: string]: dat.GUIController } = {};
  public materialControllers: { [key: string]: dat.GUIController } = {};
  public isDraggingGuiSlider: boolean = false;
  public textureControllers: { [key: string]: dat.GUIController } = {};
  public csgControllers: { [key: string]: dat.GUIController } = {};
  public animControllers: { [key: string]: dat.GUIController } = {};
  public createControllers: { [key: string]: dat.GUIController } = {};
  public uvControllers: { [key: string]: dat.GUIController } = {};

  public meshParams = {
    name: '',
    visible: true,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    uniformScale: 1,
    showBoundingBox: false,
    snapToGround: () => this.app.service.snapSelectedToGround(),
    centerOrigin: () => this.app.service.centerSelectedPivot(),
    centerAllPivots: () => this.app.service.centerAllMeshPivots(),
    bakeTransform: () => this.app.service.bakeSelectedTransform(),
    separateLooseParts: () => this.app.service.separateSelectedLooseParts(),
    mergeMeshes: () => this.app.service.mergeSelectedMeshes(),
    separateSubmeshes: () => this.app.service.separateSelectedSubMeshes(),
    copyMesh: () => this.app.service.copySelected(),
    pasteMesh: () => this.app.service.pasteAtCursor(),
    duplicateMesh: () => this.app.service.duplicateSelectedMesh(),
    deleteMesh: () => this.app.service.deleteSelected(),
  };

  public materialParams = {
    submeshInfo: 'No Submesh',
    extractSubmesh: () => this.app.service.extractSelectedSubMesh(),
    deleteSubmesh: () => this.app.service.deleteSelectedSubMesh(),
    splitAllSubmeshes: () => this.app.service.splitAllSubMeshesOnSelected(),
    materialName: '',
    textureInfo: 'None',
    albedoColor: '#ffffff',
    emissiveColor: '#000000',
    roughness: 0.5,
    metallic: 0.0,
    alpha: 1.0,
    wireframe: false,
    backFaceCulling: false,
    textureAlpha: false,
    transparencyMode: 'Opaque',
    twoSided: true,
    alphaCutOff: 0.5,
    bumpInfo: 'None',
    bumpLevel: 1.0,
    invertNormalMapX: false,
    invertNormalMapY: false,
    useParallax: false,
    useParallaxOcclusion: false,
    parallaxScaleBias: 0.05,
    loadBumpTexture: () => this.app.triggerReplaceBumpTexture(),
    generateNormalFromDiffuse: () => {
      this.app.service.generateNormalMapFromActiveTexture();
      this.updateMaterialGUI();
    },
    removeBumpTexture: () => {
      this.app.service.removeBumpTextureFromSelectedMaterial();
      this.updateMaterialGUI();
    },
    replaceTexture: () => this.app.triggerReplaceTexture(),
    removeAlbedoTexture: () => {
      this.app.service.removeTextureFromSelectedMaterial();
      this.updateMaterialGUI();
    },
    newMaterial: () => this.app.service.createNewMaterialForSelected(),
  };

  public uvParams = {
    uScale: 1,
    vScale: 1,
    uOffset: 0,
    vOffset: 0,
    rotation: 0,
    wrapMode: 'Repeat',
    autoTriplanar: () => this.app.service.applyTriplanarUVs(this.uvParams.uScale, this.uvParams.vScale),
    planarTop: () => this.app.service.applyPlanarUVs('top', this.uvParams.uScale, this.uvParams.vScale),
    planarFront: () => this.app.service.applyPlanarUVs('front', this.uvParams.uScale, this.uvParams.vScale),
    planarSide: () => this.app.service.applyPlanarUVs('side', this.uvParams.uScale, this.uvParams.vScale),
    cylindrical: () => this.app.service.applyCylindricalUVs(this.uvParams.uScale, this.uvParams.vScale),
    bakeToMesh: () =>
      this.app.service.scaleMeshUVs(
        this.uvParams.uScale,
        this.uvParams.vScale,
        this.uvParams.uOffset,
        this.uvParams.vOffset
      ),
  };

  public createParams = {
    shape: 'Box' as PrimitiveShape,
    name: 'New_Mesh',
    size: 1.0,
    width: 1.0,
    height: 1.0,
    depth: 1.0,
    diameter: 1.0,
    thickness: 0.3,
    tessellation: 24,
    subdivisions: 2,
    polyType: '1: Octahedron (8)',
    color: '#4f8cf6',
    roughness: 0.4,
    metallic: 0.1,
    createNow: () => this.app.createPrimitiveMesh(),
    clickToPlace: () => this.app.startPrimitivePlacement(),
  };

  public csgParams = {
    targetMesh: 'None',
    toolMesh: 'None',
    keepToolMesh: false,
    useSelectedAsTarget: () => this.app.setCSGTargetFromSelected(),
    useSelectedAsTool: () => this.app.setCSGToolFromSelected(),
    swapTargetAndTool: () => this.app.swapCSGMeshes(),
    addCutterBox: () => this.app.addQuickCutter('Box'),
    addCutterCylinder: () => this.app.addQuickCutter('Cylinder'),
    addCutterSphere: () => this.app.addQuickCutter('Sphere'),
    subtract: () => this.app.performCSGOperation('subtract'),
    union: () => this.app.performCSGOperation('union'),
    intersect: () => this.app.performCSGOperation('intersect'),
  };

  public facetParams = {
    active: false,
    extrudeDist: 0.5,
    insetAmount: 0.25,
    thickness: 0.2,
    segments: 4,
    count: 3,
    extrudeNow: () => this.app.service.extrudeSelectedFacet(this.facetParams.extrudeDist),
    insetNow: () => this.app.service.insetSelectedFacet(this.facetParams.insetAmount),
    arcNow: () => this.app.service.arcSelectedFacet(this.facetParams.segments, this.facetParams.extrudeDist),
    knifeNow: () => this.app.service.knifeSplitFacet(),
    loopCutNow: () => this.app.service.loopCutSelectedFacet(),
    bevelNow: () => this.app.service.bevelSelectedFacet(this.facetParams.insetAmount),
    solidifyNow: () => this.app.service.solidifyMeshOrFacet(this.facetParams.thickness, true),
    arrayNow: () => this.app.service.arraySelectedFacetOrMesh(this.facetParams.count, this.facetParams.extrudeDist, 0, 0),
    cutThroughNow: () => this.app.service.cutThroughSelectedFacet(this.facetParams.extrudeDist),
    relaxNow: () => this.app.service.relaxSelectedFacet(),
    subdivideNow: () => this.app.service.subdivideSelectedFacet(),
    subDNow: () => this.app.service.subDSmoothMeshOrFacet(),
    deleteFacet: () => this.app.service.deleteSelectedFacet(),
    flipNormal: () => this.app.service.flipSelectedFacetNormal(),
  };

  public animParams = {
    clip: 'None',
    play: () => this.app.playAnimation(),
    pause: () => this.app.pauseAnimation(),
    stop: () => this.app.stopAnimation(),
    loop: true,
    speed: 1.0,
    frame: 0,
  };

  public textureParams = {
    detectedCount: 0,
    status: 'Ready',
    quality: 85,
    maxResolution: '1024',
    optimizeAll: () =>
      this.app.service.optimizeAllTexturesToWebP(this.textureParams.quality / 100, parseInt(this.textureParams.maxResolution, 10)),
  };

  constructor(private readonly app: MeshEditorAppHost) {}

  public dispose(): void {
    const destroyDatGui = (gui?: dat.GUI) => {
      if (!gui) return;
      const stopListeningRecursively = (g: any) => {
        if (Array.isArray(g.__listening)) {
          g.__listening.length = 0;
        }
        if (g.__folders && typeof g.__folders === 'object') {
          for (const sub of Object.values(g.__folders)) {
            stopListeningRecursively(sub);
          }
        }
      };
      stopListeningRecursively(gui);
      try {
        gui.destroy();
      } catch {
        // Ignore if DOM nodes were already removed
      }
    };
    destroyDatGui(this.guiScene);
    destroyDatGui(this.guiMesh);
    destroyDatGui(this.guiMaterial);
    destroyDatGui(this.guiAnim);
    destroyDatGui(this.guiTextures);
    destroyDatGui(this.guiCreate);
    destroyDatGui(this.guiCSG);
    destroyDatGui(this.guiFacet);
  }

  public initGUI(): void {
    // 1. Scene GUI
    const containerScene = document.getElementById('gui-scene-container') || document.getElementById('gui-container-scene');
    this.guiScene = new dat.GUI({ autoPlace: false, width: 280 });
    containerScene?.appendChild(this.guiScene.domElement);

    let pendingClearColor: string | null = null;
    this.sceneControllers['clearColor'] = this.guiScene
      .addColor(this.app.service.sceneParams, 'clearColor')
      .name('Background')
      .onChange((v: string) => {
        if (pendingClearColor === null) {
          pendingClearColor = this.app.service.scene.clearColor.toHexString().slice(0, 7);
        }
        this.isDraggingGuiSlider = true;
        this.app.service.setClearColor(v);
      })
      .onFinishChange((v: string) => {
        this.isDraggingGuiSlider = false;
        const prev = pendingClearColor;
        pendingClearColor = null;
        if (prev && prev.toLowerCase() !== v.toLowerCase()) {
          this.app.service.recordAction({
            name: 'Change Background Color',
            undo: () => this.app.service.setClearColor(prev),
            redo: () => this.app.service.setClearColor(v),
          });
        }
      });

    let pendingAmbient: number | null = null;
    this.sceneControllers['ambientLight'] = this.guiScene
      .add(this.app.service.sceneParams, 'ambientLight', 0.1, 3.0, 0.1)
      .name('Ambient Light')
      .onChange((v: number) => {
        if (pendingAmbient === null) {
          pendingAmbient = this.app.service.ambientLight ? this.app.service.ambientLight.intensity : v;
        }
        this.isDraggingGuiSlider = true;
        this.app.service.setAmbientIntensity(v);
      })
      .onFinishChange((v: number) => {
        this.isDraggingGuiSlider = false;
        const prev = pendingAmbient;
        pendingAmbient = null;
        if (prev !== null && Math.abs(prev - v) > 1e-4) {
          this.app.service.recordAction({
            name: 'Change Ambient Light',
            undo: () => this.app.service.setAmbientIntensity(prev),
            redo: () => this.app.service.setAmbientIntensity(v),
          });
        }
      });

    let pendingSun: number | null = null;
    this.sceneControllers['sunLight'] = this.guiScene
      .add(this.app.service.sceneParams, 'sunLight', 0.1, 4.0, 0.1)
      .name('Sun Light')
      .onChange((v: number) => {
        if (pendingSun === null) {
          pendingSun = this.app.service.sunLight ? this.app.service.sunLight.intensity : v;
        }
        this.isDraggingGuiSlider = true;
        this.app.service.setSunIntensity(v);
      })
      .onFinishChange((v: number) => {
        this.isDraggingGuiSlider = false;
        const prev = pendingSun;
        pendingSun = null;
        if (prev !== null && Math.abs(prev - v) > 1e-4) {
          this.app.service.recordAction({
            name: 'Change Sun Light',
            undo: () => this.app.service.setSunIntensity(prev),
            redo: () => this.app.service.setSunIntensity(v),
          });
        }
      });

    // 2. Mesh Properties GUI
    const containerMesh = document.getElementById('gui-mesh-container') || document.getElementById('gui-container-mesh');
    this.guiMesh = new dat.GUI({ autoPlace: false, width: 280 });
    containerMesh?.appendChild(this.guiMesh.domElement);

    this.meshControllers['name'] = this.guiMesh
      .add(this.meshParams, 'name')
      .name('Name')
      .listen()
      .onFinishChange((newName: string) => {
        const mesh = this.app.service.selectedMesh;
        const trimmed = (newName || '').trim();
        if (!mesh || !trimmed || mesh.name === trimmed) return;
        const prevName = mesh.name;
        mesh.name = trimmed;
        this.app.service.recordAction({
          name: `Rename "${prevName}" to "${trimmed}"`,
          undo: () => {
            if (!mesh.isDisposed()) mesh.name = prevName;
          },
          redo: () => {
            if (!mesh.isDisposed()) mesh.name = trimmed;
          },
        });
        this.app.service.events.onSceneModified?.();
      });

    this.meshControllers['visible'] = this.guiMesh
      .add(this.meshParams, 'visible')
      .name('Visible')
      .onChange((v: boolean) => {
        const mesh = this.app.service.selectedMesh;
        if (!mesh || mesh.isVisible === v) return;
        const prev = mesh.isVisible;
        mesh.isVisible = v;
        this.app.service.recordAction({
          name: `${v ? 'Show' : 'Hide'} "${mesh.name}"`,
          undo: () => {
            if (!mesh.isDisposed()) mesh.isVisible = prev;
          },
          redo: () => {
            if (!mesh.isDisposed()) mesh.isVisible = v;
          },
        });
        this.app.service.events.onSceneModified?.();
      });

    const fTransform = this.guiMesh.addFolder('Transform');
    let pendingMeshTransform: {
      mesh: Mesh;
      pos: Vector3;
      rot: Vector3;
      rotQuat: Quaternion | null;
      scale: Vector3;
    } | null = null;

    const capturePendingMeshTransform = () => {
      const mesh = this.app.service.selectedMesh;
      if (!mesh) return;
      if (!pendingMeshTransform || pendingMeshTransform.mesh !== mesh) {
        pendingMeshTransform = {
          mesh,
          pos: mesh.position.clone(),
          rot: mesh.rotation.clone(),
          rotQuat: mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null,
          scale: mesh.scaling.clone(),
        };
      }
      this.isDraggingGuiSlider = true;
    };

    const commitPendingMeshTransform = (label: string) => {
      this.isDraggingGuiSlider = false;
      const before = pendingMeshTransform;
      pendingMeshTransform = null;
      if (!before || before.mesh.isDisposed()) return;
      const mesh = before.mesh;
      const afterPos = mesh.position.clone();
      const afterRot = mesh.rotation.clone();
      const afterRotQuat = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;
      const afterScale = mesh.scaling.clone();

      const posChanged = Vector3.DistanceSquared(before.pos, afterPos) > 1e-10;
      const scaleChanged = Vector3.DistanceSquared(before.scale, afterScale) > 1e-10;
      const rotChanged =
        before.rotQuat && afterRotQuat
          ? !before.rotQuat.equalsWithEpsilon(afterRotQuat, 1e-5)
          : Vector3.DistanceSquared(before.rot, afterRot) > 1e-10 || Boolean(before.rotQuat) !== Boolean(afterRotQuat);

      if (posChanged || rotChanged || scaleChanged) {
        this.app.service.recordAction({
          name: `${label} "${mesh.name}"`,
          undo: () => {
            if (mesh.isDisposed()) return;
            mesh.position.copyFrom(before.pos);
            mesh.rotation.copyFrom(before.rot);
            mesh.rotationQuaternion = before.rotQuat ? before.rotQuat.clone() : null;
            mesh.scaling.copyFrom(before.scale);
            mesh.computeWorldMatrix(true);
          },
          redo: () => {
            if (mesh.isDisposed()) return;
            mesh.position.copyFrom(afterPos);
            mesh.rotation.copyFrom(afterRot);
            mesh.rotationQuaternion = afterRotQuat ? afterRotQuat.clone() : null;
            mesh.scaling.copyFrom(afterScale);
            mesh.computeWorldMatrix(true);
          },
        });
        this.app.service.events.onSceneModified?.();
      }
    };

    this.meshControllers['posX'] = fTransform
      .add(this.meshParams, 'posX')
      .step(0.05)
      .name('Pos X')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.position.x = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Move'));
    this.meshControllers['posY'] = fTransform
      .add(this.meshParams, 'posY')
      .step(0.05)
      .name('Pos Y')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.position.y = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Move'));
    this.meshControllers['posZ'] = fTransform
      .add(this.meshParams, 'posZ')
      .step(0.05)
      .name('Pos Z')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.position.z = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Move'));

    this.meshControllers['rotX'] = fTransform
      .add(this.meshParams, 'rotX', -180, 180, 1)
      .name('Rot X°')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.setMeshRotationDegrees(this.app.service.selectedMesh, 'x', v);
      })
      .onFinishChange(() => commitPendingMeshTransform('Rotate'));
    this.meshControllers['rotY'] = fTransform
      .add(this.meshParams, 'rotY', -180, 180, 1)
      .name('Rot Y°')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.setMeshRotationDegrees(this.app.service.selectedMesh, 'y', v);
      })
      .onFinishChange(() => commitPendingMeshTransform('Rotate'));
    this.meshControllers['rotZ'] = fTransform
      .add(this.meshParams, 'rotZ', -180, 180, 1)
      .name('Rot Z°')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.setMeshRotationDegrees(this.app.service.selectedMesh, 'z', v);
      })
      .onFinishChange(() => commitPendingMeshTransform('Rotate'));

    this.meshControllers['scaleX'] = fTransform
      .add(this.meshParams, 'scaleX', 0.01, 20, 0.05)
      .name('Scale X')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.scaling.x = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Scale'));
    this.meshControllers['scaleY'] = fTransform
      .add(this.meshParams, 'scaleY', 0.01, 20, 0.05)
      .name('Scale Y')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.scaling.y = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Scale'));
    this.meshControllers['scaleZ'] = fTransform
      .add(this.meshParams, 'scaleZ', 0.01, 20, 0.05)
      .name('Scale Z')
      .onChange((v: number) => {
        if (!this.app.service.selectedMesh) return;
        capturePendingMeshTransform();
        this.app.service.selectedMesh.scaling.z = v;
      })
      .onFinishChange(() => commitPendingMeshTransform('Scale'));
    fTransform.open();

    const fActions = this.guiMesh.addFolder('Mesh Tools');
    fActions.add(this.meshParams, 'snapToGround').name('Snap to Ground');
    fActions.add(this.meshParams, 'centerOrigin').name('Center Pivot');
    fActions.add(this.meshParams, 'bakeTransform').name('Bake Transform');
    fActions.add(this.meshParams, 'separateLooseParts').name('Separate Loose Parts');
    fActions.add(this.meshParams, 'mergeMeshes').name('Merge Meshes');
    fActions.open();

    // 3. Material Properties GUI
    const containerMat = document.getElementById('gui-material-container') || document.getElementById('gui-container-material');
    this.guiMaterial = new dat.GUI({ autoPlace: false, width: 280 });
    containerMat?.appendChild(this.guiMaterial.domElement);

    type MatPropUndoSnap = {
      mat: Material;
      albedoColor?: Color3;
      diffuseColor?: Color3;
      roughness?: number;
      metallic?: number;
      alpha: number;
      alphaCutOff?: number;
      bumpLevel?: number;
      parallaxScaleBias?: number;
    };
    let pendingMatPropSnap: MatPropUndoSnap | null = null;
    const captureMatPropSnap = (mat: Material): MatPropUndoSnap => ({
      mat,
      albedoColor: mat instanceof PBRMaterial && mat.albedoColor ? mat.albedoColor.clone() : undefined,
      diffuseColor: mat instanceof StandardMaterial && mat.diffuseColor ? mat.diffuseColor.clone() : undefined,
      roughness: mat instanceof PBRMaterial ? mat.roughness : undefined,
      metallic: mat instanceof PBRMaterial ? mat.metallic : undefined,
      alpha: mat.alpha,
      alphaCutOff: mat instanceof PBRMaterial ? mat.alphaCutOff : undefined,
      bumpLevel:
        (mat instanceof PBRMaterial || mat instanceof StandardMaterial) && mat.bumpTexture
          ? mat.bumpTexture.level
          : undefined,
      parallaxScaleBias:
        mat instanceof PBRMaterial || mat instanceof StandardMaterial ? mat.parallaxScaleBias : undefined,
    });
    const applyMatPropSnap = (snap: MatPropUndoSnap) => {
      const mat = snap.mat;
      if (mat instanceof PBRMaterial) {
        if (snap.albedoColor) mat.albedoColor = snap.albedoColor.clone();
        if (snap.roughness !== undefined) mat.roughness = snap.roughness;
        if (snap.metallic !== undefined) mat.metallic = snap.metallic;
        if (snap.alphaCutOff !== undefined) mat.alphaCutOff = snap.alphaCutOff;
        if (mat.bumpTexture && snap.bumpLevel !== undefined) mat.bumpTexture.level = snap.bumpLevel;
        if (snap.parallaxScaleBias !== undefined) mat.parallaxScaleBias = snap.parallaxScaleBias;
      } else if (mat instanceof StandardMaterial) {
        if (snap.diffuseColor) mat.diffuseColor = snap.diffuseColor.clone();
        if (mat.bumpTexture && snap.bumpLevel !== undefined) mat.bumpTexture.level = snap.bumpLevel;
        if (snap.parallaxScaleBias !== undefined) mat.parallaxScaleBias = snap.parallaxScaleBias;
      }
      mat.alpha = snap.alpha;
    };
    const beginMatPropEdit = (mat: Material | null) => {
      if (!mat) return;
      if (!pendingMatPropSnap || pendingMatPropSnap.mat !== mat) {
        pendingMatPropSnap = captureMatPropSnap(mat);
      }
      this.isDraggingGuiSlider = true;
    };
    const commitMatPropEdit = (label: string) => {
      this.isDraggingGuiSlider = false;
      const before = pendingMatPropSnap;
      pendingMatPropSnap = null;
      if (!before) return;
      const after = captureMatPropSnap(before.mat);
      this.app.service.recordAction({
        name: `${label} "${before.mat.name}"`,
        undo: () => applyMatPropSnap(before),
        redo: () => applyMatPropSnap(after),
      });
      this.app.service.events.onSceneModified?.();
    };

    this.materialControllers['materialName'] = this.guiMaterial.add(this.materialParams, 'materialName').name('Material').listen();
    this.materialControllers['textureInfo'] = this.guiMaterial.add(this.materialParams, 'textureInfo').name('Texture').listen();
    this.materialControllers['albedoColor'] = this.guiMaterial
      .addColor(this.materialParams, 'albedoColor')
      .name('Color')
      .onChange((hex: string) => {
        const mat = this.app.service.getSelectedMaterial();
        if (!mat) return;
        beginMatPropEdit(mat);
        if (mat instanceof PBRMaterial) mat.albedoColor = Color3.FromHexString(hex);
        else if (mat instanceof StandardMaterial) mat.diffuseColor = Color3.FromHexString(hex);
      })
      .onFinishChange(() => commitMatPropEdit('Change Color'));
    this.materialControllers['roughness'] = this.guiMaterial
      .add(this.materialParams, 'roughness', 0, 1, 0.05)
      .name('Roughness')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat instanceof PBRMaterial) {
          beginMatPropEdit(mat);
          mat.roughness = v;
        }
      })
      .onFinishChange(() => commitMatPropEdit('Change Roughness'));
    this.materialControllers['metallic'] = this.guiMaterial
      .add(this.materialParams, 'metallic', 0, 1, 0.05)
      .name('Metallic')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat instanceof PBRMaterial) {
          beginMatPropEdit(mat);
          mat.metallic = v;
        }
      })
      .onFinishChange(() => commitMatPropEdit('Change Metallic'));
    this.materialControllers['alpha'] = this.guiMaterial
      .add(this.materialParams, 'alpha', 0, 1, 0.05)
      .name('Opacity')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat) {
          beginMatPropEdit(mat);
          mat.alpha = v;
        }
      })
      .onFinishChange(() => commitMatPropEdit('Change Opacity'));
    this.materialControllers['wireframe'] = this.guiMaterial
      .add(this.materialParams, 'wireframe')
      .name('Wireframe')
      .onChange((v: boolean) => {
        const mat = this.app.service.getSelectedMaterial();
        if (!mat || mat.wireframe === v) return;
        const prev = !!mat.wireframe;
        mat.wireframe = v;
        this.app.service.recordAction({
          name: `${v ? 'Enable' : 'Disable'} Wireframe "${mat.name}"`,
          undo: () => {
            mat.wireframe = prev;
          },
          redo: () => {
            mat.wireframe = v;
          },
        });
        this.app.service.events.onSceneModified?.();
      });
    this.materialControllers['textureAlpha'] = this.guiMaterial
      .add(this.materialParams, 'textureAlpha')
      .name('Texture Alpha')
      .onChange((v: boolean) => {
        this.app.service.setTextureAlpha(v);
      });
    this.materialControllers['transparencyMode'] = this.guiMaterial
      .add(this.materialParams, 'transparencyMode', [
        'Opaque',
        'Alpha Test (Cutout)',
        'Alpha Blend',
        'Alpha Test & Blend',
      ])
      .name('Transparency Mode')
      .onChange((modeStr: string) => {
        const map: Record<string, number> = {
          Opaque: 0,
          'Alpha Test (Cutout)': 1,
          'Alpha Blend': 2,
          'Alpha Test & Blend': 3,
        };
        this.app.service.setMaterialTransparencyMode(map[modeStr] ?? 3);
      });
    this.materialControllers['twoSided'] = this.guiMaterial
      .add(this.materialParams, 'twoSided')
      .name('Double Sided')
      .onChange((v: boolean) => {
        this.app.service.setMaterialTwoSided(v);
      });
    this.materialControllers['alphaCutOff'] = this.guiMaterial
      .add(this.materialParams, 'alphaCutOff', 0.0, 1.0, 0.05)
      .name('Alpha Cutoff')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat) beginMatPropEdit(mat);
        this.app.service.setMaterialAlphaCutOff(v);
      })
      .onFinishChange(() => commitMatPropEdit('Change Alpha Cutoff'));
    this.guiMaterial.add(this.materialParams, 'replaceTexture').name('Replace Texture...');
    this.guiMaterial.add(this.materialParams, 'removeAlbedoTexture').name('Remove Texture');
    this.guiMaterial.add(this.materialParams, 'newMaterial').name('New PBR Material');

    const fBump = this.guiMaterial.addFolder('Bump & Normal Map');
    this.materialControllers['bumpInfo'] = fBump.add(this.materialParams, 'bumpInfo').name('Map').listen();
    this.materialControllers['bumpLevel'] = fBump
      .add(this.materialParams, 'bumpLevel', 0, 5, 0.05)
      .name('Intensity')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat) beginMatPropEdit(mat);
        this.app.service.setBumpLevel(v);
      })
      .onFinishChange(() => commitMatPropEdit('Change Bump Intensity'));
    this.materialControllers['invertNormalMapX'] = fBump
      .add(this.materialParams, 'invertNormalMapX')
      .name('Invert X')
      .onChange((v: boolean) => {
        this.app.service.setInvertNormalMapX(v);
      });
    this.materialControllers['invertNormalMapY'] = fBump
      .add(this.materialParams, 'invertNormalMapY')
      .name('Invert Y (DirectX)')
      .onChange((v: boolean) => {
        this.app.service.setInvertNormalMapY(v);
      });
    this.materialControllers['useParallax'] = fBump
      .add(this.materialParams, 'useParallax')
      .name('Parallax Mapping')
      .onChange((v: boolean) => {
        this.app.service.setUseParallax(v);
      });
    this.materialControllers['useParallaxOcclusion'] = fBump
      .add(this.materialParams, 'useParallaxOcclusion')
      .name('Parallax Occlusion')
      .onChange((v: boolean) => {
        this.app.service.setUseParallaxOcclusion(v);
      });
    this.materialControllers['parallaxScaleBias'] = fBump
      .add(this.materialParams, 'parallaxScaleBias', 0, 0.2, 0.005)
      .name('Parallax Depth')
      .onChange((v: number) => {
        const mat = this.app.service.getSelectedMaterial();
        if (mat) beginMatPropEdit(mat);
        this.app.service.setParallaxScaleBias(v);
      })
      .onFinishChange(() => commitMatPropEdit('Change Parallax Depth'));
    fBump.add(this.materialParams, 'loadBumpTexture').name('Load Normal Map...');
    fBump.add(this.materialParams, 'generateNormalFromDiffuse').name('Generate from Texture');
    fBump.add(this.materialParams, 'removeBumpTexture').name('Remove Normal Map');
    fBump.open();

    const fUV = this.guiMaterial.addFolder('UV Mapping & Texture');
    type TexUVSnap = Array<{
      tex: Texture;
      uOffset: number;
      vOffset: number;
      uScale: number;
      vScale: number;
      wAng: number;
      wrapU: number;
      wrapV: number;
    }>;
    let pendingUVSnap: TexUVSnap | null = null;
    const captureCurrentMatUVSnap = (): TexUVSnap => {
      const mat = this.app.service.getSelectedMaterial();
      const list: Texture[] = [];
      const baseTex = this.app.service.getActiveMaterialTexture();
      if (baseTex) list.push(baseTex);
      if (mat) {
        const keys = [
          'albedoTexture',
          'diffuseTexture',
          'bumpTexture',
          'metallicTexture',
          'ambientTexture',
          'opacityTexture',
          'emissiveTexture',
          'specularTexture',
        ];
        for (const k of keys) {
          const t = (mat as any)[k];
          if (t instanceof Texture && !list.includes(t)) list.push(t);
        }
      }
      return list.map((tex) => ({
        tex,
        uOffset: tex.uOffset,
        vOffset: tex.vOffset,
        uScale: tex.uScale,
        vScale: tex.vScale,
        wAng: tex.wAng,
        wrapU: tex.wrapU,
        wrapV: tex.wrapV,
      }));
    };
    const applyTexUVSnap = (snap: TexUVSnap) => {
      for (const s of snap) {
        s.tex.uOffset = s.uOffset;
        s.tex.vOffset = s.vOffset;
        s.tex.uScale = s.uScale;
        s.tex.vScale = s.vScale;
        s.tex.wAng = s.wAng;
        s.tex.wrapU = s.wrapU;
        s.tex.wrapV = s.wrapV;
      }
    };
    const onUVChange = () => {
      if (!pendingUVSnap) pendingUVSnap = captureCurrentMatUVSnap();
      this.isDraggingGuiSlider = true;
      this.applyLiveUVTransform();
    };
    const onUVFinish = (label: string) => {
      this.isDraggingGuiSlider = false;
      const before = pendingUVSnap;
      pendingUVSnap = null;
      if (!before || before.length === 0) return;
      const after = captureCurrentMatUVSnap();
      this.app.service.recordAction({
        name: `Change Texture ${label}`,
        undo: () => applyTexUVSnap(before),
        redo: () => applyTexUVSnap(after),
      });
      this.app.service.events.onSceneModified?.();
    };

    this.uvControllers['uScale'] = fUV
      .add(this.uvParams, 'uScale', 0.1, 20, 0.05)
      .name('uScale')
      .onChange(onUVChange)
      .onFinishChange(() => onUVFinish('uScale'));
    this.uvControllers['vScale'] = fUV
      .add(this.uvParams, 'vScale', 0.1, 20, 0.05)
      .name('vScale')
      .onChange(onUVChange)
      .onFinishChange(() => onUVFinish('vScale'));
    this.uvControllers['uOffset'] = fUV
      .add(this.uvParams, 'uOffset', -5, 5, 0.05)
      .name('uOffset')
      .onChange(onUVChange)
      .onFinishChange(() => onUVFinish('uOffset'));
    this.uvControllers['vOffset'] = fUV
      .add(this.uvParams, 'vOffset', -5, 5, 0.05)
      .name('vOffset')
      .onChange(onUVChange)
      .onFinishChange(() => onUVFinish('vOffset'));
    this.uvControllers['rotation'] = fUV
      .add(this.uvParams, 'rotation', -180, 180, 1)
      .name('Rotation°')
      .onChange(onUVChange)
      .onFinishChange(() => onUVFinish('Rotation'));
    this.uvControllers['wrapMode'] = fUV
      .add(this.uvParams, 'wrapMode', ['Repeat', 'Clamp', 'Mirror'])
      .name('Wrap Mode')
      .onChange(() => {
        const before = captureCurrentMatUVSnap();
        this.applyLiveUVTransform();
        if (before.length > 0) {
          const after = captureCurrentMatUVSnap();
          this.app.service.recordAction({
            name: `Change Texture Wrap Mode (${this.uvParams.wrapMode})`,
            undo: () => applyTexUVSnap(before),
            redo: () => applyTexUVSnap(after),
          });
        }
      });
    fUV.add(this.uvParams, 'autoTriplanar').name('Auto-Triplanar / Box UV');
    fUV.add(this.uvParams, 'planarTop').name('Planar Top (XZ)');
    fUV.add(this.uvParams, 'planarFront').name('Planar Front (XY)');
    fUV.add(this.uvParams, 'planarSide').name('Planar Side (ZY)');
    fUV.add(this.uvParams, 'cylindrical').name('Cylindrical Wrap UV');
    fUV.add(this.uvParams, 'bakeToMesh').name('Bake UV Scale to Mesh');
    fUV.open();

    // 4. Primitive Creation GUI
    const containerCreate = document.getElementById('gui-create-container') || document.getElementById('gui-container-create');
    this.guiCreate = new dat.GUI({ autoPlace: false, width: 310 });
    containerCreate?.appendChild(this.guiCreate.domElement);

    this.guiCreate
      .add(this.createParams, 'shape', [
        'Box',
        'Sphere',
        'Cylinder',
        'Cone',
        'Capsule',
        'Torus',
        'TorusKnot',
        'Plane',
        'Disc',
        'Ground',
        'Polyhedron',
      ])
      .name('Shape')
      .onChange((val: string) => {
        this.app.updateCreateShapeVisibility(val);
      });

    this.createControllers['name'] = this.guiCreate.add(this.createParams, 'name').name('Name');

    const fDim = this.guiCreate.addFolder('Dimensions');
    this.createControllers['size'] = fDim.add(this.createParams, 'size', 0.1, 10, 0.1).name('Size');
    this.createControllers['width'] = fDim.add(this.createParams, 'width', 0.1, 10, 0.1).name('Width (X)');
    this.createControllers['height'] = fDim.add(this.createParams, 'height', 0.1, 10, 0.1).name('Height (Y)');
    this.createControllers['depth'] = fDim.add(this.createParams, 'depth', 0.1, 10, 0.1).name('Depth (Z)');
    this.createControllers['diameter'] = fDim.add(this.createParams, 'diameter', 0.1, 10, 0.1).name('Diameter');
    this.createControllers['thickness'] = fDim.add(this.createParams, 'thickness', 0.05, 2, 0.05).name('Thickness / Tube');
    this.createControllers['tessellation'] = fDim.add(this.createParams, 'tessellation', 3, 64, 1).name('Segments');
    this.createControllers['subdivisions'] = fDim.add(this.createParams, 'subdivisions', 1, 32, 1).name('Subdivisions');
    this.createControllers['polyType'] = fDim
      .add(this.createParams, 'polyType', [
        '0: Tetrahedron (4)',
        '1: Octahedron (8)',
        '2: Dodecahedron (12)',
        '3: Icosahedron (20)',
        '4: Rhombicuboctahedron (26)',
      ])
      .name('Polyhedron Type');
    fDim.open();

    const fCreateMat = this.guiCreate.addFolder('Initial Material');
    fCreateMat.addColor(this.createParams, 'color').name('Color');
    fCreateMat.add(this.createParams, 'roughness', 0, 1, 0.05).name('Roughness');
    fCreateMat.add(this.createParams, 'metallic', 0, 1, 0.05).name('Metallic');
    fCreateMat.open();

    const ctrlCreateNow = this.guiCreate.add(this.createParams, 'createNow').name('Spawn at Origin');
    const ctrlClickToPlace = this.guiCreate.add(this.createParams, 'clickToPlace').name('Pick & Place in 3D');

    this.createControllers['createNow'] = ctrlCreateNow;
    this.createControllers['clickToPlace'] = ctrlClickToPlace;

    const liCreateNow = ctrlCreateNow.domElement.closest('li') || (ctrlCreateNow as any).__li;
    const liClickToPlace = ctrlClickToPlace.domElement.closest('li') || (ctrlClickToPlace as any).__li;

    if (liCreateNow) {
      liCreateNow.classList.add('tool-btn', 'tool-btn-primary', 'btn-block');
      liCreateNow.setAttribute('title', 'Spawn current primitive at the world origin (0, 0, 0)');
    }
    if (liClickToPlace) {
      liClickToPlace.classList.add('tool-btn', 'tool-btn-primary', 'btn-block');
      liClickToPlace.setAttribute('title', 'Click directly in the 3D viewport to place the primitive on the grid or surface');
    }

    this.app.updateCreateShapeVisibility(this.createParams.shape);

    // 5. Constructive Solid Geometryg GUI
    const containerCSG = document.getElementById('gui-csg-container') || document.getElementById('gui-container-csg');
    this.guiCSG = new dat.GUI({ autoPlace: false, width: 310 });
    containerCSG?.appendChild(this.guiCSG.domElement);

    const fMeshes = this.guiCSG.addFolder('Target & Tool Meshes');
    this.csgControllers['targetMesh'] = fMeshes
      .add(this.csgParams, 'targetMesh', ['None'])
      .name('Target Mesh')
      .onChange((val) => {
        this.csgParams.targetMesh = val;
      });
    fMeshes.add(this.csgParams, 'useSelectedAsTarget').name('Set Target (Selected)');
    this.csgControllers['toolMesh'] = fMeshes
      .add(this.csgParams, 'toolMesh', ['None'])
      .name('Tool / Cutter')
      .onChange((val) => {
        this.csgParams.toolMesh = val;
      });
    fMeshes.add(this.csgParams, 'useSelectedAsTool').name('Set Tool (Selected)');
    fMeshes.add(this.csgParams, 'swapTargetAndTool').name('Swap Target & Tool');
    fMeshes.add(this.csgParams, 'keepToolMesh').name('Keep Tool Mesh');
    fMeshes.open();

    const fCutters = this.guiCSG.addFolder('Quick Sculpt Cutters');
    fCutters.add(this.csgParams, 'addCutterBox').name('Add Box Cutter');
    fCutters.add(this.csgParams, 'addCutterCylinder').name('Add Cylinder Cutter');
    fCutters.add(this.csgParams, 'addCutterSphere').name('Add Sphere Cutter');
    fCutters.open();

    const fOps = this.guiCSG.addFolder('Boolean Operations');
    fOps.add(this.csgParams, 'subtract').name('Subtract / Cut Out (A - B)');
    fOps.add(this.csgParams, 'union').name('Union / Fuse (A + B)');
    fOps.add(this.csgParams, 'intersect').name('Intersect (A ∩ B)');
    fOps.open();

    // 6. Facet & Vertex Editor GUI
    const containerFacet = document.getElementById('gui-facet-container') || document.getElementById('gui-container-facet');
    this.guiFacet = new dat.GUI({ autoPlace: false, width: 280 });
    containerFacet?.appendChild(this.guiFacet.domElement);
    this.guiFacet
      .add(this.facetParams, 'active')
      .name('Enable Face Pick')
      .onChange((v) => {
        if (v) {
          this.app.activateExclusive3DTool('facet_editor');
        } else {
          this.app.service.toggleFacetEditor(false);
        }
      });
    this.guiFacet.add(this.facetParams, 'extrudeDist', 0.05, 5, 0.05).name('Distance');
    this.guiFacet.add(this.facetParams, 'extrudeNow').name('Extrude Face');
    this.guiFacet.add(this.facetParams, 'deleteFacet').name('Delete Face');
    this.guiFacet.add(this.facetParams, 'flipNormal').name('Invert Normal');

    // 7. WebP Textures GUI
    const containerTex = document.getElementById('gui-textures-container') || document.getElementById('gui-container-textures');
    this.guiTextures = new dat.GUI({ autoPlace: false, width: 280 });
    containerTex?.appendChild(this.guiTextures.domElement);
    this.textureControllers['status'] = this.guiTextures.add(this.textureParams, 'status').name('Status').listen();
    this.guiTextures.add(this.textureParams, 'quality', 10, 100, 5).name('WebP Quality %');
    this.guiTextures.add(this.textureParams, 'maxResolution', ['Original', '2048', '1024', '512', '256']).name('Max Res');
    this.guiTextures.add(this.textureParams, 'optimizeAll').name('Optimize All Textures');

    // 8. Animations GUI (Babylon Sandbox Style)
    const containerAnim = document.getElementById('gui-anim-container') || document.getElementById('gui-container-anim');
    this.guiAnim = new dat.GUI({ autoPlace: false, width: 420 });
    containerAnim?.appendChild(this.guiAnim.domElement);

    this.animControllers['clip'] = this.guiAnim
      .add(this.animParams, 'clip', ['None'])
      .name('Clip')
      .onChange((name: string) => {
        this.app.selectAnimationGroup(name);
      });

    const ctrlPlay = this.guiAnim.add(this.animParams, 'play').name('▶ Play');
    const ctrlPause = this.guiAnim.add(this.animParams, 'pause').name('⏸ Pause');
    const ctrlStop = this.guiAnim.add(this.animParams, 'stop').name('⏹ Stop');

    // Group Play, Pause, Stop into a single horizontal row
    const animBtnRow = document.createElement('div');
    animBtnRow.className = 'anim-btn-group';
    const liPlay = ctrlPlay.domElement.closest('li') || ctrlPlay.domElement;
    const liPause = ctrlPause.domElement.closest('li') || ctrlPause.domElement;
    const liStop = ctrlStop.domElement.closest('li') || ctrlStop.domElement;

    if (liPlay.parentElement) {
      liPlay.parentElement.insertBefore(animBtnRow, liPlay);
      animBtnRow.appendChild(liPlay);
      animBtnRow.appendChild(liPause);
      animBtnRow.appendChild(liStop);
    }

    this.animControllers['loop'] = this.guiAnim
      .add(this.animParams, 'loop')
      .name('Loop')
      .onChange((v: boolean) => {
        this.app.service.setAnimationLoop(v);
      });

    this.animControllers['speed'] = this.guiAnim
      .add(this.animParams, 'speed', 0.1, 2.5, 0.1)
      .name('Speed')
      .onChange((v: number) => {
        this.app.service.setAnimationSpeed(v);
      });

    this.animControllers['frame'] = this.guiAnim
      .add(this.animParams, 'frame', 0, 100, 1)
      .name('Timeline')
      .onChange((f: number) => {
        this.app.service.setAnimFrame(f);
      });

    this.setupColorPickerEnhancements();
  }

  private setupColorPickerEnhancements(): void {
    const scope = this.app.rootContainer || document;
    const colorRows = Array.from(scope.querySelectorAll('.dg .cr.color')) as HTMLElement[];

    const closeAllColorPickers = (exceptRow?: HTMLElement) => {
      for (const row of colorRows) {
        if (row === exceptRow) continue;
        row.classList.remove('color-picker-open');
        const sel = row.querySelector('.selector') as HTMLElement | null;
        if (sel) {
          sel.classList.remove('drag');
          sel.style.display = '';
        }
        const input = row.querySelector('input[type="text"]') as HTMLInputElement | null;
        if (input && document.activeElement === input) {
          input.blur();
        }
      }
      const allDialogs = Array.from(scope.querySelectorAll('.floating-dialog')) as HTMLElement[];
      for (const dlg of allDialogs) {
        if (exceptRow && dlg.contains(exceptRow)) continue;
        dlg.classList.remove('has-open-color-picker');
      }
    };

    // Enhance each dat.GUI ColorController instance
    const allGuis = [this.guiScene, this.guiMaterial, this.guiCreate].filter(Boolean);
    const collectColorControllers = (gui: dat.GUI): any[] => {
      const result: any[] = [];
      const controllers = (gui as any).__controllers || [];
      for (const ctrl of controllers) {
        if (ctrl && ctrl.__selector && ctrl.__saturation_field && ctrl.__hue_field) {
          result.push(ctrl);
        }
      }
      const folders = (gui as any).__folders || {};
      for (const folderName of Object.keys(folders)) {
        result.push(...collectColorControllers(folders[folderName]));
      }
      return result;
    };

    for (const gui of allGuis) {
      for (const ctrl of collectColorControllers(gui)) {
        let lastValidHue =
          typeof ctrl.__color?.__state?.h === 'number' && !Number.isNaN(ctrl.__color.__state.h) ? ctrl.__color.__state.h : 0;
        const origUpdateDisplay = ctrl.updateDisplay;

        ctrl.updateDisplay = function () {
          if (typeof this.__color?.__state?.h === 'number' && !Number.isNaN(this.__color.__state.h)) {
            lastValidHue = this.__color.__state.h;
          }
          const res = origUpdateDisplay.apply(this, arguments);
          try {
            if (this.__color?.__state) {
              if (Number.isNaN(this.__color.__state.h) || this.__color.__state.h === undefined) {
                this.__color.__state.h = lastValidHue;
              } else {
                lastValidHue = this.__color.__state.h;
              }
            }

            // Compute pure hue RGB for saturation gradient using standard CSS linear-gradient syntax
            const hNorm = (((lastValidHue % 360) + 360) % 360) / 60;
            const hi = Math.floor(hNorm) % 6;
            const f = hNorm - Math.floor(hNorm);
            const q = 1 - f;
            const t = f;
            const rgbArr = [
              [1, t, 0],
              [q, 1, 0],
              [0, 1, t],
              [0, q, 1],
              [t, 0, 1],
              [1, 0, q],
            ][hi] || [1, 0, 0];
            const hr = Math.round(rgbArr[0] * 255);
            const hg = Math.round(rgbArr[1] * 255);
            const hb = Math.round(rgbArr[2] * 255);
            const pureHueCss = `rgb(${hr}, ${hg}, ${hb})`;

            if (this.__saturation_field) {
              this.__saturation_field.style.backgroundImage = `linear-gradient(to right, #ffffff 0%, ${pureHueCss} 100%)`;
              const valField = this.__saturation_field.firstElementChild as HTMLElement | null;
              if (valField) {
                valField.style.backgroundImage = 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, #000000 100%)';
              }
            }
            if (this.__hue_field) {
              this.__hue_field.style.backgroundImage =
                'linear-gradient(to bottom, #ff0000 0%, #ff00ff 17%, #0000ff 34%, #00ffff 50%, #00ff00 67%, #ffff00 84%, #ff0000 100%)';
            }
          } catch {
            // Ignore style sync errors
          }
          return res;
        };

        ctrl.updateDisplay();
      }
    }

    // Attach robust open/close & z-index management to each .cr.color row
    for (const row of colorRows) {
      const dialog = row.closest('.floating-dialog') as HTMLElement | null;
      const selector = row.querySelector('.selector') as HTMLElement | null;
      const input = row.querySelector('input[type="text"]') as HTMLInputElement | null;
      let isDraggingPalette = false;

      const openPicker = () => {
        closeAllColorPickers(row);
        row.classList.add('color-picker-open');
        if (dialog) {
          this.app.bringDialogToFront(dialog);
          dialog.classList.add('has-open-color-picker');
        }
      };

      row.addEventListener('mouseenter', () => {
        openPicker();
      });

      row.addEventListener('pointerdown', () => {
        openPicker();
      });

      input?.addEventListener('focus', () => {
        openPicker();
      });

      selector?.addEventListener('pointerdown', () => {
        isDraggingPalette = true;
        openPicker();
        const onWindowPointerUp = () => {
          isDraggingPalette = false;
          selector.classList.remove('drag');
          if (!row.matches(':hover') && document.activeElement !== input) {
            row.classList.remove('color-picker-open');
            dialog?.classList.remove('has-open-color-picker');
          }
        };
        window.addEventListener('pointerup', onWindowPointerUp, { once: true });
        window.addEventListener('pointercancel', onWindowPointerUp, { once: true });
      });

      row.addEventListener('mouseleave', () => {
        if (!isDraggingPalette && document.activeElement !== input) {
          row.classList.remove('color-picker-open');
          dialog?.classList.remove('has-open-color-picker');
        }
      });
    }

    const rootTarget = this.app.rootContainer || document;
    rootTarget.addEventListener('pointerdown', (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const activeColorRow = target.closest('.cr.color') as HTMLElement | null;
      if (!activeColorRow) {
        closeAllColorPickers();
      }
    });

    this.app.addGlobalListener(window, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        closeAllColorPickers();
      }
    });
  }

  public updateSceneGUI(): void {
    for (const key in this.sceneControllers) {
      this.sceneControllers[key]?.updateDisplay();
    }
  }

  public updateMeshGUI(): void {
    const mesh = this.app.service.selectedMesh;
    if (mesh) {
      this.meshParams.name = mesh.name;
      this.meshParams.visible = mesh.isVisible;
      this.meshParams.posX = parseFloat(mesh.position.x.toFixed(3));
      this.meshParams.posY = parseFloat(mesh.position.y.toFixed(3));
      this.meshParams.posZ = parseFloat(mesh.position.z.toFixed(3));

      const rot = this.app.service.getMeshRotationDegrees(mesh);
      this.meshParams.rotX = Math.round(rot.x);
      this.meshParams.rotY = Math.round(rot.y);
      this.meshParams.rotZ = Math.round(rot.z);

      this.meshParams.scaleX = parseFloat(mesh.scaling.x.toFixed(3));
      this.meshParams.scaleY = parseFloat(mesh.scaling.y.toFixed(3));
      this.meshParams.scaleZ = parseFloat(mesh.scaling.z.toFixed(3));
    } else {
      this.meshParams.name = this.app.service.selectedNodes.length > 0 ? `(${this.app.service.selectedNodes.length} objects)` : 'No selection';
      this.meshParams.visible = true;
    }

    for (const key in this.meshControllers) {
      this.meshControllers[key]?.updateDisplay();
    }
  }

  public updateMaterialGUI(): void {
    const mat = this.app.service.getSelectedMaterial();
    if (mat) {
      this.materialParams.materialName = mat.name;
      if (mat instanceof PBRMaterial) {
        this.materialParams.albedoColor = mat.albedoColor ? mat.albedoColor.toHexString() : '#ffffff';
        this.materialParams.roughness = mat.roughness !== undefined ? mat.roughness : 0.5;
        this.materialParams.metallic = mat.metallic !== undefined ? mat.metallic : 0.0;
        this.materialParams.alpha = mat.alpha !== undefined ? mat.alpha : 1.0;
        this.materialParams.wireframe = mat.wireframe || false;
      } else if (mat instanceof StandardMaterial) {
        this.materialParams.albedoColor = mat.diffuseColor ? mat.diffuseColor.toHexString() : '#ffffff';
        this.materialParams.alpha = mat.alpha !== undefined ? mat.alpha : 1.0;
        this.materialParams.wireframe = mat.wireframe || false;
      }

      const trans = this.app.service.getMaterialTransparencyInfo();
      this.materialParams.textureAlpha = trans.hasAlpha;
      const modeNames = ['Opaque', 'Alpha Test (Cutout)', 'Alpha Blend', 'Alpha Test & Blend'];
      this.materialParams.transparencyMode = modeNames[trans.mode] ?? 'Opaque';
      this.materialParams.twoSided = trans.twoSided;
      this.materialParams.alphaCutOff = trans.alphaCutOff;

      const bump = this.app.service.getMaterialBumpInfo();
      this.materialParams.bumpInfo = bump.hasBump ? bump.name : 'None';
      this.materialParams.bumpLevel = bump.level;
      this.materialParams.invertNormalMapX = bump.invertX;
      this.materialParams.invertNormalMapY = bump.invertY;
      this.materialParams.useParallax = bump.useParallax;
      this.materialParams.useParallaxOcclusion = bump.useParallaxOcclusion;
      this.materialParams.parallaxScaleBias = bump.parallaxScaleBias;

      const activeTexInfo = this.app.service.getActiveMaterialTexturesInfo();
      if (activeTexInfo.albedo) {
        this.materialParams.textureInfo = activeTexInfo.albedo.name;
      } else if (activeTexInfo.extra.length > 0) {
        this.materialParams.textureInfo = activeTexInfo.extra.map((t) => t.name).join(', ');
      } else {
        this.materialParams.textureInfo = 'None';
      }
    } else {
      this.materialParams.materialName = 'No material';
      this.materialParams.textureInfo = 'None';
      this.materialParams.bumpInfo = 'None';
      this.materialParams.bumpLevel = 1.0;
      this.materialParams.invertNormalMapX = false;
      this.materialParams.invertNormalMapY = false;
      this.materialParams.useParallax = false;
      this.materialParams.useParallaxOcclusion = false;
      this.materialParams.parallaxScaleBias = 0.05;
    }

    for (const key in this.materialControllers) {
      this.materialControllers[key]?.updateDisplay();
    }
    this.updateUVGUI();
    this.app.renderActiveMaterialTextures();
    this.app.renderEmbeddedTextures();
    this.app.updateCompressModelUI();
  }

  public updateUVGUI(): void {
    const tex = this.app.service.getActiveMaterialTexture();
    if (tex) {
      this.uvParams.uOffset = parseFloat((tex.uOffset || 0).toFixed(2));
      this.uvParams.vOffset = parseFloat((tex.vOffset || 0).toFixed(2));
      this.uvParams.uScale = parseFloat((tex.uScale !== undefined ? tex.uScale : 1).toFixed(2));
      this.uvParams.vScale = parseFloat((tex.vScale !== undefined ? tex.vScale : 1).toFixed(2));
      this.uvParams.rotation = Math.round(((tex.wAng || 0) * 180) / Math.PI);
      this.uvParams.wrapMode =
        tex.wrapU === Texture.CLAMP_ADDRESSMODE ? 'Clamp' : tex.wrapU === Texture.MIRROR_ADDRESSMODE ? 'Mirror' : 'Repeat';
    } else {
      this.uvParams.uOffset = 0;
      this.uvParams.vOffset = 0;
      this.uvParams.uScale = 1;
      this.uvParams.vScale = 1;
      this.uvParams.rotation = 0;
      this.uvParams.wrapMode = 'Repeat';
    }

    for (const key of Object.keys(this.uvControllers)) {
      this.uvControllers[key]?.updateDisplay();
    }
  }

  public applyLiveUVTransform(): void {
    const mat = this.app.service.getSelectedMaterial();
    const textures: Texture[] = [];
    const baseTex = this.app.service.getActiveMaterialTexture();
    if (baseTex) textures.push(baseTex);

    if (mat) {
      const candidateKeys = [
        'albedoTexture',
        'diffuseTexture',
        'bumpTexture',
        'metallicTexture',
        'ambientTexture',
        'opacityTexture',
        'emissiveTexture',
        'specularTexture',
      ];
      for (const k of candidateKeys) {
        const t = (mat as any)[k];
        if (t instanceof Texture && !textures.includes(t)) {
          textures.push(t);
        }
      }
    }
    if (textures.length === 0) return;

    const mode =
      this.uvParams.wrapMode === 'Clamp'
        ? Texture.CLAMP_ADDRESSMODE
        : this.uvParams.wrapMode === 'Mirror'
          ? Texture.MIRROR_ADDRESSMODE
          : Texture.WRAP_ADDRESSMODE;

    for (const tex of textures) {
      tex.uOffset = this.uvParams.uOffset;
      tex.vOffset = this.uvParams.vOffset;
      tex.uScale = this.uvParams.uScale;
      tex.vScale = this.uvParams.vScale;
      tex.wAng = (this.uvParams.rotation * Math.PI) / 180;
      tex.wrapU = mode;
      tex.wrapV = mode;
    }
    this.app.service.events.onSceneModified?.();
  }
}
