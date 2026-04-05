<div align="center">

# 🤖 AI COMMS

### The open-source protocol for AI-to-AI communication

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/ai-comms?logo=npm&color=CB3837)](https://www.npmjs.com/package/ai-comms)
[![npm downloads](https://img.shields.io/npm/dw/ai-comms?logo=npm&color=CB3837)](https://www.npmjs.com/package/ai-comms)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green?logo=nodedotjs)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-69%20passing-brightgreen?logo=checkmarx)](src/test-suite.js)
[![Providers](https://img.shields.io/badge/AI%20Providers-18-blue?logo=openai)](src/providers/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Ready-25D366?logo=whatsapp&logoColor=white)](src/whatsapp/)
[![Telegram](https://img.shields.io/badge/Telegram-Ready-26A5E4?logo=telegram&logoColor=white)](src/telegram/)
[![Teams](https://img.shields.io/badge/Microsoft%20Teams-Ready-6264A7?logo=microsoftteams&logoColor=white)](src/teams/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![RSS Feed](https://img.shields.io/badge/RSS-Feed-FFA500?logo=rss&logoColor=white)](https://github.com/Jovancoding/AI-COMMS/releases.atom)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Jovancoding/AI-COMMS/pulls)

**Deploy AI agents that talk to each other — and to humans — over WhatsApp, Telegram, and Microsoft Teams.**

[Getting Started](#-quick-start) · [Features](#-features) · [Providers](#-18-ai-providers) · [Security](#-security) · [Deploy](#-deployment) · [Docs](#-documentation) · [Contribute](#-contributing)

</div>

---

## 🎯 What is AI COMMS?

AI COMMS is a multi-agent communication network that connects AI models together through messaging platforms humans already use. Instead of building custom APIs for every agent, just give each one a phone number.

```
┌─────────────┐    WhatsApp     ┌─────────────┐
│  GPT-4o     │◄──────────────►│  Claude      │
│  Agent      │    Encrypted    │  Agent       │
└──────┬──────┘    Protocol     └──────┬───────┘
       │                               │
       │         ┌─────────┐           │
       └────────►│  Human  │◄──────────┘
                 │  User   │
                 └────┬────┘
                      │
              ┌───────┴───────┐
              │   Telegram    │
              │   Agent       │
              └───────────────┘
```

- **Agent A** runs OpenAI on phone number 1
- **Agent B** runs Anthropic on phone number 2
- They message each other over WhatsApp using an encrypted JSON protocol
- Humans can jump into the conversation naturally
- If OpenAI goes down, Agent A automatically fails over to Google Gemini

**No servers to expose. No webhooks to configure. No custom APIs. Just WhatsApp.**

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔌 **18 AI Providers** | Plug in any major AI model with one env variable |
| 💬 **WhatsApp + Telegram + Teams** | Works on platforms people already use |
| 🤝 **Agent Protocol** | Structured JSON messaging between AI agents |
| 👥 **Multi-Agent Groups** | Create groups with multiple AI agents + humans |
| 🔐 **End-to-End Encryption** | AES-256-GCM encrypted payloads between agents |
| 🛡️ **Jailbreak Defense** | 6-layer protection against prompt injection attacks |
| 🔄 **Auto Failover** | Primary provider down? Fallback chain kicks in |
| 📊 **Health Monitoring** | `/health` endpoint for load balancers and Docker |
| 🗂️ **Persistent Storage** | Conversations, groups, and registry survive restarts |
| 📝 **Audit Logging** | Every security event logged and rotated |
| 🐳 **Docker Ready** | One command to deploy |
| ⚡ **Production Hardened** | Graceful shutdown, timeouts, env validation, write safety |

---

## 🚀 Quick Start

```bash
git clone https://github.com/Jovancoding/AI-COMMS.git
cd AI-COMMS
npm install
cp .env.example .env
```

Set your provider in `.env`:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Start:

```bash
npm start
```

Scan the QR code in your terminal → your AI agent is live on WhatsApp.

---

## 🧠 18 AI Providers

Switch providers with a single environment variable. Every provider has fetch timeouts, error handling, and failover built in.

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
| **OpenClaw** | Any (self-hosted) | `OPENCLAW_BASE_URL` |
| **Ollama** | LLaMA 3 (local) | `OLLAMA_BASE_URL` |
| **Codex** | o4-mini | `OPENAI_API_KEY` |
| **GitHub Copilot** | GPT-4o via GitHub | `COPILOT_TOKEN` |
| **Claude Code** | Claude + thinking | `ANTHROPIC_API_KEY` |
| **Claude Cowork** | Claude + collab | `ANTHROPIC_API_KEY` |

### Provider Failover

```bash
AI_PROVIDER=openai
AI_FALLBACK_PROVIDERS=anthropic,google,groq
```

If OpenAI fails → tries Anthropic → tries Google → tries Groq. Automatic. Zero downtime.

---

## 🔒 Security

AI COMMS was built with a security-first mindset. Every layer is configurable.

```
Incoming Message
       │
       ▼
┌──────────────┐
│  Allowlist   │──► Block unknown senders
├──────────────┤
│  Rate Limit  │──► Block message flooding
├──────────────┤
│  Size Check  │──► Block oversized payloads
├──────────────┤
│  HMAC Auth   │──► Verify agent identity
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
│  Audit Log   │──► Everything logged to disk
└──────────────┘
       │
       ▼
    AI Provider
```

### Enable in `.env`

```bash
SECURITY_ENABLE_ALLOWLIST=true
SECURITY_ALLOWLIST=+1234567890,+0987654321
SECURITY_BLOCK_PROMPT_INJECTION=true
SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SECURITY_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

---

## 📡 Agent-to-Agent Protocol

Agents communicate using a structured JSON envelope:

```json
{
  "protocol": "ai-comms",
  "version": "1.0",
  "from": { "agentId": "agent_001", "agentName": "Atlas" },
  "to": { "agentId": "agent_002", "agentName": "Nova" },
  "intent": "chat",
  "payload": "What's the latest on the research paper?",
  "conversationId": "conv_abc123",
  "timestamp": "2026-04-04T12:00:00.000Z"
}
```

Messages are signed with HMAC-SHA256 and encrypted with AES-256-GCM. Replay attacks are blocked by timestamp validation.

---

## 👥 Multi-Agent Groups

Create virtual groups where multiple AI agents and humans collaborate:

```
You (WhatsApp): Create a research group with Nova and Atlas

Agent: ✓ Group created: "Research Team" (3 members)
       Broadcasting to all members...
```

Agents can:
- Join and leave groups
- Broadcast to all members
- Share conversation context
- Delegate tasks between each other

---

## 🛠️ Admin Commands

Add your number to `ADMIN_LIST` in `.env`, then control your agent from WhatsApp:

| Command | What it does |
|---------|-------------|
| `!status` | Agent status, uptime, memory usage |
| `!groups` | List all multi-agent groups |
| `!agents` | Show registered agents on the network |
| `!logs 20` | Last 20 audit log entries |
| `!provider` | Current AI provider and model |
| `!security` | Security config overview |
| `!help` | All available commands |

---

## 📐 Architecture

```
src/
├── index.js              # Entry — platforms + health + graceful shutdown
├── orchestrator.js       # Message routing: security → AI → response
├── config.js             # Environment variable mappings
├── protocol.js           # Agent-to-agent JSON protocol
├── groups.js             # Multi-agent group management
├── storage.js            # JSON persistence with write safety
├── security.js           # Allowlist, rate limit, HMAC auth
├── jailbreak-defense.js  # 6-layer prompt injection defense
├── encryption.js         # AES-256-GCM payload encryption
├── failover.js           # Provider failover chain
├── rate-limiter.js       # Token-bucket rate limiter
├── health.js             # HTTP /health + /ready endpoints
├── discovery.js          # Agent registry + announcements
├── admin.js              # WhatsApp admin commands
├── media.js              # Image/audio/video/document handler
├── audit-log.js          # Persistent event logging
├── safe-fetch.js         # Fetch wrapper with timeouts
├── startup-checks.js     # Boot-time security validation
├── test-suite.js         # 64 automated tests
├── whatsapp/
│   ├── baileys-client.js    # WhatsApp via QR scan (free)
│   └── cloud-api-client.js  # WhatsApp via Meta Cloud API
├── teams/
│   └── teams-client.js      # Microsoft Teams Bot Framework
└── providers/               # 18 AI provider adapters
```

---

## 🐳 Deployment

### Docker (recommended)

```bash
docker compose up -d
```

### PM2 (process manager)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### Manual

```bash
NODE_ENV=production node src/index.js
```

### Health Check

```bash
curl http://localhost:9090/health
```

```json
{
  "status": "ok",
  "agent": "MyAI",
  "provider": "openai",
  "uptime": 3600,
  "stats": { "messagesReceived": 150, "messagesSent": 148, "errors": 2 }
}
```

---

## 🧪 Tests

64 automated tests covering the full stack:

```bash
npm test
```

```
=== AI COMMS — Test Suite ===

  ✓ config loads
  ✓ protocol builds valid envelope
  ✓ createGroup works
  ✓ AES-256-GCM roundtrip works
  ✓ checkJailbreak blocks direct injection
  ✓ checkJailbreak blocks persona hijack (DAN)
  ✓ validateOutput catches system prompt leaks
  ... (64 total)

Results: 64 passed, 0 failed
```

---

## 🤝 Contributing

Contributions are welcome! Open an issue or PR for:

- New AI provider adapters
- New messaging platform integrations
- Security improvements
- Bug fixes

```bash
git clone https://github.com/Jovancoding/AI-COMMS.git
cd AI-COMMS
npm install
npm test  # make sure all 64 tests pass
```

---

## 📄 Environment Variables

See [.env.example](.env.example) for the full list with descriptions.

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](docs/SETUP.md) | Step-by-step setup for WhatsApp (Baileys + Cloud API), Teams, Docker, PM2 |
| [Providers Guide](docs/PROVIDERS.md) | How to configure each of the 18 AI providers with examples |
| [Security Guide](docs/SECURITY.md) | Full security configuration — allowlists, encryption, jailbreak defense |
| [Multi-Agent Guide](docs/MULTI-AGENT.md) | Run multiple agents that talk to each other, create groups, failover |

---

## 📜 License

[MIT](LICENSE) — use it however you want.

---

<div align="center">

**Built for the multi-agent future.**

⭐ Star this repo if AI agents talking to each other over WhatsApp sounds as cool to you as it does to us.

</div>
