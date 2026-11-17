import { Matrix, Mesh, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColladaConverter, ModelCompressor } from '../../src';
import { MeshEditorService } from '../../src/MeshEditorService';

function createSampleColladaXml(options?: {
  upAxis?: 'Y_UP' | 'Z_UP';
  unitMeter?: number;
  texturePath?: string;
}): string {
  const upAxis = options?.upAxis || 'Y_UP';
  const unitMeter = options?.unitMeter ?? 1.0;
  const texturePath = options?.texturePath;

  const imagesXml = texturePath
    ? `
  <library_images>
    <image id="crate_img" name="crate_img">
      <init_from>${texturePath}</init_from>
    </image>
  </library_images>`
    : '';

  const effectXml = texturePath
    ? `
        <newparam sid="crate_surface">
          <surface type="2D">
            <init_from>crate_img</init_from>
          </surface>
        </newparam>
        <newparam sid="crate_sampler">
          <sampler2D>
            <source>crate_surface</source>
          </sampler2D>
        </newparam>
        <technique sid="common">
          <phong>
            <diffuse>
              <texture texture="crate_sampler" texcoord="UVMap"/>
            </diffuse>
            <shininess>
              <float>40</float>
            </shininess>
          </phong>
        </technique>`
    : `
        <technique sid="common">
          <phong>
            <diffuse>
              <color sid="diffuse">0.2 0.6 0.9 1</color>
            </diffuse>
            <shininess>
              <float>40</float>
            </shininess>
          </phong>
        </technique>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="${unitMeter}"/>
    <up_axis>${upAxis}</up_axis>
  </asset>${imagesXml}
  <library_effects>
    <effect id="Mat-effect">
      <profile_COMMON>${effectXml}
      </profile_COMMON>
    </effect>
  </library_effects>
  <library_materials>
    <material id="Mat-material" name="CrateMaterial">
      <instance_effect url="#Mat-effect"/>
    </material>
  </library_materials>
  <library_geometries>
    <geometry id="Tri-mesh" name="TriMesh">
      <mesh>
        <source id="Tri-positions">
          <float_array id="Tri-positions-array" count="9">0 0 0 1 0 0 0 1 0</float_array>
          <technique_common>
            <accessor source="#Tri-positions-array" count="3" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="Tri-normals">
          <float_array id="Tri-normals-array" count="3">0 0 1</float_array>
          <technique_common>
            <accessor source="#Tri-normals-array" count="1" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="Tri-uvs">
          <float_array id="Tri-uvs-array" count="6">0 0 1 0 0 1</float_array>
          <technique_common>
            <accessor source="#Tri-uvs-array" count="3" stride="2">
              <param name="S" type="float"/>
              <param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="Tri-vertices">
          <input semantic="POSITION" source="#Tri-positions"/>
        </vertices>
        <triangles material="Mat-material" count="1">
          <input semantic="VERTEX" source="#Tri-vertices" offset="0"/>
          <input semantic="NORMAL" source="#Tri-normals" offset="1"/>
          <input semantic="TEXCOORD" source="#Tri-uvs" offset="2" set="0"/>
          <p>0 0 0 1 0 1 2 0 2</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="TriNode" name="TriNode" type="NODE">
        <instance_geometry url="#Tri-mesh">
          <bind_material>
            <technique_common>
              <instance_material symbol="Mat-material" target="#Mat-material">
                <bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/>
              </instance_material>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>`;
}

