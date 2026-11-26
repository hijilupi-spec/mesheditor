import { Mesh, MeshBuilder, PBRMaterial, Scene, Texture, VertexBuffer, VertexData } from '@babylonjs/core';

export const STATIC_FIXTURE_IDS = [
  'S-STATIC-VALID-CRATE', 'S-STATIC-TRI-OVER', 'S-STATIC-OPEN-BOUNDARY', 'S-STATIC-ZERO-THICKNESS',
  'S-STATIC-NONFINITE', 'S-STATIC-UV-OOB', 'S-STATIC-UV-OVERLAP', 'S-STATIC-MULTI-UV',
  'S-STATIC-TEXTURE-FORMAT', 'S-STATIC-EXPORT-ROUNDTRIP',
] as const;

export function createStaticFixture(scene: Scene, id: typeof STATIC_FIXTURE_IDS[number]): Mesh {
  const mesh = MeshBuilder.CreateBox(id, { width: 2, height: 1.5, depth: 1 }, scene);
  const material = new PBRMaterial(`${id}-material`, scene);
  mesh.material = material;
  mesh.metadata = { fixtureId: id, targetDimensions: [2, 1.5, 1], unit: 'fixture-local-unit', intendedRestingPlane: 'world Y=0' };
  if (id === 'S-STATIC-TRI-OVER') {
    const count = 20001;
    const p = new Float32Array(count * 9); const ix = new Uint32Array(count * 3);
    for (let i = 0; i < count; i++) { const base = i * 9; p.set([0, 0, 0, 1, 0, 0, 0, 1, 0], base); ix.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3); }
    mesh.setVerticesData(VertexBuffer.PositionKind, p, true, 3); mesh.setIndices(ix); mesh.setVerticesData(VertexBuffer.UVKind, new Float32Array(count * 6), true, 2);
  } else if (id === 'S-STATIC-OPEN-BOUNDARY') {
    const data = VertexData.ExtractFromMesh(mesh); if (data.indices) data.indices = data.indices.slice(0, data.indices.length - 6); data.applyToMesh(mesh, true);
  } else if (id === 'S-STATIC-ZERO-THICKNESS') {
    const plane = MeshBuilder.CreatePlane('temporary', { size: 1 }, scene); const data = VertexData.ExtractFromMesh(plane); plane.dispose(false, false);
    data.applyToMesh(mesh, true);
  } else if (id === 'S-STATIC-NONFINITE') {
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!; p[0] = Number.NaN; mesh.setVerticesData(VertexBuffer.PositionKind, p, true, 3);
  } else if (id === 'S-STATIC-UV-OOB') {
    const uv = mesh.getVerticesData(VertexBuffer.UVKind)!; uv[0] = 1.25; mesh.setVerticesData(VertexBuffer.UVKind, uv, true, 2);
  } else if (id === 'S-STATIC-UV-OVERLAP') {
    const uv = mesh.getVerticesData(VertexBuffer.UVKind)!; for (let i = 2; i < uv.length; i++) uv[i] = uv[i % 2]; mesh.setVerticesData(VertexBuffer.UVKind, uv, true, 2);
  } else if (id === 'S-STATIC-MULTI-UV') {
    const uv = mesh.getVerticesData(VertexBuffer.UVKind)!; mesh.setVerticesData(VertexBuffer.UV2Kind, uv.slice(), true, 2);
  } else if (id === 'S-STATIC-TEXTURE-FORMAT') {
    const texture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', scene);
    texture.name = 'crate.png'; material.albedoTexture = texture;
  }
  return mesh;
}
