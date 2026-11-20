#!/usr/bin/env node
/**
 * Antigravity Local OpenAI-Compatible Bridge for Mesh Editor
 *
 * Bridges OpenAI-compatible `/v1/models` and `/v1/chat/completions` requests
 * from the Mesh Editor AI Agent directly to the local Antigravity CLI (`agy`),
 * using the user's authenticated Antigravity account without requiring an API key.
 *
 * Used automatically by:
 * 1. `webpack-dev-server` at `/api/antigravity/v1/*` (`npm run dev` / `npm run prod`)
 * 2. Standalone bridge server at `http://localhost:8787/v1/*` (`npm run ai:bridge`)
 * 3. Electron desktop app (`electron/main.js`)
 */

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DEFAULT_AGY_MODELS = [
  'gemini-3.8-flash-medium',
  'gemini-3.8-flash-high',
  'gemini-3.8-flash-low',
  'gemini-4-neon-medium',
  'gemini-4-neon-high',
  'gemini-4-neon-xhigh',
  'gemini-4-neon-low',
  'gemini-4-argon-medium',
  'gemini-4-argon-high',
  'gemini-4-argon-low',
  'gemini-4-hydrogen-medium',
  'gemini-4-hydrogen-high',
  'gemini-4-hydrogen-xhigh',
  'gemini-4-hydrogen-low',
  'gemini-pro-orchestrator-neon',
  'gemini-pro-orchestrator-g1-pro',
  'claude-sonnet-5-5-medium',
  'claude-sonnet-5-5-high',
  'claude-sonnet-5-5-low',
  'claude-opus-5-5-medium',
  'claude-opus-5-5-high',
  'claude-opus-5-5-low',
  'gpt-oss-120b-medium',
];

let cachedModels = null;

/**
 * Resolves the path to the local `agy` binary.
 */
function resolveAgyBinary() {
  const home = os.homedir();
  const candidates = [
    process.env.AGY_BIN,
    path.join(home, '.gemini', 'bin', 'agy'),
    path.join(home, '.gemini', 'antigravity', 'bin', 'agy'),
    '/usr/local/bin/agy',
    '/opt/homebrew/bin/agy',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return 'agy';
}

/**
 * Normalizes a requested model ID to a valid Antigravity CLI model ID.
 */
function normalizeAgyModel(requestedModel) {
  const raw = String(requestedModel || '').trim().toLowerCase();
  if (!raw) return 'gemini-3.8-flash-medium';

  if (DEFAULT_AGY_MODELS.includes(raw)) {
    return raw;
  }
  if (raw.includes('3.8-flash') || raw.includes('3-flash') || raw.includes('2.5-flash') || raw === 'gemini-flash') {
    if (raw.includes('high')) return 'gemini-3.8-flash-high';
    if (raw.includes('low')) return 'gemini-3.8-flash-low';
    return 'gemini-3.8-flash-medium';
  }
  if (raw.includes('neon')) {
    if (raw.includes('orchestrator')) return 'gemini-pro-orchestrator-neon';
    if (raw.includes('xhigh')) return 'gemini-4-neon-xhigh';
    if (raw.includes('high')) return 'gemini-4-neon-high';
    if (raw.includes('low')) return 'gemini-4-neon-low';
    return 'gemini-4-neon-medium';
  }
  if (raw.includes('hydrogen')) {
    if (raw.includes('xhigh')) return 'gemini-4-hydrogen-xhigh';
    if (raw.includes('high')) return 'gemini-4-hydrogen-high';
    if (raw.includes('low')) return 'gemini-4-hydrogen-low';
    return 'gemini-4-hydrogen-medium';
  }
  if (raw.includes('argon') || raw.includes('3.1-pro') || raw.includes('2.5-pro') || raw === 'gemini-pro') {
    if (raw.includes('high')) return 'gemini-4-argon-high';
    if (raw.includes('low')) return 'gemini-4-argon-low';
    return 'gemini-4-argon-medium';
  }
  if (raw.includes('opus')) {
    if (raw.includes('high')) return 'claude-opus-5-5-high';
    if (raw.includes('low')) return 'claude-opus-5-5-low';
    return 'claude-opus-5-5-medium';
  }
  if (raw.includes('claude') || raw.includes('sonnet')) {
    if (raw.includes('high')) return 'claude-sonnet-5-5-high';
    if (raw.includes('low')) return 'claude-sonnet-5-5-low';
    return 'claude-sonnet-5-5-medium';
  }
  if (raw.includes('gpt-oss')) {
    return 'gpt-oss-120b-medium';
  }
  // Fallback for e.g. 'gpt-4o' when switching from OpenAI preset to Antigravity
  if (raw.startsWith('gpt-')) {
    return 'gemini-3.8-flash-medium';
  }
  return requestedModel;
}

/**
 * Parses the final JSON status object emitted by `agy --output-format json`.
 */
function parseLastAgyJson(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;

  // 1. Direct full-stdout JSON (handles both single-line and pretty-printed multi-line JSON)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through to line-by-line / slice scanning
    }
  }

  // 2. Last single-line JSON object (standard NDJSON / status line output)
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('{') && lines[i].endsWith('}')) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // continue searching
      }
    }
  }

  // 3. Fallback: last balanced JSON object in stdout (handles multi-line JSON preceded by log lines)
  const slices = scanTopLevelJsonSlices(trimmed);
  for (let i = slices.length - 1; i >= 0; i--) {
    if (!slices[i].startsWith('{')) continue;
    try {
      const parsed = JSON.parse(slices[i]);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        ('status' in parsed || 'response' in parsed || 'conversation_id' in parsed || 'error' in parsed)
      ) {
        return parsed;
      }
    } catch {
      // continue searching
    }
  }

  return null;
}

