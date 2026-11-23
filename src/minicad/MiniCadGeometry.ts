import {
  CSG,
  CSG2,
  IsCSG2Ready,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Scene,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import {
  captureMeshSnapshot,
  computeBeveledSnapshot,
  restoreMeshSnapshot,
} from '../geometry/bevelModifier';
import { createRoundedBoxVertexData } from '../geometry/roundedBox';
import {
  MINICAD_PROFILES,
  MiniCadBoxOpFeature,
  MiniCadCutListItem,
  MiniCadDimensionsMm,
  MiniCadFaceDir,
  MiniCadFeatureOp,
  MiniCadHoleFeature,
  MiniCadPrintabilityReport,
  MiniCadProfileConfig,
  MiniCadProfileId,
  MiniCadRecipe,
} from './types';

export interface FaceBasis {
  dir: MiniCadFaceDir;
  normal: Vector3;
  uAxis: Vector3;
  vAxis: Vector3;
  faceWidthMm: number;
  faceHeightMm: number;
  spanAlongNormalMm: number;
}

export function getProfileConfig(profileId: MiniCadProfileId): MiniCadProfileConfig {
  return MINICAD_PROFILES[profileId] || MINICAD_PROFILES['3d_print'];
}

export function mmToWorld(mm: number, profileId: MiniCadProfileId): number {
  const cfg = getProfileConfig(profileId);
  return mm / cfg.mmPerUnit;
}

export function worldToMm(world: number, profileId: MiniCadProfileId): number {
  const cfg = getProfileConfig(profileId);
  return world * cfg.mmPerUnit;
}

export function roundMm(value: number, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function getFaceBasis(face: MiniCadFaceDir, dims: MiniCadDimensionsMm): FaceBasis {
  switch (face) {
    case 'top':
      return {
        dir: 'top',
        normal: new Vector3(0, 1, 0),
        uAxis: new Vector3(1, 0, 0),
        vAxis: new Vector3(0, 0, 1),
        faceWidthMm: dims.width,
        faceHeightMm: dims.depth,
        spanAlongNormalMm: dims.height,
      };
    case 'bottom':
      return {
        dir: 'bottom',
        normal: new Vector3(0, -1, 0),
        uAxis: new Vector3(1, 0, 0),
        vAxis: new Vector3(0, 0, -1),
        faceWidthMm: dims.width,
        faceHeightMm: dims.depth,
        spanAlongNormalMm: dims.height,
      };
    case 'front':
      return {
        dir: 'front',
        normal: new Vector3(0, 0, 1),
        uAxis: new Vector3(1, 0, 0),
        vAxis: new Vector3(0, 1, 0),
        faceWidthMm: dims.width,
        faceHeightMm: dims.height,
        spanAlongNormalMm: dims.depth,
      };
    case 'back':
      return {
        dir: 'back',
        normal: new Vector3(0, 0, -1),
        uAxis: new Vector3(-1, 0, 0),
        vAxis: new Vector3(0, 1, 0),
        faceWidthMm: dims.width,
        faceHeightMm: dims.height,
        spanAlongNormalMm: dims.depth,
      };
    case 'right':
      return {
        dir: 'right',
        normal: new Vector3(1, 0, 0),
        uAxis: new Vector3(0, 0, -1),
        vAxis: new Vector3(0, 1, 0),
        faceWidthMm: dims.depth,
        faceHeightMm: dims.height,
        spanAlongNormalMm: dims.width,
      };
    case 'left':
      return {
        dir: 'left',
        normal: new Vector3(-1, 0, 0),
        uAxis: new Vector3(0, 0, 1),
        vAxis: new Vector3(0, 1, 0),
        faceWidthMm: dims.depth,
        faceHeightMm: dims.height,
        spanAlongNormalMm: dims.width,
      };
  }
}

export function classifyCardinalFace(localNormal: Vector3): MiniCadFaceDir {
  const ax = Math.abs(localNormal.x);
  const ay = Math.abs(localNormal.y);
  const az = Math.abs(localNormal.z);
  if (ay >= ax && ay >= az) {
    return localNormal.y >= 0 ? 'top' : 'bottom';
  }
  if (ax >= ay && ax >= az) {
    return localNormal.x >= 0 ? 'right' : 'left';
  }
  return localNormal.z >= 0 ? 'front' : 'back';
}

function orientCylinderToFace(mesh: Mesh, face: MiniCadFaceDir): void {
  switch (face) {
    case 'top':
      mesh.rotation.set(0, 0, 0);
      break;
    case 'bottom':
      mesh.rotation.set(Math.PI, 0, 0);
      break;
    case 'front':
      mesh.rotation.set(Math.PI / 2, 0, 0);
      break;
    case 'back':
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      break;
    case 'right':
      mesh.rotation.set(0, 0, -Math.PI / 2);
      break;
    case 'left':
      mesh.rotation.set(0, 0, Math.PI / 2);
      break;
  }
}

function createAxisAlignedBoxOnFace(
  name: string,
  sizeU: number,
  sizeN: number,
  sizeV: number,
  basis: FaceBasis,
  scene: Scene
): Mesh {
  const dimX = Math.max(
    0.001,
    Math.abs(basis.uAxis.x) * sizeU + Math.abs(basis.vAxis.x) * sizeV + Math.abs(basis.normal.x) * sizeN
  );
  const dimY = Math.max(
    0.001,
    Math.abs(basis.uAxis.y) * sizeU + Math.abs(basis.vAxis.y) * sizeV + Math.abs(basis.normal.y) * sizeN
  );
  const dimZ = Math.max(
    0.001,
    Math.abs(basis.uAxis.z) * sizeU + Math.abs(basis.vAxis.z) * sizeV + Math.abs(basis.normal.z) * sizeN
  );
  return MeshBuilder.CreateBox(name, { width: dimX, height: dimY, depth: dimZ }, scene);
}

/**
 * Performs a boolean operation in local space using CSG2 (Manifold WASM) when ready,
 * falling back cleanly to Babylon's synchronous CSG in headless/NullEngine environments.
 */
function performLocalBoolean(
  baseMesh: Mesh,
  toolMesh: Mesh,
  op: 'subtract' | 'union',
  scene: Scene
): Mesh {
  baseMesh.computeWorldMatrix(true);
  toolMesh.computeWorldMatrix(true);

  let result: Mesh | null = null;
  if (typeof IsCSG2Ready === 'function' && IsCSG2Ready()) {
    try {
      const a = CSG2.FromMesh(baseMesh, false);
      const b = CSG2.FromMesh(toolMesh, false);
      const res = op === 'subtract' ? a.subtract(b) : a.add(b);
      result = res.toMesh(`${baseMesh.name}_tmp`, scene);
      res.dispose();
      a.dispose();
      b.dispose();
    } catch {
      result = null;
    }
  }

  if (!result) {
    const a = CSG.FromMesh(baseMesh);
    const b = CSG.FromMesh(toolMesh);
    const res = op === 'subtract' ? a.subtract(b) : a.union(b);
    result = res.toMesh(`${baseMesh.name}_tmp`, baseMesh.material, scene);
  }

  if (!baseMesh.isDisposed()) baseMesh.dispose();
  if (!toolMesh.isDisposed()) toolMesh.dispose();
  return result;
}

function buildBaseSolid(name: string, recipe: MiniCadRecipe, scene: Scene): Mesh {
  const pid = recipe.profileId;
  const w = Math.max(0.01, mmToWorld(Math.max(1, recipe.dimensionsMm.width), pid));
  const h = Math.max(0.01, mmToWorld(Math.max(1, recipe.dimensionsMm.height), pid));
  const d = Math.max(0.01, mmToWorld(Math.max(1, recipe.dimensionsMm.depth), pid));

  switch (recipe.baseShape) {
    case 'rounded_box':
    case 'plate': {
      const defaultRadius = recipe.baseShape === 'plate' ? 2.0 : 3.0;
      const rMm = recipe.dimensionsMm.cornerRadius ?? defaultRadius;
      const rWorld = Math.max(0, mmToWorld(rMm, pid));
      const mesh = new Mesh(name, scene);
      const vd = createRoundedBoxVertexData({
        width: w,
        height: h,
        depth: d,
        radius: rWorld,
        segments: rWorld > 1e-4 ? 3 : 0,
      });
      vd.applyToMesh(mesh, true);
      return mesh;
    }
    case 'cylinder': {
      return MeshBuilder.CreateCylinder(
        name,
        {
          diameter: w,
          height: h,
          tessellation: 36,
        },
        scene
      );
    }
    case 'tube': {
      const outer = MeshBuilder.CreateCylinder(
        `${name}_outer`,
        { diameter: w, height: h, tessellation: 36 },
        scene
      );
      const wallMm = Math.max(0.5, recipe.dimensionsMm.wallThickness ?? 3);
      const innerDiamMm = Math.max(
        1,
        Math.min(recipe.dimensionsMm.width - 1, recipe.dimensionsMm.innerDiameter ?? recipe.dimensionsMm.width - wallMm * 2)
      );
      const inner = MeshBuilder.CreateCylinder(
        `${name}_inner`,
        { diameter: mmToWorld(innerDiamMm, pid), height: h + 0.04, tessellation: 36 },
        scene
      );
      const tube = performLocalBoolean(outer, inner, 'subtract', scene);
      tube.name = name;
      return tube;
    }
    case 'l_bracket': {
      const wallMm = Math.max(
        1,
        Math.min(
          Math.min(recipe.dimensionsMm.height, recipe.dimensionsMm.depth) * 0.6,
          recipe.dimensionsMm.wallThickness ?? 4
        )
      );
      const wall = mmToWorld(wallMm, pid);
      // Base horizontal leg at bottom (Y = -h/2 + wall/2)
      const baseLeg = MeshBuilder.CreateBox(`${name}_base`, { width: w, height: wall, depth: d }, scene);
      baseLeg.position.y = -h * 0.5 + wall * 0.5;
      // Vertical upright leg at back (Z = -d/2 + wall/2)
      const vertLeg = MeshBuilder.CreateBox(`${name}_vert`, { width: w, height: h, depth: wall }, scene);
      vertLeg.position.z = -d * 0.5 + wall * 0.5;
      const bracket = performLocalBoolean(baseLeg, vertLeg, 'union', scene);
      bracket.name = name;
      return bracket;
    }
    case 'box':
    default: {
      return MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    }
  }
}

function getPatternPositionsMm(
  offsetUMm: number,
  offsetVMm: number,
  pattern?: { cols: number; rows: number; spacingUMm: number; spacingVMm: number }
): Array<{ uMm: number; vMm: number }> {
  if (!pattern || (pattern.cols <= 1 && pattern.rows <= 1)) {
    return [{ uMm: offsetUMm, vMm: offsetVMm }];
  }
  const cols = Math.max(1, Math.min(12, Math.round(pattern.cols)));
  const rows = Math.max(1, Math.min(12, Math.round(pattern.rows)));
  const results: Array<{ uMm: number; vMm: number }> = [];
  const totalU = (cols - 1) * pattern.spacingUMm;
  const totalV = (rows - 1) * pattern.spacingVMm;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      results.push({
        uMm: offsetUMm - totalU * 0.5 + c * pattern.spacingUMm,
        vMm: offsetVMm - totalV * 0.5 + r * pattern.spacingVMm,
      });
    }
  }
  return results;
}

