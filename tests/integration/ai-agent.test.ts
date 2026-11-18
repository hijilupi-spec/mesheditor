import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { NullEngine } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_AGENT_SKILLS, discoverSkills, parseSkillMarkdown } from '../../src/builtInSkills';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';

describe('AI Mesh Agent (Text-to-Mesh, Image-to-Mesh & Mesh Update) Integration Tests', () => {
  let canvas: HTMLCanvasElement;
  let engine: NullEngine;
  let service: MeshEditorService;

  beforeEach(() => {
    localStorage.clear();
    canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);
    engine = new NullEngine();
    service = new MeshEditorService(canvas, {}, engine);
  });

  afterEach(() => {
    service.dispose();
    canvas.remove();
  });

  describe('1. OpenAI-Compatible Endpoint Configuration & Built-in Skills', () => {
    it('saves and persists OpenAI-compatible endpoint config and resolves URLs', () => {
      const updated = service.aiAgent.saveConfig({
        baseUrl: 'https://openrouter.ai/api/v1/',
        apiKey: 'sk-or-test-12345',
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.15,
      });

      expect(updated.baseUrl).toBe('https://openrouter.ai/api/v1/');
      expect(updated.apiKey).toBe('sk-or-test-12345');
      expect(updated.model).toBe('anthropic/claude-3.5-sonnet');
      expect(service.aiAgent.getChatCompletionsUrl()).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(service.aiAgent.getModelsUrl()).toBe('https://openrouter.ai/api/v1/models');

      const stored = JSON.parse(localStorage.getItem('mesheditor_ai_agent_config') || '{}');
      expect(stored.model).toBe('anthropic/claude-3.5-sonnet');
      expect(stored.apiKey).toBe('sk-or-test-12345');

      // Verify Gemini endpoint normalizes deprecated gemini-2.5-pro and shorthand flash aliases to gemini-3-flash-preview
      const geminiCfg = service.aiAgent.saveConfig({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.5-pro',
      });
      expect(geminiCfg.model).toBe('gemini-3-flash-preview');

      const flashAliasCfg = service.aiAgent.saveConfig({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.8-flash',
      });
      expect(flashAliasCfg.model).toBe('gemini-3-flash-preview');

      const proAliasCfg = service.aiAgent.saveConfig({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'models/gemini-3.1-pro-preview',
      });
      expect(proAliasCfg.model).toBe('gemini-3.1-pro-preview');
    });

    it('fetches available models from OpenAI-compatible /models endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o3-mini' }],
        }),
      });
      service.aiAgent.customFetch = mockFetch as any;

      const models = await service.aiAgent.fetchAvailableModels({
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'test-key',
      });

      expect(models).toEqual(['gpt-4o', 'gpt-4o-mini', 'o3-mini']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('includes built-in Babylon.js procedural-modeler, voxel-painter, mesh-updater, image-to-mesh, figure-sculptor, and neural-3d-generator skills', () => {
      const skills = service.aiAgent.getSkills();
      expect(skills.length).toBe(BUILT_IN_AGENT_SKILLS.length);
      expect(skills.map((s) => s.id)).toEqual([
        'procedural-modeler',
        'voxel-painter',
        'mesh-updater',
        'image-to-mesh',
        'figure-sculptor',
        'neural-3d-generator',
      ]);

      const sysPrompt = service.aiAgent.buildSystemPrompt();
      expect(sysPrompt).toContain('Procedural Modeler (MeshBuilder, CSG2, Extrude, Lathe)');
      expect(sysPrompt).toContain('Voxel & Block Modeler');
      expect(sysPrompt).toContain('Mesh Updater & Scene Sculptor');
      expect(sysPrompt).toContain('Image to 3D Mesh Vision Analyzer');
      expect(sysPrompt).toContain('Figure Sculptor & Game Retopology');
      expect(sysPrompt).toContain('Neural 3D Generator Delegation');

      // Disable voxel-painter and verify system prompt updates
      service.aiAgent.setSkillEnabled('voxel-painter', false);
      const updatedPrompt = service.aiAgent.buildSystemPrompt();
      expect(updatedPrompt).not.toContain('Voxel & Block Modeler');
    });

    it('discovers skills from /skills directory and parses markdown with YAML frontmatter', () => {
      const skills = discoverSkills();
      expect(skills.length).toBeGreaterThanOrEqual(4);
      expect(skills.some((s) => s.id === 'procedural-modeler')).toBe(true);

      // Test parsing frontmatter
      const sampleMd = `---
id: custom-terrain
name: Procedural Terrain Modeler
description: Generates heightmap terrains and noise landscapes.
enabled: false
---
# Terrain Generation
Use simplex noise to deform planes.`;

      const parsed = parseSkillMarkdown(sampleMd, 'fallback-id');
      expect(parsed.id).toBe('custom-terrain');
      expect(parsed.name).toBe('Procedural Terrain Modeler');
      expect(parsed.description).toBe('Generates heightmap terrains and noise landscapes.');
      expect(parsed.enabled).toBe(false);
      expect(parsed.instructions).toContain('Use simplex noise to deform planes.');

      // Test parsing pure markdown without frontmatter
      const pureMd = `# Low Poly Trees
Build low-poly trees using cylinder trunks and icosphere foliage.`;
      const parsedPure = parseSkillMarkdown(pureMd, 'low-poly-tree');
      expect(parsedPure.id).toBe('low-poly-tree');
      expect(parsedPure.name).toBe('Low Poly Trees');
      expect(parsedPure.description).toContain('Build low-poly trees');
      expect(parsedPure.enabled).toBe(true);

      // Register skill into agent service
      service.aiAgent.registerSkill(parsed);
      expect(service.aiAgent.getSkills().some((s) => s.id === 'custom-terrain')).toBe(true);

      // Register skill from markdown directly
      service.aiAgent.registerSkillFromMarkdown(pureMd, 'low-poly-tree');
      expect(service.aiAgent.getSkills().some((s) => s.id === 'low-poly-tree')).toBe(true);
    });
  });

  describe('2. Built-in Babylon.js Modeling Tools Execution', () => {
    it('executes primitive, extrude_polygon, lathe, tube, material, UV, and array cloning tools', async () => {
      // 1. Create Material with procedural marble texture
      const matRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_create_material', {
          materialName: 'Mat_Marble',
          albedoColor: '#f2efe9',
          roughness: 0.35,
          metallic: 0.05,
          proceduralTexture: 'marble',
          uScale: 2,
          vScale: 2,
        })
      );
      expect(matRes.status).toBe('ok');

      // 2. Extrude Polygon with hole (e.g. temple base frame)
      const polyRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_extrude_polygon', {
          name: 'Temple_Frame',
          shape: [
            [-2, -2],
            [2, -2],
            [2, 2],
            [-2, 2],
          ],
          holes: [
            [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ],
          ],
          depth: 0.5,
          position: [0, 0.5, 0],
          materialName: 'Mat_Marble',
        })
      );
      expect(polyRes.status).toBe('ok');
      expect(polyRes.vertices).toBeGreaterThan(0);

      // 3. Create Lathe (column)
      const latheRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_create_lathe', {
          name: 'Doric_Column',
          shape: [
            [0.35, 0, 0],
            [0.3, 1.5, 0],
            [0.25, 3.0, 0],
            [0.4, 3.2, 0],
          ],
          tessellation: 16,
          position: [-1.5, 0.5, -1.5],
          materialName: 'Mat_Marble',
        })
      );
      expect(latheRes.status).toBe('ok');
      expect(latheRes.vertices).toBeGreaterThan(20);

      // 4. Clone Array of columns and merge
      const cloneRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_clone_array', {
          sourceMeshName: 'Doric_Column',
          mode: 'linear',
          count: 3,
          offset: [1.5, 0, 0],
          mergeResult: true,
          newName: 'Colonnade_Row',
        })
      );
      expect(cloneRes.status).toBe('ok');
      expect(cloneRes.mergedMeshName).toBe('Colonnade_Row');

      // 5. Auto UV Mapping
      const uvRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_auto_uv_mapping', {
          meshName: 'Colonnade_Row',
          projection: 'box',
          uScale: 2,
          vScale: 2,
        })
      );
      expect(uvRes.status).toBe('ok');

      expect(service.importedMeshes.some((m) => m.name === 'Temple_Frame')).toBe(true);
      expect(service.importedMeshes.some((m) => m.name === 'Colonnade_Row')).toBe(true);
    });

    it('builds optimized multi-material voxel meshes with interior face culling', async () => {
      const voxRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_build_voxel_mesh', {
          name: 'Voxel_Tree',
          voxelSize: 0.25,
          palette: {
            trunk: { color: '#6b4423', roughness: 0.85 },
            leaves: { color: '#2e8b57', roughness: 0.65 },
          },
          boxes: [
            { start: [0, 0, 0], end: [0, 2, 0], type: 'trunk' },
            { start: [-1, 3, -1], end: [1, 4, 1], type: 'leaves' },
          ],
        })
      );

      expect(voxRes.status).toBe('ok');
      expect(voxRes.meshName).toBe('Voxel_Tree');
      expect(voxRes.solidVoxels).toBeGreaterThan(0);
      expect(voxRes.culledInteriorVoxels).toBeGreaterThanOrEqual(0);

      const treeMesh = service.importedMeshes.find((m) => m.name === 'Voxel_Tree');
      expect(treeMesh).toBeDefined();
      expect(treeMesh!.getTotalVertices()).toBeGreaterThan(0);
    });

    it('executes custom procedural Babylon.js code via modeler_execute_babylon_code', async () => {
      const codeRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_execute_babylon_code', {
          description: 'Build a procedural crystal cluster',
          code: `
            const mat = createPBRMaterial('Mat_Crystal', '#38bdf8', 0.15, 0.2, '#0284c7');
            const shards = [];
            for (let i = 0; i < 4; i++) {
              const s = MeshBuilder.CreateCylinder('Shard_' + i, {
                height: 1.5 + i * 0.3,
                diameterBottom: 0.5,
                diameterTop: 0,
                tessellation: 6
              }, scene);
              s.position.set((i - 1.5) * 0.3, 0.75, 0);
              s.material = mat;
              shards.push(s);
            }
            const merged = Mesh.MergeMeshes(shards, true, true, undefined, false, true);
            merged.name = 'Crystal_Cluster';
            registerMesh(merged);
            return { created: merged.name, vertices: merged.getTotalVertices() };
          `,
        })
      );

      expect(codeRes.status).toBe('ok');
      expect(codeRes.result.created).toBe('Crystal_Cluster');
      expect(service.importedMeshes.some((m) => m.name === 'Crystal_Cluster')).toBe(true);
    });
  });

  describe('3. End-to-End Multi-Turn Agent Loop (Text-to-Mesh, Image-to-Mesh, Mesh Update & Undo/Redo)', () => {
    it('runs Text-to-Mesh and Text-to-Mesh Update against a mocked OpenAI endpoint with single-step Undo/Redo', async () => {
      let callCount = 0;
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        callCount++;
        const body = JSON.parse(String(init?.body || '{}'));

        if (callCount === 1) {
          // Verify tools and system prompt are passed
          expect(body.tools.length).toBeGreaterThanOrEqual(13);
          expect(body.messages[0].role).toBe('system');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_1',
                        type: 'function',
                        function: {
                          name: 'modeler_create_primitive',
                          arguments: JSON.stringify({
                            shape: 'Box',
                            name: 'AI_Pedestal',
                            width: 2,
                            height: 1,
                            depth: 2,
                            position: [0, 0.5, 0],
                            color: '#94a3b8',
                          }),
                        },
                      },
                      {
                        id: 'call_2',
                        type: 'function',
                        function: {
                          name: 'modeler_create_primitive',
                          arguments: JSON.stringify({
                            shape: 'Sphere',
                            name: 'AI_Orb',
                            diameter: 1.2,
                            position: [0, 1.6, 0],
                            color: '#38bdf8',
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Created AI_Pedestal and AI_Orb on top of it.',
                },
              },
            ],
          }),
        };
      });

      const steps: string[] = [];
      const response = await service.aiAgent.runPrompt({
        prompt: 'Create a stone pedestal with a glowing blue orb on top',
        onStep: (step) => steps.push(step.toolName),
      });

      expect(response.content).toContain('AI_Pedestal');
      expect(steps).toEqual(['modeler_create_primitive', 'modeler_create_primitive']);
      expect(service.importedMeshes.map((m) => m.name)).toContain('AI_Pedestal');
      expect(service.importedMeshes.map((m) => m.name)).toContain('AI_Orb');

      // Verify single-step Undo reverts the entire AI generation turn
      service.undo();
      expect(service.importedMeshes.some((m) => m.name === 'AI_Pedestal')).toBe(false);
      expect(service.importedMeshes.some((m) => m.name === 'AI_Orb')).toBe(false);

      // Verify Redo restores the AI-generated meshes
      service.redo();
      expect(service.importedMeshes.some((m) => m.name === 'AI_Pedestal')).toBe(true);
      expect(service.importedMeshes.some((m) => m.name === 'AI_Orb')).toBe(true);
    });

    it('sends multimodal image_url payload for Image-to-Mesh requests and wires UI dialog', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const app = new MeshEditorApp({
        container,
        engine,
        layoutMode: 'floating',
      });

      let capturedRequestBody: any = null;
      app.service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedRequestBody = JSON.parse(String(init?.body || '{}'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Reconstructed 3D asset from reference image.',
                },
              },
            ],
          }),
        };
      });

      // Open AI Agent dialog via dynamic Tools menu button
      const btnToggleAI = container.querySelector('#btnToggleAIAgent') as HTMLButtonElement | null;
      const aiDialog = container.querySelector('#dialog-ai-agent') as HTMLElement | null;
      expect(btnToggleAI).not.toBeNull();
      expect(aiDialog).not.toBeNull();
      btnToggleAI?.click();
      expect(aiDialog?.style.display).toBe('flex');

      // Run Image-to-Mesh via service with a data URL image
      const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await app.service.aiAgent.runPrompt({
        prompt: 'Build this low-poly shield from the image',
        images: [sampleDataUrl],
      });

      expect(capturedRequestBody).not.toBeNull();
      const userMessage = capturedRequestBody.messages[capturedRequestBody.messages.length - 1];
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[0].type).toBe('text');
      expect(userMessage.content[1].type).toBe('image_url');
      expect(userMessage.content[1].image_url.url).toBe(sampleDataUrl);

      // Verify AI chat log empty state & reset behavior
      const chatLog = container.querySelector('#aiChatLog') as HTMLElement | null;
      const btnClearChat = container.querySelector('#btnAIClearChat') as HTMLButtonElement | null;
      expect(chatLog).not.toBeNull();
      expect(btnClearChat).not.toBeNull();

      // Initially, chat log should contain the initial empty-state text
      expect(chatLog?.querySelector('.ai-chat-empty')).not.toBeNull();
      expect(chatLog?.textContent).toContain('Text / Image to 3D Mesh & Update');

      // Click clear chat to verify the exact initial text is restored
      btnClearChat?.click();
      expect(chatLog?.querySelector('.ai-chat-empty')).not.toBeNull();
      expect(chatLog?.textContent).toContain('Text / Image to 3D Mesh & Update');
      expect(chatLog?.querySelector('.ai-chat-welcome')).toBeNull();

      app.dispose();
      container.remove();
    });

    it('renders ai-msg-text in Markdown using marked and records prompt via Speech-to-Text', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const nullEngine = new NullEngine();
      const app = new MeshEditorApp({
        container,
        engine: nullEngine,
      });

      const aiDialog = container.querySelector('#dialog-ai-agent') as HTMLElement | null;
      expect(aiDialog).not.toBeNull();
      expect(aiDialog?.style.width).toBe('380px');

      const btnRecordSpeech = container.querySelector('#btnAIRecordSpeech') as HTMLButtonElement | null;
      expect(btnRecordSpeech).not.toBeNull();
      expect(btnRecordSpeech?.title).toContain('Voice');

      // 1. Mock OpenAI endpoint that returns rich markdown response
      const markdownReply = '### Pillar Created\n\n- Height: **4.0**\n- Radius: `0.8`\n\n```ts\nmesh.position.y = 2;\n```';
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-test-md',
          choices: [
            {
              message: {
                role: 'assistant',
                content: markdownReply,
                tool_calls: [],
              },
            },
          ],
        }),
      });

      const promptInput = container.querySelector('#aiPromptInput') as HTMLTextAreaElement | null;
      const btnGenerate = container.querySelector('#btnAIGenerate') as HTMLButtonElement | null;
      const chatLog = container.querySelector('#aiChatLog') as HTMLElement | null;
      expect(promptInput).not.toBeNull();
      expect(btnGenerate).not.toBeNull();
      expect(chatLog).not.toBeNull();

      if (promptInput) {
        promptInput.value = '**Make a Roman Pillar** with _fluting_';
      }

      await app.runAIAgentPrompt();

      // Verify user message is rendered in markdown
      const userMsgText = chatLog?.querySelector('.ai-msg-user .ai-msg-text') as HTMLElement | null;
      expect(userMsgText).not.toBeNull();
      expect(userMsgText?.innerHTML).toContain('<strong>Make a Roman Pillar</strong>');
      expect(userMsgText?.innerHTML).toContain('<em>fluting</em>');

      // Verify assistant message is rendered in markdown
      const assistantMsgText = chatLog?.querySelector('.ai-msg-assistant .ai-msg-text') as HTMLElement | null;
      expect(assistantMsgText).not.toBeNull();
      expect(assistantMsgText?.innerHTML).toContain('<h3>Pillar Created</h3>');
      expect(assistantMsgText?.innerHTML).toContain('<li>Height: <strong>4.0</strong></li>');
      expect(assistantMsgText?.innerHTML).toContain('<code>0.8</code>');
      expect(assistantMsgText?.innerHTML).toContain('mesh.position.y = 2;');

      // 2. Test Speech-to-Text Recording
      class MockSpeechRecognition {
        public continuous = false;
        public interimResults = false;
        public lang = 'en-US';
        public onstart: (() => void) | null = null;
        public onresult: ((e: any) => void) | null = null;
        public onerror: ((e: any) => void) | null = null;
        public onend: (() => void) | null = null;

        public start(): void {
          setTimeout(() => this.onstart?.(), 0);
        }

        public stop(): void {
          setTimeout(() => this.onend?.(), 0);
        }

        public simulateTranscript(text: string, isFinal: boolean = true): void {
          this.onresult?.({
            results: [
              [
                { transcript: text },
              ],
            ],
          });
          if (this.onresult) {
            (this.onresult as any)({
              results: {
                length: 1,
                0: Object.assign([{ transcript: text }], { isFinal }),
              },
            });
          }
        }
      }

      let activeMockRecognition: MockSpeechRecognition | null = null;
      (window as any).SpeechRecognition = function () {
        activeMockRecognition = new MockSpeechRecognition();
        return activeMockRecognition;
      };

      // Click record button to start voice recording
      btnRecordSpeech?.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(btnRecordSpeech?.classList.contains('btn-recording')).toBe(true);
      expect(btnRecordSpeech?.title).toContain('Listening...');

      // Simulate incoming speech transcript
      activeMockRecognition?.simulateTranscript('Create a crystal dragon', true);
      expect(promptInput?.value).toBe('Create a crystal dragon');

      // Click again to stop
      btnRecordSpeech?.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(btnRecordSpeech?.classList.contains('btn-recording')).toBe(false);
      expect(btnRecordSpeech?.title).toContain('Voice');

      // Cleanup
      delete (window as any).SpeechRecognition;
      app.dispose();
      container.remove();
    });

    it('manages polygon constraints (min/max) and texture generation toggle in config and UI', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const nullEngine = new NullEngine();
      const app = new MeshEditorApp({ container, engine: nullEngine });

      // Verify default values in service config
      const defaultCfg = app.service.aiAgent.getConfig();
      expect(defaultCfg.minPolygons).toBe(200);
      expect(defaultCfg.maxPolygons).toBe(5000);
      expect(defaultCfg.createTextures).toBe(true);
      expect(defaultCfg.createNormalMaps).toBe(true);

      // Verify default system prompt reflects constraints
      const defaultPrompt = app.service.aiAgent.buildSystemPrompt();
      expect(defaultPrompt).toContain('200 to 5,000 triangles');
      expect(defaultPrompt).toContain('Colors & Materials');
      expect(defaultPrompt).toContain('Normal maps are ENABLED');

      // Verify UI controls exist in DOM
      const minPolyInput = container.querySelector('#aiMinPolyInput') as HTMLInputElement | null;
      const minPolyVal = container.querySelector('#aiMinPolyVal') as HTMLElement | null;
      const maxPolyInput = container.querySelector('#aiMaxPolyInput') as HTMLInputElement | null;
      const maxPolyVal = container.querySelector('#aiMaxPolyVal') as HTMLElement | null;
      const createTexturesCheck = container.querySelector('#aiCreateTexturesCheck') as HTMLInputElement | null;
      const createTexturesCheckQuick = container.querySelector('#aiCreateTexturesCheckQuick') as HTMLInputElement | null;
      const createNormalMapsCheck = container.querySelector('#aiCreateNormalMapsCheck') as HTMLInputElement | null;
      const createNormalMapsCheckQuick = container.querySelector('#aiCreateNormalMapsCheckQuick') as HTMLInputElement | null;

      expect(minPolyInput).not.toBeNull();
      expect(minPolyInput?.value).toBe('200');
      expect(minPolyVal?.textContent).toBe('200');

      expect(maxPolyInput).not.toBeNull();
      expect(maxPolyInput?.value).toBe('5000');
      expect(maxPolyVal?.textContent).toBe('5,000');

      expect(createTexturesCheck?.checked).toBe(true);
      expect(createTexturesCheckQuick?.checked).toBe(true);
      expect(createNormalMapsCheck?.checked).toBe(true);
      expect(createNormalMapsCheckQuick?.checked).toBe(true);

      // Change sliders and checkboxes — changes persist immediately to config & localStorage
      minPolyInput!.value = '400';
      minPolyInput!.dispatchEvent(new Event('input'));
      expect(minPolyVal?.textContent).toBe('400');

      maxPolyInput!.value = '8000';
      maxPolyInput!.dispatchEvent(new Event('input'));
      expect(maxPolyVal?.textContent).toBe('8,000');

      createTexturesCheck!.checked = false;
      createTexturesCheck!.dispatchEvent(new Event('change'));
      createNormalMapsCheck!.checked = false;
      createNormalMapsCheck!.dispatchEvent(new Event('change'));

      // Check updated config & localStorage persistence
      const updatedCfg = app.service.aiAgent.getConfig();
      expect(updatedCfg.minPolygons).toBe(400);
      expect(updatedCfg.maxPolygons).toBe(8000);
      expect(updatedCfg.createTextures).toBe(false);
      expect(updatedCfg.createNormalMaps).toBe(false);
      const persisted = JSON.parse(localStorage.getItem('mesheditor_ai_agent_config') || '{}');
      expect(persisted.minPolygons).toBe(400);
      expect(persisted.maxPolygons).toBe(8000);
      expect(persisted.createTextures).toBe(false);
      expect(persisted.createNormalMaps).toBe(false);

      // Check updated prompt
      const updatedPrompt = app.service.aiAgent.buildSystemPrompt();
      expect(updatedPrompt).toContain('400 to 8,000 triangles');
      expect(updatedPrompt).toContain('Textures DISABLED');

      // Check quick checkbox sync
      expect(createTexturesCheckQuick?.checked).toBe(false);
      createTexturesCheckQuick?.click();
      expect(app.service.aiAgent.getConfig().createTextures).toBe(true);
      expect(createTexturesCheck?.checked).toBe(true);

      expect(createNormalMapsCheckQuick?.checked).toBe(false);
      createNormalMapsCheckQuick?.click();
      expect(app.service.aiAgent.getConfig().createNormalMaps).toBe(true);
      expect(createNormalMapsCheck?.checked).toBe(true);

      app.dispose();
      container.remove();
    });

    it('removes inline AI settings drawer/button and opens AI tab in central Settings modal with all skills', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const nullEngine = new NullEngine();
      const app = new MeshEditorApp({ container, engine: nullEngine });

      const settingsModal = container.querySelector('#settingsModal') as HTMLDialogElement | null;
      const tabBtnEditing = container.querySelector('#settingsTabBtnEditing') as HTMLButtonElement | null;
      const tabBtnAI = container.querySelector('#settingsTabBtnAI') as HTMLButtonElement | null;
      const tabPanelEditing = container.querySelector('#settingsTabPanelEditing') as HTMLElement | null;
      const tabPanelAI = container.querySelector('#settingsTabPanelAI') as HTMLElement | null;
      const skillsList = container.querySelector('#aiSkillsList') as HTMLElement | null;

      // Old inline settings drawer & header gear button are removed from AI Agent panel
      expect(container.querySelector('#aiSettingsPanel')).toBeNull();
      expect(container.querySelector('#btnAISettingsToggle')).toBeNull();
      expect(settingsModal).not.toBeNull();
      expect(tabBtnEditing?.textContent?.trim()).toBe('Editing');
      expect(tabBtnAI?.textContent?.trim()).toBe('AI');
      expect(tabBtnEditing?.getAttribute('aria-selected')).toBe('true');
      expect(tabBtnAI?.getAttribute('aria-selected')).toBe('false');
      expect(tabPanelEditing?.hidden).toBe(false);
      expect(tabPanelAI?.hidden).toBe(true);

      // 1. Inline "Configure" link opens central Settings modal directly on the "AI" tab
      const btnConfigureInline = container.querySelector('#btnOpenAISettingsInline') as HTMLButtonElement | null;
      btnConfigureInline?.click();
      expect(settingsModal?.hasAttribute('open')).toBe(true);
      expect(tabBtnAI?.getAttribute('aria-selected')).toBe('true');
      expect(tabPanelAI?.hidden).toBe(false);
      expect(tabPanelEditing?.hidden).toBe(true);

      // Verify all built-in skills are rendered with name and description
      const skillItems = skillsList?.querySelectorAll('.ai-skill-item');
      expect(skillItems?.length).toBe(app.service.aiAgent.getSkills().length);
      expect(skillItems?.length).toBeGreaterThanOrEqual(4);

      skillItems?.forEach((item) => {
        const nameEl = item.querySelector('.ai-skill-name');
        const descEl = item.querySelector('.ai-skill-desc');
        expect(nameEl?.textContent).toBeTruthy();
        expect(descEl?.textContent).toBeTruthy();
      });

      // 2. Switch between Editing and AI tabs
      tabBtnEditing?.click();
      expect(tabBtnEditing?.getAttribute('aria-selected')).toBe('true');
      expect(tabPanelEditing?.hidden).toBe(false);
      expect(tabPanelAI?.hidden).toBe(true);

      tabBtnAI?.click();
      expect(tabBtnAI?.getAttribute('aria-selected')).toBe('true');
      expect(tabPanelAI?.hidden).toBe(false);

      // 3. Test Maximum Polygons up to 1,000,000 and budget chips (persists immediately)
      const maxPolyInput = container.querySelector('#aiMaxPolyInput') as HTMLInputElement | null;
      const maxPolyVal = container.querySelector('#aiMaxPolyVal') as HTMLElement | null;
      expect(maxPolyInput?.max).toBe('1000000');

      const chip1M = container.querySelector('#aiMaxPolyChips button[data-poly="1000000"]') as HTMLButtonElement | null;
      expect(chip1M).toBeTruthy();
      chip1M?.click();
      expect(maxPolyInput?.value).toBe('1000000');
      expect(maxPolyVal?.textContent).toContain('1');
      expect(app.service.aiAgent.getConfig().maxPolygons).toBe(1000000);

      // 4. Close central Settings modal via Done button
      const btnDone = container.querySelector('#btnSettingsDone') as HTMLButtonElement | null;
      btnDone?.click();
      expect(settingsModal?.hasAttribute('open')).toBe(false);

      // Verify endpoint summary badge reflects 1Mp ceiling
      const endpointSummary = container.querySelector('#aiEndpointSummaryBar') as HTMLElement | null;
      expect(endpointSummary?.textContent).toContain('1Mp');

      // 5. Test Model selector dropdown and custom input toggle
      const modelSelect = container.querySelector('#aiModelSelect') as HTMLSelectElement | null;
      const modelInput = container.querySelector('#aiModelInput') as HTMLInputElement | null;
      const btnToggleCustom = container.querySelector('#btnToggleCustomModel') as HTMLButtonElement | null;
      expect(modelSelect).toBeTruthy();
      expect(modelInput).toBeTruthy();
      expect(btnToggleCustom).toBeTruthy();

      if (modelSelect) {
        modelSelect.value = 'gemini-4-argon-medium';
        modelSelect.dispatchEvent(new Event('change'));
        expect(modelInput?.value).toBe('gemini-4-argon-medium');
        expect(app.service.aiAgent.getConfig().model).toBe('gemini-4-argon-medium');
      }

      btnToggleCustom?.click();
      expect(modelInput?.style.display).toBe('inline-block');
      expect(modelSelect?.style.display).toBe('none');
      btnToggleCustom?.click();
      expect(modelInput?.style.display).toBe('none');
      expect(modelSelect?.style.display).toBe('inline-block');

      // 7. Test Copy Button on messages and instant skills/thinking indicators
      const chatLog = container.querySelector('#aiChatLog') as HTMLElement;
      expect(chatLog).toBeTruthy();

      // Mock runPrompt endpoint
      app.service.aiAgent.customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I built a test stone pillar with fluted columns.',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'modeler_create_primitive',
                      arguments: JSON.stringify({ shape: 'box', name: 'pillar_base' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      }) as any;

      const promptInput = container.querySelector('#aiPromptInput') as HTMLTextAreaElement;
      promptInput.value = 'Build a stone pillar';
      await app.runAIAgentPrompt();

      // Verify user message has header, role, and copy button
      const userBubble = chatLog.querySelector('.ai-msg.ai-msg-user');
      expect(userBubble).toBeTruthy();
      const userCopyBtn = userBubble?.querySelector('.ai-msg-copy-btn') as HTMLButtonElement;
      expect(userCopyBtn).toBeTruthy();
      expect(userCopyBtn.title).toBe('Copy prompt');

      // Verify assistant message has header, live timer, active skills bar, tool step, and copy button
      const assistantBubble = chatLog.querySelector('.ai-msg.ai-msg-assistant');
      expect(assistantBubble).toBeTruthy();
      const assistantCopyBtn = assistantBubble?.querySelector('.ai-msg-copy-btn') as HTMLButtonElement;
      expect(assistantCopyBtn).toBeTruthy();
      expect(assistantCopyBtn.title).toBe('Copy response');

      const skillsBar = assistantBubble?.querySelector('.ai-active-skills-bar');
      expect(skillsBar).toBeTruthy();
      expect(skillsBar?.textContent).toContain('Skills:');

      const toolStep = assistantBubble?.querySelector('.ai-tool-step.is-success');
      expect(toolStep).toBeTruthy();
      expect(toolStep?.textContent).toContain('create_primitive');

      // Test clipboard copy execution
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextSpy,
        },
      });

      userCopyBtn.click();
      expect(writeTextSpy).toHaveBeenCalledWith('Build a stone pillar');

      assistantCopyBtn.click();
      expect(writeTextSpy).toHaveBeenCalledWith('I built a test stone pillar with fluted columns.');

      app.dispose();
      container.remove();
    });

    it('persists AI Agent skill selections across reloadSkills, fetchSkillsFromApi, and new app instances', async () => {
      localStorage.clear();
      const container1 = document.createElement('div');
      document.body.appendChild(container1);
      const engine1 = new NullEngine();
      const app1 = new MeshEditorApp({ container: container1, engine: engine1 });

      // Open central Settings modal on AI tab
      (container1.querySelector('#btnSettings') as HTMLButtonElement).click();
      (container1.querySelector('#settingsTabBtnAI') as HTMLButtonElement).click();

      const voxelCheckbox = container1.querySelector(
        '#aiSkillsList input[type="checkbox"][data-skill-id="voxel-painter"]'
      ) as HTMLInputElement;
      const sculptorCheckbox = container1.querySelector(
        '#aiSkillsList input[type="checkbox"][data-skill-id="figure-sculptor"]'
      ) as HTMLInputElement;
      expect(voxelCheckbox).not.toBeNull();
      expect(sculptorCheckbox).not.toBeNull();
      expect(voxelCheckbox.checked).toBe(true);

      // Toggle both skills off via change event — persists immediately to localStorage
      voxelCheckbox.checked = false;
      voxelCheckbox.dispatchEvent(new Event('change'));
      sculptorCheckbox.checked = false;
      sculptorCheckbox.dispatchEvent(new Event('change'));

      const savedConfig = JSON.parse(localStorage.getItem('mesheditor_ai_agent_config') || '{}');
      expect(savedConfig.skillStates?.['voxel-painter']).toBe(false);
      expect(savedConfig.skillStates?.['figure-sculptor']).toBe(false);

      app1.dispose();
      engine1.dispose();
      container1.remove();

      // Create a fresh app instance and mock /api/skills returning enabled: true defaults
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'voxel-painter',
            name: 'Voxel & Block Modeler',
            description: 'Voxel skill',
            instructions: 'Build voxels',
            enabled: true,
          },
          {
            id: 'figure-sculptor',
            name: 'Figure Sculptor & Game Retopology',
            description: 'Sculpt skill',
            instructions: 'Sculpt meshes',
            enabled: true,
          },
        ],
      }) as any;

      try {
        const container2 = document.createElement('div');
        document.body.appendChild(container2);
        const engine2 = new NullEngine();
        const app2 = new MeshEditorApp({ container: container2, engine: engine2 });

        await app2.service.aiAgent.fetchSkillsFromApi();
        app2.service.aiAgent.reloadSkills();

        (container2.querySelector('#btnSettings') as HTMLButtonElement).click();
        (container2.querySelector('#settingsTabBtnAI') as HTMLButtonElement).click();

        const restoredVoxel = container2.querySelector(
          '#aiSkillsList input[type="checkbox"][data-skill-id="voxel-painter"]'
        ) as HTMLInputElement;
        const restoredSculptor = container2.querySelector(
          '#aiSkillsList input[type="checkbox"][data-skill-id="figure-sculptor"]'
        ) as HTMLInputElement;
        const restoredModeler = container2.querySelector(
          '#aiSkillsList input[type="checkbox"][data-skill-id="procedural-modeler"]'
        ) as HTMLInputElement;

        expect(restoredVoxel.checked).toBe(false);
        expect(restoredSculptor.checked).toBe(false);
        expect(restoredModeler.checked).toBe(true);
        expect(app2.service.aiAgent.getSkills().find((s) => s.id === 'voxel-painter')?.enabled).toBe(false);
        expect(app2.service.aiAgent.getSkills().find((s) => s.id === 'figure-sculptor')?.enabled).toBe(false);

        app2.dispose();
        engine2.dispose();
        container2.remove();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('persists and restores external image generator selection and credentials in AI tab of central Settings', async () => {
      localStorage.clear();
      const container1 = document.createElement('div');
      document.body.appendChild(container1);
      const engine1 = new NullEngine();
      const app1 = new MeshEditorApp({ container: container1, engine: engine1 });

      (container1.querySelector('#btnOpenAISettingsInline') as HTMLButtonElement).click();

      const backendSelect1 = container1.querySelector('#aiImageGenBackendSelect') as HTMLSelectElement;
      const modelInput1 = container1.querySelector('#aiImageGenModel') as HTMLInputElement;
      const urlInput1 = container1.querySelector('#aiImageGenUrl') as HTMLInputElement;
      const keyInput1 = container1.querySelector('#aiImageGenKey') as HTMLInputElement;
      const enabledCheck1 = container1.querySelector('#aiImageGenEnabled') as HTMLInputElement;

      expect(backendSelect1).not.toBeNull();
      expect(enabledCheck1.checked).toBe(true);

      // Switch external image generator to OpenAI and set custom fields (persists on change)
      backendSelect1.value = 'openai';
      backendSelect1.dispatchEvent(new Event('change'));
      modelInput1.value = 'gpt-image-1';
      modelInput1.dispatchEvent(new Event('change'));
      urlInput1.value = 'https://api.openai.com/v1/images/generations';
      urlInput1.dispatchEvent(new Event('change'));
      keyInput1.value = 'sk-persisted-img-key';
      keyInput1.dispatchEvent(new Event('change'));

      expect(app1.service.aiAgent.getConfig().imageGeneratorActiveBackend).toBe('openai');
      expect(app1.service.externalImageGenerator.getActiveBackend()).toBe('openai');

      app1.dispose();
      engine1.dispose();
      container1.remove();

      // Reload into a brand new MeshEditorApp instance and verify UI + service state
      const container2 = document.createElement('div');
      document.body.appendChild(container2);
      const engine2 = new NullEngine();
      const app2 = new MeshEditorApp({ container: container2, engine: engine2 });

      (container2.querySelector('#btnOpenAISettingsInline') as HTMLButtonElement).click();

      const backendSelect2 = container2.querySelector('#aiImageGenBackendSelect') as HTMLSelectElement;
      const modelInput2 = container2.querySelector('#aiImageGenModel') as HTMLInputElement;
      const urlInput2 = container2.querySelector('#aiImageGenUrl') as HTMLInputElement;
      const keyInput2 = container2.querySelector('#aiImageGenKey') as HTMLInputElement;
      const enabledCheck2 = container2.querySelector('#aiImageGenEnabled') as HTMLInputElement;

      expect(enabledCheck2.checked).toBe(true);
      expect(backendSelect2.value).toBe('openai');
      expect(modelInput2.value).toBe('gpt-image-1');
      expect(urlInput2.value).toBe('https://api.openai.com/v1/images/generations');
      expect(keyInput2.value).toBe('sk-persisted-img-key');
      expect(app2.service.externalImageGenerator.getActiveBackend()).toBe('openai');
      expect(app2.service.externalImageGenerator.getProvider('openai').apiKey).toBe('sk-persisted-img-key');

      app2.dispose();
      engine2.dispose();
      container2.remove();
    });

    it('enforces size-adaptive tessellation (eye has fewer polygons than torso) and supports clay sphere sculpting', async () => {
      // 1. Verify figure-sculptor skill allows clay sphere sculpting when requested
      const sysPrompt = service.aiAgent.buildSystemPrompt();
      expect(sysPrompt).not.toContain('NEVER Attempt to Sculpt a Character from `sculpt_sphere`');
      expect(sysPrompt).toContain('Explicit Clay Sphere Requests');

      // 2. Create a small eyeball sphere (diameter 0.04m) and a larger torso sphere (diameter 0.65m)
      const eyeRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_create_primitive', {
          type: 'sphere',
          name: 'Char_Eye_Left',
          diameter: 0.04,
          position: { x: 0.06, y: 1.65, z: 0.12 },
        })
      );
      const torsoRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_create_primitive', {
          type: 'sphere',
          name: 'Char_Torso',
          diameter: 0.65,
          position: { x: 0, y: 1.15, z: 0 },
        })
      );

      expect(eyeRes.triangles).toBeLessThan(250);
      expect(torsoRes.triangles).toBeGreaterThan(eyeRes.triangles * 3);

      // 3. Spawn a clay sphere and sculpt it using directional grab and clay stroke paths
      const spawnRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_spawn_base_mesh', {
          type: 'sculpt_sphere',
          name: 'Clay_Bust_Sphere',
        })
      );
      expect(spawnRes.status).toBe('ok');

      const sculptRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_sculpt_mesh', {
          meshName: 'Clay_Bust_Sphere',
          brush: 'grab',
          symmetryX: true,
          strokes: [
            {
              from: { x: 0, y: 0.6, z: 0.45 },
              to: { x: 0, y: 0.35, z: 0.62 },
              radius: 0.35,
              strength: 0.8,
            },
            {
              from: { x: 0.25, y: 1.0, z: 0.3 },
              to: { x: 0.45, y: 1.25, z: 0.2 },
              radius: 0.28,
              strength: 0.7,
            },
          ],
        })
      );
      expect(sculptRes.status).toBe('ok');
      expect(sculptRes.strokesApplied).toBe(2);
      expect(sculptRes.samplesApplied).toBeGreaterThan(4);
    });

    it('arranges AI checkboxes in a dedicated row and runs the Multi-View Visual Critique pass with the same model', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const nullEngine = new NullEngine();
      const app = new MeshEditorApp({ container, engine: nullEngine });

      // 1. Verify dedicated checkbox row in AI Mesh Agent UI
      const checkboxRow = container.querySelector('#aiCheckboxRow.ai-checkbox-row') as HTMLElement | null;
      const modeBar = container.querySelector('.ai-mode-bar') as HTMLElement | null;
      const visualCheckQuick = container.querySelector('#aiVisualCritiqueCheckQuick') as HTMLInputElement | null;
      const visualCheckSettings = container.querySelector('#aiVisualCritiqueCheck') as HTMLInputElement | null;

      expect(checkboxRow).not.toBeNull();
      expect(modeBar).not.toBeNull();
      expect(visualCheckQuick).not.toBeNull();
      expect(visualCheckSettings).not.toBeNull();
      // Checkboxes are inside #aiCheckboxRow, separate from .ai-mode-bar
      expect(checkboxRow?.querySelectorAll('input[type="checkbox"]').length).toBe(5);
      expect(modeBar?.querySelectorAll('input[type="checkbox"]').length).toBe(0);

      // Toggle quick Visual Check checkbox and verify sync with config & settings checkbox
      expect(visualCheckQuick?.checked).toBe(false);
      visualCheckQuick?.click();
      expect(visualCheckQuick?.checked).toBe(true);
      expect(visualCheckSettings?.checked).toBe(true);
      expect(app.service.aiAgent.getConfig().visualCritique).toBe(true);

      // Verify AI Quick Prompts cover all modeling techniques and populate #aiPromptInput on click
      expect(app.getQuickPrompts().length).toBeGreaterThanOrEqual(13);
      const quickPromptChips = Array.from(
        container.querySelectorAll<HTMLButtonElement>('#aiQuickPrompts .ai-prompt-chip[data-prompt]')
      );
      expect(quickPromptChips.length).toBeGreaterThanOrEqual(10);
      const techniques = quickPromptChips.map((c) => c.getAttribute('data-technique'));
      expect(techniques.slice(0, 10)).toEqual([
        'sdf',
        'clay_sphere',
        'architecture',
        'gothic',
        'bevel',
        'lathe',
        'figure',
        'csg',
        'voxel',
        'update',
      ]);
      expect(techniques).toContain('pillar');
      expect(techniques).toContain('seating');
      expect(techniques).toContain('chibi_costume');

      // Click an item without image (SDF) and verify prompt populates
      const sdfChip = quickPromptChips[0];
      sdfChip.click();
      const promptInputCheck = container.querySelector('#aiPromptInput') as HTMLTextAreaElement;
      expect(promptInputCheck.value).toContain('modeler_create_sdf_mesh');

      // Click an item with reference image (e.g. cinema_chair or prompt with data-image) and verify both prompt and image attachment populate
      const imageChip = quickPromptChips.find((c) => c.hasAttribute('data-image'));
      expect(imageChip).toBeDefined();
      imageChip?.click();
      const attachmentsBar = container.querySelector('#aiImageAttachmentsBar') as HTMLElement;
      expect(attachmentsBar.style.display).not.toBe('none');
      expect(attachmentsBar.querySelectorAll('img').length).toBeGreaterThanOrEqual(1);

      // 2. Run a prompt with visualCritique enabled and verify:
      //    Turn 1: builds initial mesh
      //    Turn 2: returns no tool calls -> triggers Multi-View Visual Critique user message with 4-view image
      //    Turn 3 (critique pass): same model inspects 4-view sheet and emits a corrective tool call
      //    Turn 4: final summary
      const modelsUsed: string[] = [];
      const requestBodies: any[] = [];
      let callIdx = 0;

      const modelInput = container.querySelector('#aiModelInput') as HTMLInputElement | null;
      if (modelInput) {
        modelInput.value = 'gemini-3.8-flash-high';
      }
      app.service.aiAgent.saveConfig({ model: 'gemini-3.8-flash-high', visualCritique: true });
      app.service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        callIdx++;
        const body = JSON.parse(String(init?.body || '{}'));
        modelsUsed.push(body.model);
        requestBodies.push(body);

        if (callIdx === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_init_1',
                        type: 'function',
                        function: {
                          name: 'modeler_create_arch',
                          arguments: JSON.stringify({
                            name: 'Temple_Arch',
                            style: 'round',
                            span: 2.2,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        if (callIdx === 2) {
          // Model finishes initial build -> AIAgentService will inject Multi-View Visual Critique turn next
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Initial arch constructed.',
                  },
                },
              ],
            }),
          };
        }

        if (callIdx === 3) {
          // Critique turn: model sees 4-view image and adds a roof during self-correction
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_fix_1',
                        type: 'function',
                        function: {
                          name: 'modeler_create_roof',
                          arguments: JSON.stringify({
                            name: 'Temple_Gable_Roof',
                            style: 'gable',
                            width: 3.0,
                            depth: 1.0,
                            position: { x: 0, y: 3.2, z: 0 },
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Verified 4-view sheet and added the missing gable roof on top of the arch.',
                },
              },
            ],
          }),
        };
      });

      const promptInput = container.querySelector('#aiPromptInput') as HTMLTextAreaElement;
      promptInput.value = 'Build a temple arch with a gable roof';
      await app.runAIAgentPrompt();

      expect(callIdx).toBe(4);
      // Verify the exact same model was used for both building and visual critique
      expect(new Set(modelsUsed).size).toBe(1);
      expect(modelsUsed[0]).toBe('gemini-3.8-flash-high');

      // Verify Turn 3 received the [VISUAL CRITIQUE & SELF-CORRECTION PHASE] message and 4-view image_url
      const critiqueTurnMessages = requestBodies[2].messages;
      const lastMsg = critiqueTurnMessages[critiqueTurnMessages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(Array.isArray(lastMsg.content)).toBe(true);
      expect(lastMsg.content[0].text).toContain('[VISUAL CRITIQUE & SELF-CORRECTION PHASE]');
      expect(lastMsg.content[1].type).toBe('image_url');
      expect(lastMsg.content[1].image_url.url).toContain('data:image/png');

      // Both initial and self-corrected meshes exist in scene
      expect(app.service.importedMeshes.some((m) => m.name === 'Temple_Arch')).toBe(true);
      expect(app.service.importedMeshes.some((m) => m.name === 'Temple_Gable_Roof')).toBe(true);

      app.dispose();
      container.remove();
    });
  });

  describe('6. Neural 3D Generators (TRELLIS 2, Hunyuan3D, Hi3D & Local oMLX Delegation)', () => {
    it('supports configuring multiple Neural 3D Generators simultaneously and injects active providers into system prompt', () => {
      // Initially all 3 neural generators are disabled
      expect(service.aiAgent.getEnabledNeural3DProviders().length).toBe(0);
      expect(service.aiAgent.buildSystemPrompt()).not.toContain('Active Neural 3D Generators');

      // Enable all 3 via local oMLX
      service.aiAgent.setNeural3DProviderConfig('trellis', {
        enabled: true,
        protocol: 'omlx',
        endpointUrl: 'http://localhost:8000/v1/3d/generations',
        modelId: 'mlx-community/TRELLIS.2-4B',
      });
      service.aiAgent.setNeural3DProviderConfig('hunyuan3d', {
        enabled: true,
        protocol: 'omlx',
        endpointUrl: 'http://localhost:8000/v1/3d/generations',
        modelId: 'mlx-community/Hunyuan3D-2.1',
      });
      service.aiAgent.setNeural3DProviderConfig('hi3d', {
        enabled: true,
        protocol: 'omlx',
        endpointUrl: 'http://localhost:8000/v1/3d/generations',
        modelId: 'mlx-community/Hi3D-V3.0',
      });

      const enabled = service.aiAgent.getEnabledNeural3DProviders();
      expect(enabled.length).toBe(3);
      expect(enabled.map((p) => p.id)).toEqual(['trellis', 'hunyuan3d', 'hi3d']);

      const sysPrompt = service.aiAgent.buildSystemPrompt();
      expect(sysPrompt).toContain('Active Neural 3D Generators');
      expect(sysPrompt).toContain('mlx-community/TRELLIS.2-4B');
      expect(sysPrompt).toContain('mlx-community/Hunyuan3D-2.1');
      expect(sysPrompt).toContain('mlx-community/Hi3D-V3.0');
    });

    it('delegates organic hero subtasks to TRELLIS 2 / Hunyuan3D / Hi3D via modeler_generate_neural_mesh and bottom-aligns on pedestals', async () => {
      service.aiAgent.setNeural3DProviderConfig('trellis', {
        enabled: true,
        protocol: 'omlx',
        endpointUrl: 'http://localhost:8000/v1/3d/generations',
        modelId: 'mlx-community/TRELLIS.2-4B',
      });
      service.aiAgent.setNeural3DProviderConfig('hi3d', {
        enabled: true,
        protocol: 'omlx',
        endpointUrl: 'http://localhost:8000/v1/3d/generations',
        modelId: 'mlx-community/Hi3D-V3.0',
      });

      // Mock Wavefront OBJ tetrahedron/pyramid returned by local oMLX 3D endpoint (height 0.5 -> will be scaled to targetHeight 1.6 and placed at y = 0.8)
      const sampleObj = [
        '# Generated by oMLX TRELLIS.2-4B',
        'v -0.25 -0.25 -0.25',
        'v  0.25 -0.25 -0.25',
        'v  0.25 -0.25  0.25',
        'v -0.25 -0.25  0.25',
        'v  0.00  0.25  0.00',
        'f 1 2 5',
        'f 2 3 5',
        'f 3 4 5',
        'f 4 1 5',
        'f 1 4 3 2',
      ].join('\n');

      const recordedRequests: Array<{ url: string; body: any }> = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        recordedRequests.push({ url, body });
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ obj: sampleObj })).buffer,
        };
      });

      // 1. Create a procedural stone pedestal of height 0.8 (standing on Y = 0 -> top is at Y = 0.8)
      await service.aiAgent.executeToolCall('modeler_create_rounded_box', {
        name: 'Stone_Pedestal',
        width: 1.4,
        height: 0.8,
        depth: 1.4,
        radius: 0.04,
        position: { x: 0, y: 0.4, z: 0 },
      });

      // 2. Delegate the Gargoyle Statue subtask to TRELLIS 2, placing its base directly on top of the pedestal (y = 0.8)
      const resStr = await service.aiAgent.executeToolCall('modeler_generate_neural_mesh', {
        name: 'Gargoyle_Statue',
        backend: 'trellis',
        prompt: 'A weathered gothic stone gargoyle crouching with folded wings',
        targetHeight: 1.6,
        position: { x: 0, y: 0.8, z: 0 },
        color: '#8a8d91',
      });

      const res = JSON.parse(resStr);
      expect(res.status).toBe('ok');
      expect(res.provider).toBe('trellis');
      expect(res.modelId).toBe('mlx-community/TRELLIS.2-4B');
      expect(res.bounds.size.y).toBeCloseTo(1.6, 2);
      expect(res.bounds.min.y).toBeCloseTo(0.8, 2);
      expect(res.bounds.max.y).toBeCloseTo(2.4, 2);

      // 3. Test auto-routing to Hi3D when highResPrint is true
      const printResStr = await service.aiAgent.executeToolCall('modeler_generate_neural_mesh', {
        name: 'Print_Miniature_Bust',
        backend: 'auto',
        prompt: 'High detail armored knight bust for 3D printing',
        highResPrint: true,
        targetHeight: 1.0,
        position: { x: 2, y: 0, z: 0 },
      });
      const printRes = JSON.parse(printResStr);
      expect(printRes.status).toBe('ok');
      expect(printRes.provider).toBe('hi3d');
      expect(printRes.modelId).toBe('mlx-community/Hi3D-V3.0');
      expect(recordedRequests[1].body.high_res_print).toBe(true);
    });

    it('probes /config instead of /info on Gradio 4/5 servers (e.g. http://localhost:42003/) and executes 2-stage TRELLIS image_to_3d -> extract_glb SSE pipelines', async () => {
      service.aiAgent.setNeural3DProviderConfig('trellis', {
        enabled: true,
        protocol: 'gradio',
        endpointUrl: 'http://localhost:42003/',
        modelId: 'microsoft/TRELLIS-image-large',
      });

      const sampleObj = [
        '# Generated by TRELLIS Gradio',
        'v -0.5 0.0 -0.5',
        'v  0.5 0.0 -0.5',
        'v  0.5 0.0  0.5',
        'v -0.5 0.0  0.5',
        'v  0.0 1.0  0.0',
        'f 1 2 5',
        'f 2 3 5',
        'f 3 4 5',
        'f 4 1 5',
      ].join('\n');

      const mockGradioConfig = {
        version: '4.44.0',
        api_prefix: '',
        components: [
          { id: 1, type: 'image', props: { label: 'Image Prompt' } },
          { id: 2, type: 'slider', props: { label: 'Seed', value: 42 } },
          { id: 3, type: 'slider', props: { label: 'Guidance Strength', value: 7.5 } },
          { id: 4, type: 'state', props: { value: null } },
          { id: 5, type: 'video', props: { label: 'Preview Video' } },
          { id: 6, type: 'slider', props: { label: 'Simplify', value: 0.95 } },
          { id: 7, type: 'slider', props: { label: 'Texture Size', value: 1024 } },
          { id: 8, type: 'model3d', props: { label: 'Extracted GLB' } },
          { id: 9, type: 'downloadbutton', props: { label: 'Download GLB' } },
        ],
        dependencies: [
          {
            id: 0,
            api_name: 'preprocess_image',
            inputs: [1],
            outputs: [1],
            backend_fn: true,
            queue: true,
          },
          {
            id: 1,
            api_name: 'image_to_3d',
            inputs: [1, 2, 3],
            outputs: [4, 5],
            backend_fn: true,
            queue: true,
          },
          {
            id: 2,
            api_name: 'extract_glb',
            inputs: [4, 6, 7],
            outputs: [8, 9],
            backend_fn: true,
            queue: true,
          },
        ],
      };

      const calledUrls: string[] = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string) => {
        calledUrls.push(url);
        if (url === 'http://localhost:42003/info') {
          return new Response('Not Found', { status: 404, statusText: 'Not Found' });
        }
        if (url === 'http://localhost:42003/config') {
          return new Response(JSON.stringify(mockGradioConfig), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.startsWith('http://localhost:42003/upload')) {
          return new Response(JSON.stringify(['/tmp/gradio/12345/input.png']), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'http://localhost:42003/call/preprocess_image') {
          return new Response(JSON.stringify({ event_id: 'evt_prep' }), { status: 200 });
        }
        if (url === 'http://localhost:42003/call/preprocess_image/evt_prep') {
          const sse = [
            'event: complete',
            `data: ${JSON.stringify([{ path: '/tmp/gradio/12345/preprocessed.png', url: 'http://localhost:42003/file=/tmp/gradio/12345/preprocessed.png' }])}`,
            '',
          ].join('\n');
          return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        if (url === 'http://localhost:42003/call/image_to_3d') {
          return new Response(JSON.stringify({ event_id: 'evt_gen' }), { status: 200 });
        }
        if (url === 'http://localhost:42003/call/image_to_3d/evt_gen') {
          const sse = [
            'event: complete',
            `data: ${JSON.stringify([{ state_token: 'slat_state_ok' }, { path: '/tmp/gradio/12345/preview.mp4', url: 'http://localhost:42003/file=/tmp/gradio/12345/preview.mp4' }])}`,
            '',
          ].join('\n');
          return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        if (url === 'http://localhost:42003/call/extract_glb') {
          return new Response(JSON.stringify({ event_id: 'evt_ext' }), { status: 200 });
        }
        if (url === 'http://localhost:42003/call/extract_glb/evt_ext') {
          const sse = [
            'event: complete',
            `data: ${JSON.stringify([
              { path: '/tmp/gradio/12345/sample.obj' },
              { path: '/tmp/gradio/12345/sample.obj' },
            ])}`,
            '',
          ].join('\n');
          return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        if (url === 'http://localhost:42003/file=/tmp/gradio/12345/sample.obj') {
          return new Response(sampleObj, {
            status: 200,
            headers: { 'content-type': 'model/obj' },
          });
        }
        return new Response('Not Found', { status: 404 });
      });

      // 1. Test connection must hit /config first (never hitting /info 404)
      const connTest = await service.aiAgent.testNeural3DProvider('trellis');
      expect(connTest.ok).toBe(true);
      expect(connTest.message).toContain('Gradio v4.44.0');
      expect(connTest.message).toContain('3 endpoints');
      expect(calledUrls).toContain('http://localhost:42003/config');
      expect(calledUrls).not.toContain('http://localhost:42003/info');

      // 2. Test full 2-stage TRELLIS generation with reference image (upload -> preprocess_image -> image_to_3d -> extract_glb -> download /file=/tmp/...)
      const dummyPngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const genResStr = await service.aiAgent.executeToolCall('modeler_generate_neural_mesh', {
        name: 'Trellis_Gradio_Statue',
        backend: 'trellis',
        prompt: 'Ornate dragon statue',
        imageUrl: dummyPngDataUrl,
        targetHeight: 2.0,
        position: { x: 0, y: 0, z: 0 },
      });

      const genRes = JSON.parse(genResStr);
      expect(genRes.status).toBe('ok');
      expect(genRes.provider).toBe('trellis');
      expect(genRes.bounds.size.y).toBeCloseTo(2.0, 2);
      expect(calledUrls).toContain('http://localhost:42003/call/preprocess_image');
      expect(calledUrls).toContain('http://localhost:42003/call/image_to_3d');
      expect(calledUrls).toContain('http://localhost:42003/call/extract_glb');
      expect(calledUrls).toContain('http://localhost:42003/file=/tmp/gradio/12345/sample.obj');
    });
  });

  describe('10. Antigravity CLI Bridge Protocol & Babylon Script Execution', () => {
    it('frames virtual modeler_* JSON tool calls in Antigravity Bridge prompts and recovers temp .js Babylon scripts', () => {
      const require = createRequire(import.meta.url);
      const bridge = require('../../scripts/antigravity-bridge.js');

      const { prompt } = bridge.buildAgyPromptFromOpenAI(
        [{ role: 'user', content: 'Build a treasure chest' }],
        [
          {
            type: 'function',
            function: {
              name: 'modeler_execute_babylon_code',
              description: 'Executes custom Babylon.js code',
              parameters: { type: 'object', properties: { code: { type: 'string' } } },
            },
          },
        ]
      );

      expect(prompt).toContain('CRITICAL ANTIGRAVITY BRIDGE PROTOCOL');
      expect(prompt).toContain('VIRTUAL AVAILABLE 3D MODELER TOOLS');
      expect(prompt).toContain('modeler_execute_babylon_code');

      // Test recovery of a temporary .js script written to os.tmpdir()
      const tmpFile = path.join(os.tmpdir(), `agy_test_chest_${Date.now()}.js`);
      const scriptCode = `const lid = MeshBuilder.CreateBox('chest_lid', { size: 1 }, scene); registerMesh(lid);`;
      fs.writeFileSync(tmpFile, scriptCode, 'utf8');

      try {
        const recovered = bridge.parseStructuredAgentResponse(
          `I saved the Babylon.js script to ${tmpFile} for you.`
        );
        expect(recovered.toolCalls.length).toBe(1);
        expect(recovered.toolCalls[0].name).toBe('modeler_execute_babylon_code');
        expect(recovered.toolCalls[0].arguments.code).toContain('MeshBuilder.CreateBox');
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    });

    it('executes Babylon scripts using GlowLayer, DynamicTexture, ExtrudePolygon with earcut, and CreateRibbon', async () => {
      const code = `
        const gl = new BABYLON.GlowLayer('test_glow', scene);
        const dt = new DynamicTexture('test_dyn_tex', { width: 64, height: 64 }, scene, false);
        const ctx = dt.getContext();
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(0, 0, 64, 64);
        dt.update();

        const poly = MeshBuilder.ExtrudePolygon('test_extrude_poly', {
          shape: [new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 0, -0.5), new Vector3(0, 0, 0.5)],
          depth: 0.4
        }, scene);
        registerMesh(poly);

        const ribbon = MeshBuilder.CreateRibbon('test_ribbon', {
          pathArray: [
            [new Vector3(-1, 0, 0), new Vector3(1, 0, 0)],
            [new Vector3(-1, 1, 0), new Vector3(1, 1, 0)]
          ]
        }, scene);
        registerMesh(ribbon);
        gl.dispose();
      `;

      const res = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_execute_babylon_code', {
          description: 'Test GlowLayer, DynamicTexture, ExtrudePolygon, and CreateRibbon',
          code,
        })
      );

      expect(res.status).toBe('ok');
      expect(res.createdMeshes).toContain('test_extrude_poly');
      expect(res.createdMeshes).toContain('test_ribbon');
    });

    it('extracts 429 quota errors when agy returns status ERROR with empty response', () => {
      const require = createRequire(import.meta.url);
      const bridge = require('../../scripts/antigravity-bridge.js');

      const stdout = JSON.stringify({
        status: 'ERROR',
        response: '',
        error: 'RESOURCE_EXHAUSTED: {"error_code": 429, "message": "Individual quota reached for model"}',
      });

      const details = bridge.extractBridgeErrorDetails(new Error(''), stdout, '', 0);
      expect(details.statusCode).toBe(429);
      expect(details.message).toContain('Individual quota reached');
    });

    it('includes and normalizes all Gemini 4 Hydrogen modes (low, medium, high, xhigh)', () => {
      const require = createRequire(import.meta.url);
      const bridge = require('../../scripts/antigravity-bridge.js');

      expect(bridge.DEFAULT_AGY_MODELS).toEqual(
        expect.arrayContaining([
          'gemini-4-hydrogen-low',
          'gemini-4-hydrogen-medium',
          'gemini-4-hydrogen-high',
          'gemini-4-hydrogen-xhigh',
        ])
      );

      expect(bridge.normalizeAgyModel('gemini-4-hydrogen-low')).toBe('gemini-4-hydrogen-low');
      expect(bridge.normalizeAgyModel('gemini-4-hydrogen-medium')).toBe('gemini-4-hydrogen-medium');
      expect(bridge.normalizeAgyModel('gemini-4-hydrogen-high')).toBe('gemini-4-hydrogen-high');
      expect(bridge.normalizeAgyModel('gemini-4-hydrogen-xhigh')).toBe('gemini-4-hydrogen-xhigh');
      expect(bridge.normalizeAgyModel('gemini-4-hydrogen')).toBe('gemini-4-hydrogen-medium');
      expect(bridge.normalizeAgyModel('hydrogen-xhigh')).toBe('gemini-4-hydrogen-xhigh');
    });

    it('retries transient agy empty conversation id / database opener races and does not retry quota errors', async () => {
      const require = createRequire(import.meta.url);
      const bridge = require('../../scripts/antigravity-bridge.js');

      let attempts = 0;
      const res = await bridge.runAgyChatCompletion(
        {
          model: 'gemini-4-hydrogen-medium',
          messages: [{ role: 'user', content: 'Build a box' }],
        },
        {
          retryDelaysMs: [1, 1],
          execFn: async () => {
            attempts++;
            if (attempts === 1) {
              return {
                code: 1,
                stdout: JSON.stringify({
                  conversation_id: '',
                  status: 'ERROR',
                  response: '',
                  error: 'failed to start conversation: backend returned an empty conversation id',
                  finished_reason: 'error',
                }),
                stderr: '',
              };
            }
            return {
              code: 0,
              stdout: JSON.stringify({
                conversation_id: 'conv-recovered-1',
                status: 'SUCCESS',
                response: JSON.stringify({ content: 'Created box.', tool_calls: [] }),
              }),
              stderr: '',
            };
          },
        }
      );

      expect(attempts).toBe(2);
      expect(res.id).toBe('chatcmpl_agy_conv-recovered-1');
      expect(res.choices[0].message.content).toBe('Created box.');

      // Verify 429 quota errors are NOT retried
      let quotaAttempts = 0;
      await expect(
        bridge.runAgyChatCompletion(
          {
            model: 'gemini-4-hydrogen-medium',
            messages: [{ role: 'user', content: 'Build a box' }],
          },
          {
            retryDelaysMs: [1, 1],
            execFn: async () => {
              quotaAttempts++;
              return {
                code: 1,
                stdout: JSON.stringify({
                  conversation_id: '',
                  status: 'ERROR',
                  response: '',
                  error: 'RESOURCE_EXHAUSTED: {"error_code": 429, "message": "Individual quota reached"}',
                  finished_reason: 'error',
                }),
                stderr: '',
              };
            },
          }
        )
      ).rejects.toThrow(/Individual quota reached/);
      expect(quotaAttempts).toBe(1);
    });

    it('retries in AIAgentService when the Antigravity Bridge returns 500 with empty conversation id', async () => {
      let fetchAttempts = 0;
      service.aiAgent.saveConfig({ baseUrl: '/api/antigravity/v1', model: 'gemini-4-hydrogen-high' });
      service.aiAgent.customFetch = vi.fn(async () => {
        fetchAttempts++;
        if (fetchAttempts === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () =>
              JSON.stringify({
                error: {
                  message:
                    'Antigravity Bridge Error: failed to start conversation: backend returned an empty conversation id',
                },
              }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'Recovered ok.' } }],
          }),
        } as any;
      }) as any;

      const result = await service.aiAgent.runPrompt({ prompt: 'Say ok' });
      expect(fetchAttempts).toBe(2);
      expect(result.content).toBe('Recovered ok.');
    });

    it('persists optional promptSuffix in config and appends it to user prompts when set', async () => {
      const capturedBodies: any[] = [];
      service.aiAgent.customFetch = vi.fn(async (_url: string, init: any) => {
        capturedBodies.push(JSON.parse(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'Done.' } }],
          }),
        } as any;
      }) as any;

      // Without promptSuffix, prompt is sent unchanged
      await service.aiAgent.runPrompt({ prompt: 'Build a wooden barrel' });
      expect(capturedBodies[0].messages[1]).toEqual({
        role: 'user',
        content: 'Build a wooden barrel',
      });

      // Configure promptSuffix and verify persistence
      const updated = service.aiAgent.saveConfig({
        promptSuffix: 'Use low-poly stylized fantasy art style.',
      });
      expect(updated.promptSuffix).toBe('Use low-poly stylized fantasy art style.');

      const stored = JSON.parse(localStorage.getItem('mesheditor_ai_agent_config') || '{}');
      expect(stored.promptSuffix).toBe('Use low-poly stylized fantasy art style.');
      expect(service.aiAgent.loadSavedConfig().promptSuffix).toBe('Use low-poly stylized fantasy art style.');

      // Text prompt has promptSuffix appended at the end
      await service.aiAgent.runPrompt({ prompt: 'Build a stone tower' });
      const lastUserMsg = capturedBodies[1].messages[capturedBodies[1].messages.length - 1];
      expect(lastUserMsg).toEqual({
        role: 'user',
        content: 'Build a stone tower\n\nUse low-poly stylized fantasy art style.',
      });

      // Multimodal prompt (text + image) also has promptSuffix appended
      await service.aiAgent.runPrompt({
        prompt: 'Recreate this shield',
        images: ['data:image/png;base64,AAAA'],
      });
      const multimodalMsg = capturedBodies[2].messages[capturedBodies[2].messages.length - 1];
      expect(multimodalMsg.role).toBe('user');
      expect(multimodalMsg.content[0]).toEqual({
        type: 'text',
        text: 'Recreate this shield\n\nUse low-poly stylized fantasy art style.',
      });
    });

    it('wires #aiPromptSuffixInput in AI Settings modal to config and resets to empty on defaults restore', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const nullEngine = new NullEngine();
      const app = new MeshEditorApp({ container, engine: nullEngine });
      try {
        const suffixInput = container.querySelector<HTMLTextAreaElement>('#aiPromptSuffixInput');
        expect(suffixInput).toBeTruthy();

        suffixInput!.value = 'Stylized PBR, warm rim lighting';
        suffixInput!.dispatchEvent(new Event('change'));

        expect(app.service.aiAgent.getConfig().promptSuffix).toBe('Stylized PBR, warm rim lighting');

        app.resetAISettingsToDefaults();
        expect(app.service.aiAgent.getConfig().promptSuffix).toBe('');
        expect(suffixInput!.value).toBe('');
      } finally {
        app.dispose();
        container.remove();
      }
    });
  });

  describe('8. External Image Generator Enforcement & Architectural texturePrompt', () => {
    it('injects Active External Image Generator instructions into system prompt when enabled and omits them when disabled', () => {
      service.aiAgent.saveConfig({
        createTextures: true,
        imageGeneratorEnabled: true,
        imageGeneratorActiveBackend: 'sd_webui',
        imageGeneratorProviders: {
          ...service.aiAgent.getConfig().imageGeneratorProviders,
          sd_webui: {
            id: 'sd_webui',
            name: 'Stable Diffusion / Draw Things (Local)',
            enabled: true,
            protocol: 'sd_webui',
            endpointUrl: 'http://127.0.0.1:7860/sdapi/v1/txt2img',
            apiKey: '',
            modelId: 'flux-dev',
          },
        },
      });

      const activePrompt = service.aiAgent.buildSystemPrompt();
      expect(activePrompt).toContain('Active External Image Generator');
      expect(activePrompt).toContain('sd_webui');
      expect(activePrompt).toContain('flux-dev');
      expect(activePrompt).toContain('modeler_create_arch');
      expect(activePrompt).toContain('modeler_create_molding');
      expect(activePrompt).toContain('modeler_generate_texture');
      expect(activePrompt).toContain('SURFACE-ONLY PROMPTING RULE');
      expect(activePrompt).toContain('CRITICAL TEXTURE PROMPT RULE');

      // Disable external image generator
      service.aiAgent.saveConfig({
        imageGeneratorEnabled: false,
      });
      const disabledPrompt = service.aiAgent.buildSystemPrompt();
      expect(disabledPrompt).not.toContain('Active External Image Generator');

      // Re-enable but disable textures globally
      service.aiAgent.saveConfig({
        imageGeneratorEnabled: true,
        createTextures: false,
      });
      const noTexPrompt = service.aiAgent.buildSystemPrompt();
      expect(noTexPrompt).not.toContain('Active External Image Generator');
    });

    it('awaits external image generator texturePrompt on modeler_create_arch, modeler_create_wall, modeler_create_molding, and modeler_create_stairs', async () => {
      service.aiAgent.saveConfig({
        createTextures: true,
        imageGeneratorEnabled: true,
        imageGeneratorActiveBackend: 'sd_webui',
      });

      const generateImageSpy = vi
        .spyOn(service.externalImageGenerator, 'generateImage')
        .mockResolvedValue({
          providerId: 'sd_webui',
          providerName: 'Stable Diffusion / Draw Things (Local)',
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          width: 512,
          height: 512,
        });

      const ctx = service.aiAgent.createToolContext();
      const archTool = service.aiAgent.toolRegistry.get('modeler_create_arch')!;
      const wallTool = service.aiAgent.toolRegistry.get('modeler_create_wall')!;
      const moldingTool = service.aiAgent.toolRegistry.get('modeler_create_molding')!;
      const stairsTool = service.aiAgent.toolRegistry.get('modeler_create_stairs')!;

      const archRes = JSON.parse(
        await archTool.execute(
          {
            name: 'gothic_arch_1',
            style: 'pointed',
            span: 2.2,
            pierHeight: 2.0,
            keystone: true,
            impostCap: true,
            texturePrompt: 'Weathered Gothic limestone voussoirs',
          },
          ctx
        )
      );
      expect(archRes.status).toBe('ok');
      expect(archRes.textureBackend).toBe('sd_webui');
      expect(archRes.isAITexture).toBe(true);

      const wallRes = JSON.parse(
        await wallTool.execute(
          {
            name: 'gothic_wall',
            width: 5,
            height: 3.4,
            texturePrompt: 'Ancient medieval ashlar stone masonry',
          },
          ctx
        )
      );
      expect(wallRes.status).toBe('ok');
      expect(wallRes.textureBackend).toBe('sd_webui');
      expect(wallRes.isAITexture).toBe(true);

      const moldingRes = JSON.parse(
        await moldingTool.execute(
          {
            name: 'gothic_cornice',
            path: [
              { x: -2.5, y: 3.4, z: 0 },
              { x: 2.5, y: 3.4, z: 0 },
            ],
            profile: 'cornice',
            texturePrompt: 'Carved Gothic stone cornice',
          },
          ctx
        )
      );
      expect(moldingRes.status).toBe('ok');
      expect(moldingRes.textureBackend).toBe('sd_webui');
      expect(moldingRes.isAITexture).toBe(true);

      const stairsRes = JSON.parse(
        await stairsTool.execute(
          {
            name: 'gothic_spiral_stairs',
            style: 'spiral',
            totalHeight: 3.4,
            outerRadius: 1.3,
            turns: 1.25,
            centralColumn: true,
            railing: 'both',
            texturePrompt: 'Worn medieval stone steps',
          },
          ctx
        )
      );
      expect(stairsRes.status).toBe('ok');
      expect(stairsRes.textureBackend).toBe('sd_webui');
      expect(stairsRes.isAITexture).toBe(true);

      expect(generateImageSpy).toHaveBeenCalledTimes(4);
      expect(generateImageSpy.mock.calls.every((c) => c[0].backend === 'sd_webui')).toBe(true);
      generateImageSpy.mockRestore();
    });

    it('executes unfenced concatenated {"tool_calls": [...]} JSON blocks emitted as plain text', async () => {
      const rawTextToolCalls =
        JSON.stringify(
          {
            tool_calls: [
              {
                name: 'modeler_create_material',
                arguments: {
                  materialName: 'fallback_gold_mat',
                  albedoColor: '#ffd700',
                  metallic: 0.9,
                  roughness: 0.2,
                },
              },
            ],
          },
          null,
          2
        ) +
        '\n' +
        JSON.stringify(
          {
            tool_calls: [
              {
                name: 'modeler_create_primitive',
                arguments: {
                  name: 'fallback_gold_orb',
                  type: 'sphere',
                  options: { diameter: 1.0, segments: 8 },
                  materialName: 'fallback_gold_mat',
                },
              },
            ],
          },
          null,
          2
        );

      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-fallback-json',
          choices: [
            {
              message: {
                role: 'assistant',
                content: rawTextToolCalls,
                tool_calls: [],
              },
            },
          ],
        }),
      });

      const res = await service.aiAgent.runPrompt({
        prompt: 'Build a gold orb',
        visualCritique: false,
      });

      expect(res.toolSteps).toHaveLength(2);
      expect(res.toolSteps?.[0].toolName).toBe('modeler_create_material');
      expect(res.toolSteps?.[1].toolName).toBe('modeler_create_primitive');
      expect(service.importedMeshes.some((m) => m.name === 'fallback_gold_orb')).toBe(true);
      expect(res.content).toContain('2 3D modeling operation(s) successfully executed');
    });
  });

  describe('9. Z-Fighting & Texture Bleeding Detection and AI Self-Correction', () => {
    it('detects inter-mesh coplanar overlapping faces via modeler_check_z_fighting and verifies fix with facet extrude/inset', async () => {
      // Create a wall and a flush coplanar window panel sharing z = +0.15 (+Z front face)
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        name: 'Base_Wall',
        type: 'box',
        options: { width: 4.0, height: 3.0, depth: 0.3 },
        position: { x: 0, y: 1.5, z: 0 },
      });
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        name: 'Flush_Panel',
        type: 'box',
        options: { width: 1.2, height: 1.2, depth: 0.1 },
        position: { x: 0, y: 1.5, z: 0.1 }, // max.z = 0.1 + 0.05 = 0.15 == Base_Wall max.z!
      });

      const checkBefore = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_check_z_fighting', {})
      );
      expect(checkBefore.status).toBe('ok');
      expect(checkBefore.hasIssues).toBe(true);
      expect(checkBefore.issueCount).toBeGreaterThanOrEqual(1);
      const issue = checkBefore.issues[0];
      expect(issue.kind).toBe('inter_mesh_coplanar');
      expect(issue.normalOrientation).toBe('same');
      expect(issue.faceDirectionA).toBe('front');
      expect(issue.faceDirectionB).toBe('front');
      expect(issue.overlapArea).toBeGreaterThan(1.0);
      expect(issue.recommendedFixes.join(' ')).toContain('modeler_facet_extrude');

      // Scene info diagnostics also include the Z-fighting issue
      const sceneInfo = JSON.parse(await service.aiAgent.executeToolCall('modeler_get_scene_info', {}));
      expect(sceneInfo.diagnostics.zFightingIssueCount).toBeGreaterThanOrEqual(1);

      // Fix by extruding the front face of Flush_Panel slightly outward (just like manual repair!)
      const extrudeRes = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_facet_extrude', {
          meshName: 'Flush_Panel',
          direction: 'front',
          distance: 0.03,
        })
      );
      expect(extrudeRes.status).toBe('ok');

      const checkAfter = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_check_z_fighting', {})
      );
      expect(checkAfter.hasIssues).toBe(false);
      expect(checkAfter.issueCount).toBe(0);
    });

    it('detects intra-mesh duplicate double-sided faces when backFaceCulling is false and avoids false positives on resting solids or parametric walls/arches', async () => {
      const { MeshBuilder, Mesh } = await import('@babylonjs/core');

      // 1. Solid column resting flush on floor at y = 0 should NOT report false-positive Z-fighting
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        name: 'Floor_Slab',
        type: 'box',
        options: { width: 6, height: 0.2, depth: 6 },
        position: { x: 0, y: -0.1, z: 0 },
      });
      await service.aiAgent.executeToolCall('modeler_create_primitive', {
        name: 'Resting_Pillar',
        type: 'box',
        options: { width: 0.6, height: 2.0, depth: 0.6 },
        position: { x: 0, y: 1.0, z: 0 },
      });
      // Parametric wall with openings, plinth, cornice and arch should also be clean
      await service.aiAgent.executeToolCall('modeler_create_wall', {
        name: 'Clean_Wall',
        width: 4.0,
        height: 3.0,
        thickness: 0.3,
        plinthHeight: 0.2,
        corniceHeight: 0.15,
        position: { x: 0, y: 0, z: -2.0 },
        openings: [{ type: 'rect', x: 0, y: 1.2, width: 1.0, height: 1.0, frame: true }],
      });
      await service.aiAgent.executeToolCall('modeler_create_arch', {
        name: 'Clean_Arch',
        style: 'round',
        span: 2.0,
        position: { x: 0, y: 0, z: 2.0 },
      });

      const cleanCheck = JSON.parse(await service.aiAgent.executeToolCall('modeler_check_z_fighting', {}));
      expect(cleanCheck.issues).toEqual([]);
      expect(cleanCheck.hasIssues).toBe(false);

      // 2. Mesh created with Mesh.DOUBLESIDE + backFaceCulling = false duplicates faces and SHOULD be detected
      const dupBox = MeshBuilder.CreateBox(
        'DoubleSide_Dup_Box',
        { size: 1, sideOrientation: Mesh.DOUBLESIDE },
        service.scene
      );
      dupBox.position.set(3, 0.5, 0);
      dupBox.material = service.aiAgent.getOrCreateMaterial('dup_mat', '#cccccc');
      service.aiAgent.registerCreatedMesh(dupBox);

      const dupCheck = JSON.parse(
        await service.aiAgent.executeToolCall('modeler_check_z_fighting', {
          meshNames: ['DoubleSide_Dup_Box'],
        })
      );
      expect(dupCheck.hasIssues).toBe(true);
      expect(dupCheck.issues.some((i: any) => i.kind === 'intra_mesh_coplanar')).toBe(true);
    });

    it('automatically triggers a Z-fighting self-correction turn in runPrompt when coplanar overlap is detected and repairs via facet_inset', async () => {
      let callCount = 0;
      const recordedPayloads: any[] = [];

      service.aiAgent.saveConfig({ checkZFighting: true, visualCritique: false });
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        callCount++;
        const body = JSON.parse(String(init?.body || '{}'));
        recordedPayloads.push(body);

        if (callCount === 1) {
          // Turn 1: AI creates a wall and a flush coplanar sign box at z = 0.25
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc_wall',
                        type: 'function',
                        function: {
                          name: 'modeler_create_primitive',
                          arguments: JSON.stringify({
                            name: 'Cabinet_Body',
                            type: 'box',
                            options: { width: 2.0, height: 2.0, depth: 0.5 },
                            position: { x: 0, y: 1.0, z: 0 },
                          }),
                        },
                      },
                      {
                        id: 'tc_panel',
                        type: 'function',
                        function: {
                          name: 'modeler_create_primitive',
                          arguments: JSON.stringify({
                            name: 'Door_Panel',
                            type: 'box',
                            options: { width: 1.4, height: 1.4, depth: 0.1 },
                            position: { x: 0, y: 1.0, z: 0.2 }, // max.z = 0.25 == Cabinet_Body max.z
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        if (callCount === 2) {
          // Turn 2: AI tries to finish -> automatic Z-fighting check detects the overlap and asks AI to fix
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Built the cabinet and door panel.',
                  },
                },
              ],
            }),
          };
        }

        if (callCount === 3) {
          // Turn 3: AI receives [Z-FIGHTING & TEXTURE BLEEDING CHECK] and fixes via modeler_facet_inset with depth
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc_fix_inset',
                        type: 'function',
                        function: {
                          name: 'modeler_facet_inset',
                          arguments: JSON.stringify({
                            meshName: 'Door_Panel',
                            direction: 'front',
                            insetAmount: 0.1,
                            depth: 0.03,
                          }),
                        },
                      },
                      {
                        id: 'tc_fix_extrude',
                        type: 'function',
                        function: {
                          name: 'modeler_transform_mesh',
                          arguments: {
                            meshName: 'Door_Panel',
                            position: { x: 0, y: 1.0, z: 0.22 },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Fixed Z-fighting on Door_Panel by offsetting and insetting the front face.',
                },
              },
            ],
          }),
        };
      });

      const res = await service.aiAgent.runPrompt({
        prompt: 'Build a cabinet with a front door panel',
      });

      expect(callCount).toBe(4);
      // Verify Turn 3 received the automatic [Z-FIGHTING & TEXTURE BLEEDING CHECK] diagnostic prompt
      const zFightPromptMsg = recordedPayloads[2].messages[recordedPayloads[2].messages.length - 1];
      expect(zFightPromptMsg.role).toBe('user');
      expect(zFightPromptMsg.content).toContain('[Z-FIGHTING & TEXTURE BLEEDING CHECK]');
      expect(zFightPromptMsg.content).toContain('Door_Panel');
      expect(zFightPromptMsg.content).toContain('Cabinet_Body');
      expect(res.content).toContain('Fixed Z-fighting');
      expect(service.aiAgent.checkSceneZFighting().hasIssues).toBe(false);
    });

    it('wires #aiCheckZFightingCheckQuick and #aiCheckZFightingCheck in UI and persists config', async () => {
      const container = document.createElement('div');
      container.id = 'test-zf-ui';
      document.body.appendChild(container);
      const app = new MeshEditorApp({
        container,
        engine: new NullEngine(),
      });

      const quickChk = container.querySelector('#aiCheckZFightingCheckQuick') as HTMLInputElement;
      const modalChk = container.querySelector('#aiCheckZFightingCheck') as HTMLInputElement;
      expect(quickChk).not.toBeNull();
      expect(modalChk).not.toBeNull();
      expect(quickChk.checked).toBe(true);
      expect(modalChk.checked).toBe(true);

      quickChk.checked = false;
      quickChk.dispatchEvent(new Event('change'));
      expect(app.service.aiAgent.getConfig().checkZFighting).toBe(false);
      expect(modalChk.checked).toBe(false);

      modalChk.checked = true;
      modalChk.dispatchEvent(new Event('change'));
      expect(app.service.aiAgent.getConfig().checkZFighting).toBe(true);
      expect(quickChk.checked).toBe(true);

      app.dispose();
      container.remove();
    });
  });
});