/**
 * Runs a command and captures stdout/stderr with a timeout.
 */
function execProcess(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || 600000; // 10 minutes timeout
    const jsonGraceMs = options.jsonGraceMs ?? 2500; // Allow agy to finish SQLite/store shutdown cleanly
    const isWin = process.platform === 'win32';
    const child = spawn(bin, args, {
      cwd: options.cwd || os.tmpdir(),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWin,
    });

    let stdout = '';
    let stderr = '';
    let timer = null;
    let jsonEarlyTimer = null;
    let exitTimer = null;
    let exited = false;
    let settled = false;

    const killProcessGroup = (signalName) => {
      try {
        if (child.pid && !isWin) {
          process.kill(-child.pid, signalName);
        } else {
          child.kill(signalName);
        }
      } catch {
        // ignore if already exited
      }
    };

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (jsonEarlyTimer) {
        clearTimeout(jsonEarlyTimer);
        jsonEarlyTimer = null;
      }
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = null;
      }
      if (exited) {
        // Main process already exited cleanly; reap any lingering grandchild processes (e.g. stdio MCP servers)
        killProcessGroup('SIGKILL');
      } else {
        // Terminate gracefully first so SQLite WAL/stores are not corrupted mid-flush
        killProcessGroup('SIGTERM');
        const forceKill = setTimeout(() => killProcessGroup('SIGKILL'), 300);
        if (typeof forceKill.unref === 'function') {
          forceKill.unref();
        }
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        fail(new Error(`Antigravity CLI process timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
    }

    let exitCode = 0;

    const scheduleExitFinish = (delayMs) => {
      if (exitTimer) {
        clearTimeout(exitTimer);
      }
      exitTimer = setTimeout(() => {
        finish({ code: exitCode, stdout, stderr });
      }, delayMs);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (exited && !settled) {
        // More stdout data arrived after exit; wait briefly to ensure pipe finishes flushing
        scheduleExitFinish(80);
      }
      // When agy outputs its complete JSON result in print mode, wait briefly for agy
      // to finish its own clean shutdown (typically ~200ms) and only force-resolve if
      // persistent grandchild processes (such as stdio MCP servers) keep pipes open.
      if (
        options.waitForJson !== false &&
        !jsonEarlyTimer &&
        !exited &&
        stdout.includes('"conversation_id"') &&
        /"status"\s*:\s*"(?:SUCCESS|ERROR)"/.test(stdout)
      ) {
        const parsed = parseLastAgyJson(stdout);
        if (parsed && (parsed.status === 'SUCCESS' || parsed.status === 'ERROR')) {
          jsonEarlyTimer = setTimeout(() => {
            const earlyCode = parsed.status === 'ERROR' ? 1 : 0;
            finish({ code: earlyCode, stdout, stderr });
          }, jsonGraceMs);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      fail(err);
    });

    child.on('exit', (code) => {
      exited = true;
      exitCode = code ?? 0;
      if (jsonEarlyTimer) {
        clearTimeout(jsonEarlyTimer);
        jsonEarlyTimer = null;
      }
      const hasParsedJson = Boolean(parseLastAgyJson(stdout));
      // Allow more time for buffered stdout to flush if no complete JSON has arrived yet
      scheduleExitFinish(hasParsedJson ? 80 : 250);
    });

    child.on('close', (code) => {
      exited = true;
      finish({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Queries `agy models` (with caching and fallback to DEFAULT_AGY_MODELS).
 */
async function listAgyModels() {
  if (cachedModels && cachedModels.length > 0) {
    return cachedModels;
  }
  try {
    const bin = resolveAgyBinary();
    const { code, stdout } = await execProcess(bin, ['models']);
    if (code === 0 && stdout) {
      const parsed = [];
      const lines = stdout.replace(/\r/g, '\n').split('\n');
      for (const line of lines) {
        const clean = line.replace(/^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+/, '').trim();
        if (!clean || clean.startsWith('Fetching')) continue;
        const match = clean.match(/^([a-z0-9._-]+)(?:\t+|\s{2,})(.+)$/i);
        if (match) {
          parsed.push(match[1].trim());
        }
      }
      if (parsed.length > 0) {
        cachedModels = Array.from(new Set([...parsed, ...DEFAULT_AGY_MODELS]));
        return cachedModels;
      }
    }
  } catch {
    // Fallback to default list
  }
  return DEFAULT_AGY_MODELS;
}

const BABYLON_CODE_PATTERN =
  /\b(?:MeshBuilder\.|new\s+(?:BABYLON\.)?(?:PBRMaterial|StandardMaterial|Mesh)|registerMesh\s*\(|ExtrudePolygon|CreateRibbon|CSG2?\.FromMesh)\b/;

function createBabylonFallbackCall(code, description) {
  return [
    {
      name: 'modeler_execute_babylon_code',
      arguments: {
        description: description || 'Execute generated Babylon.js script in the scene',
        code,
      },
    },
  ];
}

function isAllowedTempScriptPath(filePath) {
  if (!filePath || !filePath.endsWith('.js')) return false;
  const resolved = path.resolve(filePath);
  const tmpDir = path.resolve(os.tmpdir());
  return (
    resolved.startsWith(tmpDir + path.sep) ||
    resolved.startsWith('/tmp/') ||
    resolved.startsWith('/private/tmp/') ||
    resolved.startsWith('/var/folders/') ||
    resolved.startsWith('/private/var/folders/')
  );
}

function recoverBabylonScriptFromText(text) {
  const source = String(text || '');
  if (!source) return [];

  // 1. Check fenced JS/TS/Babylon code blocks inside response text
  const codeFenceRegex = /```(?:javascript|js|typescript|ts|babylon)\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeFenceRegex.exec(source)) !== null) {
    const code = match[1].trim();
    if (BABYLON_CODE_PATTERN.test(code)) {
      return createBabylonFallbackCall(code, 'Execute Babylon.js code block returned by assistant');
    }
  }

  // 2. Check referenced temp .js script files written by CLI assistants
  const candidates = [];
  const fileUrlRegex = /file:\/\/(\/[^\s)"'<>]+\.js)/gi;
  while ((match = fileUrlRegex.exec(source)) !== null) {
    try {
      candidates.push(decodeURIComponent(match[1]));
    } catch {
      candidates.push(match[1]);
    }
  }
  const unixTmpRegex = /(?:\/(?:private\/)?(?:var\/folders|tmp)\/[^\s)"'<>]+\.js)/gi;
  while ((match = unixTmpRegex.exec(source)) !== null) {
    candidates.push(match[0]);
  }

  for (const candidatePath of Array.from(new Set(candidates))) {
    if (!isAllowedTempScriptPath(candidatePath)) continue;
    try {
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        const diskCode = fs.readFileSync(candidatePath, 'utf8').trim();
        if (diskCode && BABYLON_CODE_PATTERN.test(diskCode)) {
          return createBabylonFallbackCall(
            diskCode,
            `Execute Babylon.js script from ${path.basename(candidatePath)}`
          );
        }
      }
    } catch {
      // ignore unreadable candidate path
    }
  }

  return [];
}

/**
 * Scans a string for balanced top-level JSON objects (`{...}`) or arrays (`[...]`),
 * supporting concatenated JSON blocks such as `{ "tool_calls": [...] }\n{ "tool_calls": [...] }`.
 */
function scanTopLevelJsonSlices(text) {
  const slices = [];
  if (!text) return slices;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') {
      i++;
      continue;
    }
    const openChar = ch;
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIdx = -1;

    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
      } else if (c === openChar) {
        depth++;
      } else if (c === closeChar) {
        depth--;
        if (depth === 0) {
          endIdx = j;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      slices.push(text.slice(i, endIdx + 1));
      i = endIdx + 1;
    } else {
      i++;
    }
  }
  return slices;
}

