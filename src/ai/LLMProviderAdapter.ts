import { AIAgentEndpointConfig, AIAgentProtocol } from '../types';

export interface AIProtocolInfo {
  id: AIAgentProtocol;
  label: string;
  shortBadge: string;
  description: string;
  authSummary: string;
  urlPlaceholder: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
  modelsPathLabel: string;
  supportsBrowserCors: boolean;
}

export const DEFAULT_AZURE_API_VERSION = '2024-10-21';
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;
export const DEFAULT_OLLAMA_NUM_CTX = 32768;

export const AI_PROTOCOL_INFO: Record<AIAgentProtocol, AIProtocolInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI Chat Completions (/v1/chat/completions)',
    shortBadge: 'OpenAI',
    description:
      'Universal standard used by OpenAI, OpenRouter, DeepSeek, Mistral, Groq, xAI, Antigravity Bridge, LM Studio, oMLX, vLLM, and llama.cpp.',
    authSummary: 'Authorization: Bearer <API Key>',
    urlPlaceholder: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-... (optional for local servers & bridges)',
    modelPlaceholder: 'gpt-4o',
    modelsPathLabel: '/models',
    supportsBrowserCors: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic / Claude Messages (/v1/messages)',
    shortBadge: 'Claude',
    description:
      'Native Anthropic Messages API with Prompt Caching, native tool_use, Vision, and direct browser CORS support. Also compatible with Anthropic-format gateways (DeepSeek Anthropic, LiteLLM, MiniMax).',
    authSummary: 'x-api-key + anthropic-version + direct-browser-access',
    urlPlaceholder: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-...',
    modelPlaceholder: 'claude-sonnet-4-5',
    modelsPathLabel: '/v1/models',
    supportsBrowserCors: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini Native (:generateContent)',
    shortBadge: 'Gemini Native',
    description:
      'Native Google Gemini REST API with direct browser CORS, native function calling, thought-signature preservation, and inline Vision support.',
    authSummary: 'x-goog-api-key',
    urlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta',
    keyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-3-flash-preview',
    modelsPathLabel: '/v1beta/models',
    supportsBrowserCors: true,
  },
  openai_responses: {
    id: 'openai_responses',
    label: 'OpenAI Responses API (/v1/responses)',
    shortBadge: 'Responses',
    description:
      'Next-generation OpenAI Responses API designed for reasoning models (o3, o4-mini, GPT-4.1+) with configurable reasoning effort and native function tools.',
    authSummary: 'Authorization: Bearer <API Key>',
    urlPlaceholder: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    modelPlaceholder: 'gpt-4.1',
    modelsPathLabel: '/models',
    supportsBrowserCors: true,
  },
  ollama_native: {
    id: 'ollama_native',
    label: 'Ollama Native (/api/chat)',
    shortBadge: 'Ollama Native',
    description:
      'Native Ollama API that lets you configure Context Window (num_ctx) explicitly so local models do not truncate the 40+ 3D modeling tool schemas.',
    authSummary: 'Localhost (API key optional)',
    urlPlaceholder: 'http://localhost:11434',
    keyPlaceholder: 'Optional (only needed behind an auth proxy)',
    modelPlaceholder: 'qwen2.5-coder:14b',
    modelsPathLabel: '/api/tags',
    supportsBrowserCors: true,
  },
  azure_openai: {
    id: 'azure_openai',
    label: 'Azure OpenAI / AI Foundry (api-key)',
    shortBadge: 'Azure',
    description:
      'Enterprise Azure OpenAI & Azure AI Foundry endpoint using the native api-key header and configurable api-version. Enter your resource URL or deployment URL.',
    authSummary: 'api-key header + ?api-version=...',
    urlPlaceholder: 'https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT',
    keyPlaceholder: 'Azure API Key',
    modelPlaceholder: 'gpt-4o (or deployment name)',
    modelsPathLabel: '/openai/models',
    supportsBrowserCors: true,
  },
};

export interface EndpointPreset {
  id: string;
  label: string;
  shortLabel?: string;
  category: 'native' | 'cloud' | 'local';
  protocol: AIAgentProtocol;
  baseUrl: string;
  defaultModel: string;
  suggestedModels?: string[];
  requiresKey: boolean;
  description: string;
  featured?: boolean;
  maxTokens?: number;
  promptCaching?: boolean;
  ollamaNumCtx?: number;
  azureApiVersion?: string;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
}

