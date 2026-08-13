import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { join, dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync, exec, spawn, execFileSync } from 'child_process';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DATA_DIR = join(ROOT_DIR, 'data');
const SETTINGS_FILE = join(DATA_DIR, 'openclaude', 'settings.json');
const CHATS_DIR = join(DATA_DIR, 'chats');
const AGENTS_DIR = join(DATA_DIR, 'agents');
const TEAMS_DIR = join(DATA_DIR, 'teams');
const WORKFLOWS_DIR = join(DATA_DIR, 'workflows');
const HTML_FILE = join(__dirname, 'index.html');
const PORT = 3000;
let WORK_DIR = ROOT_DIR;
const interventions = {}; // { sessionId: { messages: [], resolved: false } }
const pendingPermissions = new Map(); // permissionId → { resolve, reject, timeout }
let activeSSE = null; // { sendSSE } — set by runAgent/runAgentChat for use by executeTool
const authorizedPaths = new Set(); // paths/directories user has authorized (with remember=true)

// Ensure data directories
[AGENTS_DIR, TEAMS_DIR, WORKFLOWS_DIR].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

function readConfig() {
    if (existsSync(SETTINGS_FILE)) {
        try {
            const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
            const cfg = { AI_PROVIDER: 'anthropic', AI_DISPLAY_MODEL: settings.model || 'auto' };
            if (settings.env) {
                // Anthropic/Claude Code CLI endpoint (Anthropic-compatible protocol)
                const anthroUrl = settings.env.ANTHROPIC_BASE_URL;
                if (anthroUrl) {
                    cfg.ANTHROPIC_BASE_URL = anthroUrl;
                    cfg.AI_PROVIDER = 'openai';
                }
                // Dashboard server endpoint (OpenAI-compatible protocol) — may differ from Anthropic URL
                // e.g. DeepSeek: /anthropic for Claude Code CLI, /v1 for dashboard
                cfg.OPENAI_BASE_URL = settings.env.OPENAI_BASE_URL || anthroUrl || '';
                cfg.OPENAI_API_KEY = settings.env.ANTHROPIC_AUTH_TOKEN || 'not-needed';
                cfg.OPENAI_MODEL = settings.env.OPENAI_MODEL || settings.env.ANTHROPIC_MODEL || settings.model || 'auto';
                if (settings.env.ANTHROPIC_API_KEY) cfg.ANTHROPIC_API_KEY = settings.env.ANTHROPIC_API_KEY;
                if (settings.env.ANTHROPIC_AUTH_TOKEN) cfg.ANTHROPIC_AUTH_TOKEN = settings.env.ANTHROPIC_AUTH_TOKEN;
                if (settings.env.ANTHROPIC_MODEL) cfg.ANTHROPIC_MODEL = settings.env.ANTHROPIC_MODEL;
            }
            return cfg;
        } catch (e) { console.error('Config error:', e.message); }
    }
    return {};
}

// Safe version for client: strips sensitive keys, keeps only display info
function readConfigSafe() {
    const cfg = readConfig();
    // Mask or remove actual API key values — keep only last 4 chars for display
    const mask = (k) => k ? '••••' + k.slice(-4) : '';
    cfg.OPENAI_API_KEY = mask(cfg.OPENAI_API_KEY);
    if (cfg.ANTHROPIC_API_KEY) cfg.ANTHROPIC_API_KEY = mask(cfg.ANTHROPIC_API_KEY);
    if (cfg.ANTHROPIC_AUTH_TOKEN) cfg.ANTHROPIC_AUTH_TOKEN = mask(cfg.ANTHROPIC_AUTH_TOKEN);
    if (cfg.GEMINI_API_KEY) cfg.GEMINI_API_KEY = mask(cfg.GEMINI_API_KEY);
    // Include terminal token for WebSocket auth
    cfg.WS_TERMINAL_TOKEN = WS_TERMINAL_TOKEN;
    return cfg;
}

function writeConfig(config) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const configDir = join(DATA_DIR, 'openclaude');
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    const settings = {
        model: config.AI_DISPLAY_MODEL || config.OPENAI_MODEL || 'auto',
        env: {}
    };
    // Anthropic-compatible URL (for Claude Code CLI) — e.g. https://api.deepseek.com/anthropic
    if (config.ANTHROPIC_BASE_URL) settings.env.ANTHROPIC_BASE_URL = config.ANTHROPIC_BASE_URL;
    else if (config.OPENAI_BASE_URL && !config.OPENAI_BASE_URL.includes('api.openai.com')) settings.env.ANTHROPIC_BASE_URL = config.OPENAI_BASE_URL.replace(/\/+$/, '');
    // OpenAI-compatible URL (for Dashboard server) — may differ from Anthropic URL
    // e.g. DeepSeek uses /v1 for OpenAI, /anthropic for Claude Code CLI
    if (config.OPENAI_BASE_URL) settings.env.OPENAI_BASE_URL = config.OPENAI_BASE_URL.replace(/\/+$/, '');
    // Auth token
    if (config.ANTHROPIC_AUTH_TOKEN) settings.env.ANTHROPIC_AUTH_TOKEN = config.ANTHROPIC_AUTH_TOKEN;
    else if (config.OPENAI_API_KEY) settings.env.ANTHROPIC_AUTH_TOKEN = config.OPENAI_API_KEY;
    if (config.ANTHROPIC_API_KEY) settings.env.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
    // Anthropic model for Claude Code CLI — e.g. deepseek-v4-pro
    if (config.ANTHROPIC_MODEL) settings.env.ANTHROPIC_MODEL = config.ANTHROPIC_MODEL;
    else if (config.OPENAI_MODEL) settings.env.ANTHROPIC_MODEL = config.OPENAI_MODEL;
    // OpenAI model for Dashboard server — e.g. deepseek-chat
    if (config.OPENAI_MODEL) settings.env.OPENAI_MODEL = config.OPENAI_MODEL;
    // Other providers
    if (config.GEMINI_API_KEY) settings.env.GEMINI_API_KEY = config.GEMINI_API_KEY;
    // OmniRoute gateway model discovery
    if ((config.ANTHROPIC_BASE_URL && config.ANTHROPIC_BASE_URL.includes('localhost:20128')) ||
        (config.OPENAI_BASE_URL && config.OPENAI_BASE_URL.includes('localhost:20128'))) {
        settings.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '1';
    }
    // Atomic write: write to temp file then rename
    const tmpFile = SETTINGS_FILE + '.tmp';
    writeFileSync(tmpFile, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    renameSync(tmpFile, SETTINGS_FILE);
}

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB limit for request bodies
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_SIZE) { req.destroy(); reject(new Error('Payload too large (>5MB)')); return; }
            data += chunk;
        });
        req.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
    });
}