function applyShellFeature(
  mesh: Mesh,
  recipe: MiniCadRecipe,
  wallThicknessMm: number,
  openFace: MiniCadFaceDir | 'none',
  scene: Scene
): Mesh {
  const pid = recipe.profileId;
  const dims = recipe.dimensionsMm;
  const wall = Math.max(0.5, wallThicknessMm);
  const innerW = dims.width - wall * 2;
  const innerH = dims.height - wall * 2;
  const innerD = dims.depth - wall * 2;
  if (innerW <= 0.5 || innerH <= 0.5 || innerD <= 0.5) {
    return mesh;
  }

  let cavity: Mesh;
  const wWorld = mmToWorld(innerW, pid);
  const hWorld = mmToWorld(innerH, pid);
  const dWorld = mmToWorld(innerD, pid);
  const extraWorld = mmToWorld(wall + 2.0, pid);

  if (recipe.baseShape === 'cylinder' || recipe.baseShape === 'tube') {
    const cavityH = openFace === 'top' || openFace === 'bottom' ? hWorld + extraWorld : hWorld;
    cavity = MeshBuilder.CreateCylinder(
      `${mesh.name}_shell_cutter`,
      { diameter: wWorld, height: cavityH, tessellation: 36 },
      scene
    );
  } else {
    const cx = openFace === 'left' || openFace === 'right' ? wWorld + extraWorld : wWorld;
    const cy = openFace === 'top' || openFace === 'bottom' ? hWorld + extraWorld : hWorld;
    const cz = openFace === 'front' || openFace === 'back' ? dWorld + extraWorld : dWorld;
    cavity = MeshBuilder.CreateBox(`${mesh.name}_shell_cutter`, { width: cx, height: cy, depth: cz }, scene);
  }

  if (openFace !== 'none') {
    const basis = getFaceBasis(openFace, dims);
    const shiftWorld = (mmToWorld(wall, pid) + mmToWorld(2.0, pid)) * 0.5;
    cavity.position.addInPlace(basis.normal.scale(shiftWorld));
  }

  const shelled = performLocalBoolean(mesh, cavity, 'subtract', scene);
  shelled.name = mesh.name;
  return shelled;
}