/**
 * Extracts a structured `{ content, tool_calls }` payload from the model's text response.
 */
function parseStructuredAgentResponse(rawText, options = {}) {
  const trimmed = String(rawText || '').trim();
  const allowCodeFallback = options.allowCodeFallback !== false;
  if (!trimmed) {
    return { content: '', toolCalls: [] };
  }

  const normalizeCallItem = (item, requireExplicitShape = false) => {
    if (!item || typeof item !== 'object') return null;
    const name = item.name || item.tool || item.tool_name || item.function_name || item.function?.name;
    if (typeof name !== 'string' || !name.trim()) return null;
    const cleanName = name.trim();
    if (
      requireExplicitShape &&
      !cleanName.startsWith('modeler_') &&
      item.arguments === undefined &&
      item.args === undefined &&
      item.parameters === undefined &&
      item.input === undefined &&
      item.function === undefined
    ) {
      return null;
    }
    return {
      name: cleanName,
      arguments: item.arguments ?? item.args ?? item.parameters ?? item.input ?? item.function?.arguments ?? {},
    };
  };

  const extractStringContent = (obj) => {
    const keys = ['content', 'message', 'response', 'text', 'summary', 'answer'];
    let fallbackEmpty = null;
    for (const key of keys) {
      if (typeof obj[key] === 'string') {
        if (obj[key].trim()) {
          return obj[key];
        }
        if (fallbackEmpty === null && (key === 'content' || key === 'message')) {
          fallbackEmpty = '';
        }
      }
    }
    return fallbackEmpty;
  };

  const tryParseObj = (candidate) => {
    try {
      const obj = JSON.parse(candidate);
      if (Array.isArray(obj)) {
        const calls = obj.map((item) => normalizeCallItem(item, true)).filter(Boolean);
        if (calls.length > 0) {
          return { content: '', toolCalls: calls };
        }
      }
      if (obj && typeof obj === 'object') {
        const rawToolCalls = Array.isArray(obj.tool_calls)
          ? obj.tool_calls
          : Array.isArray(obj.toolCalls)
            ? obj.toolCalls
            : null;
        if (rawToolCalls) {
          const toolCalls = rawToolCalls.map((item) => normalizeCallItem(item, false)).filter(Boolean);
          const extracted = extractStringContent(obj);
          const content = extracted ?? '';
          if (toolCalls.length > 0 || extracted !== null) {
            return { content, toolCalls };
          }
        }
        const single = normalizeCallItem(obj, true);
        if (single) {
          return {
            content: extractStringContent(obj) ?? '',
            toolCalls: [single],
          };
        }
        const content = extractStringContent(obj);
        if (content !== null) {
          return { content, toolCalls: [] };
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const parseMultipleJsonBlocks = (text) => {
    const slices = scanTopLevelJsonSlices(text);
    const mergedCalls = [];
    const contentParts = [];
    let matchedAny = false;

    for (const slice of slices) {
      const res = tryParseObj(slice);
      if (!res) continue;
      matchedAny = true;
      if (res.toolCalls.length > 0) {
        mergedCalls.push(...res.toolCalls);
      }
      if (res.content && res.content.trim()) {
        contentParts.push(res.content.trim());
      }
    }

    if (!matchedAny) return null;
    return {
      content: contentParts.join('\n'),
      toolCalls: mergedCalls,
    };
  };

  let parsed = null;

  // 1. Direct single JSON object / array
  parsed = tryParseObj(trimmed);

  // 2. One or more ```json ... ``` fenced blocks (including concatenated JSON inside a block)
  if (!parsed) {
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    const mergedCalls = [];
    const contentParts = [];
    const emptyBlockRanges = [];
    let matchedAny = false;
    let match;
    while ((match = fenceRegex.exec(trimmed)) !== null) {
      const block = match[1].trim();
      const candidate = tryParseObj(block) || parseMultipleJsonBlocks(block);
      if (candidate) {
        matchedAny = true;
        if (candidate.toolCalls.length > 0) {
          mergedCalls.push(...candidate.toolCalls);
        }
        if (candidate.content && candidate.content.trim()) {
          contentParts.push(candidate.content.trim());
        }
        if (candidate.toolCalls.length === 0 && !String(candidate.content || '').trim()) {
          emptyBlockRanges.push([match.index, match.index + match[0].length]);
        }
      }
    }
    if (matchedAny) {
      let content = contentParts.join('\n');
      // If the fenced JSON block(s) were empty envelopes (e.g. {"content":"","tool_calls":[]})
      // accompanied by surrounding prose, preserve the surrounding prose instead of returning empty.
      if (mergedCalls.length === 0 && !content.trim() && emptyBlockRanges.length > 0) {
        let stripped = '';
        let cursor = 0;
        for (const [start, end] of emptyBlockRanges) {
          if (start > cursor) stripped += trimmed.slice(cursor, start);
          cursor = Math.max(cursor, end);
        }
        if (cursor < trimmed.length) stripped += trimmed.slice(cursor);
        if (stripped.trim()) {
          content = stripped.trim();
        }
      }
      parsed = {
        content,
        toolCalls: mergedCalls,
      };
    }
  }

  // 3. One or more unfenced top-level JSON objects/arrays in text (e.g. concatenated {"tool_calls":[...]}\n{"tool_calls":[...]})
  if (!parsed) {
    const multi = parseMultipleJsonBlocks(trimmed);
    if (multi) {
      if (multi.toolCalls.length > 0 || multi.content.trim()) {
        parsed = multi;
      } else {
        // Avoid discarding prose when a stray empty JSON snippet (e.g. {"content":"","tool_calls":[]}) appears inside text
        const withoutJson = scanTopLevelJsonSlices(trimmed)
          .reduce((acc, slice) => acc.replace(slice, ''), trimmed)
          .trim();
        if (withoutJson) {
          parsed = { content: withoutJson, toolCalls: [] };
        } else {
          parsed = multi;
        }
      }
    }
  }

  if (parsed) {
    if (parsed.toolCalls.length === 0 && allowCodeFallback) {
      const recovered = recoverBabylonScriptFromText(parsed.content || trimmed);
      if (recovered.length > 0) {
        return { content: parsed.content, toolCalls: recovered };
      }
    }
    return parsed;
  }

  if (allowCodeFallback) {
    const recovered = recoverBabylonScriptFromText(trimmed);
    if (recovered.length > 0) {
      return { content: trimmed, toolCalls: recovered };
    }
  }

  return { content: trimmed, toolCalls: [] };
}

/**
 * Builds the prompt for `agy -p` from OpenAI `messages` and `tools`.
 */
function buildAgyPromptFromOpenAI(messages, tools) {
  const tempImageFiles = [];
  const sections = [];

  const toolDefs = Array.isArray(tools)
    ? tools
        .map((t) => t && t.function)
        .filter(Boolean)
        .map((fn) => ({
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        }))
    : [];

  sections.push(`=== CRITICAL ANTIGRAVITY BRIDGE PROTOCOL (READ FIRST) ===
You are running inside the Antigravity CLI behind the Mesh Editor HTTP-to-CLI Bridge (scripts/antigravity-bridge.js).
- The 3D scene modeling tools listed under AVAILABLE 3D MODELER TOOLS (all "modeler_*" tools, including "modeler_execute_babylon_code") are VIRTUAL BROWSER-SIDE TOOLS hosted in the live Mesh Editor web app.
- Because you are bridged via stdio/JSON, "modeler_*" tools will NEVER appear as native Antigravity CLI tool declarations in your tool schema. That is completely expected!
- How to call them: Output a single JSON object on stdout containing "tool_calls": [{ "name": "modeler_...", "arguments": { ... } }]. The bridge automatically forwards every entry in "tool_calls" to the live Mesh Editor browser scene, executes it, and feeds the results back to you in the next turn.
- NEVER claim that "modeler_*" tools are unavailable.
- NEVER write ".js" script files to disk or /tmp using write_file/run_command, and NEVER ask the user to manually paste or run code.
- Whenever you write a custom procedural Babylon.js script, pass the script string directly in:
  "tool_calls": [{ "name": "modeler_execute_babylon_code", "arguments": { "description": "...", "code": "..." } }]`);

  for (const msg of messages || []) {
    if (!msg) continue;
    if (msg.role === 'system') {
      sections.push(`=== SYSTEM INSTRUCTIONS ===\n${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`);
    } else if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        sections.push(`=== USER REQUEST ===\n${msg.content}`);
      } else if (Array.isArray(msg.content)) {
        const textParts = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            textParts.push(part.text);
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const url = part.image_url.url;
            const dataMatch = url.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            if (dataMatch) {
              const ext = dataMatch[1] === 'jpeg' ? 'jpg' : dataMatch[1];
              const tmpFile = path.join(os.tmpdir(), `mesheditor_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`);
              try {
                fs.writeFileSync(tmpFile, Buffer.from(dataMatch[2], 'base64'));
                tempImageFiles.push(tmpFile);
                textParts.push(`[Attached Reference Image saved at: ${tmpFile}]`);
              } catch {
                // ignore image write failure
              }
            } else {
              textParts.push(`[Attached Reference Image URL: ${url}]`);
            }
          }
        }
        sections.push(`=== USER REQUEST ===\n${textParts.join('\n')}`);
      }
    } else if (msg.role === 'assistant') {
      const tcList = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc) => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          }))
        : [];
      sections.push(
        `=== PREVIOUS ASSISTANT TURN ===\n${msg.content ? `Text: ${msg.content}\n` : ''}${
          tcList.length > 0 ? `Executed Tool Calls: ${JSON.stringify(tcList)}` : ''
        }`
      );
    } else if (msg.role === 'tool') {
      sections.push(`=== TOOL EXECUTION RESULT (${msg.name || msg.tool_call_id}) ===\n${msg.content}`);
    }
  }

  if (toolDefs.length > 0) {
    sections.push(
      `=== AVAILABLE 3D MODELER TOOLS ===\n${JSON.stringify(toolDefs, null, 2)}`
    );
  }

  const imageInstruction =
    tempImageFiles.length > 0
      ? `You may ONLY call your internal read_file tool on [${tempImageFiles.join(', ')}] to inspect the attached reference or 4-view visual critique image(s). Do NOT call any other internal CLI/workspace tools (no run_command, no edit_file, etc.).`
      : `CRITICAL: Do NOT call any internal CLI/workspace tools (do NOT call run_command, read_file, write_file, edit_file, etc.).`;

  sections.push(`=== OUTPUT FORMAT REQUIREMENT ===
${imageInstruction}
Instead, respond ONLY with a single valid JSON object (no markdown prose outside the JSON) with this exact structure:
{
  "content": "Brief message or explanation in English for the user",
  "tool_calls": [
    {
      "name": "modeler_...",
      "arguments": { ... }
    }
  ]
}
Rules for "tool_calls":
1. To create or modify 3D meshes in the scene, populate "tool_calls" with one or more calls to the VIRTUAL AVAILABLE 3D MODELER TOOLS listed above (e.g. "modeler_plan_model", "modeler_create_sdf_mesh", "modeler_create_rounded_box", "modeler_create_wall", "modeler_create_arch", "modeler_create_column", "modeler_create_molding", "modeler_create_stairs", "modeler_create_roof", "modeler_sculpt_mesh", "modeler_create_primitive", "modeler_extrude_polygon", "modeler_create_lathe", "modeler_boolean_operation", "modeler_create_material", "modeler_build_voxel_mesh", "modeler_execute_babylon_code", etc.).
2. IMPORTANT: Even though "modeler_*" tools do not appear in your CLI runtime tool list, they ARE live via this JSON "tool_calls" bridge! Never say they are unavailable, and NEVER save scripts to /tmp or ask the user to copy/paste code into "modeler_execute_babylon_code" — emit the "modeler_execute_babylon_code" JSON tool call directly.
3. You can emit multiple tool_calls in a single turn to build all parts of the requested 3D model at once, or inspect results across turns. Put ALL tool calls for the turn inside ONE single JSON object's "tool_calls" array (never output multiple separate concatenated JSON objects).
4. If all required TOOL EXECUTION RESULTS are already present above and the 3D model is complete (including any VISUAL CRITIQUE self-corrections), set "tool_calls": [] and provide a concise final summary in "content".`);

  return {
    prompt: sections.join('\n\n'),
    tempImageFiles,
  };
}

