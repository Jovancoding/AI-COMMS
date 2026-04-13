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
import config from './config.js';
import { chat } from './providers/index.js';
import { toolDefinitions, executeTool } from './cli-tools.js';
import { safeFetch } from './safe-fetch.js';

// --- Bridge configuration ---
const BRIDGES = {
  copilot:  { port: process.env.COPILOT_BRIDGE_PORT || 3120, token: process.env.COPILOT_BRIDGE_TOKEN || '' },
  claude:   { port: process.env.CLAUDE_CODE_BRIDGE_PORT || 3121, token: process.env.CLAUDE_CODE_BRIDGE_TOKEN || '' },
  codex:    { port: process.env.CODEX_BRIDGE_PORT || 3122, token: process.env.CODEX_BRIDGE_TOKEN || '' },
  cursor:   { port: process.env.CURSOR_BRIDGE_PORT || 3123, token: process.env.CURSOR_BRIDGE_TOKEN || '' },
};

// --- Parse arguments ---
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { bridge: null, help: false, version: false, message: null };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--help' || args[i] === '-h') {
      opts.help = true; i++;
    } else if (args[i] === '--version' || args[i] === '-v') {
      opts.version = true; i++;
    } else if (args[i] === '--bridge' || args[i] === '-b') {
      opts.bridge = args[i + 1]; i += 2;
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

  Options:
    -b, --bridge <name>    Route task to a specific bridge
    -h, --help             Show this help
    -v, --version          Show version

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
`);
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

    console.log(`  → ${fn.name}(${JSON.stringify(args).slice(0, 100)})`);
    const result = await executeTool(fn.name, args);
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
async function handleAgentCommand(text) {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== 'agents') return null;

  const sub = parts[1];
  if (sub === 'status' || sub === 'list') {
    const results = [];
    for (const [name, b] of Object.entries(BRIDGES)) {
      const check = await checkBridge(name);
      const status = check.available ? '🟢 online' : '⚫ offline';
      results.push(`  ${name.padEnd(10)} :${b.port}  ${status}`);
    }
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

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.version) {
    // Read version from package.json
    try {
      const { readFileSync } = await import('fs');
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
      console.log(`ai-comms v${pkg.version}`);
    } catch {
      console.log('ai-comms (version unknown)');
    }
    process.exit(0);
  }

  // Agent commands (one-shot)
  if (opts.message && opts.message.startsWith('agents ')) {
    const result = await handleAgentCommand(opts.message);
    if (result) console.log(result);
    process.exit(0);
  }

  // Bridge relay mode (one-shot)
  if (opts.bridge) {
    if (!opts.message) {
      console.error('Error: --bridge requires a message. Usage: ai-comms --bridge copilot "your task"');
      process.exit(1);
    }
    if (!BRIDGES[opts.bridge]) {
      console.error(`Error: Unknown bridge "${opts.bridge}". Available: ${Object.keys(BRIDGES).join(', ')}`);
      process.exit(1);
    }
    const check = await checkBridge(opts.bridge);
    if (!check.available) {
      console.error(`Error: ${opts.bridge} bridge is offline (port ${BRIDGES[opts.bridge].port})`);
      process.exit(1);
    }
    try {
      const response = await sendToBridge(opts.bridge, opts.message);
      console.log(response);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // One-shot standalone mode
  if (opts.message) {
    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: opts.message },
    ];
    try {
      const response = await standaloneChat(history);
      console.log(response);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Interactive REPL (default)
  await startRepl();
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