function applyHoleFeature(
  mesh: Mesh,
  recipe: MiniCadRecipe,
  feat: MiniCadHoleFeature,
  scene: Scene
): Mesh {
  const pid = recipe.profileId;
  const basis = getFaceBasis(feat.face, recipe.dimensionsMm);
  const overshootMm = 2.0;
  const cutDepthMm = feat.throughAll
    ? basis.spanAlongNormalMm + overshootMm * 2
    : Math.max(1, feat.depthMm) + overshootMm;
  const cutDepthWorld = mmToWorld(cutDepthMm, pid);
  const faceDistWorld = mmToWorld(basis.spanAlongNormalMm * 0.5, pid);
  const centerAlongNormal = feat.throughAll
    ? 0
    : faceDistWorld - cutDepthWorld * 0.5 + mmToWorld(overshootMm, pid);

  const points = getPatternPositionsMm(feat.offsetUMm, feat.offsetVMm, feat.pattern);
  let current = mesh;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const centerPos = basis.normal
      .scale(centerAlongNormal)
      .add(basis.uAxis.scale(mmToWorld(pt.uMm, pid)))
      .add(basis.vAxis.scale(mmToWorld(pt.vMm, pid)));

    let cutter: Mesh;
    if (feat.shape === 'box') {
      const uMm = feat.widthMm ?? feat.diameterMm;
      const vMm = feat.diameterMm;
      cutter = createAxisAlignedBoxOnFace(
        `${mesh.name}_hole_${i}`,
        mmToWorld(uMm, pid),
        cutDepthWorld,
        mmToWorld(vMm, pid),
        basis,
        scene
      );
      cutter.position.copyFrom(centerPos);
      current = performLocalBoolean(current, cutter, 'subtract', scene);
    } else {
      cutter = MeshBuilder.CreateCylinder(
        `${mesh.name}_hole_${i}`,
        {
          diameter: mmToWorld(Math.max(0.5, feat.diameterMm), pid),
          height: cutDepthWorld,
          tessellation: 24,
        },
        scene
      );
      orientCylinderToFace(cutter, feat.face);
      cutter.position.copyFrom(centerPos);
      current = performLocalBoolean(current, cutter, 'subtract', scene);

      if (feat.shape === 'countersunk') {
        const headDiamMm = feat.headDiameterMm ?? feat.diameterMm * 1.9;
        const headDepthMm = feat.headDepthMm ?? Math.min(basis.spanAlongNormalMm * 0.5, feat.diameterMm * 0.65);
        const headDepthWorld = mmToWorld(headDepthMm + overshootMm, pid);
        const headCenterAlongNormal =
          faceDistWorld - headDepthWorld * 0.5 + mmToWorld(overshootMm, pid);
        const headCutter = MeshBuilder.CreateCylinder(
          `${mesh.name}_csk_${i}`,
          {
            diameterTop: mmToWorld(headDiamMm, pid),
            diameterBottom: mmToWorld(feat.diameterMm, pid),
            height: headDepthWorld,
            tessellation: 24,
          },
          scene
        );
        orientCylinderToFace(headCutter, feat.face);
        headCutter.position.copyFrom(
          basis.normal
            .scale(headCenterAlongNormal)
            .add(basis.uAxis.scale(mmToWorld(pt.uMm, pid)))
            .add(basis.vAxis.scale(mmToWorld(pt.vMm, pid)))
        );
        current = performLocalBoolean(current, headCutter, 'subtract', scene);
      }
    }
  }

  return current;
}

