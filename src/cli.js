#!/usr/bin/env node
// ==========================================
// AI COMMS CLI — full computer control from your terminal
// ==========================================
// Modes:
//   1. Bridge relay  — route tasks to a running IDE bridge (Copilot, Claude Code, Codex, Cursor)
//   2. Standalone    — AI with native tools (file, shell, HTTP) — no IDE needed
//   3. Interactive   — REPL loop (default when no arguments)
//   4. One-shot      — single command from args, exit when done
//
// Usage:
//   ai-comms                              → interactive REPL (standalone mode)
//   ai-comms "fix the tests"              → one-shot standalone
//   ai-comms --bridge copilot "fix tests" → relay to Copilot bridge
//   ai-comms agents status                → agent management
//   ai-comms --help                       → show help

import 'dotenv/config';
import readline from 'readline';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import config from './config.js';
import { chat } from './providers/index.js';
import { toolDefinitions, executeTool } from './cli-tools.js';
import { safeFetch } from './safe-fetch.js';

// --- Structured exit codes (sysexits.h inspired) ---
const EXIT = {
  OK:          0,   // Success
  ERROR:       1,   // General error
  USAGE:       2,   // Bad usage / invalid args
  NOINPUT:    66,   // Input file/data missing
  UNAVAILABLE:69,   // Service unavailable (bridge offline, etc.)
  NOPERM:     77,   // Permission denied / auth failure
  CONFIG:     78,   // Configuration error
};

// --- Verbose logging ---
let verbose = false;
function vlog(...args) {
  if (verbose) console.error('\x1b[90m[verbose]\x1b[0m', ...args);
}

// --- Bridge configuration ---
const BRIDGES = {
  copilot:  { port: process.env.COPILOT_BRIDGE_PORT || 3120, token: process.env.COPILOT_BRIDGE_TOKEN || '' },
  claude:   { port: process.env.CLAUDE_CODE_BRIDGE_PORT || 3121, token: process.env.CLAUDE_CODE_BRIDGE_TOKEN || '' },
  codex:    { port: process.env.CODEX_BRIDGE_PORT || 3122, token: process.env.CODEX_BRIDGE_TOKEN || '' },
  cursor:   { port: process.env.CURSOR_BRIDGE_PORT || 3123, token: process.env.CURSOR_BRIDGE_TOKEN || '' },
  openclaw: { port: process.env.OPENCLAW_BRIDGE_PORT || 3124, token: process.env.OPENCLAW_BRIDGE_TOKEN || '' },
};

