import { Mesh } from '@babylonjs/core';
import { ToolExecutionContext } from '../ToolExecutionContext';

export interface ArchitecturalTextureResult {
  generated: boolean;
  generatorBackend?: string;
  isAI?: boolean;
}

/**
 * Generates and applies an AI/procedural PBR texture to a newly created architectural mesh
 * when `texturePrompt` is provided, awaiting completion before the tool returns.
 */
export async function applyArchitecturalTexturePrompt(
  context: ToolExecutionContext,
  mesh: Mesh,
  args: { texturePrompt?: string; uvScale?: number },
  defaultUvScale = 2.0
): Promise<ArchitecturalTextureResult> {
  if (!args.texturePrompt || !context.service.aiTextureGenerator) {
    return { generated: false };
  }

  try {
    const item = await context.service.aiTextureGenerator.generateTexture({
      prompt: args.texturePrompt,
      applyToMesh: mesh.name,
      uvScale: typeof args.uvScale === 'number' ? args.uvScale : defaultUvScale,
      useAI: true,
      fallbackToProcedural: true,
    });
    return {
      generated: true,
      generatorBackend: item.generatorBackend || 'procedural',
      isAI: !!item.isAI,
    };
  } catch (err: any) {
    console.warn(`Texture generation for ${mesh.name} failed:`, err);
    return { generated: false };
  }
}