function applyBoxOpFeature(
  mesh: Mesh,
  recipe: MiniCadRecipe,
  feat: MiniCadBoxOpFeature,
  scene: Scene
): Mesh {
  const pid = recipe.profileId;
  const basis = getFaceBasis(feat.face, recipe.dimensionsMm);
  const faceDistWorld = mmToWorld(basis.spanAlongNormalMm * 0.5, pid);
  const overshootMm = feat.kind === 'cutout' ? 2.0 : 0.4;
  const depthMm = feat.throughAll
    ? basis.spanAlongNormalMm + overshootMm * 2
    : Math.max(0.5, feat.depthMm) + overshootMm;
  const depthWorld = mmToWorld(depthMm, pid);

  const centerAlongNormal =
    feat.kind === 'cutout'
      ? feat.throughAll
        ? 0
        : faceDistWorld - depthWorld * 0.5 + mmToWorld(overshootMm, pid)
      : faceDistWorld + depthWorld * 0.5 - mmToWorld(overshootMm, pid);

  const centerPos = basis.normal
    .scale(centerAlongNormal)
    .add(basis.uAxis.scale(mmToWorld(feat.offsetUMm, pid)))
    .add(basis.vAxis.scale(mmToWorld(feat.offsetVMm, pid)));

  let opMesh: Mesh;
  if (feat.shape === 'cylinder') {
    opMesh = MeshBuilder.CreateCylinder(
      `${mesh.name}_op`,
      {
        diameter: mmToWorld(Math.max(1, feat.widthMm), pid),
        height: depthWorld,
        tessellation: 28,
      },
      scene
    );
    orientCylinderToFace(opMesh, feat.face);
  } else {
    opMesh = createAxisAlignedBoxOnFace(
      `${mesh.name}_op`,
      mmToWorld(Math.max(1, feat.widthMm), pid),
      depthWorld,
      mmToWorld(Math.max(1, feat.heightMm), pid),
      basis,
      scene
    );
  }
  opMesh.position.copyFrom(centerPos);

  return performLocalBoolean(mesh, opMesh, feat.kind === 'cutout' ? 'subtract' : 'union', scene);
}

