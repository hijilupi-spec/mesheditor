import * as BABYLON_CORE from '@babylonjs/core';
import {
  Color3,
  Color4,
  CSG,
  CSG2,
  DynamicTexture,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  MultiMaterial,
  PBRMaterial,
  Quaternion,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import * as earcutModule from 'earcut';
const earcut: any = (earcutModule as any).default || earcutModule;
import { AbstractTool } from '../AbstractTool';
import { ToolExecutionContext } from '../ToolExecutionContext';

function createFallback2DContext(): Record<string, any> {
  const noop = () => {};
  const gradStub = () => ({ addColorStop: noop });
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    setLineDash: noop,
    getLineDash: () => [],
    fillText: noop,
    strokeText: noop,
    measureText: (text: string) => ({ width: String(text || '').length * 6 }),
    createLinearGradient: gradStub,
    createRadialGradient: gradStub,
    createConicGradient: gradStub,
    createPattern: () => null,
    drawImage: noop,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    }),
    putImageData: noop,
  };
}

/**
 * DynamicTexture wrapper that preserves native CanvasRenderingContext2D in browsers
 * while providing a safe no-op 2D context fallback in headless jsdom/NullEngine runs.
 */
class SafeDynamicTexture extends DynamicTexture {
  private _fallbackCtx: any = null;

  public override getContext(): any {
    const ctx = super.getContext();
    if (ctx) return ctx;
    if (!this._fallbackCtx) {
      this._fallbackCtx = createFallback2DContext();
      (this as any)._context = this._fallbackCtx;
    }
    return this._fallbackCtx;
  }

  public override update(invertY?: boolean, premulAlpha?: boolean, allowGPUOptimization?: boolean): void {
    if (this._fallbackCtx) return;
    super.update(invertY, premulAlpha, allowGPUOptimization);
  }
}

export class ExecuteBabylonCodeTool extends AbstractTool {
  public readonly name = 'modeler_execute_babylon_code';
  public readonly description =
    'Executes custom procedural Babylon.js JavaScript code directly against the live scene. Ideal for complex parametric models with loops, math curves, CSG2 chains, or custom VertexData.';