async function fetchExternal(url, headers = {}, body = null, method = 'GET') {
    const mod = await import(url.startsWith('https') ? 'https' : 'http');
    return new Promise((resolve, reject) => {
        const opts = { method, headers };
        const req = mod.request(url, opts, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

async function streamExternal(url, headers, body, onChunk, onEnd, signal) {
    const mod = await import(url.startsWith('https') ? 'https' : 'http');
    return new Promise((resolve, reject) => {
        const req = mod.request(url, { method: 'POST', headers }, res => {
            res.on('data', chunk => onChunk(chunk.toString()));
            res.on('end', () => { onEnd(); resolve(); });
            res.on('error', reject);
        });
        req.on('error', (err) => { if (signal && signal.aborted) resolve(); else reject(err); });
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (signal) {
          if (signal.aborted) { req.destroy(); resolve(); return; }
          signal.addEventListener('abort', () => { req.destroy(); resolve(); });
        }
        req.write(body);
        req.end();
    });
}

function sendJSON(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
}

// Chat History
function ensureChatsDir() { if (!existsSync(CHATS_DIR)) mkdirSync(CHATS_DIR, { recursive: true }); }

function listChats() {
    ensureChatsDir();
    return readdirSync(CHATS_DIR).filter(f => f.endsWith('.json')).map(f => {
        try {
            const data = JSON.parse(readFileSync(join(CHATS_DIR, f), 'utf-8'));
            return { id: f.replace('.json', ''), title: data.title || 'Untitled', created: data.created, updated: data.updated, messageCount: (data.messages || []).length, type: data.type || 'chat' };
        } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

function loadChat(id) {
    const file = join(CHATS_DIR, `${id}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8'));
}

function saveChat(id, data) {
    ensureChatsDir();
    writeFileSync(join(CHATS_DIR, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

function newChatId() { return `chat_${Date.now()}`; }

// ─── Agent Management ─────────────────────────────────────────
const BUILTIN_AGENTS = {
  'developer': { name: 'Developer', icon: '💻', role: 'Sviluppatore', goal: 'Scrivere codice, risolvere bug, implementare feature', model: 'auto/best-coding', backstory: 'Sviluppatore senior con 15 anni di esperienza in Node.js, React e TypeScript.', tools: ['read_file', 'write_file', 'execute_command', 'search_files', 'list_directory'] },
  'project-manager': { name: 'Project Manager', icon: '📋', role: 'Project Manager', goal: 'Pianificare task, scomporre obiettivi e coordinare il lavoro', model: 'auto/best-reasoning', backstory: 'PM esperto che scompone progetti complessi in task gestibili.', tools: ['read_file', 'search_files', 'list_directory'] },
  'code-reviewer': { name: 'Code Reviewer', icon: '🔍', role: 'Revisore di Codice', goal: 'Trovare bug, problemi di sicurezza e opportunità di miglioramento', model: 'auto/best-reasoning', backstory: 'Revisore severo ma costruttivo con occhio per dettaglio e sicurezza.', tools: ['read_file', 'search_files', 'list_directory'] },
  'tester': { name: 'Tester QA', icon: '🧪', role: 'QA Tester', goal: 'Scrivere ed eseguire test, trovare qualsiasi cosa non funzioni', model: 'auto/best-coding', backstory: 'Tester metodico e pignolo che trova ogni bug nascosto.', tools: ['read_file', 'write_file', 'execute_command', 'search_files', 'list_directory'] },
  'architect': { name: 'Architect', icon: '🏗️', role: 'Software Architect', goal: 'Progettare architetture scalabili e scegliere le tecnologie giuste', model: 'auto/best-reasoning', backstory: 'Architetto software con 20 anni di esperienza nella progettazione di sistemi complessi.', tools: ['read_file', 'search_files', 'list_directory'] },
  'security': { name: 'Security Auditor', icon: '🔒', role: 'Security Auditor', goal: 'Trovare vulnerabilità e proteggere il codice da attacchi', model: 'auto/best-reasoning', backstory: 'Esperto di penetration testing e sicurezza applicativa.', tools: ['read_file', 'search_files', 'list_directory', 'execute_command'] },
  'documentation': { name: 'Documentation', icon: '📚', role: 'Technical Writer', goal: 'Scrivere documentazione chiara per sviluppatori e utenti', model: 'auto/best-chat', backstory: 'Technical writer che rende comprensibile anche il codice più complesso.', tools: ['read_file', 'write_file', 'search_files', 'list_directory'] },
  'support': { name: 'Support', icon: '🎧', role: 'Support Agent', goal: 'Aiutare utenti di qualsiasi livello a risolvere problemi', model: 'auto/best-chat', backstory: 'Agente di supporto paziente che spiega in modo semplice.', tools: ['read_file', 'search_files', 'execute_command', 'list_directory'] }
};

const TOOLS = {
  'read_file': { name: 'Leggi File', icon: '📖', description: 'Legge il contenuto di un file' },
  'write_file': { name: 'Scrivi File', icon: '📄', description: 'Crea o modifica un file' },
  'execute_command': { name: 'Esegui Comando', icon: '⚡', description: 'Esegue un comando shell' },
  'search_files': { name: 'Cerca nei File', icon: '🔍', description: 'Cerca testo nei file' },
  'list_directory': { name: 'Elenca Directory', icon: '📁', description: 'Elenca i contenuti di una cartella' },
  'web_fetch': { name: 'Web Fetch', icon: '🌐', description: 'Recupera contenuto da URL' },
  'web_search': { name: 'Web Search', icon: '🔎', description: 'Cerca sul web' }
};

function loadCustomAgents() {
  const agents = { ...BUILTIN_AGENTS };
  if (existsSync(AGENTS_DIR)) {
    readdirSync(AGENTS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        const data = JSON.parse(readFileSync(join(AGENTS_DIR, f), 'utf-8'));
        const id = f.replace('.json', '');
        agents[id] = { ...data, icon: data.icon || '🤖' };
      } catch {}
    });
  }
  return agents;
}

function saveCustomAgent(id, data) {
  if (!existsSync(AGENTS_DIR)) mkdirSync(AGENTS_DIR, { recursive: true });
  writeFileSync(join(AGENTS_DIR, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

function deleteCustomAgent(id) {
  const f = join(AGENTS_DIR, `${id}.json`);
  if (existsSync(f)) unlinkSync(f);
}

function loadTeams() {
  const teams = [];
  if (existsSync(TEAMS_DIR)) {
    readdirSync(TEAMS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        teams.push(JSON.parse(readFileSync(join(TEAMS_DIR, f), 'utf-8')));
      } catch {}
    });
  }
  return teams;
}

// ─── Agent Execution Engine ───────────────────────────────────
async function runAgent(agentId, task, messages, res, cfg) {
  const agents = loadCustomAgents();
  const agent = agents[agentId];
  if (!agent) { sendJSON(res, 404, { error: 'Agente non trovato' }); return ''; }

  const provider = cfg.AI_PROVIDER || 'openai';
  const model = cfg.OPENAI_MODEL || agent.model || 'auto/best-coding';
  const baseUrl = (cfg.OPENAI_BASE_URL || 'http://localhost:20128/v1').replace(/\/+$/, '');
  const apiKey = cfg.OPENAI_API_KEY || cfg.ANTHROPIC_AUTH_TOKEN || 'not-needed';

  // System prompt from agent definition
  const toolList = (agent.tools || []).join(', ');
  const toolInstructions = (agent.tools || []).length > 0 ? `\n\n**IMPORTANTE — Come usare i tool (formato MULTI-LINEA):**
Per write_file, DEVI usare questo formato ESATTO (NON usare JSON!):
\`\`\`
[TOOL:write_file]
path: cartella/nome-file.html
<<<FILE>>>
QUI METTI IL CONTENUTO COMPLETO DEL FILE
(il contenuto NON va escape-ato, scrivilo normalmente — puoi usare liberamente \`\`\` codeblock nel contenuto!)
<<<END>>>
\`\`\`
Il path DEVE includere la cartella del progetto (es. projects/nome-progetto/index.html).
Se l'utente ti chiede ESPLICITAMENTE di accedere a un file o cartella FUORI dalla directory di lavoro,
usa il percorso assoluto completo (es. C:\\Users\\nome\\Documenti\\file.txt). Il sistema chiederà
automaticamente il permesso all'utente. NON rifiutare l'accesso — lascia che sia il sistema a gestire i permessi.
Per read_file: [TOOL:read_file] path: percorso/file.txt (da solo su una riga)
Per list_directory: [TOOL:list_directory] path: cartella
Dopo il tool, riceverai il risultato e potrai continuare.` : '';

  const systemPrompt = agent.backstory
    ? `## ${agent.name} — ${agent.role}\n\n**Goal:** ${agent.goal}\n\n**Background:** ${agent.backstory}\n\n**Available Tools:** ${toolList}${toolInstructions}\n\nPer ogni task:\n1. Analizza la richiesta\n2. Usa SUBITO i tool disponibili per creare/scrivere i file necessari\n3. NON limitarti a descrivere il codice — DEVI creare i file con write_file\n4. Alla fine, spiega in modo semplice cosa hai fatto`
    : `Sei un ${agent.name}. ${agent.goal}. Usa i tool disponibili per completare il task.${toolInstructions}`;

  // Set up SSE FIRST so permission dialogs can work during path pre-fetch
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
  });
  const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  activeSSE = { sendSSE };

  // Detect external paths in the user's task and pre-execute the tool
  let enhancedTask = task;
  let preFetchedContext = '';
  const pathPattern = /([A-Za-z]:[\\\/](?!\/)[^\s,;\"'()`]+|\\\\[^\s,;\"'()`\\]+(?:\\[^\s,;\"'()`\\]+)*|\/[A-Za-z]\/[^\s,;\"'()`]+)/g;
  const foundPaths = task.match(pathPattern);
  if (foundPaths && foundPaths.length > 0) {
    console.log(`[PathDetect] Found external paths in task: ${foundPaths.join(', ')}`);
    // Pre-execute: try to list each path found
    for (const extPath of foundPaths) {
      // Clean trailing punctuation
      // Strip quotes, backticks, trailing punctuation — also handle markdown artifacts
      const cleanPath = extPath.replace(/^[\"'`]+|[\"'`,;.!?]+$/g, '').replace(/`{1,3}$/, '');
      const absPath = resolve(cleanPath); // normalize immediately — handles C:\ → C:\ correctly
      console.log(`[Prefetch] cleanPath="${cleanPath}" absPath="${absPath}"`);
      try {
        const listResult = await executeToolDirect('list_directory', { path: absPath }, absPath);
        console.log(`[Prefetch] Result (first 150 chars): "${(listResult||'').slice(0, 150)}"`);
        if (listResult && !listResult.startsWith('Directory non trovata') && !listResult.startsWith('Errore') && !listResult.startsWith('Accesso negato')) {
          preFetchedContext += `\n📁 Contenuto di ${cleanPath}:\n${listResult}\n`;
          const files = listResult.split('\n').filter(l => l.match(/📄.*\.(js|ts|py|html|css|json|md|txt|jsx|tsx)$/));
          for (const fLine of files.slice(0, 5)) {
            const fname = fLine.replace(/^📄\s*/, '').trim();
            const filePath = join(absPath, fname);
            try {
              const fileContent = await executeToolDirect('read_file', { path: filePath }, filePath);
              if (fileContent && !fileContent.startsWith('File non trovato') && !fileContent.startsWith('Errore') && !fileContent.startsWith('Accesso negato')) {
                preFetchedContext += `\n--- ${fname} ---\n${fileContent.slice(0, 3000)}\n`;
              }
            } catch {}
          }
        }
      } catch {}
    }
    if (preFetchedContext) {
      enhancedTask = `HO GIÀ LETTO I FILE PER TE. Ecco il contenuto della cartella richiesta:\n\n${preFetchedContext}\n\n---\n\nTask originale: ${task}\n\nORA PUOI ANALIZZARE questi file. Usa i tool se ti servono ulteriori informazioni.`;
    }
  }

  // Build messages with system prompt
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...(messages || []),
    { role: 'user', content: enhancedTask }
  ];

  // Simple ReAct loop — max 10 iterations
  let fullText = '';
  let iterations = 0;
  const maxIterations = 15;
  const conversation = [...allMessages];

  while (iterations < maxIterations) {
    iterations++;
    sendSSE({ type: 'agent_thinking', iteration: iterations, agent: agent.name });

    try {
      const body = JSON.stringify({ model, messages: conversation, stream: true });
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };

      let chunkText = '';
      await streamExternal(`${baseUrl}/chat/completions`, headers, body,
        (chunk) => {
          chunk.split('\n').forEach(line => {
            if (!line.startsWith('data: ')) return;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') return;
            try {
              const parsed = JSON.parse(raw);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                chunkText += delta.content;
                sendSSE({ type: 'agent_reasoning', iteration, content: delta.content });
              }
            } catch {}
          });
        },
        () => {} // onEnd — handled below
      );

        if (chunkText.trim()) {
          let toolName, toolArgs = {};

          // 1. JSON format: [TOOL:name] {"path":"..."} or [TOOL:name] {"command":"..."}
          const jsonMatch = chunkText.match(/\[TOOL:(\w+)\]\s*(\{[\s\S]*?\})/);
          if (jsonMatch) {
            toolName = jsonMatch[1];
            try { toolArgs = JSON.parse(jsonMatch[2]); } catch(e) { toolName = null; }
          }

          // 2. Multi-line content format (write_file): [TOOL:write_file]\npath: xyz\n<<<FILE>>>\ncontent\n<<<END>>>
          if (!toolName) {
            const mlMatch = chunkText.match(/\[TOOL:(\w+)\]\s*\n?\s*path:\s*([^\r\n]+)[\s\S]*?<<<FILE>>>\s*\n([\s\S]*?)<<<END>>>/);
            if (mlMatch) {
              toolName = mlMatch[1];
              toolArgs = { path: mlMatch[2].trim().replace(/^[\"']|[\"']$/g, ''), content: mlMatch[3].replace(/\n?$/, '') };
            }
          }

          // 3. Single-line format: [TOOL:name] path: xyz or [TOOL:name]\npath: xyz
          if (!toolName) {
            const slMatch = chunkText.match(/\[TOOL:(\w+)\]\s*\n?\s*(path|pattern|command):\s*([^\r\n]+)/i);
            if (slMatch) {
              toolName = slMatch[1];
              const key = slMatch[2].toLowerCase();
              const val = slMatch[3].trim().replace(/^[\"']|[\"']$/g, '');
              toolArgs = { [key]: val };
              if (key === 'path') toolArgs.path = val;
            }
          }

          if (toolName) {
          conversation.push({ role: 'assistant', content: chunkText });
          sendSSE({ type: 'tool_call', id: `call_${iterations}`, name: toolName, args: JSON.stringify({ path: toolArgs.path || '???' }).slice(0, 200) });

          // Execute tool (async — may wait for user permission)
          let result;
          try {
            result = await executeTool(toolName, toolArgs);
            sendSSE({ type: 'tool_result', id: `call_${iterations}`, result: { success: true, output: result } });
          } catch(e) {
            sendSSE({ type: 'tool_result', id: `call_${iterations}`, result: { success: false, error: e.message } });
            result = `Error: ${e.message}`;
          }

          conversation.push({ role: 'user', content: `Tool ${toolName} result:\n${result}\n\nContinue the task. If done, provide the final answer.` });
        } else {
          // No tool call — agent is done
          fullText = chunkText;
          sendSSE({ type: 'agent_text', content: fullText });
          break;
        }
      } else {
        break;
      }
    } catch (err) {
      sendSSE({ type: 'agent_error', error: err.message });
      break;
    }
  }

  if (iterations >= maxIterations && !fullText) {
    fullText = '⚠️ L\'agente ha raggiunto il limite di iterazioni. Prova a riformulare il task in modo più specifico.';
    sendSSE({ type: 'agent_text', content: fullText });
  }

  sendSSE({ type: 'done', fullText });
  res.end();
  activeSSE = null;
  return fullText;
}

// ─── Orchestrator Engine ──────────────────────────────────────
async function runTeam(teamName, task, messages, res, cfg) {
  const teams = loadTeams();
  const team = teams.find(t => t.name === teamName || t.id === teamName);
  const agents = loadCustomAgents();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
  });
  const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  if (!team) {
    // If team not found, create an ad-hoc team with PM + Dev + Reviewer
    sendSSE({ type: 'orchestrator', action: 'auto_team', message: 'Creazione team automatico: PM → Dev → Reviewer' });

    const teamAgents = ['project-manager', 'developer', 'code-reviewer'];
    const provider = cfg.AI_PROVIDER || 'openai';
    const model = cfg.OPENAI_MODEL || 'auto/best-coding';
    const baseUrl = (cfg.OPENAI_BASE_URL || 'http://localhost:20128/v1').replace(/\/+$/, '');
    const apiKey = cfg.OPENAI_API_KEY || cfg.ANTHROPIC_AUTH_TOKEN || 'not-needed';

    // Phase 1: PM decomposes the task
    sendSSE({ type: 'orchestrator', action: 'phase', phase: '📋 Project Manager sta analizzando il task...', agent: 'project-manager' });

    const pmAgent = agents['project-manager'] || BUILTIN_AGENTS['project-manager'];
    const pmPrompt = `Sei un Project Manager. Scomponi questo task in 3-5 sotto-task ordinati: "${task}". Rispondi SOLO con una lista numerata, una riga per task.`;

    let subtasks = [];
    try {
      const pmBody = JSON.stringify({ model, messages: [{ role: 'user', content: pmPrompt }], stream: false });
      const pmRes = await fetchExternal(`${baseUrl}/chat/completions`, { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, pmBody, 'POST');
      const pmData = JSON.parse(pmRes.data);
      const pmText = pmData.choices?.[0]?.message?.content || '';
      subtasks = pmText.split('\n').filter(line => line.match(/^\d+[\.\)]/)).map(l => l.replace(/^\d+[\.\)]\s*/, ''));
      sendSSE({ type: 'orchestrator', action: 'subtasks', subtasks });
    } catch (e) {
      subtasks = [task]; // Fallback: single task
    }

    // Phase 2: Developer executes each subtask
    let results = [];
    for (let i = 0; i < subtasks.length; i++) {
      const st = subtasks[i];
      sendSSE({ type: 'orchestrator', action: 'phase', phase: `💻 Developer esegue task ${i+1}/${subtasks.length}: ${st}`, agent: 'developer' });

      const devAgent = agents['developer'] || BUILTIN_AGENTS['developer'];
      const devPrompt = `Sei uno sviluppatore senior. Contesto: "${task}". Esegui questo sotto-task: "${st}". Spiega cosa faresti e produci il codice necessario.`;

      try {
        const devBody = JSON.stringify({ model, messages: [{ role: 'user', content: devPrompt }], stream: false });
        const devRes = await fetchExternal(`${baseUrl}/chat/completions`, { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, devBody, 'POST');
        const devData = JSON.parse(devRes.data);
        const devText = devData.choices?.[0]?.message?.content || '';
        results.push({ task: st, result: devText, agent: 'developer' });
        sendSSE({ type: 'orchestrator', action: 'task_done', task: st, summary: devText.slice(0, 200) });
      } catch (e) {
        results.push({ task: st, result: `Error: ${e.message}`, agent: 'developer' });
        sendSSE({ type: 'orchestrator', action: 'task_error', task: st, error: e.message });
      }
    }

    // Phase 3: Reviewer checks
    sendSSE({ type: 'orchestrator', action: 'phase', phase: '🔍 Reviewer controlla il risultato...', agent: 'code-reviewer' });
    const reviewAgent = agents['code-reviewer'] || BUILTIN_AGENTS['code-reviewer'];
    const summary = results.map((r, i) => `${i+1}. ${r.task}\n${r.result.slice(0, 500)}`).join('\n\n');
    let reviewText = '';
    try {
      const reviewPrompt = `Sei un code reviewer. Controlla questi risultati e dai un feedback costruttivo:\n${summary}`;
      const revBody = JSON.stringify({ model, messages: [{ role: 'user', content: reviewPrompt }], stream: false });
      const revRes = await fetchExternal(`${baseUrl}/chat/completions`, { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, revBody, 'POST');
      const revData = JSON.parse(revRes.data);
      reviewText = revData.choices?.[0]?.message?.content || 'Revisione completata.';
    } catch (e) {
      reviewText = 'Revisione non disponibile.';
    }
    sendSSE({ type: 'orchestrator', action: 'review', content: reviewText });

    // Final summary
    const finalText = `## ✅ Task Completato dal Team\n\n**Obiettivo:** ${task}\n\n### 📋 Piano (PM)\n${subtasks.map((s,i) => `${i+1}. ${s}`).join('\n')}\n\n### 🔍 Review Finale\n${reviewText}\n\n---\n*Team: PM → Developer → Reviewer*`;
    sendSSE({ type: 'agent_text', content: finalText });
    sendSSE({ type: 'done', fullText: finalText });
    res.end();
    return finalText;
  }

  // Pre-defined team logic (similar but with team's agents)
  sendSSE({ type: 'orchestrator', action: 'team_start', team: team.name, agents: team.agents });
  // ... (simplified — uses same pattern as above)
  const finalText = `Team "${team.name}" ha completato il task: ${task}`;
  sendSSE({ type: 'agent_text', content: finalText });
  sendSSE({ type: 'done', fullText: finalText });
  res.end();
  return finalText;
}

// ─── Multi-Agent Chat Engine (WhatsApp-style conversation) ─────────
async function runAgentChat(task, res, cfg, selectedAgents) {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Direct-interrupt state: shared between /intervene endpoint and askAgent
  const interruptState = { controller: null, pendingIntervention: null };
  // Still support session-scoped intervention queue as fallback
  interventions[sessionId] = { messages: [], resolved: false, interruptState };
  const allAgents = loadCustomAgents();
  // Use selected agents, or default to PM + Dev + Reviewer
  const agentIds = (selectedAgents && selectedAgents.length > 0) ? selectedAgents : ['project-manager', 'developer', 'code-reviewer'];
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
  });
  const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  activeSSE = { sendSSE };

  // Send sessionId so client can post interventions
  sendSSE({ type: 'session', sessionId });

  // Helper: check the fallback queue (only used if direct abort isn't possible)
  async function drainInterventionQueue(contextLabel) {
    const session = interventions[sessionId];
    if (!session || !session.messages.length) return null;
    const msgs = session.messages.splice(0);
    if (!msgs.length) return null;
    const combined = msgs.map(m => `[INTERVENTO UTENTE]: ${m.message}`).join('\n');
    sendSSE({ type: 'intervention_applied', messages: msgs.map(m => m.message), phase: contextLabel });
    return combined;
  }

  const provider = cfg.AI_PROVIDER || 'openai';
  const baseUrl = (cfg.OPENAI_BASE_URL || 'http://localhost:20128/v1').replace(/\/+$/, '');
  const apiKey = cfg.OPENAI_API_KEY || cfg.ANTHROPIC_AUTH_TOKEN || 'not-needed';
  const model = cfg.OPENAI_MODEL || cfg.AI_DISPLAY_MODEL || 'auto';

  async function askAgent(agentId, agentDef, prompt, roleLabel, intrState) {
    const hasWriteTool = (agentDef.tools || []).includes('write_file');
    const hasReadTool = (agentDef.tools || []).includes('read_file');
    const hasListTool = (agentDef.tools || []).includes('list_directory');

    const toolSection = (hasWriteTool || hasReadTool || hasListTool) ? `
TOOL DISPONIBILI (usa QUESTO formato ESATTO per creare/modificare file):
- Per creare file NUOVI: scrivi ESATTAMENTE:
[TOOL:write_file]
path: index.html
<<<FILE>>>
CONTENUTO COMPLETO DEL FILE (puoi usare \`\`\` codeblock qui dentro senza problemi!)
<<<END>>>
- Per MODIFICARE file esistenti: PRIMA leggi il file con [TOOL:read_file], POI riscrivilo COMPLETO con [TOOL:write_file]
- Per leggere file: [TOOL:read_file]
path: index.html
- Per esplorare cartelle: [TOOL:list_directory]
path: .

IMPORTANTE: Per i file del progetto, usa SOLO il nome del file (es. "index.html", "style.css") o "./" per la directory corrente.
Se l'utente ti chiede ESPLICITAMENTE di accedere a un file o cartella FUORI dal progetto (es. "analizza C:\\Progetti\\Chat-Agent"), USA il percorso assoluto completo (es. C:\\Progetti\\Chat-Agent\\file.js). Il sistema chiederà automaticamente il permesso all'utente e tu potrai accedere ai file. NON rifiutare mai l'accesso a path esterni — il sistema di permessi lo gestisce.
NON fermarti a esplorare. Se il task richiede di CREARE o MODIFICARE file, DEVI usare [TOOL:write_file].
Il solo [TOOL:list_directory] o [TOOL:read_file] NON basta — devi PRODURRE output concreto.` : '';

    const sysPrompt = `Sei ${agentDef.name}, ${agentDef.role}.
Obiettivo: ${agentDef.goal}
${agentDef.backstory ? 'Background: ' + agentDef.backstory : ''}
${toolSection}

REGOLE DI COMUNICAZIONE (STILE WHATSAPP):
1. Scrivi UN solo messaggio breve e colloquiale (max 2-3 frasi), in prima persona, come in una chat tra colleghi.
2. NON includere codice, elenchi, o dettagli tecnici nel messaggio principale.
3. Dopo il messaggio, scrivi "---" su una riga separata.
4. DOPO il "---", metti TUTTI i dettagli tecnici: codice, analisi, ragionamenti, checklist.${hasWriteTool ? '\n5. Se il task richiede di creare file, DOPO il "---" usa [TOOL:write_file] per crearli DAVVERO.' : ''}

IMPORTANTE: Il messaggio prima di "---" deve essere leggibile come chat. I dettagli dopo "---" sono espandibili.

REGOLE PER INTERVENTI DEL CAPO TEAM:
Se il messaggio utente contiene "⚠️" e "INTERRUZIONE", queste SOVRASCRIVONO qualsiasi sotto-task.
DEVI eseguire le nuove istruzioni immediatamente. NON limitarti a commentarle.
Le istruzioni del capo team hanno PRIORITÀ ASSOLUTA sul piano originale.`;

    // Detect external paths in prompt and pre-execute the tool
    let enhancedPrompt = prompt;
    let preFetchedContext = '';
    const pathPattern = /([A-Za-z]:[\\\/](?!\/)[^\s,;\"'()`]+|\\\\[^\s,;\"'()`\\]+(?:\\[^\s,;\"'()`\\]+)*|\/[A-Za-z]\/[^\s,;\"'()`]+)/g;
    const foundPaths = prompt.match(pathPattern);
    if (foundPaths && foundPaths.length > 0) {
      console.log(`[PathDetect:askAgent] Found external paths: ${foundPaths.join(', ')}`);
      for (const extPath of foundPaths) {
        // Strip quotes, backticks, trailing punctuation
        const cleanPath = extPath.replace(/^[\"'`]+|[\"'`,;.!?]+$/g, '').replace(/`{1,3}$/, '');
        const absPath = resolve(cleanPath);
        try {
          const listResult = await executeToolDirect('list_directory', { path: absPath }, absPath);
          if (listResult && !listResult.startsWith('Directory non trovata') && !listResult.startsWith('Errore') && !listResult.startsWith('Accesso negato')) {
            preFetchedContext += `\n📁 Contenuto di ${cleanPath}:\n${listResult}\n`;
            const files = listResult.split('\n').filter(l => l.match(/📄.*\.(js|ts|py|html|css|json|md|txt|jsx|tsx)$/));
            for (const fLine of files.slice(0, 5)) {
              const fname = fLine.replace(/^📄\s*/, '').trim();
              const filePath = join(absPath, fname);
              try {
                const fileContent = await executeToolDirect('read_file', { path: filePath }, filePath);
                if (fileContent && !fileContent.startsWith('File non trovato') && !fileContent.startsWith('Errore') && !fileContent.startsWith('Accesso negato')) {
                  preFetchedContext += `\n--- ${fname} ---\n${fileContent.slice(0, 3000)}\n`;
                }
              } catch {}
            }
          }
        } catch {}
      }
      if (preFetchedContext) {
        enhancedPrompt = `HO GIÀ LETTO I FILE PER TE. Ecco il contenuto della cartella richiesta:\n\n${preFetchedContext}\n\n---\n\nTask originale: ${prompt}\n\nORA PUOI ANALIZZARE questi file. Rispondi basandoti ESCLUSIVAMENTE sul contenuto mostrato sopra.`;
      } else {
        enhancedPrompt = `L'utente ha chiesto di analizzare: ${foundPaths.join(', ')} ma il percorso non è stato trovato o l'accesso è stato negato dall'utente. Informa l'utente in modo cortese.`;
      }
    }

    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: enhancedPrompt }
    ];

    // Set up interrupt controller — shared with /intervene endpoint
    const controller = new AbortController();
    if (intrState) intrState.controller = controller;

    sendSSE({ type: 'agent_start', agent: { id: agentId, name: agentDef.name, icon: agentDef.icon || '🤖', role: agentDef.role || roleLabel } });

    try {
      const body = JSON.stringify({ model, messages, stream: true });
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      let fullText = '';

      await streamExternal(`${baseUrl}/chat/completions`, headers, body,
        (chunk) => {
          chunk.split('\n').forEach(line => {
            if (!line.startsWith('data: ')) return;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') return;
            try {
              const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
              if (delta) { fullText += delta; sendSSE({ type: 'agent_delta', agentId, content: delta }); }
            } catch {}
          });
        },
        () => {},
        controller.signal
      );

      // If aborted by intervention, return partial — loop will re-run
      if (controller.signal.aborted) {
        if (intrState) intrState.controller = null;
        return { interrupted: true, partialText: fullText, agentId };
      }

      // Split short message from details
      const sepIdx = fullText.indexOf('\n---\n') !== -1 ? fullText.indexOf('\n---\n') :
                     fullText.indexOf('\n---') !== -1 ? fullText.indexOf('\n---') :
                     fullText.indexOf('---\n') !== -1 ? fullText.indexOf('---\n') : -1;
      let shortMsg = fullText.trim();
      let details = '';
      if (sepIdx !== -1) {
        shortMsg = fullText.slice(0, sepIdx).trim();
        details = fullText.slice(sepIdx).replace(/^---\n?/, '').trim();
      }
      // If the "short" message is very long, it means the model didn't use the separator
      if (shortMsg.length > 500) {
        details = fullText.trim();
        shortMsg = shortMsg.slice(0, 200) + '...';
      }

      // ── Execute tool calls found in the response ──
      const agentTools = agentDef.tools || [];
      if (agentTools.length > 0) {
        // 1. JSON tool calls
        const jsonPattern = /\[TOOL:(\w+)\]\s*(\{[\s\S]*?\})/g;
        let jsonMatch;
        while ((jsonMatch = jsonPattern.exec(details)) !== null) {
          const toolName = jsonMatch[1];
          if (agentTools.includes(toolName)) {
            try {
              const toolArgs = JSON.parse(jsonMatch[2]);
              sendSSE({ type: 'tool_call', agentId, toolName, args: toolArgs });
              const result = await executeTool(toolName, toolArgs);
              sendSSE({ type: 'tool_result', agentId, toolName, result });
              if (toolName === 'write_file' && toolArgs.path) createdFiles.push(toolArgs.path);
            } catch {}
          }
        }
        // 2. Multi-line tool calls with <<<FILE>>> delimiter
        const toolPattern = /\[TOOL:(\w+)\]\s*\n?\s*path:\s*([^\r\n]+)[\s\S]*?<<<FILE>>>\s*\n([\s\S]*?)<<<END>>>/g;
        let toolMatch;
        while ((toolMatch = toolPattern.exec(details)) !== null) {
          const toolName = toolMatch[1];
          const toolPath = toolMatch[2].trim().replace(/^[\"']|[\"']$/g, '');
          const toolContent = toolMatch[3];
          if (agentTools.includes(toolName)) {
            sendSSE({ type: 'tool_call', agentId, toolName, args: { path: toolPath } });
            const result = await executeTool(toolName, { path: toolPath, content: toolContent });
            sendSSE({ type: 'tool_result', agentId, toolName, result });
            if (toolName === 'write_file') createdFiles.push(toolPath);
          }
        }
        // 3. Single-line tool calls (read_file, list_directory, search_files, execute_command)
        const slPattern = /\[TOOL:(\w+)\]\s*\n?\s*(path|pattern|command):\s*([^\r\n]+)/gi;
        let slMatch;
        while ((slMatch = slPattern.exec(details)) !== null) {
          const toolName = slMatch[1];
          if (toolName === 'write_file') continue;
          const key = slMatch[2].toLowerCase();
          const val = slMatch[3].trim().replace(/^[\"']|[\"']$/g, '');
          if (agentTools.includes(toolName)) {
            const toolArgs = { [key]: val };
            if (key === 'path') toolArgs.path = val;
            sendSSE({ type: 'tool_call', agentId, toolName, args: toolArgs });
            const result = await executeTool(toolName, toolArgs);
            sendSSE({ type: 'tool_result', agentId, toolName, result });
          }
        }
      }

      sendSSE({ type: 'agent_end', agentId, fullText, shortMsg, details });
      return fullText.trim();
    } catch (err) {
      // If aborted by intervention, don't show error — return partial
      if (controller.signal.aborted) {
        if (intrState) intrState.controller = null;
        return { interrupted: true, partialText: fullText || '', agentId };
      }
      sendSSE({ type: 'agent_error', agentId, error: err.message });
      sendSSE({ type: 'agent_end', agentId, fullText: '' });
      return `[Errore: ${err.message}]`;
    }
  }

  // Determine which roles are selected
  const hasPM = agentIds.includes('project-manager');
  const hasDev = agentIds.includes('developer');
  const hasReviewer = agentIds.includes('code-reviewer');
  const hasTester = agentIds.includes('tester');
  const hasArchitect = agentIds.includes('architect');
  const hasSecurity = agentIds.includes('security');

  // Other selected agents that should participate
  const extraAgents = agentIds.filter(id =>
    !['project-manager', 'developer', 'code-reviewer'].includes(id)
  );

  const createdFiles = []; // Track files created by agents during this chat

  let subtasks = [task];

  // ── Phase 1: PM decomposes (if selected) ──
  if (hasPM) {
    const pmAgent = allAgents['project-manager'] || BUILTIN_AGENTS['project-manager'];
    sendSSE({ type: 'phase', label: '📋 Pianificazione', detail: 'Project Manager analizza il task e crea un piano...' });
    const pmPrompt = `Task da scomporre: "${task}"\n\nScomponi questo task in 2-4 sotto-task concreti e ordinati. Per ogni sotto-task, scrivi UNA riga nel formato: [N] Descrizione breve. Scrivi in italiano.`;
    let pmText = await askAgent('project-manager', pmAgent, pmPrompt, 'PM', interruptState);
    // Normalize: if PM was interrupted, extract partial text
    if (pmText && typeof pmText === 'object') {
      pmText = pmText.partialText || '';
      if (interruptState.pendingIntervention) {
        // If PM was aborted, re-run PM with the intervention
        const interventionMsg = interruptState.pendingIntervention;
        sendSSE({ type: 'intervention_applied', messages: [interventionMsg], phase: 'Pianificazione', direct: true });
        interruptState.pendingIntervention = null;
        interruptState.controller = null;
        const rePmPrompt = pmPrompt + `\n\n⚠️ INTERRUZIONE DAL CAPO TEAM: "${interventionMsg}"\nRipianifica tenendo conto di questa istruzione.`;
        pmText = await askAgent('project-manager', pmAgent, rePmPrompt, 'PM', interruptState);
        if (pmText && typeof pmText === 'object') pmText = pmText.partialText || '';
      }
    }

    const parsed = pmText.split('\n')
      .filter(line => line.match(/^\d+[\.\)\]\s]/) || line.match(/^\[\d+\]/))
      .map(l => l.replace(/^[\[\(]?\d+[\]\)\.\s]+/, '').trim())
      .filter(s => s.length > 3);
    if (parsed.length > 0) subtasks = parsed;
  }

  // Check for user intervention after planning (drain fallback queue)
  let interventionContext = await drainInterventionQueue('Pianificazione') || '';

  // ── Phase 2: Execution agents ──
  const execAgents = [];
  if (hasDev) execAgents.push({ id: 'developer', label: '💻 Sviluppo', role: 'Developer' });
  if (hasArchitect) execAgents.push({ id: 'architect', label: '🏗️ Architettura', role: 'Architect' });
  // Add extra agents to execution
  for (const eid of extraAgents) {
    const a = allAgents[eid] || BUILTIN_AGENTS[eid];
    if (a) execAgents.push({ id: eid, label: (a.icon||'🤖') + ' ' + a.name, role: a.role || eid });
  }

  let allResults = [];
  for (let i = 0; i < subtasks.length; i++) {
    const st = subtasks[i];
    // Round-robin through execution agents
    const execAgent = execAgents[i % execAgents.length] || execAgents[0];
    if (!execAgent) break;

    const agentDef = allAgents[execAgent.id] || BUILTIN_AGENTS[execAgent.id];
    if (!agentDef) continue;

    // Drain fallback queue (for interventions that arrived between agents)
    const newContext = await drainInterventionQueue('Esecuzione');
    if (newContext) interventionContext = (interventionContext ? interventionContext + '\n' : '') + newContext;

    sendSSE({ type: 'phase', label: `${execAgent.label} ${i+1}/${subtasks.length}`, detail: st });
    let prompt = `Contesto progetto: "${task}"\n\nDevi eseguire questo sotto-task: "${st}"\n\nSpiega cosa fare, produci codice se necessario. Scrivi in prima persona, in italiano. Sii diretto e concreto.`;
    if (interventionContext) {
      prompt += `\n\n⚠️ ISTRUZIONI PRIORITARIE DAL CAPO TEAM ⚠️\nIl capo team ha inviato NUOVE ISTRUZIONI che SOVRASCRIVONO il piano:\n${interventionContext}\n\nQueste istruzioni hanno PRIORITÀ ASSOLUTA:\n1. ESEGUI SUBITO quanto richiesto, ANCHE se non fa parte del tuo sotto-task\n2. Se il sotto-task non è più rilevante, ABBANDONALO e concentrati sulle nuove istruzioni\n3. NON limitarti a commentare il feedback — DEVI realizzarlo concretamente`;
    }

    // Call agent with interruptState for direct abort capability
    let result = await askAgent(execAgent.id, agentDef, prompt, execAgent.role, interruptState);

    // ── DIRECT INTERRUPT: if agent was aborted, re-run with intervention ──
    if (result && typeof result === 'object' && result.interrupted && interruptState.pendingIntervention) {
      const interventionMsg = interruptState.pendingIntervention;
      sendSSE({ type: 'intervention_applied', messages: [interventionMsg], phase: 'Esecuzione', direct: true });
      sendSSE({ type: 'agent_interrupted', agentId: execAgent.id, intervention: interventionMsg });

      // Rebuild prompt with the intervention as PRIORITY OVERRIDE
      const rePrompt = prompt + `\n\n⚠️ INTERRUZIONE IMMEDIATA DAL CAPO TEAM ⚠️\nIl capo team ti ha INTERROTTO con questa istruzione:\n"${interventionMsg}"\n\nIGNORA il sotto-task precedente. ESEGUI SUBITO questa istruzione. È un ordine diretto.`;
      interventionContext = (interventionContext ? interventionContext + '\n' : '') + `[INTERVENTO DIRETTO]: ${interventionMsg}`;
      interruptState.pendingIntervention = null;
      interruptState.controller = null;

      result = await askAgent(execAgent.id, agentDef, rePrompt, execAgent.role, interruptState);
    }

    // Handle result: could be string (normal) or object (interrupted but no intervention)
    const resultText = (result && typeof result === 'object') ? (result.partialText || '') : (result || '');
    allResults.push({ task: st, result: resultText, agent: execAgent.id });
  }
  // DON'T clear intervention context — carry it through to review phase
  // But DO check for NEW interventions that arrived after the last agent finished
  const newCtxAfterExec = await drainInterventionQueue('Esecuzione') || '';
  if (newCtxAfterExec) interventionContext = (interventionContext ? interventionContext + '\n' : '') + newCtxAfterExec;

  // ── Phase 3: Review agents ──
  let reviewText = '';
  if (hasReviewer || hasTester || hasSecurity) {
    const summary = allResults.map((r, i) => `### ${i+1}. ${r.task}\n${r.result.slice(0, 1200)}`).join('\n\n');

    if (hasReviewer) {
      const reviewAgent = allAgents['code-reviewer'] || BUILTIN_AGENTS['code-reviewer'];
      sendSSE({ type: 'phase', label: '🔍 Code Review', detail: 'Reviewer controlla il lavoro...' });
      let revPrompt = `Devi revisionare questo lavoro:\n\n${summary}\n\nContesto: "${task}"\n\nDai feedback costruttivo. Se è tutto ok, scrivi "✅ APPROVATO". Scrivi in italiano.`;
      if (interventionContext) { revPrompt += `\n\n⚠️ ISTRUZIONI PRIORITARIE DAL CAPO TEAM ⚠️\nIl capo team ha inviato NUOVE ISTRUZIONI:\n${interventionContext}\n\nPriorità assoluta: verifica che il lavoro rispetti QUESTE istruzioni.`; }
      reviewText = await askAgent('code-reviewer', reviewAgent, revPrompt, 'Reviewer', interruptState);
      if (reviewText && typeof reviewText === 'object') reviewText = reviewText.partialText || '';
    }

    if (hasTester) {
      const testerAgent = allAgents['tester'] || BUILTIN_AGENTS['tester'];
      sendSSE({ type: 'phase', label: '🧪 Testing', detail: 'Tester verifica il funzionamento...' });
      const testPrompt = `Devi testare questo lavoro:\n\n${summary}\n\nTrova bug, casi limite, problemi. Se tutto funziona, scrivi "✅ TEST SUPERATI". Scrivi in italiano.`;
      let testText = await askAgent('tester', testerAgent, testPrompt, 'Tester', interruptState);
      if (testText && typeof testText === 'object') testText = testText.partialText || '';
      reviewText += '\n\n' + testText;
    }

    if (hasSecurity) {
      const secAgent = allAgents['security'] || BUILTIN_AGENTS['security'];
      sendSSE({ type: 'phase', label: '🔒 Security Audit', detail: 'Security Auditor controlla le vulnerabilità...' });
      const secPrompt = `Devi fare un security audit:\n\n${summary}\n\nCerca vulnerabilità, injection, dati esposti. Se tutto è sicuro, scrivi "✅ SICURO". Scrivi in italiano.`;
      let secText = await askAgent('security', secAgent, secPrompt, 'Security', interruptState);
      if (secText && typeof secText === 'object') secText = secText.partialText || '';
      reviewText += '\n\n' + secText;
    }

    // ── Phase 4: Feedback loop (max 2 rounds) ──
    const newCtxAfterReview = await drainInterventionQueue('Revisione') || '';
    if (newCtxAfterReview) interventionContext = (interventionContext ? interventionContext + '\n' : '') + newCtxAfterReview;
    // Also run fix loop if user interventions are pending (even if reviewer didn't flag issues)
    const hasInterventions = !!interventionContext;
    for (let round = 0; round < 2 && hasDev; round++) {
      const hasIssues = reviewText.match(/problema|manca|errore|bug|non va|corregg|migliora|⚠|❌|da rifare|non funziona|issue|vulnerabilit|fix/i) &&
                        !reviewText.match(/✅\s*APPROVATO|✅\s*TEST SUPERATI|✅\s*SICURO|nessun problema|tutto ok|tutto a posto|perfetto/i);

      if (!hasIssues && !hasInterventions) break;
      // Clear interventions flag so we don't loop forever
      if (hasInterventions && !hasIssues) hasInterventions = false;

      // Check for new interventions before each fix round
      const newCtxFix = await drainInterventionQueue('Correzione') || '';
      if (newCtxFix) interventionContext = (interventionContext ? interventionContext + '\n' : '') + newCtxFix;

      sendSSE({ type: 'phase', label: `🔧 Correzione ${round+1}`, detail: 'Developer sistema in base al feedback...' });
      const devAgent = allAgents['developer'] || BUILTIN_AGENTS['developer'];
      let fixPrompt = `Feedback ricevuto:\n${reviewText}\n\nCorreggi i problemi evidenziati. Scrivi in italiano.`;
      if (interventionContext) { fixPrompt += `\n\n⚠️ ISTRUZIONI PRIORITARIE DAL CAPO TEAM ⚠️\nIl capo team ha inviato NUOVE ISTRUZIONI:\n${interventionContext}\n\nQueste istruzioni SOVRASCRIVONO qualsiasi altra correzione. ESEGUILE SUBITO.`; }
      let fixText = await askAgent('developer', devAgent, fixPrompt, 'Developer', interruptState);
      if (fixText && typeof fixText === 'object') fixText = fixText.partialText || '';

      sendSSE({ type: 'phase', label: `🔍 Re-Review ${round+1}`, detail: 'Verifica delle correzioni...' });
      const reReviewAgent = allAgents['code-reviewer'] || BUILTIN_AGENTS['code-reviewer'];
      reviewText = await askAgent('code-reviewer', reReviewAgent,
        `Il Developer ha fatto queste correzioni:\n${fixText}\n\nVerifica che i problemi siano stati risolti. Se tutto ok scrivi "✅ APPROVATO". Scrivi in italiano.`, 'Reviewer', interruptState);
      if (reviewText && typeof reviewText === 'object') reviewText = reviewText.partialText || '';
    }
  }

  // Fallback: if intervention is pending but no review agents, let Developer address it
  if (interventionContext && !hasReviewer && !hasTester && !hasSecurity && hasDev) {
    sendSSE({ type: 'phase', label: '🔧 Adeguamento', detail: 'Developer applica le istruzioni del capo team...' });
    const devAgent = allAgents['developer'] || BUILTIN_AGENTS['developer'];
    const adjPrompt = `⚠️ ISTRUZIONI PRIORITARIE DAL CAPO TEAM:\n${interventionContext}\n\nApplica queste modifiche al lavoro fatto. Scrivi in italiano.`;
    await askAgent('developer', devAgent, adjPrompt, 'Developer', interruptState);
  }

  // ── Done ──
  delete interventions[sessionId];
  sendSSE({ type: 'done', subtasks, createdFiles });
  res.end();
  activeSSE = null;
}

// Simple tool executor (file system operations relative to work dir)
// Async because it may pause to request user permission for external paths

function isPathAuthorized(resolvedPath) {
    if (!resolvedPath) return false;
    const norm = resolve(resolvedPath).toLowerCase();
    for (const allowed of authorizedPaths) {
        if (norm === allowed || norm.startsWith(allowed + '\\') || norm.startsWith(allowed + '/')) {
            return true;
        }
    }
    return false;
}

function isExternalPath(resolvedPath) {
    if (!resolvedPath) return false;
    const normPath = resolve(resolvedPath).toLowerCase();
    const workNorm = resolve(WORK_DIR).toLowerCase();
    return !normPath.startsWith(workNorm + '\\') && 
           !normPath.startsWith(workNorm + '/') && 
           normPath !== workNorm;
}

function resolveToolPath(name, args) {
  if (name === 'read_file' || name === 'write_file' || name === 'list_directory' || name === 'search_files') {
    let rawPath = typeof args === 'string' ? args : (args.path || '');
    rawPath = rawPath.trim().replace(/^[\"'`]+|[\"'`]+$/g, '');
    if (!rawPath) return WORK_DIR;

    // Check if rawPath is an absolute path (Windows drive, UNC, POSIX)
    const winDrive = /^[A-Za-z]:[\\\/]/.test(rawPath);
    const uncPath = /^[\\\/]{2}/.test(rawPath);
    if (isAbsolute(rawPath) || winDrive || uncPath) {
      const resolved = resolve(rawPath);
      console.log(`[resolveToolPath] ABSOLUTE: raw="${rawPath}" → resolved="${resolved}"`);
      return resolved;
    }

    // Relative path handling
    let relPath = rawPath.replace(/^[\/\\]+/, '').replace(/^\.\//, '');
    if (relPath.includes('/home/') || relPath.startsWith('/')) {
      relPath = relPath.replace(/^.*?([^\/\\]+)$/, '$1');
    }
    const final = resolve(WORK_DIR, relPath);
    console.log(`[resolveToolPath] RELATIVE: raw="${rawPath}" → final="${final}"`);
    return final;
  }
  return null;
}

async function executeTool(name, args) {
  const resolvedPath = resolveToolPath(name, args);

  // ── Permission check for external paths ──
  if (resolvedPath && isExternalPath(resolvedPath) && !isPathAuthorized(resolvedPath) && activeSSE && activeSSE.sendSSE) {
    const permissionId = 'perm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    console.log(`[Permission] External path detected: ${resolvedPath} (WORK_DIR: ${WORK_DIR})`);

    // Send SSE event to frontend
    activeSSE.sendSSE({
      type: 'permission_required',
      permissionId,
      path: resolvedPath,
      tool: name,
      workDir: WORK_DIR
    });

    // Wait for user response via Promise (with 60s timeout)
    try {
      const resData = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingPermissions.delete(permissionId);
          console.log(`[Permission] Timeout for ${permissionId}`);
          resolve({ allowed: false, remember: false });
        }, 60000);
        pendingPermissions.set(permissionId, { resolve, timeout, path: resolvedPath });
      });

      const allowed = resData && typeof resData === 'object' ? resData.allowed : resData;
      const remember = resData && typeof resData === 'object' ? resData.remember : true;

      if (!allowed) {
        return `Accesso negato dall'utente al percorso: ${resolvedPath}`;
      }

      if (remember) {
        const norm = resolve(resolvedPath).toLowerCase();
        let baseDir = norm;
        try {
          if (existsSync(resolvedPath) && !statSync(resolvedPath).isDirectory()) {
            baseDir = resolve(dirname(resolvedPath)).toLowerCase();
          }
        } catch {}
        authorizedPaths.add(baseDir);
        console.log(`[Permission] Authorized root path added: ${baseDir}`);
      }
    } catch (e) {
      return `Errore permesso: ${e.message}`;
    }
  }

  return executeToolDirect(name, args, resolvedPath);
}

// Direct tool execution WITHOUT permission check (for pre-fetch where user already authorized)
function executeToolDirect(name, args, resolvedPath) {
  resolvedPath = resolvedPath || resolveToolPath(name, args);

  // ── Execute ──
  switch(name) {
    case 'read_file': {
      const fpath = resolvedPath;
      if (!existsSync(fpath)) return `File non trovato: ${args.path || ''} (cercato in ${fpath})`;
      return readFileSync(fpath, 'utf-8').slice(0, 10000);
    }
    case 'write_file': {
      const fpath = resolvedPath;
      const dir = dirname(fpath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fpath, args.content || '', 'utf-8');
      return `File scritto: ${args.path || ''} (${(args.content||'').length} caratteri) → ${fpath}`;
    }
    case 'list_directory': {
      const dpath = resolvedPath;
      if (!existsSync(dpath)) return `Directory non trovata: ${args.path || ''} (cercata in ${dpath})`;
      return readdirSync(dpath).map(f => {
        const fp = join(dpath, f);
        try { return `${statSync(fp).isDirectory() ? '📁' : '📄'} ${f}`; } catch { return `❓ ${f}`; }
      }).join('\n');
    }
    case 'execute_command': {
      try {
        const cmd = (typeof args === 'string' ? args : args.command || '').trim();
        // Extract base command and check against allowlist
        const baseCmd = cmd.split(/\s+/)[0].replace(/^.*[\\/]/, '').toLowerCase();
        const ALLOWED_COMMANDS = ['npm', 'npx', 'node', 'git', 'python', 'python3', 'pip', 'pip3', 'dir', 'ls', 'cd', 'echo', 'type', 'cat', 'mkdir', 'copy', 'move', 'ren', 'del'];
        if (!ALLOWED_COMMANDS.includes(baseCmd) && !baseCmd.startsWith('.')) {
          // Allow relative scripts (./build.sh) but flag unknown system commands
          if (!existsSync(join(WORK_DIR, baseCmd))) {
            return `Comando non consentito: "${baseCmd}". Comandi consentiti: ${ALLOWED_COMMANDS.join(', ')}`;
          }
        }
        const targetDir = (resolvedPath && existsSync(resolvedPath)) ? resolvedPath : WORK_DIR;
        const result = execSync(cmd, { cwd: targetDir, encoding: 'utf-8', timeout: 30000, shell: true });
        return result.slice(0, 5000);
      } catch(e) {
        return `Errore: ${e.message}`;
      }
    }
    case 'search_files': {
      try {
        const pattern = args.pattern || args;
        const targetDir = (resolvedPath && existsSync(resolvedPath)) ? resolvedPath : WORK_DIR;
        // Sanitize pattern: escape double quotes and backslashes to prevent shell injection
        const safePattern = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        const result = execSync(`npx --no-install rg --no-heading -n "${safePattern}" "${targetDir}" --max-count 20`, { encoding: 'utf-8', timeout: 15000, cwd: targetDir });
        return result.slice(0, 5000) || 'Nessun risultato trovato.';
      } catch { return 'Nessun risultato trovato.'; }
    }
    default: return `Tool sconosciuto: ${name}`;
  }
}

// Chat streaming
// ─── Web Search (Wikipedia API — gratis, no API key) ─────────────────────
async function searchWeb(query) {
    try {
        // Extract key search terms: keep numbers, proper nouns, and last 3-4 significant words
        const keywords = query.replace(/[?.,!;:¿¡]/g, '').split(/\s+/).filter(w => w.length > 2).slice(-8).join(' ');
        const searchQuery = keywords || query;
        console.log(`[searchWeb] Query: "${query}" → keywords: "${searchQuery}"`);

        // Try Italian Wikipedia first (matches user's language), fall back to English
        let pages = [];
        let wikiLang = 'it';
        for (const lang of ['it', 'en']) {
            const wikiBase = `https://${lang}.wikipedia.org/w/api.php`;
            const searchUrl = `${wikiBase}?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&srlimit=5`;
            try {
                const searchRes = await fetchExternal(searchUrl, { 'User-Agent': 'Dashboard/1.0' }, null, 'GET');
                const searchData = JSON.parse(searchRes.data);
                pages = (searchData.query && searchData.query.search) || [];
                if (pages.length > 0) { wikiLang = lang; break; }
            } catch (e) { continue; }
        }

        console.log(`[searchWeb] Found ${pages.length} pages on ${wikiLang}.wiki: ${pages.map(p=>p.title).join(', ')}`);

        if (pages.length === 0) return null;

        // Fetch extracts from the SAME wiki that returned results
        const pageIds = pages.map(p => p.pageid).join('|');
        const wikiBase = `https://${wikiLang}.wikipedia.org/w/api.php`;
        const extractUrl = `${wikiBase}?action=query&pageids=${pageIds}&prop=extracts&exintro=1&explaintext=1&format=json`;
        let extractData = { query: { pages: {} } };
        try {
            const extractRes = await fetchExternal(extractUrl, { 'User-Agent': 'Dashboard/1.0' }, null, 'GET');
            extractData = JSON.parse(extractRes.data);
            console.log(`[searchWeb] Extracts fetched OK`);
        } catch (e) { console.log(`[searchWeb] Extract fetch failed: ${e.message}`); }

        const pageData = (extractData.query && extractData.query.pages) || {};

        // Build context from results
        const results = [];
        for (const page of pages) {
            const extract = (pageData[page.pageid] && pageData[page.pageid].extract) || page.snippet || '';
            const cleanExtract = extract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (cleanExtract.length > 30) {
                const url = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent((page.title || '').replace(/ /g, '_'))}`;
                results.push({
                    title: page.title || '',
                    url,
                    text: cleanExtract.slice(0, 800)
                });
            }
        }

        if (results.length === 0) return null;

        return results.map((r, i) =>
            `[${i + 1}] ${r.title}\n${r.text}\nFonte: ${r.url}`
        ).join('\n\n');
    } catch (e) {
        console.error('Web search error:', e.message);
        return null;
    }
}

async function streamChatResponse(messages, cfg, res) {
    const provider = cfg.AI_PROVIDER;
    const model = cfg.OPENAI_MODEL || cfg.AI_DISPLAY_MODEL || 'auto';
    const baseUrl = cfg.OPENAI_BASE_URL || 'http://localhost:20128/v1';
    const apiKey = cfg.OPENAI_API_KEY || cfg.ANTHROPIC_AUTH_TOKEN || 'not-needed';

    res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
        'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
    });
    const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (provider === 'openai' || provider === 'anthropic') {
        const body = JSON.stringify({ model, messages, stream: true });
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        let fullText = '';
        await streamExternal(`${baseUrl}/chat/completions`, headers, body,
            (chunk) => {
                chunk.split('\n').forEach(line => {
                    if (!line.startsWith('data: ')) return;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') return;
                    try {
                        const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
                        if (delta) { fullText += delta; sendSSE({ type: 'delta', content: delta }); }
                    } catch {}
                });
            },
            () => { sendSSE({ type: 'done', fullText }); res.end(); }
        );
        return fullText;
    }

    sendSSE({ type: 'error', content: 'Provider not supported' });
    res.end();
    return '';
}

// Server
const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
        return res.end();
    }
    try {
        if (url.pathname === '/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(readFileSync(HTML_FILE, 'utf-8'));
        }
        // Serve static files (CSS, JS, images) — prevent path traversal
        if (req.method === 'GET' && /\.(css|js|svg|png|jpg|ico|woff2?|ttf)$/.test(url.pathname)) {
            const staticPath = resolve(__dirname, '.' + url.pathname);
            // Reject if resolved path escapes the dashboard directory
            const dashboardNorm = resolve(__dirname);
            if (!staticPath.toLowerCase().startsWith(dashboardNorm.toLowerCase())) {
                return sendJSON(res, 403, { error: 'Forbidden' });
            }
            if (existsSync(staticPath)) {
                const mime = url.pathname.endsWith('.css') ? 'text/css' :
                            url.pathname.endsWith('.js') ? 'application/javascript' :
                            url.pathname.endsWith('.svg') ? 'image/svg+xml' :
                            url.pathname.endsWith('.png') ? 'image/png' :
                            url.pathname.endsWith('.jpg') ? 'image/jpeg' :
                            'application/octet-stream';
                res.writeHead(200, { 'Content-Type': mime });
                return res.end(readFileSync(staticPath));
            }
        }
        if (url.pathname === '/api/config' && req.method === 'GET') return sendJSON(res, 200, readConfigSafe());
        if (url.pathname === '/api/config' && req.method === 'POST') { const b = await readBody(req); writeConfig(b); return sendJSON(res, 200, { success: true }); }

        if (url.pathname === '/api/verify-key' && req.method === 'POST') {
            const { provider, key, baseUrl } = await readBody(req);
            try {
                let verifyUrl = '';
                let headers = {};
                const cleanBase = (baseUrl || '').replace(/\/+$/, '');
                if (provider === 'openai') { verifyUrl = cleanBase ? `${cleanBase}/models` : 'https://api.openai.com/v1/models'; headers = { 'Authorization': `Bearer ${key}` }; }
                else if (provider === 'deepseek') { verifyUrl = 'https://api.deepseek.com/v1/models'; headers = { 'Authorization': `Bearer ${key}` }; }
                else if (provider === 'anthropic') { verifyUrl = 'https://api.anthropic.com/v1/models'; headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' }; }
                else if (provider === 'gemini') { verifyUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`; }
                else if (provider === 'nvidia') { verifyUrl = 'https://integrate.api.nvidia.com/v1/models'; headers = { 'Authorization': `Bearer ${key}` }; }
                else if (provider === 'openrouter') { verifyUrl = 'https://openrouter.ai/api/v1/models'; headers = { 'Authorization': `Bearer ${key}` }; }
                else if (provider === 'ollama') {
                    verifyUrl = `${cleanBase || 'http://localhost:11434'}/api/tags`;
                    const resp = await fetch(verifyUrl);
                    if (!resp.ok) throw new Error('Ollama not reachable');
                    const data = await resp.json();
                    return sendJSON(res, 200, { valid: true, models: (data.models || []).map(m => m.name) });
                }
                else if (provider === 'omniroute') {
                    verifyUrl = `${cleanBase || 'http://localhost:20128'}/v1/models`;
                    const resp = await fetch(verifyUrl, { headers: key && key !== 'not-needed' ? { 'Authorization': `Bearer ${key}` } : {} });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok && resp.status >= 400) throw new Error('OmniRoute not reachable');
                    return sendJSON(res, 200, { valid: true, models: (data.data || data.models || []).map(m => m.id || m.name) });
                }
                else if (provider === 'lmstudio') {
                    verifyUrl = `${cleanBase || 'http://localhost:1234/v1'}/models`;
                    const resp = await fetch(verifyUrl);
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error('LM Studio not reachable');
                    return sendJSON(res, 200, { valid: true, models: (data.data || data.models || []).map(m => m.id || m.name) });
                }
                else if (provider === 'custom-openai') {
                    verifyUrl = `${cleanBase}/models`;
                    headers = key && key !== 'not-needed' ? { 'Authorization': `Bearer ${key}` } : {};
                    const resp = await fetch(verifyUrl, { headers });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error('Custom API not reachable');
                    return sendJSON(res, 200, { valid: true, models: (data.data || data.models || []).map(m => m.id || m.name) });
                }
                else {
                    return sendJSON(res, 200, { valid: true, note: 'Provider non supporta verifica automatica' });
                }
                // Generic check for cloud providers
                if (verifyUrl) {
                    const resp = await fetch(verifyUrl, { headers });
                    if (!resp.ok) {
                        const errText = await resp.text().catch(() => '');
                        return sendJSON(res, 200, { valid: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
                    }
                    const data = await resp.json().catch(() => ({}));
                    return sendJSON(res, 200, { valid: true, models: (data.data || data.models || []).map(m => m.id || m.name || m.model) });
                }
            } catch (e) {
                return sendJSON(res, 200, { valid: false, error: e.message });
            }
        }

        // Model listing endpoints for Setup wizard
        if (url.pathname === '/api/deepseek/models' && req.method === 'POST') {
            try {
                const { key } = await readBody(req);
                const resp = await fetch('https://api.deepseek.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
                const data = await resp.json().catch(() => ({}));
                return sendJSON(res, 200, { models: (data.data || []).map(m => m.id) });
            } catch (e) { return sendJSON(res, 200, { models: [] }); }
        }
        if (url.pathname === '/api/nvidia/models' && req.method === 'GET') {
            try {
                const resp = await fetch('https://integrate.api.nvidia.com/v1/models');
                const data = await resp.json().catch(() => ({}));
                return sendJSON(res, 200, { models: (data.data || []).map(m => m.id) });
            } catch (e) { return sendJSON(res, 200, { models: [] }); }
        }
        if (url.pathname === '/api/ollama/models' && req.method === 'GET') {
            try {
                const resp = await fetch('http://localhost:11434/api/tags');
                const data = await resp.json().catch(() => ({}));
                return sendJSON(res, 200, { models: (data.models || []).map(m => ({ id: m.name, name: m.name })) });
            } catch (e) { return sendJSON(res, 200, { models: [] }); }
        }
        if (url.pathname === '/api/openai-compatible/models' && req.method === 'POST') {
            try {
                const { baseUrl, key } = await readBody(req);
                const cleanUrl = (baseUrl || '').replace(/\/+$/, '');
                const headers = { 'Content-Type': 'application/json' };
                if (key && key !== 'not-needed') headers['Authorization'] = `Bearer ${key}`;
                const resp = await fetch(`${cleanUrl}/models`, { headers });
                const data = await resp.json().catch(() => ({}));
                return sendJSON(res, 200, { models: (data.data || data.models || []).map(m => m.id || m.name) });
            } catch (e) { return sendJSON(res, 200, { models: [] }); }
        }
        if (url.pathname === '/api/models' && req.method === 'GET') {
            try {
                const q = new URL(`http://localhost${req.url}`);
                const type = q.searchParams.get('type') || 'free';
                const apiKey = q.searchParams.get('key') || '';
                // Always use OpenRouter API for model discovery (not the saved config)
                const baseUrl = 'https://openrouter.ai/api/v1';
                const key = apiKey || readConfig().OPENAI_API_KEY || readConfig().ANTHROPIC_AUTH_TOKEN || '';
                const headers = key ? { 'Authorization': `Bearer ${key}` } : {};
                const resp = await fetch(`${baseUrl}/models`, { headers });
                const data = await resp.json().catch(() => ({}));
                let models = (data.data || []).map(m => m.id);
                // Filter by tier: free models have pricing sum === 0
                if (type === 'free') {
                    models = (data.data || []).filter(m => {
                        const price = m.pricing ? (parseFloat(m.pricing.prompt || '0') + parseFloat(m.pricing.completion || '0')) : 0;
                        return price === 0;
                    }).map(m => m.id);
                } else if (type === 'paid') {
                    models = (data.data || []).filter(m => {
                        const price = m.pricing ? (parseFloat(m.pricing.prompt || '0') + parseFloat(m.pricing.completion || '0')) : 0;
                        return price > 0;
                    }).map(m => m.id);
                }
                return sendJSON(res, 200, { models });
            } catch (e) { return sendJSON(res, 200, { models: [] }); }
        }

        if (url.pathname === '/api/chats' && req.method === 'GET') return sendJSON(res, 200, { chats: listChats() });
        if (url.pathname === '/api/chats' && req.method === 'POST') {
            const { title } = await readBody(req);
            const id = newChatId();
            const now = new Date().toISOString();
            saveChat(id, { id, title: title || 'Nuova conversazione', created: now, updated: now, messages: [] });
            return sendJSON(res, 200, { id });
        }

        const chatMatch = url.pathname.match(/^\/api\/chats\/([^/]+)$/);
        if (chatMatch) {
            const chatId = chatMatch[1];
            if (req.method === 'GET') { const chat = loadChat(chatId); return chat ? sendJSON(res, 200, chat) : sendJSON(res, 404, { error: 'Not found' }); }
            if (req.method === 'DELETE') { const f = join(CHATS_DIR, `${chatId}.json`); if (existsSync(f)) unlinkSync(f); return sendJSON(res, 200, { success: true }); }
            if (req.method === 'POST') { const data = await readBody(req); saveChat(chatId, data); return sendJSON(res, 200, { success: true }); }
        }

        if (url.pathname === '/api/chat' && req.method === 'POST') {
            const { chatId, messages, userMessage, webSearch } = await readBody(req);
            const cfg = readConfig();
            if (!cfg.AI_PROVIDER) { sendJSON(res, 400, { error: 'No provider configured' }); return; }
            const history = messages || [];

            // If web search is enabled, fetch search results and inject as context
            let enhancedUserMessage = userMessage;
            if (webSearch) {
                console.log(`[WebSearch] Searching for: "${userMessage}"`);
                const searchResults = await searchWeb(userMessage);
                if (searchResults) {
                    console.log(`[WebSearch] Found results, injecting into prompt`);
                    // Use a "primed answer" format that weak models are more likely to follow.
                    // The model sees data then "Risposta:" — it naturally completes with the data.
                    enhancedUserMessage = [
                        `RICERCA WEB IN TEMPO REALE (fonte: Wikipedia, data: ${new Date().toLocaleDateString('it-IT')})`,
                        '',
                        searchResults,
                        '',
                        '---',
                        `DOMANDA UTENTE: ${userMessage}`,
                        '',
                        'ISTRUZIONE: Le informazioni qui sopra sono AGGIORNATE e CORRETTE. La tua conoscenza interna potrebbe essere VECCHIA o ERRATA. Usa SOLO le informazioni sopra per rispondere.',
                        '',
                        'Risposta (basata sulle informazioni aggiornate):'
                    ].join('\n');
                    // Use a chat-optimized model that follows instructions better
                    if (cfg.OPENAI_MODEL === 'auto/best-coding' || cfg.OPENAI_MODEL === 'auto') {
                        cfg.OPENAI_MODEL = 'auto/best-chat';
                        console.log(`[WebSearch] Switched model to auto/best-chat for better instruction following`);
                    }
                } else {
                    console.log(`[WebSearch] No results found`);
                }
            }

            const allMessages = [...history, { role: 'user', content: enhancedUserMessage }];
            const fullText = await streamChatResponse(allMessages, cfg, res);
            if (chatId && fullText) {
                const existing = loadChat(chatId) || { id: chatId, title: userMessage.slice(0, 50), created: new Date().toISOString(), messages: [] };
                existing.messages.push({ role: 'user', content: userMessage }, { role: 'assistant', content: fullText });
                existing.updated = new Date().toISOString();
                if (!existing.title || existing.title === 'Nuova conversazione') existing.title = userMessage.slice(0, 50);
                saveChat(chatId, existing);
            }
            return;
        }

        if (url.pathname === '/api/agent/run' && req.method === 'POST') {
            const { agentId, task, messages } = await readBody(req);
            const cfg = readConfig();
            if (!cfg.OPENAI_BASE_URL && !cfg.ANTHROPIC_BASE_URL) { sendJSON(res, 400, { error: 'Nessun backend AI configurato' }); return; }
            await runAgent(agentId, task, messages || [], res, cfg);
            return;
        }
        if (url.pathname === '/api/agents' && req.method === 'GET') {
            return sendJSON(res, 200, { agents: loadCustomAgents(), teams: loadTeams() });
        }
        if (url.pathname === '/api/agents' && req.method === 'POST') {
            const { id, ...data } = await readBody(req);
            saveCustomAgent(id, data);
            return sendJSON(res, 200, { success: true, id });
        }
        if (url.pathname.match(/^\/api\/agents\/([^/]+)$/) && req.method === 'DELETE') {
            const id = url.pathname.match(/^\/api\/agents\/([^/]+)$/)[1];
            if (BUILTIN_AGENTS[id]) return sendJSON(res, 400, { error: 'Impossibile eliminare un agente built-in' });
            deleteCustomAgent(id);
            return sendJSON(res, 200, { success: true });
        }
        if (url.pathname === '/api/teams' && req.method === 'POST') {
            const team = await readBody(req);
            if (!existsSync(TEAMS_DIR)) mkdirSync(TEAMS_DIR, { recursive: true });
            team.id = team.id || `team_${Date.now()}`;
            team.created = team.created || new Date().toISOString();
            writeFileSync(join(TEAMS_DIR, `${team.id}.json`), JSON.stringify(team, null, 2), 'utf-8');
            return sendJSON(res, 200, { success: true, id: team.id });
        }
        if (url.pathname === '/api/teams' && req.method === 'GET') {
            return sendJSON(res, 200, { teams: loadTeams() });
        }
        if (url.pathname.match(/^\/api\/teams\/([^/]+)$/) && req.method === 'DELETE') {
            const id = url.pathname.match(/^\/api\/teams\/([^/]+)$/)[1];
            const f = join(TEAMS_DIR, `${id}.json`);
            if (existsSync(f)) unlinkSync(f);
            return sendJSON(res, 200, { success: true });
        }
        if (url.pathname === '/api/orchestrator/run' && req.method === 'POST') {
            const { team, task, messages } = await readBody(req);
            const cfg = readConfig();
            await runTeam(team, task, messages || [], res, cfg);
            return;
        }
        if (url.pathname === '/api/orchestrator/chat' && req.method === 'POST') {
            const { task, agents: selectedAgents } = await readBody(req);
            const cfg = readConfig();
            if (!cfg.OPENAI_BASE_URL && !cfg.ANTHROPIC_BASE_URL) {
                sendJSON(res, 400, { error: 'Nessun backend AI configurato' }); return;
            }
            await runAgentChat(task, res, cfg, selectedAgents);
            return;
        }
        if (url.pathname === '/api/orchestrator/intervene' && req.method === 'POST') {
            const { sessionId, message } = await readBody(req);
            if (!sessionId || !message) return sendJSON(res, 400, { error: 'sessionId e message richiesti' });
            if (!interventions[sessionId]) interventions[sessionId] = { messages: [], resolved: false };
            const session = interventions[sessionId];

            // DIRECT ABORT: if there's an active agent with interruptState, abort it now
            if (session.interruptState && session.interruptState.controller) {
              session.interruptState.pendingIntervention = message;
              session.interruptState.controller.abort();
              return sendJSON(res, 200, { success: true, direct: true });
            }

            // Fallback: queue the message (consumed by drainInterventionQueue at phase boundaries)
            session.messages.push({ message, timestamp: Date.now() });
            return sendJSON(res, 200, { success: true });
        }
        if (url.pathname === '/api/permission/respond' && req.method === 'POST') {
            const { permissionId, allow, remember } = await readBody(req);
            const pending = pendingPermissions.get(permissionId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve({ allowed: allow === true, remember: remember !== false });
                pendingPermissions.delete(permissionId);
                console.log(`[Permission] ${permissionId} resolved: allow=${allow}, remember=${remember}`);
                return sendJSON(res, 200, { success: true });
            }
            return sendJSON(res, 404, { error: 'Permission request not found or expired' });
        }
        if (url.pathname === '/api/omniroute/status' && req.method === 'GET') {
            try {
                // Check if OmniRoute is reachable and get model count
                const resp = await fetchExternal('http://localhost:20128/v1/models', {}, null, 'GET');
                const data = JSON.parse(resp);
                const count = (data.data || data.models || []).length;
                return sendJSON(res, 200, { running: true, models: count });
            } catch {
                return sendJSON(res, 200, { running: false, models: 0 });
            }
        }
        if (url.pathname === '/api/omniroute/start' && req.method === 'POST') {
            try {
                // Check if already running
                try { await fetchExternal('http://localhost:20128/v1/models', {}, null, 'GET'); return sendJSON(res, 200, { running: true, started: false, models: -1 }); } catch {}
                // Start OmniRoute in background
                const child = spawn('cmd', ['/c', 'start', '/B', 'omniroute'], { detached: true, stdio: 'ignore', shell: true, windowsHide: true });
                child.unref();
                // Wait for it to come online (max 15s)
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const resp = await fetchExternal('http://localhost:20128/v1/models', {}, null, 'GET');
                        const data = JSON.parse(resp);
                        return sendJSON(res, 200, { running: true, started: true, models: (data.data || data.models || []).length });
                    } catch { /* still waiting */ }
                }
                return sendJSON(res, 200, { running: false, started: true, models: 0, error: 'Timeout: OmniRoute non risponde dopo 15s' });
            } catch (e) {
                return sendJSON(res, 500, { error: e.message });
            }
        }
        if (url.pathname === '/api/workdir/write' && req.method === 'POST') {
            const { path: relPath, content } = await readBody(req);
            // Resolve path and prevent directory traversal outside WORK_DIR
            const fpath = resolve(WORK_DIR, relPath || '');
            const workNorm = resolve(WORK_DIR).toLowerCase();
            if (!fpath.toLowerCase().startsWith(workNorm)) {
                return sendJSON(res, 403, { error: 'Path traversal denied', path: relPath });
            }
            const dir = dirname(fpath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(fpath, content, 'utf-8');
            return sendJSON(res, 200, { success: true, path: relPath });
        }
        if (url.pathname === '/api/launch' && req.method === 'POST') {
            const { mode } = await readBody(req);
            // Whitelist allowed modes to prevent shell injection
            const ALLOWED_MODES = ['claude', 'chat', 'agent', 'code', 'dev', 'work'];
            const safeMode = ALLOWED_MODES.includes(mode) ? mode : 'chat';
            try {
                const psArgs = safeMode === 'claude'
                    ? ['-NoProfile', '-Command', `Start-Process cmd -ArgumentList '/k','cd /d \\"${ROOT_DIR}\\" && claude'`]
                    : ['-NoProfile', '-Command', `Start-Process cmd -ArgumentList '/k','cd /d \\"${ROOT_DIR}\\" && echo AI ${safeMode} mode - pronti a lavorare! && pause'`];
                const child = spawn('powershell', psArgs, { detached: true, stdio: 'ignore', cwd: ROOT_DIR });
                child.unref();
                console.log(`Launch ${mode} — PID:`, child.pid);
                return sendJSON(res, 200, { success: true, mode });
            } catch (e) {
                return sendJSON(res, 500, { error: e.message });
            }
        }
        if (url.pathname === '/api/workflows' && req.method === 'GET') {
            const wfs = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json')).map(f => {
                try { return JSON.parse(readFileSync(join(WORKFLOWS_DIR, f), 'utf-8')); } catch { return null; }
            }).filter(Boolean).sort((a, b) => new Date(b.saved) - new Date(a.saved));
            return sendJSON(res, 200, { workflows: wfs });
        }
        if (url.pathname === '/api/workflows' && req.method === 'POST') {
            const wf = await readBody(req);
            wf.id = wf.id || `wf_${Date.now()}`;
            wf.saved = new Date().toISOString();
            writeFileSync(join(WORKFLOWS_DIR, `${wf.id}.json`), JSON.stringify(wf, null, 2), 'utf-8');
            return sendJSON(res, 200, { success: true, id: wf.id });
        }
        if (url.pathname.match(/^\/api\/workflows\/([^/]+)$/) && req.method === 'DELETE') {
            const id = url.pathname.match(/^\/api\/workflows\/([^/]+)$/)[1];
            const f = join(WORKFLOWS_DIR, `${id}.json`);
            if (existsSync(f)) unlinkSync(f);
            return sendJSON(res, 200, { success: true });
        }
        if (url.pathname.match(/^\/api\/workflows\/([^/]+)$/) && req.method === 'GET') {
            const id = url.pathname.match(/^\/api\/workflows\/([^/]+)$/)[1];
            const f = join(WORKFLOWS_DIR, `${id}.json`);
            if (existsSync(f)) return sendJSON(res, 200, JSON.parse(readFileSync(f, 'utf-8')));
            return sendJSON(res, 404, { error: 'Not found' });
        }

        sendJSON(res, 404, { error: 'Not found' });
    } catch (err) {
        console.error(err);
        try { sendJSON(res, 500, { error: err.message }); } catch {}
    }
});

// ═══ WebSocket: Terminal ──────────────────────────────────────
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsSend(socket, data) {
    const payload = Buffer.from(data, 'utf-8');
    const len = payload.length;
    let frame;
    if (len < 126) {
        frame = Buffer.alloc(2 + len);
        frame[0] = 0x81; // FIN + text opcode
        frame[1] = len;
        payload.copy(frame, 2);
    } else if (len < 65536) {
        frame = Buffer.alloc(4 + len);
        frame[0] = 0x81;
        frame[1] = 126;
        frame.writeUInt16BE(len, 2);
        payload.copy(frame, 4);
    } else {
        frame = Buffer.alloc(10 + len);
        frame[0] = 0x81;
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(len), 2);
        payload.copy(frame, 10);
    }
    try { socket.write(frame); } catch {}
}

function wsParseFrame(buffer) {
    // Returns parsed messages array from buffer, with remaining buffer
    const messages = [];
    let offset = 0;
    while (offset + 2 <= buffer.length) {
        const opcode = buffer[offset] & 0x0F;
        const masked = (buffer[offset + 1] & 0x80) !== 0;
        let payloadLen = buffer[offset + 1] & 0x7F;
        let headerLen = 2;
        if (payloadLen === 126) { headerLen += 2; if (offset + headerLen > buffer.length) break; payloadLen = buffer.readUInt16BE(offset + 2); }
        else if (payloadLen === 127) { headerLen += 8; if (offset + headerLen > buffer.length) break; payloadLen = Number(buffer.readBigUInt64BE(offset + 2)); }
        const maskOffset = headerLen;
        headerLen += masked ? 4 : 0;
        if (offset + headerLen + payloadLen > buffer.length) break; // incomplete frame
        if (opcode === 0x8) { messages.push({ type: 'close' }); offset += headerLen + payloadLen; continue; }
        if (opcode === 0x9) { /* ping */ offset += headerLen + payloadLen; continue; }
        if (opcode === 0x1) { // text
            const data = buffer.slice(offset + headerLen, offset + headerLen + payloadLen);
            if (masked) {
                const mask = buffer.slice(maskOffset, maskOffset + 4);
                for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
            }
            messages.push({ type: 'text', data: data.toString('utf-8') });
        }
        offset += headerLen + payloadLen;
    }
    return { messages, remaining: buffer.slice(offset) };
}

function spawnTerminal(ws, socket) {
    console.log('Terminal WebSocket connected');
    const child = spawn('cmd.exe', [], {
        cwd: ROOT_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'ansi', PROMPT: '$P$G' },
    });

    child.stdout.on('data', (data) => wsSend(socket, JSON.stringify({ type: 'stdout', data: data.toString('utf-8') })));
    child.stderr.on('data', (data) => wsSend(socket, JSON.stringify({ type: 'stderr', data: data.toString('utf-8') })));
    child.on('exit', (code) => {
        wsSend(socket, JSON.stringify({ type: 'exit', code }));
        console.log('Terminal process exited with code', code);
    });
    child.on('error', (err) => {
        wsSend(socket, JSON.stringify({ type: 'error', data: err.message }));
    });

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const { messages, remaining } = wsParseFrame(buf);
        buf = remaining;
        for (const msg of messages) {
            if (msg.type === 'close') { child.kill(); try { socket.end(); } catch {} return; }
            if (msg.type === 'text') {
                try {
                    const data = JSON.parse(msg.data);
                    if (data.type === 'stdin') child.stdin.write(data.data);
                    if (data.type === 'resize') { /* cols/rows */ }
                } catch { child.stdin.write(msg.data); }
            }
        }
    });

    socket.on('close', () => { child.kill(); console.log('Terminal WebSocket closed'); });
    socket.on('error', () => { child.kill(); });
}

// Generate a random terminal token at startup (only accessible from the same machine)
const WS_TERMINAL_TOKEN = 'term_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

server.on('upgrade', (req, socket, head) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        if (url.pathname !== '/ws/terminal') { socket.destroy(); return; }
        // Require shared secret token to prevent unauthorized terminal access
        const token = url.searchParams.get('token');
        if (token !== WS_TERMINAL_TOKEN) {
            console.log(`[WS] Rejected unauthorized terminal connection from ${req.headers.origin || 'unknown'}`);
            socket.destroy();
            return;
        }
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
        );
        spawnTerminal(null, socket);
    } catch (e) {
        console.error('WebSocket upgrade error:', e.message);
        try { socket.destroy(); } catch {}
    }
});

server.listen(PORT, () => {
    console.log(`\n  Dashboard: http://localhost:${PORT}\n  Cartella: ${WORK_DIR}\n`);
});