/**
 * Rebuilds a Babylon.js Mesh deterministically from a non-destructive MiniCadRecipe.
 * Preserves existing position, rotation, material, and attaches the recipe into mesh.metadata.
 */
export function buildMeshFromMiniCadRecipe(
  name: string,
  recipe: MiniCadRecipe,
  scene: Scene,
  targetMesh?: Mesh
): Mesh {
  const clonedRecipe: MiniCadRecipe = JSON.parse(JSON.stringify(recipe));
  const savedPos = targetMesh ? targetMesh.position.clone() : null;
  const savedRot = targetMesh ? targetMesh.rotation.clone() : null;
  const savedQuat = targetMesh?.rotationQuaternion ? targetMesh.rotationQuaternion.clone() : null;
  const savedMat = targetMesh?.material ?? null;

  let working = buildBaseSolid(`${name}_build`, clonedRecipe, scene);

  const shells = clonedRecipe.features.filter((f) => f.kind === 'shell');
  const bosses = clonedRecipe.features.filter((f) => f.kind === 'add_boss');
  const cuts = clonedRecipe.features.filter((f) => f.kind === 'hole' || f.kind === 'cutout');
  const bevels = clonedRecipe.features.filter((f) => f.kind === 'bevel');

  for (const s of shells) {
    if (s.kind === 'shell') {
      working = applyShellFeature(working, clonedRecipe, s.wallThicknessMm, s.openFace, scene);
    }
  }
  for (const b of bosses) {
    if (b.kind === 'add_boss') {
      working = applyBoxOpFeature(working, clonedRecipe, b, scene);
    }
  }
  for (const c of cuts) {
    if (c.kind === 'hole') {
      working = applyHoleFeature(working, clonedRecipe, c, scene);
    } else if (c.kind === 'cutout') {
      working = applyBoxOpFeature(working, clonedRecipe, c, scene);
    }
  }

  for (const bv of bevels) {
    if (bv.kind === 'bevel' && bv.widthMm > 0) {
      const widthWorld = mmToWorld(bv.widthMm, clonedRecipe.profileId);
      const baseSnap = captureMeshSnapshot(working);
      const beveled = computeBeveledSnapshot(baseSnap, {
        width: widthWorld,
        segments: Math.max(1, Math.min(4, bv.segments || 2)),
        angleThresholdDeg: bv.angleThresholdDeg ?? 30,
        nonDestructive: false,
      });
      restoreMeshSnapshot(working, beveled.snapshot);
    }
  }

  // Recompute flat/smooth normals cleanly
  const positions = working.getVerticesData(VertexBuffer.PositionKind);
  const indices = working.getIndices();
  if (positions && indices) {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    working.setVerticesData(VertexBuffer.NormalKind, normals, true);
  }

  if (targetMesh && !targetMesh.isDisposed()) {
    const vd = VertexData.ExtractFromMesh(working, true);
    vd.applyToMesh(targetMesh, true);
    if (!working.isDisposed()) working.dispose();

    targetMesh.scaling.set(1, 1, 1);
    if (savedPos) targetMesh.position.copyFrom(savedPos);
    if (savedQuat) targetMesh.rotationQuaternion = savedQuat;
    else if (savedRot) targetMesh.rotation.copyFrom(savedRot);
    if (savedMat) targetMesh.material = savedMat;
    targetMesh.refreshBoundingInfo();
    targetMesh.computeWorldMatrix(true);
    targetMesh.metadata = {
      ...(targetMesh.metadata || {}),
      miniCadRecipe: clonedRecipe,
    };
    return targetMesh;
  }

  working.name = name;
  if (clonedRecipe.color) {
    const mat = new PBRMaterial(`${name}_cad_mat`, scene);
    mat.albedoColor = Color3.FromHexString(clonedRecipe.color);
    mat.roughness = clonedRecipe.profileId === 'woodwork' ? 0.72 : clonedRecipe.profileId === 'mechanics' ? 0.35 : 0.45;
    mat.metallic = clonedRecipe.profileId === 'mechanics' ? 0.65 : 0.05;
    mat.backFaceCulling = false;
    working.material = mat;
  }
  working.refreshBoundingInfo();
  working.computeWorldMatrix(true);
  working.metadata = {
    ...(working.metadata || {}),
    miniCadRecipe: clonedRecipe,
  };
  return working;
}