  public readonly parameters = {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Short summary of what this script builds or updates.' },
      code: {
        type: 'string',
        description:
          'JavaScript function body (supports async/await). Available variables in scope: scene, service, MeshBuilder, Mesh, Vector3, Color3, Color4, Quaternion, Matrix, PBRMaterial, StandardMaterial, MultiMaterial, Texture, DynamicTexture, VertexData, VertexBuffer, CSG, CSG2, earcut, registerMesh(mesh), createMaterial(name, hexColor, roughness, metallic), autoUV(mesh, scale), await booleanOp(baseMesh, toolMesh, op, newName, keepTool). Return a summary string or created mesh(es).',
      },
    },
    required: ['code'],
  };

  public async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const code = String(args.code || '');
    if (!code.trim()) {
      throw new Error('Empty code passed to modeler_execute_babylon_code.');
    }

    const meshesBefore = new Set(context.service.scene.meshes);
    const explicitlyRegistered: Mesh[] = [];

    const registerMesh = (m: Mesh) => {
      if (m && m instanceof Mesh && !m.isDisposed()) {
        context.registerCreatedMesh(m);
        explicitlyRegistered.push(m);
      }
      return m;
    };

    const createMaterial = (
      name: string,
      hexColor: string = '#58a6ff',
      roughness: number = 0.45,
      metallic: number = 0.1,
      emissiveHex?: string
    ) => {
      const mat = context.getOrCreateMaterial(name, hexColor, roughness, metallic);
      if (emissiveHex) {
        mat.emissiveColor = Color3.FromHexString(this.normalizeHex(emissiveHex));
      }
      return mat;
    };

    const autoUV = (m: Mesh, scale: number = 1.0) => {
      if (m && m instanceof Mesh && !m.isDisposed()) {
        // Preserve and scale existing clean UVs on curved meshes (e.g. cylinders, spheres, lathes)
        // because triplanar projection swaps X/Z axes at 45° and creates diagonal triangle seams.
        const existingUvs = m.getVerticesData(VertexBuffer.UVKind);
        const normals = m.getVerticesData(VertexBuffer.NormalKind);
        const indices = m.getIndices();
        let hasCurvedSeam = false;
        if (existingUvs && normals && indices && indices.length >= 3) {
          const dominantAxis = (idx: number): number => {
            const nx = Math.abs(normals[idx * 3]);
            const ny = Math.abs(normals[idx * 3 + 1]);
            const nz = Math.abs(normals[idx * 3 + 2]);
            if (ny >= nx && ny >= nz) return 1;
            return nx >= nz ? 0 : 2;
          };
          for (let t = 0; t + 2 < indices.length; t += 3) {
            const a = dominantAxis(indices[t]);
            const b = dominantAxis(indices[t + 1]);
            const c = dominantAxis(indices[t + 2]);
            if (a !== b || b !== c) {
              hasCurvedSeam = true;
              break;
            }
          }
        }
        if (hasCurvedSeam && existingUvs) {
          const scaled = new Float32Array(existingUvs.length);
          for (let i = 0; i < existingUvs.length; i++) {
            scaled[i] = existingUvs[i] * scale;
          }
          m.setVerticesData(VertexBuffer.UVKind, scaled);
        } else {
          const prev = context.service.selectedMesh;
          context.service.selectedMesh = m;
          context.service.applyTriplanarUVs(scale);
          context.service.selectedMesh = prev;
        }
      }
      return m;
    };

    const resolveMeshArg = async (arg: any): Promise<Mesh | null> => {
      const resolved = await Promise.resolve(arg);
      if (!resolved) return null;
      if (typeof resolved === 'string') {
        return (
          context.findMeshByNameOrId(resolved) ||
          (context.scene.getMeshByName(resolved) as Mesh | null) ||
          null
        );
      }
      return resolved as Mesh;
    };

    const booleanOp = async (
      baseMesh: Mesh | string | Promise<Mesh | null>,
      toolMesh: Mesh | string | Promise<Mesh | null>,
      op: 'union' | 'subtract' | 'intersect' = 'subtract',
      newName?: string,
      keepTool: boolean = false
    ) => {
      const resolvedBase = await resolveMeshArg(baseMesh);
      const resolvedTool = await resolveMeshArg(toolMesh);
      if (!resolvedBase || !resolvedTool) {
        throw new Error(
          `booleanOp requires two valid meshes (received base=${typeof baseMesh === 'string' ? baseMesh : resolvedBase?.name || String(resolvedBase)}, tool=${typeof toolMesh === 'string' ? toolMesh : resolvedTool?.name || String(resolvedTool)}). Note: booleanOp is async, use await booleanOp(...).`
        );
      }
      const res = await context.service.performCSGOperation(resolvedBase, resolvedTool, op, keepTool);
      if (res && newName) res.name = newName;
      return res;
    };

    const BABYLON_NS = {
      ...BABYLON_CORE,
      DynamicTexture: SafeDynamicTexture,
    };

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'scene',
      'service',
      'BABYLON',
      'MeshBuilder',
      'Mesh',
      'Vector3',
      'Color3',
      'Color4',
      'Quaternion',
      'Matrix',
      'PBRMaterial',
      'StandardMaterial',
      'MultiMaterial',
      'Texture',
      'DynamicTexture',
      'VertexData',
      'VertexBuffer',
      'CSG',
      'CSG2',
      'earcut',
      'registerMesh',
      'createMaterial',
      'createPBRMaterial',
      'autoUV',
      'booleanOp',
      code
    );

    const returnVal = await fn(
      context.scene,
      context.service,
      BABYLON_NS,
      MeshBuilder,
      Mesh,
      Vector3,
      Color3,
      Color4,
      Quaternion,
      Matrix,
      PBRMaterial,
      StandardMaterial,
      MultiMaterial,
      Texture,
      SafeDynamicTexture,
      VertexData,
      VertexBuffer,
      CSG,
      CSG2,
      earcut,
      registerMesh,
      createMaterial,
      createMaterial,
      autoUV,
      booleanOp
    );

    // Automatically register any new non-disposed meshes added to the scene during script execution
    const newlyAdded: string[] = [];
    for (const m of context.service.scene.meshes) {
      if (
        !meshesBefore.has(m) &&
        m instanceof Mesh &&
        !m.isDisposed() &&
        !context.service.isEditorHelper(m) &&
        m.getTotalVertices() > 0
      ) {
        context.registerCreatedMesh(m);
        newlyAdded.push(m.name);
      }
    }

    // Remove any disposed meshes from importedMeshes
    context.service.importedMeshes = context.service.importedMeshes.filter((m) => !m.isDisposed());

    return JSON.stringify({
      status: 'ok',
      createdMeshes: Array.from(new Set([...explicitlyRegistered.map((m) => m.name), ...newlyAdded])),
      result: returnVal !== undefined ? returnVal : undefined,
    });
  }
}

