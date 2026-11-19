import { createRequire } from 'module';
import { NullEngine } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_AGENT_STORAGE_KEY,
  AI_ENDPOINT_PRESETS,
  AI_PROTOCOL_INFO,
  resolveChatEndpointUrl,
  resolveModelsEndpointUrl,
} from '../../src/AIAgentService';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { MeshEditorService } from '../../src/MeshEditorService';

const require = createRequire(import.meta.url);

describe('Multi-Protocol LLM Integrations & Settings UI Clarity', () => {
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

  describe('1. Anthropic / Claude Messages API Protocol', () => {
    it('resolves /v1/messages and /v1/models URLs including third-party /anthropic bases', () => {
      expect(
        resolveChatEndpointUrl({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' })
      ).toBe('https://api.anthropic.com/v1/messages');
      expect(
        resolveChatEndpointUrl({ protocol: 'anthropic', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-chat' })
      ).toBe('https://api.deepseek.com/anthropic/v1/messages');
      expect(
        resolveModelsEndpointUrl({ protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' })
      ).toBe('https://api.anthropic.com/v1/models');
    });

    it('sends browser CORS headers, prompt caching, vision base64, and completes multi-turn tool_use loop', async () => {
      service.aiAgent.saveConfig({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test-key',
        model: 'claude-sonnet-4-5',
        promptCaching: true,
        maxTokens: 4096,
      });

      const calls: Array<{ url: string; init: RequestInit; body: any }> = [];
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, init, body });

        if (calls.length === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'msg_01',
              model: 'claude-sonnet-4-5',
              stop_reason: 'tool_use',
              content: [
                { type: 'text', text: 'Creating a wooden crate.' },
                {
                  type: 'tool_use',
                  id: 'toolu_box_1',
                  name: 'modeler_create_primitive',
                  input: { shape: 'Box', name: 'Claude_Crate', width: 2, height: 2, depth: 2 },
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'msg_02',
            model: 'claude-sonnet-4-5',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Created Claude_Crate successfully.' }],
          }),
        };
      });

      service.aiAgent.customFetch = mockFetch as any;

      const result = await service.aiAgent.runPrompt({
        prompt: 'Build a crate from this reference',
        images: ['data:image/png;base64,iVBORw0KGgo='],
        checkZFighting: false,
      });

      expect(result.content).toContain('Created Claude_Crate successfully.');
      expect(service.importedMeshes.some((m) => m.name === 'Claude_Crate')).toBe(true);
      expect(calls.length).toBe(2);

      // Verify first request headers & payload
      expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(headers['Authorization']).toBeUndefined();

      expect(calls[0].body.max_tokens).toBe(4096);
      expect(Array.isArray(calls[0].body.system)).toBe(true);
      expect(calls[0].body.system[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(calls[0].body.tools[calls[0].body.tools.length - 1].cache_control).toEqual({ type: 'ephemeral' });
      expect(calls[0].body.tools[0].input_schema).toBeDefined();

      // Verify Vision image conversion
      const userContent = calls[0].body.messages[0].content;
      expect(userContent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          }),
        ])
      );

      // Verify second turn sends tool_use + tool_result in Anthropic format
      const turn2Msgs = calls[1].body.messages;
      expect(turn2Msgs[turn2Msgs.length - 2].role).toBe('assistant');
      expect(turn2Msgs[turn2Msgs.length - 2].content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'tool_use', id: 'toolu_box_1' })])
      );
      expect(turn2Msgs[turn2Msgs.length - 1].role).toBe('user');
      expect(turn2Msgs[turn2Msgs.length - 1].content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_box_1' })])
      );
    });

    it('retries Anthropic request without cache_control if third-party proxy rejects it', async () => {
      service.aiAgent.saveConfig({
        protocol: 'anthropic',
        baseUrl: 'https://api.deepseek.com/anthropic',
        apiKey: 'sk-ds-test',
        model: 'deepseek-chat',
        promptCaching: true,
      });

      const payloads: any[] = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        payloads.push(body);
        if (payloads.length === 1) {
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => JSON.stringify({ error: { message: 'Unsupported field cache_control' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'deepseek-chat',
            content: [{ type: 'text', text: 'Done without cache_control.' }],
          }),
        };
      }) as any;

      const res = await service.aiAgent.runPrompt({ prompt: 'Hello', checkZFighting: false });
      expect(res.content).toBe('Done without cache_control.');
      expect(payloads.length).toBe(2);
      expect(typeof payloads[1].system).toBe('string');
    });

    it('fetches models and tests connection against Anthropic endpoint', async () => {
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (init.method === 'GET') {
          expect(url).toBe('https://api.anthropic.com/v1/models');
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }, { id: 'claude-opus-4-1' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ model: 'claude-sonnet-4-5', content: [{ type: 'text', text: 'OK' }] }),
        };
      }) as any;

      const models = await service.aiAgent.fetchAvailableModels({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      });
      expect(models).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1']);

      const testRes = await service.aiAgent.testEndpointConnection({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-5',
      });
      expect(testRes.ok).toBe(true);
      expect(testRes.message).toContain('claude-sonnet-4-5');
      expect(testRes.message).toContain('Claude');
    });
  });

  describe('2. Google Gemini Native API Protocol', () => {
    it('uses x-goog-api-key, preserves thoughtSignature across functionCall/functionResponse, and filters generateContent models', async () => {
      service.aiAgent.saveConfig({
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'AIza-test-key',
        model: 'gemini-3-flash-preview',
      });

      const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        if (init.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [
                { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
              ],
            }),
          };
        }
        const body = JSON.parse(String(init.body));
        calls.push({ url, headers, body });

        if (calls.length === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              modelVersion: 'gemini-3-flash-preview',
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          name: 'modeler_create_primitive',
                          args: { shape: 'Sphere', name: 'Gemini_Orb', diameter: 1.5 },
                        },
                        thoughtSignature: 'sig_abc123',
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
            modelVersion: 'gemini-3-flash-preview',
            candidates: [{ content: { role: 'model', parts: [{ text: 'Created Gemini_Orb.' }] } }],
          }),
        };
      }) as any;

      const models = await service.aiAgent.fetchAvailableModels();
      expect(models).toEqual(['gemini-3-flash-preview']);

      const result = await service.aiAgent.runPrompt({
        prompt: 'Create a glowing orb',
        images: ['data:image/jpeg;base64,/9j/4AAQ'],
        checkZFighting: false,
      });

      expect(result.content).toBe('Created Gemini_Orb.');
      expect(service.importedMeshes.some((m) => m.name === 'Gemini_Orb')).toBe(true);
      expect(calls[0].url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'
      );
      expect(calls[0].headers['x-goog-api-key']).toBe('AIza-test-key');
      expect(calls[0].body.systemInstruction.parts[0].text).toBeTruthy();
      expect(calls[0].body.tools[0].functionDeclarations.length).toBeGreaterThan(5);
      expect(calls[0].body.contents[0].parts).toEqual(
        expect.arrayContaining([{ inlineData: { mimeType: 'image/jpeg', data: '/9j/4AAQ' } }])
      );

      // Verify thoughtSignature & functionResponse on turn 2
      const turn2Contents = calls[1].body.contents;
      const modelTurn = turn2Contents[turn2Contents.length - 2];
      const toolTurn = turn2Contents[turn2Contents.length - 1];
      expect(modelTurn.role).toBe('model');
      expect(modelTurn.parts[0].thoughtSignature).toBe('sig_abc123');
      expect(toolTurn.role).toBe('user');
      expect(toolTurn.parts[0].functionResponse.name).toBe('modeler_create_primitive');
    });
  });

  describe('3. OpenAI Responses API Protocol', () => {
    it('sends /v1/responses with instructions, reasoning effort, and handles function_call / function_call_output', async () => {
      service.aiAgent.saveConfig({
        protocol: 'openai_responses',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai-test',
        model: 'gpt-4.1',
        reasoningEffort: 'medium',
      });

      const calls: Array<{ url: string; body: any }> = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push({ url, body });

        if (calls.length === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'resp_1',
              model: 'gpt-4.1',
              output: [
                {
                  type: 'function_call',
                  call_id: 'fc_123',
                  name: 'modeler_create_primitive',
                  arguments: JSON.stringify({ shape: 'Cylinder', name: 'Responses_Pillar', height: 3 }),
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'resp_2',
            model: 'gpt-4.1',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'Responses_Pillar created.' }],
              },
            ],
          }),
        };
      }) as any;

      const result = await service.aiAgent.runPrompt({ prompt: 'Build a pillar', checkZFighting: false });
      expect(result.content).toBe('Responses_Pillar created.');
      expect(service.importedMeshes.some((m) => m.name === 'Responses_Pillar')).toBe(true);
      expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
      expect(calls[0].body.instructions).toBeTruthy();
      expect(calls[0].body.reasoning).toEqual({ effort: 'medium' });
      expect(calls[0].body.tools[0].type).toBe('function');
      expect(calls[0].body.tools[0].name).toBeTruthy();

      expect(calls[1].body.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'function_call', call_id: 'fc_123' }),
          expect.objectContaining({ type: 'function_call_output', call_id: 'fc_123' }),
        ])
      );
    });
  });

  describe('4. Ollama Native API Protocol (/api/chat & /api/tags)', () => {
    it('sends stream:false, num_ctx, raw base64 images, and parses /api/tags models', async () => {
      service.aiAgent.saveConfig({
        protocol: 'ollama_native',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'qwen2.5-coder:14b',
        ollamaNumCtx: 65536,
      });

      const calls: Array<{ url: string; body?: any }> = [];
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (init.method === 'GET') {
          calls.push({ url });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [{ name: 'qwen2.5-coder:14b' }, { name: 'llama3.3:latest' }],
            }),
          };
        }
        const body = JSON.parse(String(init.body));
        calls.push({ url, body });

        if (calls.filter((c) => c.body).length === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              model: 'qwen2.5-coder:14b',
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'modeler_create_primitive',
                      arguments: { shape: 'Cone', name: 'Ollama_Cone', height: 2 },
                    },
                  },
                ],
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'qwen2.5-coder:14b',
            message: { role: 'assistant', content: 'Ollama_Cone ready.' },
          }),
        };
      }) as any;

      const models = await service.aiAgent.fetchAvailableModels();
      expect(models).toEqual(['qwen2.5-coder:14b', 'llama3.3:latest']);
      expect(calls[0].url).toBe('http://localhost:11434/api/tags');

      const result = await service.aiAgent.runPrompt({
        prompt: 'Make a cone',
        images: ['data:image/png;base64,QUJDRA=='],
        checkZFighting: false,
      });
      expect(result.content).toBe('Ollama_Cone ready.');
      expect(service.importedMeshes.some((m) => m.name === 'Ollama_Cone')).toBe(true);

      const chatReq = calls[1];
      expect(chatReq.url).toBe('http://localhost:11434/api/chat');
      expect(chatReq.body.stream).toBe(false);
      expect(chatReq.body.options.num_ctx).toBe(65536);
      const userMsg = chatReq.body.messages.find((m: any) => m.role === 'user');
      expect(userMsg.images).toEqual(['QUJDRA==']);
    });
  });

  describe('5. Azure OpenAI / AI Foundry Protocol', () => {
    it('resolves deployment URLs with api-version and sends native api-key header', async () => {
      expect(
        resolveChatEndpointUrl({
          protocol: 'azure_openai',
          baseUrl: 'https://my-res.openai.azure.com',
          model: 'my-gpt4o',
          azureApiVersion: '2024-10-21',
        })
      ).toBe('https://my-res.openai.azure.com/openai/deployments/my-gpt4o/chat/completions?api-version=2024-10-21');

      expect(
        resolveChatEndpointUrl({
          protocol: 'azure_openai',
          baseUrl: 'https://my-res.openai.azure.com/openai/deployments/dep1',
          model: 'gpt-4o',
          azureApiVersion: '2024-10-21',
        })
      ).toBe('https://my-res.openai.azure.com/openai/deployments/dep1/chat/completions?api-version=2024-10-21');

      expect(
        resolveChatEndpointUrl({
          protocol: 'azure_openai',
          baseUrl: 'https://my-foundry.services.ai.azure.com/openai/v1',
          model: 'gpt-4o',
          azureApiVersion: '',
        })
      ).toBe('https://my-foundry.services.ai.azure.com/openai/v1/chat/completions');

      let capturedHeaders: Record<string, string> = {};
      service.aiAgent.customFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ model: 'gpt-4o', choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
        };
      }) as any;

      const testRes = await service.aiAgent.testEndpointConnection({
        protocol: 'azure_openai',
        baseUrl: 'https://my-res.openai.azure.com/openai/deployments/dep1',
        apiKey: 'azure-secret-key',
        model: 'gpt-4o',
        azureApiVersion: '2024-10-21',
      });
      expect(testRes.ok).toBe(true);
      expect(capturedHeaders['api-key']).toBe('azure-secret-key');
      expect(capturedHeaders['Authorization']).toBeUndefined();
    });
  });

  describe('6. Local CLI Bridge Helpers', () => {
    it('routes models to claude/codex/gemini CLIs and parses structured tool calls', () => {
      const bridge = require('../../scripts/local-cli-bridge.js');
      expect(bridge.resolveProviderForModel('claude-sonnet-4-5').id).toBe('claude');
      expect(bridge.resolveProviderForModel('codex-mini').id).toBe('codex');
      expect(bridge.resolveProviderForModel('gemini-2.5-pro').id).toBe('gemini');

      const toolCalls = bridge.extractToolCalls(
        '```json\n{"tool_calls":[{"name":"modeler_create_primitive","arguments":{"shape":"Box"}}]}\n```'
      );
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].function.name).toBe('modeler_create_primitive');
      expect(JSON.parse(toolCalls[0].function.arguments)).toEqual({ shape: 'Box' });
    });
  });

  describe('7. Settings Modal UI Clarity, Presets & Contextual Protocol Controls', () => {
    let container: HTMLDivElement;
    let app: MeshEditorApp;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      app?.dispose();
      container.remove();
    });

    it('updates protocol selector, contextual options, hint callout, badges, and persists across reloads', () => {
      app = new MeshEditorApp({ container, engine: new NullEngine() });

      (container.querySelector('#btnSettings') as HTMLButtonElement).click();
      (container.querySelector('#settingsTabBtnAI') as HTMLButtonElement).click();

      const presetSelect = container.querySelector('#aiProviderPresetSelect') as HTMLSelectElement;
      const protocolSelect = container.querySelector('#aiProtocolSelect') as HTMLSelectElement;
      const authBadge = container.querySelector('#aiProtocolAuthBadge') as HTMLElement;
      const hintText = container.querySelector('#aiProtocolHintText') as HTMLElement;
      const optsContainer = container.querySelector('#aiProtocolOptionsContainer') as HTMLElement;
      const anthropicOpts = container.querySelector('#aiProtocolOpts_anthropic') as HTMLElement;
      const ollamaOpts = container.querySelector('#aiProtocolOpts_ollama_native') as HTMLElement;
      const azureOpts = container.querySelector('#aiProtocolOpts_azure_openai') as HTMLElement;
      const responsesOpts = container.querySelector('#aiProtocolOpts_openai_responses') as HTMLElement;
      const endpointSummary = container.querySelector('#aiEndpointSummaryText') as HTMLElement;

      // 1. Click Claude quick-preset chip
      const claudeChip = container.querySelector('#aiPresetChips [data-preset="anthropic"]') as HTMLButtonElement;
      expect(claudeChip).not.toBeNull();
      claudeChip.click();

      expect(protocolSelect.value).toBe('anthropic');
      expect(presetSelect.value).toBe('anthropic');
      expect(claudeChip.classList.contains('active')).toBe(true);
      expect(authBadge.textContent).toContain('x-api-key');
      expect(hintText.textContent).toContain('Prompt Caching');
      expect(optsContainer.style.display).toBe('block');
      expect(anthropicOpts.style.display).toBe('flex');
      expect(ollamaOpts.style.display).toBe('none');
      expect(endpointSummary.textContent).toContain('Claude');

      // Change Anthropic max tokens & caching checkbox
      const maxTokensInput = container.querySelector('#aiAnthropicMaxTokensInput') as HTMLInputElement;
      const cachingCheck = container.querySelector('#aiAnthropicCachingCheck') as HTMLInputElement;
      maxTokensInput.value = '16384';
      maxTokensInput.dispatchEvent(new Event('change', { bubbles: true }));
      cachingCheck.checked = false;
      cachingCheck.dispatchEvent(new Event('change', { bubbles: true }));

      const storedAnthropic = JSON.parse(localStorage.getItem(AI_AGENT_STORAGE_KEY) || '{}');
      expect(storedAnthropic.protocol).toBe('anthropic');
      expect(storedAnthropic.maxTokens).toBe(16384);
      expect(storedAnthropic.promptCaching).toBe(false);

      // 2. Select Ollama Native from dropdown -> shows num_ctx selector
      presetSelect.value = 'ollama-native';
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(protocolSelect.value).toBe('ollama_native');
      expect(ollamaOpts.style.display).toBe('flex');
      expect(anthropicOpts.style.display).toBe('none');

      const numCtxSelect = container.querySelector('#aiOllamaNumCtxSelect') as HTMLSelectElement;
      numCtxSelect.value = '65536';
      numCtxSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(app.service.aiAgent.getConfig().ollamaNumCtx).toBe(65536);

      // 3. Select Azure OpenAI -> shows Azure API version input
      presetSelect.value = 'azure-openai';
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(protocolSelect.value).toBe('azure_openai');
      expect(azureOpts.style.display).toBe('flex');
      expect(authBadge.textContent).toContain('api-key');

      // 4. Select OpenAI Responses API -> shows Reasoning Effort selector
      presetSelect.value = 'openai-responses';
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(protocolSelect.value).toBe('openai_responses');
      expect(responsesOpts.style.display).toBe('flex');

      const reasoningSelect = container.querySelector('#aiReasoningEffortSelect') as HTMLSelectElement;
      reasoningSelect.value = 'high';
      reasoningSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // Verify reload restores protocol & protocol-specific setting cleanly
      app.dispose();
      container.innerHTML = '';
      app = new MeshEditorApp({ container, engine: new NullEngine() });
      (container.querySelector('#btnSettings') as HTMLButtonElement).click();
      (container.querySelector('#settingsTabBtnAI') as HTMLButtonElement).click();

      expect((container.querySelector('#aiProtocolSelect') as HTMLSelectElement).value).toBe('openai_responses');
      expect((container.querySelector('#aiReasoningEffortSelect') as HTMLSelectElement).value).toBe('high');
      expect(AI_ENDPOINT_PRESETS.length).toBeGreaterThanOrEqual(20);
      expect(Object.keys(AI_PROTOCOL_INFO)).toEqual([
        'openai',
        'anthropic',
        'gemini',
        'openai_responses',
        'ollama_native',
        'azure_openai',
      ]);
    });
  });
});