export function getMiniCadRecipe(mesh: Mesh | null | undefined): MiniCadRecipe | null {
  const recipe = mesh?.metadata?.miniCadRecipe;
  if (recipe && recipe.version === 1 && recipe.dimensionsMm) {
    return recipe as MiniCadRecipe;
  }
  return null;
}

/**
 * Computes a printability & manifold geometry report for any mesh using active profile units.
 */
export function inspectMeshPrintability(
  mesh: Mesh,
  profileId: MiniCadProfileId
): MiniCadPrintabilityReport {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const sizeWorld = bb.maximumWorld.subtract(bb.minimumWorld);
  const widthMm = roundMm(worldToMm(sizeWorld.x, profileId), 2);
  const heightMm = roundMm(worldToMm(sizeWorld.y, profileId), 2);
  const depthMm = roundMm(worldToMm(sizeWorld.z, profileId), 2);
  const floatingAboveFloorMm = roundMm(worldToMm(bb.minimumWorld.y, profileId), 2);

  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) || [];
  const indices = mesh.getIndices() || [];
  const triCount = Math.floor(indices.length / 3);

  // Quantized spatial edge manifold check & signed volume calculation
  const quant = 1e4;
  const keyForVert = (idx: number): string => {
    const x = Math.round((positions[idx * 3] || 0) * quant);
    const y = Math.round((positions[idx * 3 + 1] || 0) * quant);
    const z = Math.round((positions[idx * 3 + 2] || 0) * quant);
    return `${x},${y},${z}`;
  };

  const edgeCounts = new Map<string, number>();
  let signedVolWorld = 0;

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    const k0 = keyForVert(i0);
    const k1 = keyForVert(i1);
    const k2 = keyForVert(i2);

    const edges: Array<[string, string]> = [
      [k0, k1],
      [k1, k2],
      [k2, k0],
    ];
    for (const [a, b] of edges) {
      if (a === b) continue;
      const eKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCounts.set(eKey, (edgeCounts.get(eKey) || 0) + 1);
    }

    const ax = positions[i0 * 3] || 0;
    const ay = positions[i0 * 3 + 1] || 0;
    const az = positions[i0 * 3 + 2] || 0;
    const bx = positions[i1 * 3] || 0;
    const by = positions[i1 * 3 + 1] || 0;
    const bz = positions[i1 * 3 + 2] || 0;
    const cx = positions[i2 * 3] || 0;
    const cy = positions[i2 * 3 + 1] || 0;
    const cz = positions[i2 * 3 + 2] || 0;

    signedVolWorld +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6.0;
  }

  let openBoundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) openBoundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const mmPerUnit = getProfileConfig(profileId).mmPerUnit;
  const volumeMm3 = Math.abs(signedVolWorld) * Math.pow(mmPerUnit, 3);
  const volumeCm3 = roundMm(volumeMm3 / 1000, 2);

  const recipe = getMiniCadRecipe(mesh);
  const shellFeature = recipe?.features.find((f) => f.kind === 'shell');
  const minWallEstimateMm =
    shellFeature && shellFeature.kind === 'shell'
      ? shellFeature.wallThicknessMm
      : Math.min(widthMm, heightMm, depthMm);

  const warnings: string[] = [];
  const isWatertight = openBoundaryEdges === 0 && nonManifoldEdges === 0 && triCount > 0;
  if (openBoundaryEdges > 0) {
    warnings.push(`Mesh has ${openBoundaryEdges} open boundary edge(s) and may need repair before slicing.`);
  }
  if (nonManifoldEdges > 0) {
    warnings.push(`Mesh has ${nonManifoldEdges} non-manifold edge(s).`);
  }
  if (profileId === '3d_print' && minWallEstimateMm < 0.8) {
    warnings.push(`Minimum wall thickness (${minWallEstimateMm} mm) is thinner than 0.8 mm (2 FDM perimeters).`);
  }
  if (floatingAboveFloorMm > 0.5) {
    warnings.push(`Part bottom is ${floatingAboveFloorMm} mm above the print bed (Y = 0). Click "Drop to Floor" before exporting.`);
  }
  if (floatingAboveFloorMm < -0.5) {
    warnings.push(`Part extends ${Math.abs(floatingAboveFloorMm)} mm below Y = 0.`);
  }

  return {
    meshName: mesh.name,
    profileId,
    isWatertight,
    openBoundaryEdges,
    nonManifoldEdges,
    floatingAboveFloorMm,
    minWallEstimateMm: roundMm(minWallEstimateMm, 2),
    warnings,
    stats: {
      widthMm,
      heightMm,
      depthMm,
      volumeCm3,
      triangleCount: triCount,
    },
  };
}