export const AI_ENDPOINT_PRESETS: EndpointPreset[] = [
  // --- Native & Primary APIs ---
  {
    id: 'antigravity',
    label: 'Antigravity (Local Account)',
    shortLabel: 'Antigravity',
    category: 'native',
    protocol: 'openai',
    baseUrl: '/api/antigravity/v1',
    defaultModel: 'gemini-3.8-flash-medium',
    suggestedModels: [
      'gemini-3.8-flash-medium',
      'gemini-3.8-flash-high',
      'gemini-4-argon-medium',
      'gemini-4-neon-medium',
      'claude-sonnet-5-5-medium',
      'claude-opus-5-5-medium',
    ],
    requiresKey: false,
    description: 'Connects via local Antigravity account bridge (no API key required). Start with: npm run ai:bridge',
    featured: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude (Native Messages API)',
    shortLabel: 'Claude',
    category: 'native',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    suggestedModels: [
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-3-7-sonnet-latest',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
    ],
    requiresKey: true,
    description: 'Direct Anthropic Messages API with browser CORS and Prompt Caching for lower latency & token cost.',
    featured: true,
    maxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
    promptCaching: true,
  },
  {
    id: 'gemini-native',
    label: 'Google Gemini Flash (Native API)',
    shortLabel: 'Gemini Native',
    category: 'native',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3-flash-preview',
    suggestedModels: [
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    requiresKey: true,
    description: 'Native Google Gemini API (:generateContent) with full function calling, Vision, and thought signatures.',
    featured: true,
  },
  {
    id: 'gemini-native-pro',
    label: 'Google Gemini Pro (Native API)',
    shortLabel: 'Gemini Pro',
    category: 'native',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.1-pro-preview',
    suggestedModels: [
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
    ],
    requiresKey: true,
    description: 'Native Google Gemini Pro API for complex multi-part 3D reasoning and detailed spatial modeling.',
  },
  {
    id: 'openai',
    label: 'OpenAI (Chat Completions)',
    shortLabel: 'OpenAI',
    category: 'native',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'o3-mini'],
    requiresKey: true,
    description: 'Standard OpenAI Chat Completions API (/v1/chat/completions).',
    featured: true,
  },
  {
    id: 'openai-responses',
    label: 'OpenAI (Responses API)',
    shortLabel: 'Responses API',
    category: 'native',
    protocol: 'openai_responses',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    suggestedModels: ['gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'],
    requiresKey: true,
    description: 'OpenAI Responses API (/v1/responses) with reasoning effort controls and modern tool calls.',
    featured: true,
    reasoningEffort: '',
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI / AI Foundry',
    shortLabel: 'Azure OpenAI',
    category: 'native',
    protocol: 'azure_openai',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
    requiresKey: true,
    description: 'Enterprise Azure OpenAI deployment using api-key header and configurable api-version.',
    azureApiVersion: DEFAULT_AZURE_API_VERSION,
  },

  // --- Cloud OpenAI-Compatible & Gateways ---
  {
    id: 'openrouter',
    label: 'OpenRouter (Multi-Provider)',
    shortLabel: 'OpenRouter',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    suggestedModels: [
      'openai/gpt-4o',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-chat',
    ],
    requiresKey: true,
    description: 'Single API key gateway to Claude, GPT, Gemini, DeepSeek, Llama, and Qwen models.',
    featured: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (OpenAI API)',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
    description: 'DeepSeek cloud API via OpenAI-compatible chat completions.',
  },
  {
    id: 'deepseek-anthropic',
    label: 'DeepSeek (Anthropic-Compatible API)',
    category: 'cloud',
    protocol: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
    description: 'DeepSeek endpoint using the Anthropic Messages protocol (/anthropic/v1/messages).',
    maxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
    promptCaching: false,
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    suggestedModels: ['mistral-large-latest', 'codestral-latest', 'pixtral-large-latest'],
    requiresKey: true,
    description: 'Mistral AI cloud models including Mistral Large, Codestral, and Pixtral Vision.',
  },
  {
    id: 'groq',
    label: 'Groq (Fast Inference)',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    requiresKey: true,
    description: 'Ultra-low-latency cloud inference for open-weight models via Groq.',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    suggestedModels: ['grok-3', 'grok-3-mini', 'grok-2-vision-1212'],
    requiresKey: true,
    description: 'xAI Grok models via OpenAI-compatible API.',
  },
  {
    id: 'together',
    label: 'Together AI',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    suggestedModels: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
      'deepseek-ai/DeepSeek-V3',
    ],
    requiresKey: true,
    description: 'Hosted open-weight models on Together AI.',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/deepseek-v3',
    suggestedModels: [
      'accounts/fireworks/models/deepseek-v3',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
    ],
    requiresKey: true,
    description: 'High-throughput serverless inference via Fireworks AI.',
  },
  {
    id: 'github-models',
    label: 'GitHub Models',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'Meta-Llama-3.1-405B-Instruct'],
    requiresKey: true,
    description: 'GitHub Models inference endpoint (authenticate with a GitHub Personal Access Token).',
  },
  {
    id: 'gemini',
    label: 'Gemini 3 Flash (OpenAI Compat)',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3-flash-preview',
    suggestedModels: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
    requiresKey: true,
    description: 'Google Gemini via OpenAI compatibility layer (consider Google Gemini Native API for full features).',
  },
  {
    id: 'gemini-pro',
    label: 'Gemini 3.1 Pro (OpenAI Compat)',
    category: 'cloud',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.1-pro-preview',
    suggestedModels: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
    requiresKey: true,
    description: 'Google Gemini Pro via OpenAI compatibility layer.',
  },

  // --- Local Servers & CLI Bridges ---
  {
    id: 'ollama-native',
    label: 'Ollama (Native API — Custom Context)',
    shortLabel: 'Ollama Native',
    category: 'local',
    protocol: 'ollama_native',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5-coder:14b',
    suggestedModels: ['qwen2.5-coder:14b', 'qwen2.5-coder:32b', 'llama3.3:latest', 'gemma3:27b'],
    requiresKey: false,
    description: 'Recommended for local Ollama: lets you increase Context Window (num_ctx) so 40+ modeling tools fit cleanly.',
    featured: true,
    ollamaNumCtx: DEFAULT_OLLAMA_NUM_CTX,
  },
  {
    id: 'ollama',
    label: 'Ollama (OpenAI Compat)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:14b',
    suggestedModels: ['qwen2.5-coder:14b', 'qwen2.5-coder:32b', 'llama3.3:latest'],
    requiresKey: false,
    description: 'Local Ollama via OpenAI-compatible /v1 endpoint.',
  },
  {
    id: 'omlx',
    label: 'oMLX (Local Apple Silicon)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    defaultModel: 'mlx-community/Qwen2.5-Coder-32B-Instruct-4bit',
    suggestedModels: ['mlx-community/Qwen2.5-Coder-32B-Instruct-4bit'],
    requiresKey: false,
    description: 'Local Apple Silicon MLX inference server.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    shortLabel: 'LM Studio',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    suggestedModels: ['local-model'],
    requiresKey: false,
    description: 'Local LM Studio server (enable CORS in LM Studio Server Settings for browser usage).',
    featured: true,
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp Server (Local)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8080/v1',
    defaultModel: 'local-model',
    suggestedModels: ['local-model'],
    requiresKey: false,
    description: 'Local llama-server OpenAI-compatible endpoint.',
  },
  {
    id: 'vllm',
    label: 'vLLM Server (Self-Hosted)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    defaultModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    suggestedModels: ['Qwen/Qwen2.5-Coder-32B-Instruct'],
    requiresKey: false,
    description: 'Self-hosted vLLM OpenAI-compatible server.',
  },
  {
    id: 'cli-bridge-claude',
    label: 'Claude Code CLI Bridge (Local)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8788/v1',
    defaultModel: 'claude-sonnet-4-5',
    suggestedModels: ['claude-sonnet-4-5', 'claude-opus-4-1'],
    requiresKey: false,
    description: 'Routes requests to your local `claude` CLI account. Start the bridge with: npm run ai:cli-bridge',
  },
  {
    id: 'cli-bridge-codex',
    label: 'Codex CLI Bridge (Local)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8788/v1',
    defaultModel: 'codex',
    suggestedModels: ['codex', 'codex-mini'],
    requiresKey: false,
    description: 'Routes requests to your local `codex` CLI account. Start the bridge with: npm run ai:cli-bridge',
  },
  {
    id: 'cli-bridge-gemini',
    label: 'Gemini CLI Bridge (Local)',
    category: 'local',
    protocol: 'openai',
    baseUrl: 'http://localhost:8788/v1',
    defaultModel: 'gemini-2.5-pro',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    requiresKey: false,
    description: 'Routes requests to your local `gemini` CLI account. Start the bridge with: npm run ai:cli-bridge',
  },
];