// --- Parse arguments ---
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { bridge: null, help: false, version: false, verbose: false, format: 'text', message: null, doctor: false };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--help' || args[i] === '-h') {
      opts.help = true; i++;
    } else if (args[i] === '--version' || args[i] === '-V') {
      opts.version = true; i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      opts.verbose = true; i++;
    } else if (args[i] === '--format' || args[i] === '-f') {
      opts.format = args[i + 1] || 'text'; i += 2;
    } else if (args[i] === '--bridge' || args[i] === '-b') {
      opts.bridge = args[i + 1]; i += 2;
    } else if (args[i] === 'doctor') {
      opts.doctor = true; i++;
    } else {
      // Everything remaining is the message
      opts.message = args.slice(i).join(' ');
      break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  ai-comms — AI agent CLI with full computer control

  Usage:
    ai-comms                                Interactive REPL (standalone mode)
    ai-comms "your task here"               One-shot task
    ai-comms --bridge <name> "task"         Relay to an IDE bridge
    ai-comms agents status                  Show agent status

  Bridges:
    copilot     VS Code Copilot (port ${BRIDGES.copilot.port})
    claude      Claude Code CLI (port ${BRIDGES.claude.port})
    codex       OpenAI Codex    (port ${BRIDGES.codex.port})
    cursor      Cursor IDE      (port ${BRIDGES.cursor.port})
    openclaw    OpenClaw AI     (port ${BRIDGES.openclaw.port})

  Commands:
    doctor                 Run diagnostics on your setup

  Options:
    -b, --bridge <name>    Route task to a specific bridge
    -f, --format <fmt>     Output format: text (default), json, table, csv
    -v, --verbose          Enable verbose logging
    -h, --help             Show this help
    -V, --version          Show version

  Interactive Commands:
    /bridge <name> <task>  Relay to bridge from REPL
    /bridges               Show bridge status
    /tools                 List available tools
    /provider              Show active AI provider
    /clear                 Clear conversation history
    /help                  Show this help
    /quit                  Exit

  Environment:
    AI_PROVIDER            AI provider (default: openai)
    OPENAI_API_KEY         Required for OpenAI/Codex
    ANTHROPIC_API_KEY      Required for Anthropic/Claude
    (see .env.example for all options)

  Examples:
    ai-comms "list all TODO comments in src/ and create a summary"
    ai-comms "run the tests and fix any failures"
    ai-comms --bridge copilot "add error handling to server.js"
    ai-comms --bridge claude "refactor auth module to use JWT"
    ai-comms doctor
    ai-comms -f json agents status
    ai-comms -v "debug this issue"
`);
}

// --- Output formatter ---
function formatOutput(data, format) {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  if (format === 'csv') {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      const keys = Object.keys(data[0]);
      const header = keys.join(',');
      const rows = data.map(row => keys.map(k => {
        const v = String(row[k] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','));
      return [header, ...rows].join('\n');
    }
    return String(data);
  }
  if (format === 'table') {
    if (Array.isArray(data)) {
      if (data.length === 0) return '(empty)';
      const keys = Object.keys(data[0]);
      const widths = keys.map(k => Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)));
      const sep = widths.map(w => '-'.repeat(w + 2)).join('+');
      const hdr = keys.map((k, i) => ` ${k.padEnd(widths[i])} `).join('|');
      const rows = data.map(r => keys.map((k, i) => ` ${String(r[k] ?? '').padEnd(widths[i])} `).join('|'));
      return [hdr, sep, ...rows].join('\n');
    }
    return String(data);
  }
  // text (default) — stringify if object, otherwise pass through
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

// --- Doctor command ---
async function runDoctor() {
  const checks = [];
  const pass = (name, detail) => checks.push({ name, status: 'pass', detail });
  const fail = (name, detail) => checks.push({ name, status: 'FAIL', detail });
  const warn = (name, detail) => checks.push({ name, status: 'warn', detail });

  // 1. Node version
  const nodeVer = process.version;
  const major = parseInt(nodeVer.slice(1), 10);
  if (major >= 20) pass('Node.js', nodeVer);
  else fail('Node.js', `${nodeVer} (requires >=20)`);

  // 2. .env file
  if (existsSync('.env')) pass('.env file', 'found');
  else warn('.env file', 'not found — using defaults');

  // 3. AI provider config
  const provider = config.aiProvider;
  const providerCfg = config.providers[provider];
  const hasKey = providerCfg?.apiKey || providerCfg?.token;
  if (hasKey) pass('AI provider', `${provider} — key configured`);
  else if (provider === 'ollama') pass('AI provider', 'ollama — no key needed');
  else fail('AI provider', `${provider} — no API key found`);

  // 4. Model
  const model = providerCfg?.model || 'default';
  pass('Model', model);

  // 5. API connectivity
  const apiCfg = getApiConfig(provider);
  if (apiCfg) {
    try {
      vlog('Testing API connectivity to', apiCfg.url);
      const resp = await safeFetch(apiCfg.url, { method: 'POST', headers: apiCfg.headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }), signal: AbortSignal.timeout(8000) });
      if (resp.ok || resp.status === 400 || resp.status === 401 || resp.status === 422) {
        if (resp.status === 401) fail('API auth', `${provider} — 401 Unauthorized`);
        else pass('API connectivity', `${provider} — reachable`);
      } else {
        warn('API connectivity', `${provider} — HTTP ${resp.status}`);
      }
    } catch (e) {
      fail('API connectivity', `${provider} — ${e.message}`);
    }
  }

  // 6. Bridges
  for (const [name, b] of Object.entries(BRIDGES)) {
    const check = await checkBridge(name);
    if (check.available) pass(`Bridge: ${name}`, `port ${b.port} — online`);
    else warn(`Bridge: ${name}`, `port ${b.port} — offline`);
  }

  // 7. Hub
  try {
    const hubPort = process.env.HUB_PORT || 8090;
    const resp = await safeFetch(`http://localhost:${hubPort}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) pass('Hub server', `port ${hubPort} — online`);
    else warn('Hub server', `port ${hubPort} — HTTP ${resp.status}`);
  } catch {
    warn('Hub server', 'offline');
  }

  // 8. npm version
  try {
    const npmVer = execSync('npm --version', { encoding: 'utf-8' }).trim();
    pass('npm', npmVer);
  } catch {
    warn('npm', 'not found');
  }

  return checks;
}