/**
 * Generates a sorted woodwork/panel cut list from all valid scene meshes.
 */
export function generateCutList(
  meshes: Mesh[],
  profileId: MiniCadProfileId
): MiniCadCutListItem[] {
  const grouped = new Map<string, MiniCadCutListItem>();

  for (const mesh of meshes) {
    if (!mesh || mesh.isDisposed() || mesh.getTotalVertices() === 0) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    const size = mesh.getBoundingInfo().boundingBox.maximumWorld.subtract(
      mesh.getBoundingInfo().boundingBox.minimumWorld
    );
    const dimsSorted = [
      roundMm(worldToMm(size.x, profileId), 1),
      roundMm(worldToMm(size.y, profileId), 1),
      roundMm(worldToMm(size.z, profileId), 1),
    ].sort((a, b) => b - a);

    const recipe = getMiniCadRecipe(mesh);
    const shape = recipe ? recipe.baseShape : 'mesh';
    const key = `${dimsSorted[0]}x${dimsSorted[1]}x${dimsSorted[2]}|${shape}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
      if (!existing.name.includes(mesh.name)) {
        existing.name = `${existing.name.split(' (+')[0]} (+${existing.quantity - 1} more)`;
      }
    } else {
      grouped.set(key, {
        name: mesh.name,
        lengthMm: dimsSorted[0],
        widthMm: dimsSorted[1],
        thicknessMm: dimsSorted[2],
        quantity: 1,
        shape,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.lengthMm * b.widthMm - a.lengthMm * a.widthMm);
}