export function resolveProtocol(cfg?: Partial<AIAgentEndpointConfig>): AIAgentProtocol {
  const raw = cfg?.protocol;
  if (
    raw === 'openai' ||
    raw === 'anthropic' ||
    raw === 'gemini' ||
    raw === 'openai_responses' ||
    raw === 'ollama_native' ||
    raw === 'azure_openai'
  ) {
    return raw;
  }
  return 'openai';
}

export function findMatchingPreset(cfg: Partial<AIAgentEndpointConfig>): EndpointPreset | undefined {
  const protocol = resolveProtocol(cfg);
  const url = (cfg.baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
  const model = (cfg.model || '').trim().toLowerCase();
  if (!url) return undefined;

  const sameProtoAndUrl = AI_ENDPOINT_PRESETS.filter(
    (p) => p.protocol === protocol && p.baseUrl.replace(/\/+$/, '').toLowerCase() === url
  );
  if (sameProtoAndUrl.length === 1) return sameProtoAndUrl[0];
  if (sameProtoAndUrl.length > 1) {
    const byModel = sameProtoAndUrl.find(
      (p) =>
        p.defaultModel.toLowerCase() === model ||
        (p.suggestedModels || []).some((m) => m.toLowerCase() === model)
    );
    return byModel || sameProtoAndUrl[0];
  }
  return undefined;
}

/**
 * Resolves the protocol-specific chat/generation endpoint URL.
 */
export function resolveChatEndpointUrl(
  cfg: Partial<AIAgentEndpointConfig>,
  activeModel?: string
): string {
  const protocol = resolveProtocol(cfg);
  const raw = (cfg.baseUrl ?? '').trim().replace(/\/+$/, '');
  const model = (activeModel ?? cfg.model ?? '').trim().replace(/^models\//i, '');

  switch (protocol) {
    case 'anthropic': {
      if (raw.endsWith('/messages')) return raw;
      if (raw.endsWith('/v1')) return `${raw}/messages`;
      return `${raw}/v1/messages`;
    }
    case 'gemini': {
      if (/:generateContent(\?|$)/i.test(raw)) return raw;
      const base = raw.replace(/\/openai$/i, '').replace(/\/models$/i, '');
      return `${base}/models/${encodeURIComponent(model || 'gemini-3-flash-preview')}:generateContent`;
    }
    case 'openai_responses': {
      if (raw.endsWith('/responses')) return raw;
      if (raw.endsWith('/chat/completions')) {
        return raw.replace(/\/chat\/completions$/, '/responses');
      }
      return `${raw}/responses`;
    }
    case 'ollama_native': {
      const root = raw
        .replace(/\/api\/chat$/i, '')
        .replace(/\/api\/tags$/i, '')
        .replace(/\/v1\/chat\/completions$/i, '')
        .replace(/\/v1$/i, '');
      return `${root}/api/chat`;
    }
    case 'azure_openai': {
      const apiVersion = (cfg.azureApiVersion || DEFAULT_AZURE_API_VERSION).trim();
      const attachVersion = (u: string): string => {
        if (!apiVersion || /[?&]api-version=/i.test(u) || /\/openai\/v1(\/|$)/i.test(u)) {
          return u;
        }
        return `${u}${u.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(apiVersion)}`;
      };
      if (raw.includes('/chat/completions')) {
        return attachVersion(raw);
      }
      if (/\/openai\/deployments\/[^/]+$/i.test(raw) || /\/openai\/v1$/i.test(raw)) {
        return attachVersion(`${raw}/chat/completions`);
      }
      const deployment = encodeURIComponent(model || 'gpt-4o');
      return attachVersion(`${raw}/openai/deployments/${deployment}/chat/completions`);
    }
    case 'openai':
    default: {
      if (raw.endsWith('/chat/completions')) return raw;
      return `${raw}/chat/completions`;
    }
  }
}

/**
 * Resolves the protocol-specific model discovery endpoint URL.
 */
export function resolveModelsEndpointUrl(cfg: Partial<AIAgentEndpointConfig>): string {
  const protocol = resolveProtocol(cfg);
  const raw = (cfg.baseUrl ?? '').trim().replace(/\/+$/, '');

  switch (protocol) {
    case 'anthropic': {
      if (raw.endsWith('/models')) return raw;
      if (raw.endsWith('/messages')) return raw.replace(/\/messages$/, '/models');
      if (raw.endsWith('/v1')) return `${raw}/models`;
      return `${raw}/v1/models`;
    }
    case 'gemini': {
      const base = raw
        .replace(/\/models\/[^/]+:generateContent.*$/i, '')
        .replace(/\/openai$/i, '')
        .replace(/\/models$/i, '');
      return `${base}/models`;
    }
    case 'openai_responses': {
      if (raw.endsWith('/models')) return raw;
      if (raw.endsWith('/responses')) return raw.replace(/\/responses$/, '/models');
      if (raw.endsWith('/chat/completions')) return raw.replace(/\/chat\/completions$/, '/models');
      return `${raw}/models`;
    }
    case 'ollama_native': {
      const root = raw
        .replace(/\/api\/chat$/i, '')
        .replace(/\/api\/tags$/i, '')
        .replace(/\/v1\/chat\/completions$/i, '')
        .replace(/\/v1$/i, '');
      return `${root}/api/tags`;
    }
    case 'azure_openai': {
      const apiVersion = (cfg.azureApiVersion || DEFAULT_AZURE_API_VERSION).trim();
      if (/\/openai\/v1$/i.test(raw)) {
        return `${raw}/models`;
      }
      const root = raw.replace(/\/openai\/deployments\/.*$/i, '').replace(/\/openai\/models.*$/i, '');
      const base = `${root}/openai/models`;
      return apiVersion ? `${base}?api-version=${encodeURIComponent(apiVersion)}` : base;
    }
    case 'openai':
    default: {
      if (raw.endsWith('/chat/completions')) return raw.replace(/\/chat\/completions$/, '/models');
      if (raw.endsWith('/models')) return raw;
      return `${raw}/models`;
    }
  }
}

/**
 * Builds HTTP headers required for the active protocol.
 */
export function buildProtocolHeaders(
  cfg: Partial<AIAgentEndpointConfig>,
  isGetRequest: boolean = false
): Record<string, string> {
  const protocol = resolveProtocol(cfg);
  const apiKey = (cfg.apiKey || '').trim();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (!isGetRequest) {
    headers['Content-Type'] = 'application/json';
  }

  switch (protocol) {
    case 'anthropic':
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }
      break;
    case 'gemini':
      if (apiKey) {
        headers['x-goog-api-key'] = apiKey;
      }
      break;
    case 'azure_openai':
      if (apiKey) {
        headers['api-key'] = apiKey;
      }
      break;
    case 'ollama_native':
    case 'openai_responses':
    case 'openai':
    default:
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;
  }

  return headers;
}

/**
 * Extracts a deduplicated list of model IDs from protocol-specific discovery responses.
 */
export function parseModelsResponse(
  protocol: AIAgentProtocol,
  json: any,
  url: string
): string[] {
  if (protocol === 'ollama_native') {
    const models: any[] = Array.isArray(json?.models) ? json.models : [];
    return Array.from(
      new Set(
        models
          .map((item) => (typeof item === 'string' ? item : item?.name || item?.model || ''))
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
  }

  if (protocol === 'gemini') {
    const models: any[] = Array.isArray(json?.models) ? json.models : [];
    const filtered = models.filter((item) => {
      if (!item || typeof item !== 'object') return true;
      if (!Array.isArray(item.supportedGenerationMethods)) return true;
      return item.supportedGenerationMethods.includes('generateContent');
    });
    return Array.from(
      new Set(
        filtered
          .map((item) => {
            const rawId = typeof item === 'string' ? item : item?.name || item?.id || '';
            return String(rawId).replace(/^models\//i, '');
          })
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
  }

  // OpenAI, Anthropic (/v1/models returns { data: [{ id }] }), OpenAI Responses, Azure OpenAI
  const list: any[] = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
      ? json.models
      : [];
  const isGeminiOpenAICompat = url.toLowerCase().includes('generativelanguage.googleapis.com');
  return Array.from(
    new Set(
      list
        .map((item) => {
          const rawId = typeof item === 'string' ? item : item?.id || item?.name || '';
          return isGeminiOpenAICompat ? String(rawId).replace(/^models\//i, '') : String(rawId);
        })
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
}

/* =========================================================================
   MESSAGE & TOOL FORMAT CONVERTERS
   ========================================================================= */

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec((url || '').trim());
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function parseToolArguments(raw: any): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return { value: parsed };
    } catch {
      return { raw };
    }
  }
  return {};
}

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' || part?.type === 'input_text' || part?.type === 'output_text') {
          return part.text || '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Recursively cleans JSON schema objects for Google Gemini `functionDeclarations` compatibility.
 */
function sanitizeGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeGeminiSchema(item));
  }

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (
      key === '$schema' ||
      key === 'additionalProperties' ||
      key === 'default' ||
      key === 'const' ||
      key === 'exclusiveMinimum' ||
      key === 'exclusiveMaximum'
    ) {
      continue;
    }
    if (key === 'type' && Array.isArray(value)) {
      const nonNull = value.find((t) => t !== 'null');
      out.type = nonNull || 'string';
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, any> = {};
      for (const [pKey, pVal] of Object.entries(value)) {
        props[pKey] = sanitizeGeminiSchema(pVal);
      }
      out.properties = props;
      continue;
    }
    if (key === 'items') {
      out.items = sanitizeGeminiSchema(value);
      continue;
    }
    out[key] = sanitizeGeminiSchema(value);
  }

  if (out.type === 'object' && !out.properties) {
    out.properties = {};
  }
  return out;
}

/**
 * Converts OpenAI-style chat messages + tools into Anthropic Messages API payload.
 */
export function buildAnthropicPayload(
  cfg: Partial<AIAgentEndpointConfig>,
  messages: any[],
  openAITools: any[],
  includeTools: boolean,
  activeModel: string,
  options?: { disableCacheControl?: boolean; maxTokensOverride?: number }
): Record<string, any> {
  const systemParts: string[] = [];
  const rawMessages: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'system') {
      const text = extractTextFromContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === 'tool') {
      rawMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || 'tool_call',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
          },
        ],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: any[] = [];
      const text = extractTextFromContent(msg.content);
      if (text) {
        blocks.push({ type: 'text', text });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id || `toolu_${Math.random().toString(36).slice(2, 10)}`,
            name: tc.function?.name || tc.name || '',
            input: parseToolArguments(tc.function?.arguments ?? tc.arguments),
          });
        }
      }
      if (blocks.length > 0) {
        rawMessages.push({ role: 'assistant', content: blocks });
      }
      continue;
    }

    // Default: user message
    const blocks: any[] = [];
    if (typeof msg.content === 'string') {
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          blocks.push({ type: 'text', text: part.text });
        } else if (part?.type === 'image_url' && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: parsed.mimeType,
                data: parsed.data,
              },
            });
          } else {
            blocks.push({
              type: 'image',
              source: {
                type: 'url',
                url: part.image_url.url,
              },
            });
          }
        }
      }
    }
    if (blocks.length > 0) {
      rawMessages.push({ role: 'user', content: blocks });
    }
  }

  // Merge consecutive messages with the same role (required by Anthropic Messages API)
  const mergedMessages: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];
  for (const m of rawMessages) {
    const prev = mergedMessages[mergedMessages.length - 1];
    if (prev && prev.role === m.role) {
      prev.content.push(...m.content);
    } else {
      mergedMessages.push({ role: m.role, content: [...m.content] });
    }
  }

  const useCache = cfg.promptCaching !== false && !options?.disableCacheControl;
  const maxTokens = options?.maxTokensOverride || Math.max(1, Number(cfg.maxTokens) || DEFAULT_ANTHROPIC_MAX_TOKENS);
  const body: Record<string, any> = {
    model: activeModel,
    max_tokens: maxTokens,
    messages: mergedMessages,
  };

  if (typeof cfg.temperature === 'number' && Number.isFinite(cfg.temperature)) {
    body.temperature = cfg.temperature;
  }

  const systemText = systemParts.join('\n\n').trim();
  if (systemText) {
    body.system = useCache
      ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
      : systemText;
  }

  if (includeTools && Array.isArray(openAITools) && openAITools.length > 0) {
    const anthropicTools = openAITools.map((t) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
    }));
    if (useCache && anthropicTools.length > 0) {
      (anthropicTools[anthropicTools.length - 1] as any).cache_control = { type: 'ephemeral' };
    }
    body.tools = anthropicTools;
    body.tool_choice = { type: 'auto' };
  }

  return body;
}