function printDoctorResults(checks, format) {
  if (format !== 'text') {
    console.log(formatOutput(checks, format));
    return;
  }
  console.log('\n  AI COMMS Doctor\n  ' + '='.repeat(40));
  for (const c of checks) {
    const icon = c.status === 'pass' ? '\x1b[32m✔\x1b[0m' : c.status === 'FAIL' ? '\x1b[31m✘\x1b[0m' : '\x1b[33m!\x1b[0m';
    console.log(`  ${icon} ${c.name.padEnd(20)} ${c.detail}`);
  }
  const fails = checks.filter(c => c.status === 'FAIL').length;
  console.log();
  if (fails) console.log(`  \x1b[31m${fails} issue(s) found\x1b[0m\n`);
  else console.log('  \x1b[32mAll checks passed\x1b[0m\n');
}

// --- Bridge relay ---
async function checkBridge(name) {
  const b = BRIDGES[name];
  if (!b) return { available: false, error: `Unknown bridge: ${name}` };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://127.0.0.1:${b.port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return { available: res.ok };
  } catch {
    return { available: false };
  }
}

async function sendToBridge(name, message) {
  const b = BRIDGES[name];
  const headers = { 'Content-Type': 'application/json' };
  if (b.token) headers['Authorization'] = `Bearer ${b.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000); // 3 min

  const res = await fetch(`http://127.0.0.1:${b.port}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, sender: 'cli' }),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.response || '(empty response)';
}

// --- Standalone tool-calling loop ---
const SYSTEM_PROMPT = `You are ${config.agent.name}, an AI coding agent running in a terminal with full computer control.

You have tools to read/write files, run shell commands, search code, make HTTP requests, and get system info.

Rules:
- Use tools to accomplish tasks. Don't guess file contents — read them.
- Run commands to verify your work (tests, linters, builds).
- Be precise and efficient. Explain what you're doing briefly.
- For multi-step tasks, work through them one step at a time.
- If a command fails, diagnose and fix it.

Current directory: ${process.cwd()}
Platform: ${process.platform}
Node: ${process.version}`;

async function standaloneChat(history) {
  // Build messages for the AI provider
  // We need to use OpenAI-compatible tool calling format
  const providerName = config.aiProvider;

  // For providers that support tool calling (OpenAI, Anthropic, etc.)
  // We'll use a simple loop: send messages → get response → if tool calls, execute them → repeat
  const body = {
    model: config.providers[providerName]?.model || 'gpt-4o',
    messages: history,
    tools: toolDefinitions,
    tool_choice: 'auto',
  };

  // Determine the API endpoint and headers based on provider
  const apiConfig = getApiConfig(providerName);
  if (!apiConfig) {
    // Fallback: simple chat without tools
    return await chat(history);
  }

  let response;
  try {
    response = await safeFetch(apiConfig.url, {
      method: 'POST',
      headers: apiConfig.headers,
      body: JSON.stringify(body),
    }, 120_000);
  } catch (err) {
    // If tool-calling fails, fall back to simple chat
    console.log('  (falling back to simple chat — tool calling not supported by this provider)');
    return await chat(history);
  }

  const choice = response.choices?.[0];
  if (!choice) return '(No response from AI)';

  const msg = choice.message;

  // If no tool calls, return the text response
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return msg.content || '(empty response)';
  }

  // Execute tool calls
  history.push(msg); // push the assistant message with tool_calls

  for (const toolCall of msg.tool_calls) {
    const fn = toolCall.function;
    let args;
    try {
      args = JSON.parse(fn.arguments);
    } catch {
      args = {};
    }

    vlog(`Tool call: ${fn.name}(${JSON.stringify(args)})`);
    console.log(`  → ${fn.name}(${JSON.stringify(args).slice(0, 100)})`);
    const result = await executeTool(fn.name, args);
    vlog(`Tool result (${result.length} chars): ${result.slice(0, 500)}`);
    console.log(`  ← ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`);

    history.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result,
    });
  }

  // Continue the loop — let AI see tool results and decide next action
  return await standaloneChat(history);
}