/**
 * Helper to safely extract JSON body from an incoming HTTP request,
 * supporting both pre-parsed middleware bodies and raw streaming requests.
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        return resolve(JSON.parse(req.body));
      } catch (e) {
        return reject(e);
      }
    }
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(rawBody || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

const TRANSIENT_STARTUP_ERROR_PATTERN =
  /failed to start conversation|backend returned an empty conversation id|initialized by another opener|database is locked|SQLITE_BUSY|trajectory not found/i;

/**
 * Returns true if an agy CLI failure is a transient startup/SQLite-lock race that should be retried.
 */
function isTransientBridgeStartupError(err, stdout = '', stderr = '') {
  if (err && typeof err.statusCode === 'number' && err.statusCode !== 500) {
    return false;
  }
  const combined = `${err?.message || ''}\n${stderr || ''}\n${stdout || ''}`;
  return TRANSIENT_STARTUP_ERROR_PATTERN.test(combined);
}

/**
 * Normalizes error messages from agy CLI into a clear human-readable string and status code.
 */
function extractBridgeErrorDetails(err, stdout, stderr, code) {
  const combined = `${err?.message || ''}\n${stderr || ''}\n${stdout || ''}`;
  let statusCode = 500;
  let message = err?.message || 'Unknown bridge error';

  if (/resource_exhausted|quota reached|error_code":\s*429/i.test(combined)) {
    statusCode = 429;
    const match = combined.match(/Individual quota reached[^\n"]*/i);
    message = match ? match[0] : 'Antigravity quota reached. Resets in a few hours or switch model/endpoint.';
  } else if (/timed out/i.test(combined)) {
    statusCode = 504;
    message = 'Antigravity CLI timed out after 10m. Please retry or choose a lighter model.';
  } else if (/auth|not signed in|login/i.test(combined)) {
    statusCode = 401;
    message = 'Antigravity authentication expired or missing. Please run `agy auth login` or switch model.';
  } else if (code !== 0) {
    message = err?.message || stderr.trim() || `Antigravity CLI exited with code ${code}`;
  }

  return { statusCode, message };
}

/**
 * Returns true if the model explicitly emitted a valid JSON completion envelope with
 * an empty `tool_calls: []` array and empty `content` (e.g. `{"content":"","tool_calls":[]}`).
 */
function isExplicitEmptyCompletionEnvelope(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return false;
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const rawToolCalls = Array.isArray(parsed.tool_calls)
      ? parsed.tool_calls
      : Array.isArray(parsed.toolCalls)
        ? parsed.toolCalls
        : null;
    return Array.isArray(rawToolCalls) && rawToolCalls.length === 0;
  } catch {
    return false;
  }
}

/**
 * Executes a chat completion request via `agy` and returns an OpenAI-formatted response object.
 */
async function runAgyChatCompletion(body, options = {}) {
  const bin = resolveAgyBinary();
  const model = normalizeAgyModel(body?.model);
  const { prompt, tempImageFiles } = buildAgyPromptFromOpenAI(body?.messages || [], body?.tools || []);
  const execFn = options.execFn || execProcess;
  const retryDelaysMs = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs : [350, 900];

  // Always supply --dangerously-skip-permissions and --print-timeout 600s so agy never hangs waiting for stdin confirmation
  const baseArgs = [
    '--model',
    model,
    '--output-format',
    'json',
    '--disable-slash-commands',
    '--dangerously-skip-permissions',
    '--print-timeout',
    '600s',
  ];
  if (tempImageFiles.length > 0) {
    baseArgs.push('--add-dir', os.tmpdir());
  }

  const hasExecutedBabylonCode = (body?.messages || []).some(
    (m) => m && m.role === 'tool' && m.name === 'modeler_execute_babylon_code'
  );
  const hasPriorToolResults = (body?.messages || []).some((m) => m && m.role === 'tool');

  try {
    let agyResult = null;
    let finalContent = '';
    let finalFormattedToolCalls = [];
    let retryEmptyNudge = false;
    const maxAttempts = 1 + retryDelaysMs.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptPrompt = retryEmptyNudge
        ? `${prompt}\n\n[RETRY NOTICE: Your previous attempt returned an empty response with no content and no tool_calls. You MUST output a single valid JSON object containing a non-empty "content" string and/or at least one entry in "tool_calls". Do NOT call internal workspace tools or return an empty string.]`
        : prompt;
      const attemptArgs = [...baseArgs, '-p', attemptPrompt];

      const { code, stdout, stderr } = await execFn(bin, attemptArgs, { cwd: os.tmpdir(), timeoutMs: 600000 });
      agyResult = parseLastAgyJson(stdout);

      if (agyResult?.status === 'ERROR' || agyResult?.finished_reason === 'error' || (code !== 0 && !agyResult)) {
        const errDetails = extractBridgeErrorDetails(new Error(agyResult?.error || ''), stdout, stderr, code);
        const bridgeErr = new Error(errDetails.message);
        bridgeErr.statusCode = errDetails.statusCode;

        if (attempt < retryDelaysMs.length && isTransientBridgeStartupError(bridgeErr, stdout, stderr)) {
          const delayMs = retryDelaysMs[attempt];
          console.warn(
            `[Antigravity Bridge] Transient CLI startup error (${bridgeErr.message}); retrying in ${delayMs}ms (attempt ${attempt + 2}/${maxAttempts})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw bridgeErr;
      }

      const rawResponseText = agyResult
        ? agyResult.response || agyResult.result || agyResult.output || agyResult.text || ''
        : stdout;
      const { content, toolCalls } = parseStructuredAgentResponse(rawResponseText, {
        allowCodeFallback: !hasExecutedBabylonCode,
      });

      const formattedToolCalls = (toolCalls || [])
        .filter((tc) => tc && typeof (tc.name || tc.function?.name) === 'string')
        .map((tc, idx) => {
          const fnName = tc.name || tc.function?.name;
          const fnArgs = tc.arguments ?? tc.function?.arguments ?? {};
          return {
            id: `call_agy_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: fnName,
              arguments: typeof fnArgs === 'string' ? fnArgs : JSON.stringify(fnArgs),
            },
          };
        });

      if (String(content || '').trim() || formattedToolCalls.length > 0) {
        finalContent = content;
        finalFormattedToolCalls = formattedToolCalls;
        break;
      }

      // If tool calls already ran in previous turns and the model explicitly returned
      // {"content":"","tool_calls":[]}, treat it as a completed turn rather than failing with 500.
      if (hasPriorToolResults && isExplicitEmptyCompletionEnvelope(rawResponseText)) {
        finalContent = 'Finished 3D mesh operations.';
        finalFormattedToolCalls = [];
        break;
      }

      // Check whether stderr/stdout contains a specific non-500 error (e.g. 429 quota, 401 auth, 504 timeout)
      const errDetails = extractBridgeErrorDetails(new Error(agyResult?.error || ''), stdout, stderr, code);
      if (errDetails.statusCode !== 500) {
        const bridgeErr = new Error(errDetails.message);
        bridgeErr.statusCode = errDetails.statusCode;
        throw bridgeErr;
      }

      const stderrSnippet = String(stderr || '').trim().slice(0, 240);
      if (attempt < retryDelaysMs.length) {
        const delayMs = retryDelaysMs[attempt];
        console.warn(
          `[Antigravity Bridge] Empty CLI response (code=${code}, status=${agyResult?.status || 'none'}, finished_reason=${agyResult?.finished_reason || 'none'}, stdoutLen=${String(stdout || '').length}${stderrSnippet ? `, stderr=${stderrSnippet}` : ''}); retrying in ${delayMs}ms (attempt ${attempt + 2}/${maxAttempts})...`
        );
        retryEmptyNudge = true;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(agyResult?.error || 'Antigravity CLI returned an empty response with no tool calls or content.');
    }

    return {
      id: `chatcmpl_agy_${agyResult?.conversation_id || Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: finalContent || (finalFormattedToolCalls.length > 0 ? null : 'Finished 3D mesh operations.'),
            ...(finalFormattedToolCalls.length > 0 ? { tool_calls: finalFormattedToolCalls } : {}),
          },
          finish_reason: finalFormattedToolCalls.length > 0 ? 'tool_calls' : 'stop',
        },
      ],
      usage: agyResult?.usage || {},
    };
  } finally {
    for (const f of tempImageFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

/**
 * Proxies HTTP requests to local Stable Diffusion WebUI / Draw Things running on 127.0.0.1:7860.
 * Eliminates browser CORS issues by injecting Access-Control-Allow-Origin headers.
 */
function proxyToLocalSdWebUI(req, res, targetPath) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const options = {
    hostname: '127.0.0.1',
    port: 7860,
    path: cleanPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: '127.0.0.1:7860',
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.statusCode = proxyRes.statusCode;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() !== 'access-control-allow-origin') {
        res.setHeader(key, value);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: {
          message: `Cannot connect to local Draw Things / SD WebUI on port 7860: ${err.message}`,
          code: 'SD_WEBUI_UNREACHABLE',
        },
      })
    );
  });

  if (req.body) {
    const bodyData = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'object'
      ? JSON.stringify(req.body)
      : String(req.body);
    proxyReq.end(bodyData);
  } else {
    req.pipe(proxyReq);
  }
}

/**
 * Express / webpack-dev-server middleware registration helper.
 */
function setupAntigravityBridgeRoutes(app) {
  // Transparent proxy for local Stable Diffusion WebUI & Draw Things API
  app.use('/sdapi', (req, res) => {
    proxyToLocalSdWebUI(req, res, `/sdapi${req.url || ''}`);
  });
  app.use('/api/sdapi', (req, res) => {
    proxyToLocalSdWebUI(req, res, `/sdapi${req.url || ''}`);
  });

  app.use('/api/antigravity/v1', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  });

  app.get('/api/antigravity/v1/models', async (_req, res) => {
    try {
      const models = await listAgyModels();
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          object: 'list',
          data: models.map((id) => ({ id, object: 'model', owned_by: 'antigravity' })),
        })
      );
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
    }
  });

  const handleSkillsRequest = (_req, res) => {
    try {
      const { getDiscoveredSkills } = require('./sync-skills');
      const skills = getDiscoveredSkills();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(skills));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
    }
  };

  app.get('/api/skills', handleSkillsRequest);
  app.get('/api/antigravity/v1/skills', handleSkillsRequest);

  app.post('/api/antigravity/v1/chat/completions', async (req, res) => {
    try {
      const parsed = await readRequestBody(req);
      const responsePayload = await runAgyChatCompletion(parsed);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(responsePayload));
    } catch (err) {
      const status = err.statusCode || 500;
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: {
            message: `Antigravity Bridge Error: ${err.message || String(err)}`,
            type: status === 429 ? 'insufficient_quota' : 'bridge_error',
            code: status,
          },
        })
      );
    }
  });
}

/**
 * Starts a standalone HTTP server for the Antigravity Bridge (default port 8787).
 */
function startStandaloneBridgeServer(port = Number(process.env.AGY_BRIDGE_PORT) || 8787) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '').split('?')[0];

    if (urlPath.startsWith('/sdapi/') || urlPath === '/sdapi') {
      proxyToLocalSdWebUI(req, res, req.url || '/sdapi');
      return;
    }
    if (urlPath.startsWith('/api/sdapi/') || urlPath === '/api/sdapi') {
      const rewrittenUrl = (req.url || '').replace(/^\/api\/sdapi/, '/sdapi');
      proxyToLocalSdWebUI(req, res, rewrittenUrl);
      return;
    }

    if (req.method === 'GET' && (urlPath === '/v1/models' || urlPath === '/api/antigravity/v1/models' || urlPath === '/models')) {
      try {
        const models = await listAgyModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: models.map((id) => ({ id, object: 'model', owned_by: 'antigravity' })),
          })
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
      }
      return;
    }

    if (
      req.method === 'GET' &&
      (urlPath === '/v1/skills' || urlPath === '/api/antigravity/v1/skills' || urlPath === '/api/skills' || urlPath === '/skills')
    ) {
      try {
        const { getDiscoveredSkills } = require('./sync-skills');
        const skills = getDiscoveredSkills();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(skills));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
      }
      return;
    }

    if (
      req.method === 'POST' &&
      (urlPath === '/v1/chat/completions' || urlPath === '/api/antigravity/v1/chat/completions' || urlPath === '/chat/completions')
    ) {
      try {
        const parsed = await readRequestBody(req);
        const result = await runAgyChatCompletion(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err.statusCode || 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message: `Antigravity Bridge Error: ${err.message || String(err)}`,
              type: status === 429 ? 'insufficient_quota' : 'bridge_error',
              code: status,
            },
          })
        );
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Not found: ${req.method} ${urlPath}` } }));
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Antigravity Bridge] OpenAI-compatible server listening on http://localhost:${port}/v1`);
    console.log(`[Antigravity Bridge] Using agy binary: ${resolveAgyBinary()}`);
  });

  return server;
}

if (require.main === module) {
  startStandaloneBridgeServer();
}

module.exports = {
  DEFAULT_AGY_MODELS,
  resolveAgyBinary,
  normalizeAgyModel,
  listAgyModels,
  buildAgyPromptFromOpenAI,
  parseStructuredAgentResponse,
  parseLastAgyJson,
  isTransientBridgeStartupError,
  extractBridgeErrorDetails,
  runAgyChatCompletion,
  setupAntigravityBridgeRoutes,
  startStandaloneBridgeServer,
};