/**
 * Converts OpenAI-style chat messages + tools into Google Gemini Native `:generateContent` payload.
 */
export function buildGeminiNativePayload(
  cfg: Partial<AIAgentEndpointConfig>,
  messages: any[],
  openAITools: any[],
  includeTools: boolean,
  options?: { maxOutputTokensOverride?: number }
): Record<string, any> {
  const systemParts: string[] = [];
  const rawContents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'system') {
      const text = extractTextFromContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === 'tool') {
      let responseObj: Record<string, any>;
      if (typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content);
          responseObj =
            parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? parsed
              : { result: parsed };
        } catch {
          responseObj = { result: msg.content };
        }
      } else if (msg.content && typeof msg.content === 'object' && !Array.isArray(msg.content)) {
        responseObj = msg.content;
      } else {
        responseObj = { result: msg.content ?? '' };
      }

      rawContents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || 'tool_result',
              response: responseObj,
            },
          },
        ],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: any[] = [];
      const text = extractTextFromContent(msg.content);
      if (text) {
        parts.push({ text });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const fcPart: Record<string, any> = {
            functionCall: {
              name: tc.function?.name || tc.name || '',
              args: parseToolArguments(tc.function?.arguments ?? tc.arguments),
            },
          };
          if (tc._thoughtSignature) {
            fcPart.thoughtSignature = tc._thoughtSignature;
          }
          parts.push(fcPart);
        }
      }
      if (parts.length > 0) {
        rawContents.push({ role: 'model', parts });
      }
      continue;
    }

    // User turn
    const parts: any[] = [];
    if (typeof msg.content === 'string') {
      if (msg.content) parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part?.type === 'image_url' && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) {
            parts.push({
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            });
          } else {
            parts.push({
              fileData: {
                fileUri: part.image_url.url,
              },
            });
          }
        }
      }
    }
    if (parts.length > 0) {
      rawContents.push({ role: 'user', parts });
    }
  }

  // Merge consecutive turns of the same role
  const mergedContents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  for (const item of rawContents) {
    const prev = mergedContents[mergedContents.length - 1];
    if (prev && prev.role === item.role) {
      prev.parts.push(...item.parts);
    } else {
      mergedContents.push({ role: item.role, parts: [...item.parts] });
    }
  }

  const body: Record<string, any> = {
    contents: mergedContents,
  };

  const systemText = systemParts.join('\n\n').trim();
  if (systemText) {
    body.systemInstruction = {
      parts: [{ text: systemText }],
    };
  }

  const generationConfig: Record<string, any> = {};
  if (typeof cfg.temperature === 'number' && Number.isFinite(cfg.temperature)) {
    generationConfig.temperature = cfg.temperature;
  }
  const maxOut = options?.maxOutputTokensOverride || (cfg.maxTokens ? Number(cfg.maxTokens) : undefined);
  if (maxOut && Number.isFinite(maxOut) && maxOut > 0) {
    generationConfig.maxOutputTokens = maxOut;
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  if (includeTools && Array.isArray(openAITools) && openAITools.length > 0) {
    body.tools = [
      {
        functionDeclarations: openAITools.map((t) => ({
          name: t.function?.name || t.name,
          description: t.function?.description || t.description || '',
          parameters: sanitizeGeminiSchema(
            t.function?.parameters || t.parameters || { type: 'object', properties: {} }
          ),
        })),
      },
    ];
    body.toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO',
      },
    };
  }

  return body;
}