function getApiConfig(providerName) {
  const cfg = config.providers;
  switch (providerName) {
    case 'openai':
    case 'codex':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.openai?.apiKey || cfg.codex?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.groq?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'deepseek':
      return {
        url: 'https://api.deepseek.com/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.deepseek?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'together':
      return {
        url: 'https://api.together.xyz/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.together?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'fireworks':
      return {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.fireworks?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'mistral':
      return {
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.mistral?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'xai':
      return {
        url: 'https://api.x.ai/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.xai?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'perplexity':
      return {
        url: 'https://api.perplexity.ai/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.perplexity?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    case 'copilot':
      return {
        url: `${cfg.copilot?.baseUrl || 'https://models.github.ai/inference'}/chat/completions`,
        headers: {
          'Authorization': `Bearer ${cfg.copilot?.token}`,
          'Content-Type': 'application/json',
        },
      };
    case 'ollama':
      return {
        url: `${cfg.ollama?.baseUrl || 'http://localhost:11434'}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
      };
    case 'nvidia-nim':
      return {
        url: `${cfg.nvidiaNim?.baseUrl || 'https://integrate.api.nvidia.com/v1'}/chat/completions`,
        headers: {
          'Authorization': `Bearer ${cfg.nvidiaNim?.apiKey}`,
          'Content-Type': 'application/json',
        },
      };
    default:
      return null; // Provider doesn't support OpenAI-compatible tool calling
  }
}

// --- Agent commands ---
async function handleAgentCommand(text, format = 'text') {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== 'agents') return null;

  const sub = parts[1];
  if (sub === 'status' || sub === 'list') {
    const results = [];
    for (const [name, b] of Object.entries(BRIDGES)) {
      const check = await checkBridge(name);
      const online = check.available;
      if (format !== 'text') {
        results.push({ bridge: name, port: b.port, status: online ? 'online' : 'offline' });
      } else {
        const status = online ? '🟢 online' : '⚫ offline';
        results.push(`  ${name.padEnd(10)} :${b.port}  ${status}`);
      }
    }
    if (format !== 'text') return formatOutput(results, format);
    return `Bridge Status:\n${results.join('\n')}`;
  }

  return null;
}

// --- REPL ---
async function startRepl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history = [{ role: 'system', content: SYSTEM_PROMPT }];
  let recursionDepth = 0;
  const MAX_RECURSION = 15; // max tool-calling rounds per turn

  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║          AI COMMS CLI — Interactive Mode          ║
  ╠══════════════════════════════════════════════════╣
  ║  Agent: ${(config.agent.name).padEnd(40)}║
  ║  Provider: ${(config.aiProvider).padEnd(37)}║
  ║  Tools: ${String(toolDefinitions.length).padEnd(40)}║
  ║  CWD: ${process.cwd().slice(0, 42).padEnd(42)}║
  ╠══════════════════════════════════════════════════╣
  ║  Type a task or /help for commands               ║
  ╚══════════════════════════════════════════════════╝
  `);

  const prompt = () => {
    rl.question('\x1b[36mYou:\x1b[0m ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      // Commands
      if (trimmed === '/quit' || trimmed === '/exit') {
        console.log('\nBye!');
        process.exit(0);
      }
      if (trimmed === '/help') { printHelp(); prompt(); return; }
      if (trimmed === '/clear') {
        history.length = 1; // keep system prompt
        console.log('  Conversation cleared.\n');
        prompt(); return;
      }
      if (trimmed === '/tools') {
        console.log('\n  Available tools:');
        for (const t of toolDefinitions) {
          console.log(`    ${t.function.name.padEnd(18)} ${t.function.description.slice(0, 60)}`);
        }
        console.log();
        prompt(); return;
      }
      if (trimmed === '/provider') {
        const p = config.aiProvider;
        const m = config.providers[p]?.model || 'default';
        console.log(`\n  Provider: ${p} (model: ${m})\n`);
        prompt(); return;
      }
      if (trimmed === '/bridges') {
        const result = await handleAgentCommand('agents status');
        console.log(`\n${result}\n`);
        prompt(); return;
      }
      if (trimmed.startsWith('/bridge ')) {
        const rest = trimmed.slice(8).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx === -1) {
          console.log('  Usage: /bridge <name> <task>\n');
          prompt(); return;
        }
        const bridgeName = rest.slice(0, spaceIdx);
        const task = rest.slice(spaceIdx + 1);
        await handleBridgeCommand(bridgeName, task);
        prompt(); return;
      }
      if (trimmed.startsWith('agents ')) {
        const result = await handleAgentCommand(trimmed);
        if (result) console.log(`\n${result}\n`);
        prompt(); return;
      }

      // Chat with tools
      history.push({ role: 'user', content: trimmed });
      console.log();
      recursionDepth = 0;

      try {
        const response = await standaloneChat(history);
        history.push({ role: 'assistant', content: response });
        console.log(`\n\x1b[32m${config.agent.name}:\x1b[0m ${response}\n`);
      } catch (err) {
        console.error(`\n  Error: ${err.message}\n`);
        history.pop(); // remove the failed user message
      }

      prompt();
    });
  };

  prompt();
}

async function handleBridgeCommand(name, task) {
  if (!BRIDGES[name]) {
    console.log(`  Unknown bridge: ${name}. Available: ${Object.keys(BRIDGES).join(', ')}\n`);
    return;
  }
  const check = await checkBridge(name);
  if (!check.available) {
    console.log(`  ⚫ ${name} bridge is offline (port ${BRIDGES[name].port})\n`);
    return;
  }
  console.log(`  → Sending to ${name} bridge...`);
  try {
    const response = await sendToBridge(name, task);
    console.log(`\n\x1b[33m[${name}]:\x1b[0m ${response}\n`);
  } catch (err) {
    console.log(`  Error: ${err.message}\n`);
  }
}

// --- Main ---
async function main() {
  const opts = parseArgs(process.argv);

  // Enable verbose globally
  if (opts.verbose) {
    verbose = true;
    vlog('Verbose mode enabled');
    vlog('Parsed args:', JSON.stringify(opts));
  }

  // Validate --format
  const validFormats = ['text', 'json', 'table', 'csv'];
  if (!validFormats.includes(opts.format)) {
    console.error(`Error: Invalid format "${opts.format}". Use: ${validFormats.join(', ')}`);
    process.exit(EXIT.USAGE);
  }

  if (opts.help) {
    printHelp();
    process.exit(EXIT.OK);
  }

  if (opts.version) {
    try {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
      console.log(`ai-comms v${pkg.version}`);
    } catch {
      console.log('ai-comms (version unknown)');
    }
    process.exit(EXIT.OK);
  }

  // Doctor command
  if (opts.doctor) {
    vlog('Running doctor diagnostics...');
    const checks = await runDoctor();
    printDoctorResults(checks, opts.format);
    const fails = checks.filter(c => c.status === 'FAIL').length;
    process.exit(fails ? EXIT.CONFIG : EXIT.OK);
  }

  // Agent commands (one-shot)
  if (opts.message && opts.message.startsWith('agents ')) {
    const result = await handleAgentCommand(opts.message, opts.format);
    if (result) console.log(result);
    process.exit(EXIT.OK);
  }

  // Bridge relay mode (one-shot)
  if (opts.bridge) {
    if (!opts.message) {
      console.error('Error: --bridge requires a message. Usage: ai-comms --bridge copilot "your task"');
      process.exit(EXIT.USAGE);
    }
    if (!BRIDGES[opts.bridge]) {
      console.error(`Error: Unknown bridge "${opts.bridge}". Available: ${Object.keys(BRIDGES).join(', ')}`);
      process.exit(EXIT.USAGE);
    }
    vlog(`Checking bridge: ${opts.bridge} on port ${BRIDGES[opts.bridge].port}`);
    const check = await checkBridge(opts.bridge);
    if (!check.available) {
      console.error(`Error: ${opts.bridge} bridge is offline (port ${BRIDGES[opts.bridge].port})`);
      process.exit(EXIT.UNAVAILABLE);
    }
    try {
      const response = await sendToBridge(opts.bridge, opts.message);
      console.log(response);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(EXIT.ERROR);
    }
    process.exit(EXIT.OK);
  }

  // One-shot standalone mode
  if (opts.message) {
    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: opts.message },
    ];
    try {
      vlog('Starting one-shot standalone chat...');
      const response = await standaloneChat(history);
      console.log(response);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(EXIT.ERROR);
    }
    process.exit(EXIT.OK);
  }

  // Interactive REPL (default)
  await startRepl();
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(EXIT.ERROR);
});
