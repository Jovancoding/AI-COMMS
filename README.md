<div align="center">

# AI COMMS

### Multi-Agent Communication Network

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/ai-comms?logo=npm&color=CB3837)](https://www.npmjs.com/package/ai-comms)
[![npm downloads](https://img.shields.io/npm/dw/ai-comms?logo=npm&color=CB3837)](https://www.npmjs.com/package/ai-comms)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green?logo=nodedotjs)](https://nodejs.org/)
[![Providers](https://img.shields.io/badge/AI%20Providers-18-blue?logo=openai)](src/providers/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Ready-25D366?logo=whatsapp&logoColor=white)](src/whatsapp/)
[![Telegram](https://img.shields.io/badge/Telegram-Ready-26A5E4?logo=telegram&logoColor=white)](src/telegram/)
[![Teams](https://img.shields.io/badge/Microsoft%20Teams-Ready-6264A7?logo=microsoftteams&logoColor=white)](src/teams/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Jovancoding/AI-COMMS/pulls)
[![RSS](https://img.shields.io/badge/RSS-Feed-FFA500?logo=rss&logoColor=white)](https://github.com/Jovancoding/AI-COMMS/releases.atom)

**Deploy AI agents that talk to each other — and to humans — over WhatsApp, Telegram, and Microsoft Teams. Connect multiple VS Code instances with Copilot. Build agent teams that span computers worldwide.**

[Quick Start](#-quick-start) · [Architecture](#-architecture) · [CLI](#-cli) · [Agent Hub](#-agent-hub) · [Multi-Agent](#-multi-agent-teams) · [Bridges](#-bridges) · [Security](#-security) · [Docs](#-documentation)

</div>

---

> **Disclaimer:** This software is provided "as is", without warranty of any kind, express or implied. Use at your own risk. You are solely responsible for compliance with the terms of service of any third-party platforms (WhatsApp, Telegram, Microsoft Teams, AI providers) and all applicable laws in your jurisdiction. The authors are not liable for any damages, data loss, account suspension, or costs arising from the use of this software. See [LICENSE](LICENSE) for full terms.

---

## What is AI COMMS?

AI COMMS is an agent communication network. It gives AI agents a way to talk to each other, to humans, and to VS Code — over messaging platforms people already use.

### Why not just use one AI session?

A single Copilot/Claude/ChatGPT session can only see one project at a time. Real work often spans multiple repos, machines, or locations:

| Scenario | Single Agent | AI COMMS |
|----------|-------------|----------|
| Edit API repo + React repo in one task | ❌ Can't hold both contexts | ✅ Each agent owns its repo, coordinated via hub |
| Dispatch work from your phone at a café | ❌ Must be at your desk | ✅ Send `!team` from WhatsApp, agents execute on your machines |
| 5 microservices need the same config change | ❌ Open each one manually | ✅ `!agents all update the Redis connection string to...` |
| Local LLMs on edge devices / IoT | ❌ Not designed for this | ✅ Each device runs an agent, hub coordinates globally |
| CI broke — you're on the train | ❌ Wait until you're home | ✅ `!copilot check the CI logs and fix the failing test` from Telegram |

The architecture isn't about distributing compute — it's about **context isolation** (each agent knows its own codebase), **remote access** (you don't need to be at your desk), and **coordination** (agents work in parallel on their own repos and combine results).

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Hub (Cloud)                      │
│             WebSocket relay · Agent registry                │
│             Task routing · Authentication                   │
└─────────┬───────────────┬──────────────────┬────────────────┘
          │               │                  │
   ┌──────┴──────┐ ┌──────┴──────┐  ┌───────┴──────┐
   │ Computer A  │ │ Computer B  │  │ Computer C   │
   │ VS Code x2  │ │ VS Code x1  │  │ VS Code x3   │
   │ Agent: back │ │ Agent: front│  │ Agent: devops│
   │ Agent: test │ │             │  │ Agent: data  │
   │ Copilot     │ │ Copilot     │  │ Agent: ml    │
   └──────┬──────┘ └──────┴──────┘  └───────┬──────┘
          │               │                  │
          └───────────────┼──────────────────┘
                          │
                  ┌───────┴───────┐
                  │  Messaging    │
                  │  WhatsApp     │
                  │  Telegram     │
                  │  Teams        │
                  └───────────────┘
                          │
                      Humans
```

- **Agents** are AI models running inside VS Code with GitHub Copilot
- **The Hub** connects agents across machines via WebSocket
- **Messaging platforms** let humans send tasks and receive results
- **The orchestrator** routes messages between all of them

---

## Features

| Feature | Description |
|---------|-------------|
| **18 AI Providers** | OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, xAI, Perplexity, Together, Fireworks, NVIDIA NIM, Ollama, Codex, Copilot, and more |
| **WhatsApp + Telegram + Teams** | Connect to any combination of platforms simultaneously |
| **Agent Hub** | WebSocket relay server — agents anywhere in the world connect and collaborate |
| **Multi-Agent Teams** | Multiple VS Code instances work together: parallel tasks, team decomposition, broadcast |
| **5 IDE Bridges** | Copilot (VS Code), Claude Code, Codex, Cursor, and OpenClaw — route tasks from WhatsApp to any IDE or AI agent |
| **CLI** | Full computer control from your terminal — standalone mode with 12 native tools, or relay to any bridge |
| **Agent Protocol** | Structured JSON messaging between agents with HMAC signatures |
| **E2E Encryption** | AES-256-GCM encrypted payloads between agents |
| **Jailbreak Defense** | 6-layer prompt injection protection |
| **Auto Failover** | Provider goes down? Fallback chain activates automatically |
| **Health Monitoring** | HTTP endpoints for load balancers and Docker |
| **Audit Logging** | Every security event logged to disk with rotation |
| **Docker Ready** | Single command deployment |

---

## Quick Start

```bash
git clone https://github.com/Jovancoding/AI-COMMS.git
cd AI-COMMS
npm install
cp .env.example .env
```

Edit `.env` — set your AI provider and at least one messaging platform:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
PLATFORM=telegram
TELEGRAM_BOT_TOKEN=your-bot-token
```

Start:

```bash
npm start
```

For WhatsApp (Baileys mode), scan the QR code in your terminal. For Telegram, the bot connects automatically via long-polling.

**CLI mode** (no messaging platform needed):

```bash
# Interactive REPL with AI + tools
npm run cli

# One-shot task
npx ai-comms "find all TODO comments in src/ and list them"

# Relay to a running bridge
npx ai-comms --bridge copilot "fix the failing test"
```

> **Token Safety:** Never commit your `.env` file. It contains API keys and tokens. The `.gitignore` already excludes it, but always verify before pushing. Rotate any tokens that may have been exposed. Set spending limits on all AI provider accounts.

---

## Architecture

```
src/
├── index.js              # Entry — multi-platform startup, graceful shutdown
├── orchestrator.js       # Message routing: security → copilot bridge → AI → response
├── config.js             # All environment variable mappings
├── multi-agent.js        # Multi-agent coordinator — discovery, routing, teams
├── cli.js                # CLI entry point — REPL, one-shot, bridge relay
├── cli-tools.js          # 12 native tools — file, shell, HTTP, search, system
├── copilot-bridge.js     # Copilot Bridge client — sends tasks to VS Code extension
├── claude-code-bridge.js # Claude Code Bridge client — sends tasks to Claude Code CLI
├── codex-bridge.js       # Codex Bridge client — sends tasks to OpenAI Codex CLI
├── cursor-bridge.js      # Cursor Bridge client — sends tasks to Cursor IDE
├── openclaw-bridge.js    # OpenClaw Bridge client — sends tasks to OpenClaw Gateway
├── protocol.js           # Agent-to-agent JSON protocol + HMAC signing
├── groups.js             # Multi-agent group management
├── storage.js            # JSON persistence with atomic writes
├── security.js           # Allowlist, rate limiting, HMAC verification
├── jailbreak-defense.js  # 6-layer prompt injection defense
├── encryption.js         # AES-256-GCM payload encryption
├── failover.js           # Provider failover chain
├── remote-agent.js       # Execute tasks via messaging (!do, !task)
├── health.js             # HTTP /health + /ready endpoints
├── discovery.js          # Agent registry + announcements
├── admin.js              # Admin commands (!status, !logs, !security)
├── media.js              # Image/audio/video/document handler
├── audit-log.js          # Persistent event logging with rotation
├── safe-fetch.js         # Fetch wrapper with timeouts
├── startup-checks.js     # Boot-time security validation
├── test-suite.js         # Automated test suite
├── whatsapp/
│   ├── baileys-client.js    # WhatsApp via QR scan (free, local)
│   └── cloud-api-client.js  # WhatsApp via Meta Cloud API (official)
├── telegram/
│   └── telegram-client.js   # Telegram Bot API (polling + webhook)
├── teams/
│   └── teams-client.js      # Microsoft Teams Bot Framework
└── providers/               # 18 AI provider adapters

hub/
└── server.js             # WebSocket Agent Hub — global relay server
```

---

## CLI

Full computer control from your terminal. Two modes:

**Standalone** — The AI has 12 native tools (read/write files, run shell commands, search code, HTTP requests, system info). No IDE or bridge needed.

**Bridge relay** — Route tasks to a running Copilot, Claude Code, Codex, or Cursor bridge.

### Install globally

```bash
npm install -g ai-comms
```

### Interactive REPL

```bash
ai-comms
```
```
╔══════════════════════════════════════════════════╗
║          AI COMMS CLI — Interactive Mode          ║
╠══════════════════════════════════════════════════╣
║  Agent: MyAI                                     ║
║  Provider: openai                                ║
║  Tools: 12                                       ║
╚══════════════════════════════════════════════════╝

You: find all files importing express and list them
  → grep({"pattern": "import.*express", "directory": "."})
  ← src/index.js:5: import express from 'express'...

MyAI: Found 1 file importing express: src/index.js (line 5)
```

### One-shot tasks

```bash
ai-comms "run the tests and fix any failures"
ai-comms "list all TODO comments in src/"
ai-comms "create a .gitignore for a Node.js project"
```

### Bridge relay

```bash
ai-comms --bridge copilot "add error handling to all API endpoints"
ai-comms --bridge claude "refactor auth module to use JWT"
ai-comms --bridge codex "generate TypeScript types from schema.json"
ai-comms --bridge cursor "fix the lint warnings in server.js"
ai-comms --bridge openclaw "summarize today's messages"
```

### Agent management

```bash
ai-comms agents status
```
```
Bridge Status:
  copilot    :3120  🟢 online
  claude     :3121  ⚫ offline
  codex      :3122  ⚫ offline
  cursor     :3123  🟢 online
  openclaw   :3124  ⚫ offline
```

### REPL commands

| Command | Description |
|---------|-------------|
| `/bridge <name> <task>` | Relay to a bridge from REPL |
| `/bridges` | Show bridge status |
| `/tools` | List available tools |
| `/provider` | Show active AI provider |
| `/clear` | Clear conversation history |
| `/help` | Show help |
| `/quit` | Exit |

### Diagnostics

```bash
ai-comms doctor
```
```
  AI COMMS Doctor
  ========================================
  ✔ Node.js              v22.1.0
  ✔ .env file             found
  ✔ AI provider           openai — key configured
  ✔ Model                 gpt-5-mini
  ✔ API connectivity      openai — reachable
  ! Bridge: copilot       port 3120 — offline
  ! Bridge: claude        port 3121 — offline
  ✔ npm                   10.8.0

  All checks passed
```

### Output formats

```bash
ai-comms -f json agents status        # JSON output
ai-comms -f csv agents status         # CSV output
ai-comms -f table agents status       # Table output
ai-comms -f json doctor               # Doctor results as JSON
```

### Verbose mode

```bash
ai-comms -v "debug this issue"        # Enable verbose logging
```

### Exit codes

| Code | Name | Meaning |
|------|------|---------|
| `0` | OK | Success |
| `1` | ERROR | General error |
| `2` | USAGE | Bad usage / invalid arguments |
| `66` | NOINPUT | Input data missing |
| `69` | UNAVAILABLE | Service unavailable (bridge offline) |
| `77` | NOPERM | Permission / auth failure |
| `78` | CONFIG | Configuration error |

### Native tools (standalone mode)

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `append_file` | Append to files |
| `list_directory` | List directory contents |
| `search_files` | Find files by name pattern |
| `grep` | Search text inside files |
| `run_command` | Execute shell commands |
| `file_info` | Get file metadata |
| `move_file` | Move/rename files |
| `delete_file` | Delete files |
| `http_request` | Make HTTP requests |
| `system_info` | Get OS/CPU/memory info |

---

## Agent Hub

The Agent Hub is a lightweight WebSocket relay server that connects agents across machines, networks, and continents. Any agent running the Copilot Bridge extension can register with the hub and become available to the entire network.

### Start the Hub

```bash
# Set a shared secret (required)
export HUB_SECRET=your-secret-here

# Start the hub
npm run hub
```

The hub runs on port 8090 by default.

### Hub REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Hub status, connected agent count |
| `/agents` | GET | List all registered agents and their skills |
| `/task` | POST | Route a task to a specific agent by name |
| `/broadcast` | POST | Send a task to all connected agents |

### Connecting Agents

On each machine running a VS Code agent, set these in `.env`:

```bash
AGENT_HUB_URL=http://your-hub-server:8090
AGENT_HUB_SECRET=your-secret-here
```

The Copilot Bridge extension auto-connects to the hub on startup and registers with its name and skills.

### How It Works

```
Agent "backend" (NYC)  ──WebSocket──┐
                                     │
Agent "frontend" (London) ──WS───── Hub (Cloud VPS) ──── Bot (WhatsApp/Telegram)
                                     │
Agent "devops" (Tokyo) ──WebSocket──┘
```

- Agents maintain persistent WebSocket connections with heartbeat (30s interval)
- Dead agents auto-cleaned after 90s timeout
- Tasks routed by agent name or broadcast to all
- All traffic authenticated with `HUB_SECRET`

### Hub Configuration

| Variable | Default | Description |
|---|---|---|
| `HUB_SECRET` | *(required)* | Shared secret for agent authentication |
| `HUB_PORT` | `8090` | Port to listen on |
| `HUB_MAX_AGENTS` | `50` | Maximum concurrent agent connections |
| `HUB_MAX_PER_IP` | `5` | Maximum WebSocket connections per IP address |
| `HUB_LOG_LEVEL` | `info` | Logging verbosity |
| `HUB_ALLOWED_ORIGINS` | localhost only | Comma-separated CORS origins (e.g. `https://yourdomain.com`) |
| `TLS_CERT_PATH` | *(none)* | Path to TLS certificate for HTTPS |
| `TLS_KEY_PATH` | *(none)* | Path to TLS private key for HTTPS |

---

## Multi-Agent Teams

Run multiple VS Code instances on one computer — or across many — and have them collaborate as a team.

### Setup Options

**Option A — Local ports (simplest)**

```bash
MULTI_AGENT_PORTS=3120,3121,3122
```

Each port is a VS Code instance with the Copilot Bridge extension.

**Option B — Named registry with skills**

```bash
MULTI_AGENT_REGISTRY=[
  {"name":"backend","url":"http://127.0.0.1:3120","skills":["api","backend"]},
  {"name":"frontend","url":"http://127.0.0.1:3121","skills":["ui","css"]},
  {"name":"testing","url":"http://127.0.0.1:3122","skills":["qa","tests"]}
]
```

**Option C — Via Agent Hub (global)**

```bash
AGENT_HUB_URL=http://your-hub:8090
AGENT_HUB_SECRET=your-secret
```

### Commands (from WhatsApp/Telegram)

| Command | Description |
|---------|-------------|
| `!claude <task>` / `!cc <task>` | Send task to Claude Code bridge |
| `!codex <task>` / `!cx <task>` | Send task to Codex bridge |
| `!cursor <task>` / `!cu <task>` | Send task to Cursor bridge |
| `!claw <task>` / `!oc <task>` | Send task to OpenClaw bridge |
| `!agents status` | List all agents with health status |
| `!agents list` | Show agent names and skills |
| `!agents send <name> <task>` | Send a task to a specific agent |
| `!agents all <task>` | Broadcast a task to all agents |
| `!team <complex task>` | Auto-decompose and distribute task to best agents |

### Team Task Decomposition

The coordinator analyzes your task, matches subtasks to agents by skill, and runs them in parallel.

**Example: Multi-repo feature rollout**

You have 3 VS Code windows open — `api-server`, `web-dashboard`, `mobile-app`. From your phone:

```
You (WhatsApp): !team add a /health endpoint to the API,
                show its status on the web dashboard,
                and display it in the mobile app settings screen
```

```
Coordinator decomposes → 3 subtasks:
  1. Agent "api-server"    → adds GET /health route         (parallel)
  2. Agent "web-dashboard" → adds status widget to dashboard (parallel)
  3. Agent "mobile-app"    → adds health check to settings   (parallel)

All 3 run simultaneously in their own VS Code workspaces.
Combined result returned to your WhatsApp in ~40 seconds.
```

Each agent edits files *in its actual project* — something a single AI session can't do across repos.

**Example: Remote debugging from your phone**

```
You (Telegram): !copilot the API tests are failing, check the logs and fix it
```

Copilot reads test output, finds the bug, edits the file, re-runs tests — all while you're on the train.

**Example: Edge / IoT coordination**

Local LLMs running on Raspberry Pis, NVIDIA Jetsons, or any device with Node.js. Each registers with the hub as an agent. Coordinate sensor data processing, firmware updates, or distributed inference from a single WhatsApp message.

---

## Bridges

AI COMMS supports 5 IDE/AI bridges — each connects a different coding agent to your WhatsApp/Telegram messages via a local HTTP server.

### How Bridges Work

```
WhatsApp/Telegram ──► Bot (Node.js) ──┬── Copilot Bridge  (VS Code,     :3120)
                                      ├── Claude Code     (CLI agent,   :3121)
                                      ├── Codex           (CLI agent,   :3122)
                                      ├── Cursor          (Cursor IDE,  :3123)
                                      └── OpenClaw        (Personal AI, :3124)
```

1. A message arrives on WhatsApp or Telegram with a prefix (`!copilot`, `!claude`, `!codex`, `!cursor`, `!claw`)
2. The orchestrator routes it to the matching bridge's HTTP endpoint
3. The bridge forwards it to the IDE/CLI agent
4. The agent processes the request (file edits, terminal, tools, etc.)
5. The response flows back through the messaging platform

### Copilot Bridge (VS Code)

The Copilot Bridge is a VS Code extension that turns GitHub Copilot into an agent with real capabilities — file ops, terminal, browser, screen control.

| Prefix | Example |
|--------|---------|
| `!copilot` / `!cp` | `!copilot fix the failing test in auth.ts` |

```bash
COPILOT_BRIDGE_PORT=3120
COPILOT_BRIDGE_TOKEN=your-shared-token
COPILOT_BRIDGE_AUTO_ROUTE=false
```

Start via VS Code Command Palette → **"Copilot Bridge: Start Server"**.

### Claude Code Bridge

Routes tasks to the Claude Code CLI agent. Claude Code excels at multi-step coding tasks with extended thinking.

| Prefix | Example |
|--------|---------|
| `!claude` / `!cc` | `!claude refactor the auth module to use JWT` |

```bash
CLAUDE_CODE_BRIDGE_PORT=3121
CLAUDE_CODE_BRIDGE_TOKEN=your-shared-token
```

### Codex Bridge

Routes tasks to the OpenAI Codex CLI agent. Codex is optimized for code generation and understanding.

| Prefix | Example |
|--------|---------|
| `!codex` / `!cx` | `!codex generate TypeScript types from this JSON schema` |

```bash
CODEX_BRIDGE_PORT=3122
CODEX_BRIDGE_TOKEN=your-shared-token
```

### Cursor Bridge

Routes tasks to a Cursor IDE instance. Cursor provides AI-powered code editing with its own agent.

| Prefix | Example |
|--------|---------|
| `!cursor` / `!cu` | `!cursor add error handling to all API endpoints` |
| `!claw` / `!oc` | `!claw ship checklist for the release` |

```bash
CURSOR_BRIDGE_PORT=3123
CURSOR_BRIDGE_TOKEN=your-shared-token
```

### OpenClaw Bridge

Routes tasks to a running OpenClaw Gateway. OpenClaw is a personal AI assistant that runs on your own devices with multi-channel support.

| Prefix | Example |
|--------|--------|
| `!claw` / `!oc` | `!claw summarize today's messages and draft a reply` |

```bash
OPENCLAW_BRIDGE_PORT=3124
OPENCLAW_BRIDGE_TOKEN=your-shared-token
```

Requires OpenClaw running: `openclaw gateway --port 18789`

### Bridge API Contract

All bridges share the same HTTP contract — any server implementing these endpoints can plug in:

```
GET  /health          → 200 OK
POST /chat            → { "message": "...", "sender": "..." }
                      ← { "response": "..." }
```

---

## 18 AI Providers

Switch providers with a single environment variable. Every provider has fetch timeouts, error handling, and automatic failover.

| Provider | Model | Env Key |
|----------|-------|---------|
| **OpenAI** | GPT-4o | `OPENAI_API_KEY` |
| **Anthropic** | Claude Sonnet 4 | `ANTHROPIC_API_KEY` |
| **Google** | Gemini 2.0 Flash | `GOOGLE_API_KEY` |
| **Mistral** | Mistral Large | `MISTRAL_API_KEY` |
| **Cohere** | Command R+ | `COHERE_API_KEY` |
| **Groq** | LLaMA 3.3 70B | `GROQ_API_KEY` |
| **DeepSeek** | DeepSeek Chat | `DEEPSEEK_API_KEY` |
| **xAI** | Grok 2 | `XAI_API_KEY` |
| **Perplexity** | Sonar Pro | `PERPLEXITY_API_KEY` |
| **Together AI** | LLaMA 3 70B | `TOGETHER_API_KEY` |
| **Fireworks** | LLaMA 3.1 70B | `FIREWORKS_API_KEY` |
| **NVIDIA NIM** | Nemotron 3 Super | `NVIDIA_API_KEY` |
| **Ollama** | LLaMA 3 (local) | `OLLAMA_BASE_URL` |
| **Codex** | o4-mini | `CODEX_API_KEY` |
| **GitHub Copilot** | GPT-4o via GitHub | `COPILOT_TOKEN` |
| **Claude Code** | Claude + thinking | `CLAUDE_CODE_API_KEY` |
| **Claude Cowork** | Claude + collab | `CLAUDE_COWORK_API_KEY` |
| **OpenClaw** | Any (self-hosted) | `OPENCLAW_BASE_URL` |

### Failover

```bash
AI_PROVIDER=openai
AI_FALLBACK_PROVIDERS=anthropic,google,groq
```

If OpenAI fails → tries Anthropic → tries Google → tries Groq. Automatic.

> **Cost Warning:** AI provider API calls consume tokens and may incur costs. Monitor your provider dashboards. Some providers offer free-tier models (e.g., GitHub Copilot with GPT-4o mini). Always set spending limits on your accounts.

---

## Security

AI COMMS was designed with security as a first-class concern.

```
Incoming Message
       │
       ▼
┌──────────────┐
│  Allowlist   │──► Block unknown senders (silent drop)
├──────────────┤
│  Rate Limit  │──► Block message flooding
├──────────────┤
│  Size Check  │──► Block oversized payloads
├──────────────┤
│  HMAC Auth   │──► Verify agent identity (timing-safe comparison)
├──────────────┤
│  Jailbreak   │──► Block prompt injection (6 layers)
│  Defense     │    · Pattern matching (40+ signatures)
│              │    · Encoding detection (base64, hex, reversed)
│              │    · Persona hijack blocking
│              │    · System prompt extraction prevention
│              │    · Multi-turn escalation tracking
│              │    · Output validation
├──────────────┤
│  Encryption  │──► AES-256-GCM + HMAC-SHA256
├──────────────┤
│  Audit Log   │──► All events logged to disk
└──────────────┘
```

### Quick Security Setup

```bash
# Restrict who can message the bot
SECURITY_ENABLE_ALLOWLIST=true
SECURITY_ALLOWLIST=+1234567890,+0987654321

# Block prompt injection attacks
SECURITY_BLOCK_PROMPT_INJECTION=true

# Require agent authentication
SECURITY_REQUIRE_AGENT_AUTH=true

# Generate secrets
SECURITY_AGENT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SECURITY_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Security Hardening (Built-In)

These protections are implemented across the codebase:

| Protection | Component | Description |
|---|---|---|
| **Timing-safe secret comparison** | Hub, Security | `crypto.timingSafeEqual()` for all secret/token checks — prevents timing attacks |
| **Request body size limit** | Hub | 1 MB max on all HTTP POST bodies — prevents memory exhaustion |
| **WebSocket payload limit** | Hub | 1 MB max per message frame — prevents DoS |
| **CORS lockdown** | Hub | Origin allowlist (default: localhost only) — prevents cross-origin attacks |
| **Per-IP connection limit** | Hub | Max 5 WebSocket connections per IP — prevents fake agent flooding |
| **Broadcast rate limit** | Hub | 10-second cooldown between broadcasts — prevents agent spam |
| **TLS support** | Hub | Optional HTTPS via `TLS_CERT_PATH` + `TLS_KEY_PATH` |
| **Sanitized API responses** | Hub | `/agents` endpoint excludes internal metadata (timestamps, workspace paths) |
| **Bridge authentication** | All 4 bridges | Optional token auth (`*_BRIDGE_TOKEN`) for bot-to-agent auth |
| **Auto-route opt-in** | Orchestrator | `COPILOT_BRIDGE_AUTO_ROUTE=false` by default — requires explicit `!copilot` prefix |
| **URL validation** | Multi-Agent | Agent registry URLs validated (protocol check, SSRF prevention) |
| **Task plan limits** | Multi-Agent | Max 20 subtasks per team decomposition, 10K chars per task message |
| **Media size limit** | Media Handler | 50 MB default (configurable via `MAX_MEDIA_SIZE`) — prevents disk exhaustion |
| **Silent drop** | Orchestrator | Unauthorized human senders get no response — prevents enumeration |

### Production Security Checklist

- [ ] `SECURITY_ENABLE_ALLOWLIST=true` with specific phone numbers
- [ ] `SECURITY_BLOCK_PROMPT_INJECTION=true`
- [ ] `SECURITY_REQUIRE_AGENT_AUTH=true`
- [ ] `HUB_SECRET` is 32+ random characters, unique per deployment
- [ ] `TLS_CERT_PATH` and `TLS_KEY_PATH` set for HTTPS on the hub
- [ ] `HUB_ALLOWED_ORIGINS` set to your domain(s)
- [ ] `COPILOT_BRIDGE_TOKEN` set if using the bridge
- [ ] `COPILOT_BRIDGE_AUTO_ROUTE=false` (use explicit `!copilot` prefix)
- [ ] All AI provider API keys rotated and spending limits set
- [ ] `.env` not committed (verify with `git status`)
- [ ] Audit logs monitored for security events
- [ ] Webhook signatures verified (WhatsApp Cloud API / Teams)
- [ ] Secrets rotated regularly (monthly recommended)

### Security Recommendations

1. **Always enable allowlist in production** — only authorized senders can interact
2. **Enable prompt injection blocking** — `SECURITY_BLOCK_PROMPT_INJECTION=true`
3. **Require agent auth** for multi-agent networks — prevents impersonation
4. **Use unique secrets** — never reuse `HUB_SECRET`, `SECURITY_AGENT_SECRET`, or `SECURITY_ENCRYPTION_KEY`
5. **Enable TLS on the hub** — all agent traffic should be encrypted in transit
6. **Rotate tokens regularly** — especially after any suspected exposure
7. **Never commit `.env`** — it contains all your secrets
8. **Set spending limits** on all AI provider accounts

---

## Agent Protocol

Agents communicate using a structured JSON envelope:

```json
{
  "protocol": "ai-comms",
  "version": "1.0",
  "from": { "agentId": "agent_001", "agentName": "Atlas" },
  "to": { "agentId": "agent_002", "agentName": "Nova" },
  "intent": "chat",
  "payload": "What is the deployment status?",
  "conversationId": "conv_abc123",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

Messages are signed with HMAC-SHA256 and optionally encrypted with AES-256-GCM. Replay attacks are blocked by timestamp validation.

---

## Admin Commands

Control your agent from WhatsApp or Telegram:

| Command | Description |
|---------|-------------|
| `!status` | Agent status, uptime, memory |
| `!groups` | List multi-agent groups |
| `!agents status` | Show all network agents |
| `!agents send <name> <task>` | Route task to specific agent |
| `!team <task>` | Distribute across team |
| `!logs 20` | Recent audit log entries |
| `!provider` | Current AI provider and model |
| `!security` | Security configuration |
| `!help` | All commands |

---

## Deployment

### Docker (recommended)

```bash
docker compose up -d
```

### PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### Manual

```bash
NODE_ENV=production node src/index.js
```

### Hub Server

```bash
HUB_SECRET=your-secret npm run hub
```

### Health Check

```bash
curl http://localhost:9090/health
```

---

## Tests

```bash
npm test
```

Covers config loading, protocol building, encryption roundtrips, jailbreak defense, groups, storage, failover, rate limiting, and more.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](docs/SETUP.md) | Step-by-step for WhatsApp, Telegram, Teams, Docker, PM2 |
| [Providers Guide](docs/PROVIDERS.md) | Configure each of the 18 AI providers |
| [Security Guide](docs/SECURITY.md) | Allowlists, encryption, jailbreak defense, audit logging |
| [Multi-Agent Guide](docs/MULTI-AGENT.md) | Agent teams, hub setup, task routing |

---

## Environment Variables

See [.env.example](.env.example) for the complete list with descriptions and defaults.

---

## Contributing

Contributions are welcome. Open an issue or PR for:

- New AI provider adapters
- New messaging platform integrations
- Security improvements
- Bug fixes

```bash
git clone https://github.com/Jovancoding/AI-COMMS.git
cd AI-COMMS
npm install
npm test
```

---

## License

[MIT](LICENSE)

---

<div align="center">

**This software is provided as-is. Use at your own risk.**

**Always protect your API keys, tokens, and secrets. Never commit credentials to version control.**

</div>