/**
 * Converts OpenAI-style chat messages + tools into OpenAI Responses API (`/v1/responses`) payload.
 */
export function buildOpenAIResponsesPayload(
  cfg: Partial<AIAgentEndpointConfig>,
  messages: any[],
  openAITools: any[],
  includeTools: boolean,
  activeModel: string,
  options?: { maxOutputTokensOverride?: number }
): Record<string, any> {
  const systemParts: string[] = [];
  const inputItems: any[] = [];

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === 'system') {
      const text = extractTextFromContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === 'tool') {
      inputItems.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id || 'call_unknown',
        output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const text = extractTextFromContent(msg.content);
      if (text) {
        inputItems.push({
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const rawArgs = tc.function?.arguments ?? tc.arguments ?? '{}';
          inputItems.push({
            type: 'function_call',
            call_id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
            name: tc.function?.name || tc.name || '',
            arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs),
          });
        }
      }
      continue;
    }

    // User message
    if (typeof msg.content === 'string') {
      inputItems.push({
        role: 'user',
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      const parts: any[] = [];
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          parts.push({ type: 'input_text', text: part.text });
        } else if (part?.type === 'image_url' && part.image_url?.url) {
          parts.push({ type: 'input_image', image_url: part.image_url.url });
        }
      }
      if (parts.length > 0) {
        inputItems.push({
          role: 'user',
          content: parts,
        });
      }
    }
  }

  const body: Record<string, any> = {
    model: activeModel,
    input: inputItems,
  };

  const instructions = systemParts.join('\n\n').trim();
  if (instructions) {
    body.instructions = instructions;
  }

  if (cfg.reasoningEffort && ['low', 'medium', 'high'].includes(cfg.reasoningEffort)) {
    body.reasoning = { effort: cfg.reasoningEffort };
  } else if (typeof cfg.temperature === 'number' && Number.isFinite(cfg.temperature)) {
    body.temperature = cfg.temperature;
  }

  const maxOut = options?.maxOutputTokensOverride || (cfg.maxTokens ? Number(cfg.maxTokens) : undefined);
  if (maxOut && Number.isFinite(maxOut) && maxOut > 0) {
    body.max_output_tokens = maxOut;
  }

  if (includeTools && Array.isArray(openAITools) && openAITools.length > 0) {
    body.tools = openAITools.map((t) => ({
      type: 'function',
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      parameters: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
    }));
    body.tool_choice = 'auto';
  }

  return body;
}