describe('Collada (.dae) Pre-Stage Conversion & Import Integration Tests', () => {
  let canvas: HTMLCanvasElement;
  let engine: NullEngine;
  let service: MeshEditorService;
  let scene: Scene;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);
    engine = new NullEngine();
    service = new MeshEditorService(canvas, {}, engine);
    scene = service.scene;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.dispose();
    canvas.remove();
  });

  it('detects .dae files accurately across File objects and URLs', () => {
    const daeFile = new File(['<COLLADA/>'], 'HeroCharacter.DAE', { type: 'model/vnd.collada+xml' });
    const glbFile = new File([new Uint8Array([1, 2, 3])], 'hero.glb', { type: 'model/gltf-binary' });

    expect(ColladaConverter.isColladaFile(daeFile)).toBe(true);
    expect(ColladaConverter.isColladaFile('https://example.com/assets/model.dae?v=2#mesh')).toBe(true);
    expect(ColladaConverter.isColladaFile(glbFile)).toBe(false);
    expect(ColladaConverter.hasColladaFiles([glbFile, daeFile])).toBe(true);
    expect(ColladaConverter.hasColladaFiles([glbFile])).toBe(false);
  });

  it('converts a .dae file into a valid binary .glb File using Three.js ColladaLoader + GLTFExporter', async () => {
    const daeXml = createSampleColladaXml({ upAxis: 'Z_UP', unitMeter: 0.5 });
    const daeFile = new File([daeXml], 'test_crate.dae', { type: 'model/vnd.collada+xml' });

    const converted = await ColladaConverter.convertToGlbFile(daeFile);
    expect(converted.originalName).toBe('test_crate.dae');
    expect(converted.glbFile.name).toBe('test_crate.glb');
    expect(converted.glbFile.type).toBe('model/gltf-binary');

    const buffer = await converted.glbFile.arrayBuffer();
    const view = new DataView(buffer);
    // GLB magic bytes: 0x46546C67 ("glTF")
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);

    // Parse embedded glTF JSON chunk to verify Z_UP rotation and unit scale are preserved
    const jsonLength = view.getUint32(12, true);
    const gltfJson = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    expect(gltfJson.meshes?.length).toBeGreaterThanOrEqual(1);
    expect(gltfJson.materials?.[0]?.name).toBe('CrateMaterial');
    const rootNodeIdx = gltfJson.scenes?.[0]?.nodes?.[0];
    const rootNode = gltfJson.nodes?.[rootNodeIdx];
    expect(rootNode).toBeDefined();
    // GLTFExporter serializes combined rotation (Z_UP -> Y_UP) + scale (0.5) as a 4x4 matrix by default
    if (rootNode.matrix) {
      // Column 0 length should equal 0.5, and column 1/2 reflects -90deg X rotation
      const m = rootNode.matrix;
      const col0Len = Math.hypot(m[0], m[1], m[2]);
      expect(col0Len).toBeCloseTo(0.5, 4);
      expect(m[6]).toBeCloseTo(-0.5, 4);
    } else {
      expect(rootNode.scale).toEqual([0.5, 0.5, 0.5]);
    }
  });

  it('automatically invokes the .dae pre-stage in loadFiles() and loads the converted GLB into Babylon', async () => {
    const daeXml = createSampleColladaXml({ upAxis: 'Y_UP' });
    const daeFile = new File([daeXml], 'prop_shield.dae', { type: 'model/vnd.collada+xml' });
    const onModelLoaded = vi.fn();
    service.events.onModelLoaded = onModelLoaded;

    // Seed an existing mesh so we verify loadFiles replaces the scene cleanly
    const oldBox = MeshBuilder.CreateBox('oldBox', { size: 1 }, scene);
    service.importedMeshes.push(oldBox);

    await service.loadFiles([daeFile]);

    expect(oldBox.isDisposed()).toBe(true);
    expect(service.currentFilename).toBe('prop_shield.dae');
    expect(service.exportParams.filename).toBe('prop_shield_edited');
    expect(onModelLoaded).toHaveBeenCalledWith('prop_shield.dae');

    const geoMeshes = service.importedMeshes.filter((m) => m instanceof Mesh && m.getTotalVertices() > 0);
    expect(geoMeshes.length).toBeGreaterThanOrEqual(1);
    expect(geoMeshes[0].getTotalVertices()).toBeGreaterThanOrEqual(3);
  });

  it('automatically invokes the .dae pre-stage in importFiles() and importFile() without clearing existing scene meshes', async () => {
    const existing = MeshBuilder.CreateBox('existing_cube', { size: 1 }, scene);
    service.importedMeshes.push(existing);

    const daeFileA = new File([createSampleColladaXml()], 'barrel_a.dae', { type: 'model/vnd.collada+xml' });
    const daeFileB = new File([createSampleColladaXml()], 'barrel_b.dae', { type: 'model/vnd.collada+xml' });

    await service.importFiles([daeFileA]);
    expect(existing.isDisposed()).toBe(false);
    expect(service.groups.some((g) => g.name.startsWith('barrel_a_group_'))).toBe(true);

    await service.importFile(daeFileB);
    expect(existing.isDisposed()).toBe(false);
    expect(service.groups.some((g) => g.name.startsWith('barrel_b_group_'))).toBe(true);
  });

  it('resolves companion texture files in a multi-file batch without re-applying consumed textures via applyDroppedTextures', async () => {
    // Spy on URL.createObjectURL / revokeObjectURL and Image loading in jsdom so texture resolution
    // completes synchronously without network/canvas dependency in Node
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-dae-texture');
    URL.revokeObjectURL = vi.fn();

    // Mock HTMLImageElement src setter to trigger immediate error/load completion in jsdom
    const origImageSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set(value: string) {
        origImageSrcDesc?.set?.call(this, value);
        queueMicrotask(() => {
          this.dispatchEvent(new Event('error'));
        });
      },
      get() {
        return origImageSrcDesc?.get?.call(this) ?? '';
      },
    });

    try {
      const daeXml = createSampleColladaXml({ texturePath: 'textures/wood_albedo.png' });
      const daeFile = new File([daeXml], 'wooden_crate.dae', { type: 'model/vnd.collada+xml' });
      const texFile = new File([new Uint8Array([137, 80, 78, 71])], 'wood_albedo.png', { type: 'image/png' });
      const applyDroppedSpy = vi.spyOn(service, 'applyDroppedTextures');

      const batch = await ColladaConverter.preprocessImportFiles([daeFile, texFile]);
      expect(batch.convertedFromDae).toBe(true);
      expect(batch.convertedCount).toBe(1);
      expect(batch.consumedTextureFiles.has(texFile)).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalledWith(texFile);

      await service.importFiles([daeFile, texFile]);
      expect(applyDroppedSpy).not.toHaveBeenCalled();
    } finally {
      if (origImageSrcDesc) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', origImageSrcDesc);
      }
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });

  it('warns gracefully when a .dae references a missing texture instead of crashing', async () => {
    const origImageSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set(value: string) {
        origImageSrcDesc?.set?.call(this, value);
        queueMicrotask(() => {
          this.dispatchEvent(new Event('error'));
        });
      },
      get() {
        return origImageSrcDesc?.get?.call(this) ?? '';
      },
    });

    try {
      const daeXml = createSampleColladaXml({ texturePath: 'missing_diffuse.png' });
      const daeFile = new File([daeXml], 'missing_tex.dae', { type: 'model/vnd.collada+xml' });

      const converted = await ColladaConverter.convertToGlbFile(daeFile);
      expect(converted.glbFile.name).toBe('missing_tex.glb');
      expect(converted.warnings.some((w) => w.includes('missing_diffuse.png'))).toBe(true);
    } finally {
      if (origImageSrcDesc) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', origImageSrcDesc);
      }
    }
  });

  it('supports loading .dae files inside ModelCompressor.loadModelFromFile', async () => {
    const daeFile = new File([createSampleColladaXml()], 'compress_target.dae', {
      type: 'model/vnd.collada+xml',
    });

    const loaded = await ModelCompressor.loadModelFromFile(daeFile, engine);
    try {
      expect(loaded.filename).toBe('compress_target.dae');
      expect(loaded.meshes.some((m) => m.getTotalVertices() > 0)).toBe(true);
    } finally {
      loaded.dispose();
    }
  });

  it('repairs skin.skeleton root for skinned Collada meshes whose joint list starts with child bones (wing_L/wing_R)', async () => {
    const skinnedDaeXml = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="0.01"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_geometries>
    <geometry id="Wings-mesh" name="Wings">
      <mesh>
        <source id="pos">
          <float_array id="pos-arr" count="18">-100 0 0  -50 0 0  -100 0 50  100 0 0  50 0 0  100 0 50</float_array>
          <technique_common>
            <accessor source="#pos-arr" count="6" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="col">
          <float_array id="col-arr" count="18">0 0 0  0 0 0  0 0 0  0 0 0  0 0 0  0 0 0</float_array>
          <technique_common>
            <accessor source="#col-arr" count="6" stride="3">
              <param name="R" type="float"/><param name="G" type="float"/><param name="B" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#v" offset="0"/>
          <input semantic="COLOR" source="#col" offset="0"/>
          <p>0 1 2 3 4 5</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_controllers>
    <controller id="Armature_Wings-skin" name="Armature">
      <skin source="#Wings-mesh">
        <bind_shape_matrix>1 0 0 0  0 1 0 0  0 0 1 100  0 0 0 1</bind_shape_matrix>
        <source id="joints-src">
          <Name_array id="joints-arr" count="2">wing_L wing_R</Name_array>
          <technique_common><accessor source="#joints-arr" count="2" stride="1"><param name="JOINT" type="name"/></accessor></technique_common>
        </source>
        <source id="ibm-src">
          <float_array id="ibm-arr" count="32">
            1 0 0 100  0 1 0 0  0 0 1 -100  0 0 0 1
            1 0 0 -100  0 1 0 0  0 0 1 -100  0 0 0 1
          </float_array>
          <technique_common><accessor source="#ibm-arr" count="2" stride="16"><param name="TRANSFORM" type="float4x4"/></accessor></technique_common>
        </source>
        <source id="w-src">
          <float_array id="w-arr" count="2">1 1</float_array>
          <technique_common><accessor source="#w-arr" count="2" stride="1"><param name="WEIGHT" type="float"/></accessor></technique_common>
        </source>
        <joints>
          <input semantic="JOINT" source="#joints-src"/>
          <input semantic="INV_BIND_MATRIX" source="#ibm-src"/>
        </joints>
        <vertex_weights count="6">
          <input semantic="JOINT" source="#joints-src" offset="0"/>
          <input semantic="WEIGHT" source="#w-src" offset="1"/>
          <vcount>1 1 1 1 1 1</vcount>
          <v>0 0  0 0  0 0  1 1  1 1  1 1</v>
        </vertex_weights>
      </skin>
    </controller>
  </library_controllers>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="Armature" name="Armature" type="NODE">
        <node id="skl_root" name="skl_root" sid="skl_root" type="JOINT">
          <translate>0 0 50</translate>
          <node id="wing_L" name="wing_L" sid="wing_L" type="JOINT">
            <translate>-100 0 50</translate>
          </node>
          <node id="wing_R" name="wing_R" sid="wing_R" type="JOINT">
            <translate>100 0 50</translate>
          </node>
        </node>
        <node id="polygon1" name="polygon1" type="NODE">
          <instance_controller url="#Armature_Wings-skin">
            <skeleton>#skl_root</skeleton>
          </instance_controller>
        </node>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;

    const daeFile = new File([skinnedDaeXml], 'winged_block.dae', { type: 'model/vnd.collada+xml' });
    const converted = await ColladaConverter.convertToGlbFile(daeFile);
    const buf = await converted.glbFile.arrayBuffer();
    const view = new DataView(buf);
    const jsonLen = view.getUint32(12, true);
    const gltfJson = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));

    // 1. skin.skeleton must point to skl_root (common ancestor), not wing_L
    const skin = gltfJson.skins?.[0];
    expect(skin).toBeDefined();
    expect(gltfJson.nodes?.[skin.skeleton]?.name).toBe('skl_root');

    // 2. Non-indexed geometry receives indices and strips near-black unused COLOR_0
    const prim = gltfJson.meshes?.[0]?.primitives?.[0];
    expect(prim?.indices).toBeDefined();
    expect(prim?.attributes?.COLOR_0).toBeUndefined();

    // 3. Load into Babylon and verify symmetric left/right wing positions & non-zero triangle count
    await service.loadFiles([daeFile]);
    const wingMesh = service.importedMeshes.find((m) => m.name === 'polygon1') as Mesh;
    expect(wingMesh).toBeDefined();
    expect(wingMesh.getTotalIndices()).toBe(6);
    expect(wingMesh.parent?.name).toBe('Armature');
    expect(wingMesh.skeleton).toBeDefined();

    wingMesh.computeWorldMatrix(true);
    wingMesh.skeleton!.prepare();
    const mats = wingMesh.skeleton!.getTransformMatrices(wingMesh);
    const pos = wingMesh.getVerticesData('position')!;
    const jIdx = wingMesh.getVerticesData('matricesIndices')!;

    const worldXs: number[] = [];
    for (let v = 0; v < 6; v++) {
      const b = jIdx[v * 4];
      const m = Matrix.FromArray(mats, b * 16);
      const localSkinned = Vector3.TransformCoordinates(new Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), m);
      const worldSkinned = Vector3.TransformCoordinates(localSkinned, wingMesh.getWorldMatrix());
      worldXs.push(worldSkinned.x);
    }

    // First 3 vertices (wing_L) and last 3 vertices (wing_R) must be on opposite sides of X=0
    expect(worldXs[0] * worldXs[3]).toBeLessThan(0);
    expect(Math.abs(worldXs[0])).toBeCloseTo(Math.abs(worldXs[3]), 3);
  });
});
