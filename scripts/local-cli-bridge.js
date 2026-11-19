#!/usr/bin/env node
/**
 * Local CLI OpenAI-Compatible Bridge for Mesh Editor
 *
 * Bridges OpenAI-compatible `/v1/models` and `/v1/chat/completions` requests
 * to locally installed AI CLIs using your existing CLI logins (no API key needed):
 *   - Claude Code CLI (`claude -p`)
 *   - OpenAI Codex CLI (`codex exec`)
 *   - Google Gemini CLI (`gemini -p`)
 *
 * Start with:
 *   npm run ai:cli-bridge
 *
 * Default endpoint in Mesh Editor Settings:
 *   http://localhost:8788/v1
 */

const http = require('http');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.CLI_BRIDGE_PORT || 8788);
const HOST = process.env.CLI_BRIDGE_HOST || '127.0.0.1';
const REQUEST_TIMEOUT_MS = Number(process.env.CLI_BRIDGE_TIMEOUT_MS || 240000);

const CLI_PROVIDERS = [
  {
    id: 'claude',
    binary: process.env.CLAUDE_BIN || 'claude',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-7-sonnet-latest'],
  },
  {
    id: 'codex',
    binary: process.env.CODEX_BIN || 'codex',
    models: ['codex', 'codex-mini'],
  },
  {
    id: 'gemini',
    binary: process.env.GEMINI_BIN || 'gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
];

function isBinaryAvailable(binary) {
  try {
    const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', [binary], {
      stdio: 'ignore',
    });
    return check.status === 0;
  } catch {
    return false;
  }
}

function detectInstalledProviders() {
  return CLI_PROVIDERS.map((p) => ({
    ...p,
    available: isBinaryAvailable(p.binary),
  }));
}

function resolveProviderForModel(modelId) {
  const lower = String(modelId || '').trim().toLowerCase();
  if (lower.includes('codex') || lower.startsWith('gpt') || lower.startsWith('o3') || lower.startsWith('o4')) {
    return CLI_PROVIDERS.find((p) => p.id === 'codex');
  }
  if (lower.includes('gemini')) {
    return CLI_PROVIDERS.find((p) => p.id === 'gemini');
  }
  return CLI_PROVIDERS.find((p) => p.id === 'claude');
}

function buildPromptFromMessages(messages, tools) {
  const sections = [];

  if (Array.isArray(tools) && tools.length > 0) {
    const compactTools = tools.map((t) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      parameters: t.function?.parameters || t.parameters || {},
    }));
    sections.push(
      [
        'AVAILABLE 3D MODELING TOOLS:',
        JSON.stringify(compactTools),
        'If you want to invoke tools, reply ONLY with a JSON code block in the shape: {"tool_calls": [{"name": "tool_name", "arguments": {...}}]}.',
      ].join('\n')
    );
  }

  for (const msg of messages || []) {
    if (!msg) continue;
    const role = String(msg.role || 'user').toUpperCase();
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .map((part) => (part?.type === 'text' ? part.text : part?.type === 'image_url' ? '[Image Attached]' : ''))
        .filter(Boolean)
        .join('\n');
    }
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      text += `\nTOOL_CALLS: ${JSON.stringify(msg.tool_calls)}`;
    }
    if (text.trim()) {
      sections.push(`[${role}]\n${text.trim()}`);
    }
  }

  return sections.join('\n\n');
}

function runCli(provider, modelId, prompt) {
  return new Promise((resolve, reject) => {
    let args = [];
    if (provider.id === 'claude') {
      args = ['-p', prompt, '--output-format', 'text'];
      if (modelId && modelId !== 'claude') {
        args.push('--model', modelId);
      }
    } else if (provider.id === 'codex') {
      args = ['exec', prompt];
      if (modelId && modelId !== 'codex') {
        args.push('--model', modelId);
      }
    } else {
      args = ['-p', prompt];
      if (modelId) {
        args.push('-m', modelId);
      }
    }

    const child = spawn(provider.binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      reject(new Error(`Local CLI '${provider.binary}' timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.`));
    }, REQUEST_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to start '${provider.binary}': ${err.message}. Ensure the CLI is installed and authenticated.`
        )
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`CLI '${provider.binary}' exited with code ${code}: ${stderr.trim() || 'Unknown error'}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function extractToolCalls(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      return parsed.tool_calls.map((tc, idx) => ({
        id: tc.id || `call_cli_${Date.now()}_${idx}`,
        type: 'function',
        function: {
          name: tc.name || tc.function?.name || '',
          arguments:
            typeof (tc.arguments ?? tc.function?.arguments) === 'string'
              ? (tc.arguments ?? tc.function?.arguments)
              : JSON.stringify(tc.arguments ?? tc.function?.arguments ?? {}),
        },
      }));
    }
  } catch {
    // Not structured JSON tool_calls; return plain text response
  }
  return [];
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
}

function sendJson(res, status, payload) {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function createLocalCliBridgeServer() {
  return http.createServer(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && urlPath === '/health') {
      const providers = detectInstalledProviders();
      sendJson(res, 200, {
        status: 'ok',
        providers: providers.map((p) => ({ id: p.id, binary: p.binary, available: p.available })),
      });
      return;
    }

    if (req.method === 'GET' && (urlPath === '/v1/models' || urlPath === '/models')) {
      const providers = detectInstalledProviders();
      const installed = providers.filter((p) => p.available);
      const list = (installed.length > 0 ? installed : providers).flatMap((p) =>
        p.models.map((id) => ({
          id,
          object: 'model',
          owned_by: `local-cli-${p.id}`,
        }))
      );
      sendJson(res, 200, { object: 'list', data: list });
      return;
    }

    if (req.method === 'POST' && (urlPath === '/v1/chat/completions' || urlPath === '/chat/completions')) {
      try {
        const body = await readJsonBody(req);
        const model = String(body.model || 'claude-sonnet-4-5').trim();
        const provider = resolveProviderForModel(model);
        const prompt = buildPromptFromMessages(body.messages, body.tools);
        const outputText = await runCli(provider, model, prompt);
        const toolCalls = extractToolCalls(outputText);

        sendJson(res, 200, {
          id: `chatcmpl_cli_${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: toolCalls.length > 0 ? '' : outputText,
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
              },
              finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
            },
          ],
        });
      } catch (err) {
        sendJson(res, 500, {
          error: {
            message: err?.message || 'Local CLI bridge request failed.',
            type: 'local_cli_bridge_error',
          },
        });
      }
      return;
    }

    sendJson(res, 404, { error: { message: `Not found: ${urlPath}` } });
  });
}

if (require.main === module) {
  const server = createLocalCliBridgeServer();
  server.listen(PORT, HOST, () => {
    const detected = detectInstalledProviders();
    const availableStr = detected
      .filter((p) => p.available)
      .map((p) => `${p.id} (${p.binary})`)
      .join(', ');
    console.log(`[MeshEditor Local CLI Bridge] Listening on http://${HOST}:${PORT}/v1`);
    console.log(
      `[MeshEditor Local CLI Bridge] Detected CLIs: ${availableStr || 'none found in PATH (install claude, codex, or gemini CLI)'}`
    );
  });
}

module.exports = {
  createLocalCliBridgeServer,
  resolveProviderForModel,
  buildPromptFromMessages,
  extractToolCalls,
};