/**
 * Converts OpenAI-style chat messages + tools into Ollama Native `/api/chat` payload.
 */
export function buildOllamaNativePayload(
  cfg: Partial<AIAgentEndpointConfig>,
  messages: any[],
  openAITools: any[],
  includeTools: boolean,
  activeModel: string,
  options?: { numPredictOverride?: number }
): Record<string, any> {
  const ollamaMessages: any[] = [];

  for (const msg of messages) {
    if (!msg) continue;

    if (msg.role === 'system') {
      ollamaMessages.push({
        role: 'system',
        content: extractTextFromContent(msg.content),
      });
      continue;
    }

    if (msg.role === 'tool') {
      ollamaMessages.push({
        role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const item: Record<string, any> = {
        role: 'assistant',
        content: extractTextFromContent(msg.content),
      };
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        item.tool_calls = msg.tool_calls.map((tc: any) => ({
          function: {
            name: tc.function?.name || tc.name || '',
            arguments: parseToolArguments(tc.function?.arguments ?? tc.arguments),
          },
        }));
      }
      ollamaMessages.push(item);
      continue;
    }

    // User message (Ollama expects raw base64 strings in `images`)
    const textParts: string[] = [];
    const base64Images: string[] = [];
    if (typeof msg.content === 'string') {
      textParts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part?.type === 'image_url' && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url);
          if (parsed) {
            base64Images.push(parsed.data);
          }
        }
      }
    }

    const userItem: Record<string, any> = {
      role: 'user',
      content: textParts.join('\n'),
    };
    if (base64Images.length > 0) {
      userItem.images = base64Images;
    }
    ollamaMessages.push(userItem);
  }

  const numCtx = Math.max(2048, Number(cfg.ollamaNumCtx) || DEFAULT_OLLAMA_NUM_CTX);
  const ollamaOptions: Record<string, any> = {
    temperature: cfg.temperature ?? 0.2,
    num_ctx: numCtx,
  };
  if (options?.numPredictOverride) {
    ollamaOptions.num_predict = options.numPredictOverride;
  }

  const body: Record<string, any> = {
    model: activeModel,
    messages: ollamaMessages,
    stream: false,
    options: ollamaOptions,
  };

  if (includeTools && Array.isArray(openAITools) && openAITools.length > 0) {
    body.tools = openAITools;
  }

  return body;
}

/**
 * Builds the request payload for any supported protocol.
 */
export function buildProtocolChatPayload(
  cfg: Partial<AIAgentEndpointConfig>,
  messages: any[],
  openAITools: any[],
  includeTools: boolean,
  activeModel: string,
  options?: { disableCacheControl?: boolean }
): Record<string, any> {
  const protocol = resolveProtocol(cfg);

  switch (protocol) {
    case 'anthropic':
      return buildAnthropicPayload(cfg, messages, openAITools, includeTools, activeModel, options);
    case 'gemini':
      return buildGeminiNativePayload(cfg, messages, openAITools, includeTools);
    case 'openai_responses':
      return buildOpenAIResponsesPayload(cfg, messages, openAITools, includeTools, activeModel);
    case 'ollama_native':
      return buildOllamaNativePayload(cfg, messages, openAITools, includeTools, activeModel);
    case 'azure_openai':
    case 'openai':
    default: {
      const body: Record<string, any> = {
        model: activeModel,
        messages,
        temperature: cfg.temperature ?? 0.2,
      };
      if (includeTools && Array.isArray(openAITools) && openAITools.length > 0) {
        body.tools = openAITools;
        body.tool_choice = 'auto';
      }
      return body;
    }
  }
}

/**
 * Builds a minimal test payload to validate connectivity, authentication, and model availability.
 */
export function buildProtocolTestPayload(
  cfg: Partial<AIAgentEndpointConfig>,
  activeModel: string,
  minimal: boolean = false
): Record<string, any> {
  const protocol = resolveProtocol(cfg);
  const baseMessages = [{ role: 'user', content: 'Reply with OK.' }];

  switch (protocol) {
    case 'anthropic':
      return buildAnthropicPayload(
        { ...cfg, temperature: minimal ? undefined : 0, promptCaching: false },
        baseMessages,
        [],
        false,
        activeModel,
        { disableCacheControl: true, maxTokensOverride: 16 }
      );
    case 'gemini':
      return buildGeminiNativePayload(
        { ...cfg, temperature: minimal ? undefined : 0 },
        baseMessages,
        [],
        false,
        { maxOutputTokensOverride: 16 }
      );
    case 'openai_responses':
      return buildOpenAIResponsesPayload(
        { ...cfg, temperature: minimal ? undefined : 0, reasoningEffort: minimal ? '' : cfg.reasoningEffort },
        baseMessages,
        [],
        false,
        activeModel,
        minimal ? undefined : { maxOutputTokensOverride: 16 }
      );
    case 'ollama_native':
      return buildOllamaNativePayload(
        { ...cfg, temperature: 0 },
        baseMessages,
        [],
        false,
        activeModel,
        { numPredictOverride: 16 }
      );
    case 'azure_openai':
    case 'openai':
    default:
      return minimal
        ? { model: activeModel, messages: baseMessages }
        : { model: activeModel, messages: baseMessages, max_tokens: 8, temperature: 0 };
  }
}

/**
 * Normalizes any protocol response into the standard OpenAI Chat Completions shape
 * expected by `AIAgentService`'s agent loop (`{ model, choices: [{ message: { role, content, tool_calls } }] }`).
 */
export function normalizeProtocolResponse(
  protocol: AIAgentProtocol,
  data: any,
  fallbackModel?: string
): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  switch (protocol) {
    case 'anthropic': {
      const blocks: any[] = Array.isArray(data.content) ? data.content : [];
      const textParts: string[] = [];
      const toolCalls: any[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        if (block.type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `call_anthropic_${i}`,
            type: 'function',
            function: {
              name: block.name || '',
              arguments: JSON.stringify(block.input ?? {}),
            },
          });
        }
      }

      return {
        id: data.id,
        model: data.model || fallbackModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: textParts.join('\n'),
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
          },
        ],
        usage: data.usage,
      };
    }

    case 'gemini': {
      const candidate = data.candidates?.[0];
      const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      const textParts: string[] = [];
      const toolCalls: any[] = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        if (typeof part.text === 'string' && !part.thought) {
          textParts.push(part.text);
        }
        if (part.functionCall && part.functionCall.name) {
          const tc: any = {
            id: `call_gemini_${Date.now()}_${i}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          };
          if (part.thoughtSignature) {
            tc._thoughtSignature = part.thoughtSignature;
          }
          toolCalls.push(tc);
        }
      }

      return {
        model: data.modelVersion || fallbackModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: textParts.join('\n'),
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
        usage: data.usageMetadata,
      };
    }

    case 'openai_responses': {
      const outputItems: any[] = Array.isArray(data.output) ? data.output : [];
      const textParts: string[] = [];
      const toolCalls: any[] = [];

      for (let i = 0; i < outputItems.length; i++) {
        const item = outputItems[i];
        if (!item) continue;
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') {
              textParts.push(c.text);
            }
          }
        } else if (item.type === 'function_call') {
          toolCalls.push({
            id: item.call_id || item.id || `call_resp_${i}`,
            type: 'function',
            function: {
              name: item.name || '',
              arguments:
                typeof item.arguments === 'string'
                  ? item.arguments
                  : JSON.stringify(item.arguments ?? {}),
            },
          });
        }
      }

      if (textParts.length === 0 && typeof data.output_text === 'string' && data.output_text) {
        textParts.push(data.output_text);
      }

      return {
        id: data.id,
        model: data.model || fallbackModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: textParts.join('\n'),
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
        usage: data.usage,
      };
    }

    case 'ollama_native': {
      const msg = data.message;
      if (!msg) return data;
      const toolCalls: any[] = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc: any, i: number) => ({
            id: tc.id || `call_ollama_${Date.now()}_${i}`,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments:
                typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments ?? {}),
            },
          }))
        : [];

      return {
        model: data.model || fallbackModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: typeof msg.content === 'string' ? msg.content : '',
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
      };
    }

    case 'azure_openai':
    case 'openai':
    default:
      return data;
  }
}

/**
 * Extracts a clean error message from OpenAI, Anthropic, Gemini, Azure, or Ollama error responses.
 */
export function extractProtocolErrorMessage(rawText: string, fallbackText: string): string {
  const fallback = rawText || fallbackText || 'Unknown error';
  if (!rawText) return fallback;
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
    const errObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    if (errObj?.message) {
      return String(errObj.message);
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Keep raw text
  }
  return fallback;
}
