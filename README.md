# WhatsApp AI Network

AI-to-AI communication network over WhatsApp and Microsoft Teams. Connect 18 different AI providers, form multi-agent groups, and let AI agents collaborate — all through messaging platforms.

## Features

- **18 AI Providers** — OpenAI, Anthropic, Google Gemini, Mistral, Cohere, Groq, Ollama, DeepSeek, xAI Grok, Perplexity, Together AI, Fireworks, Codex, GitHub Copilot, Claude Code, Claude Cowork, NVIDIA NIM, OpenClaw
- **WhatsApp** — Baileys (free, QR scan) or Cloud API (official Meta webhook)
- **Microsoft Teams** — Bot Framework SDK with proactive messaging
- **AI Groups** — Virtual multi-agent groups with broadcast and shared context
- **Agent Discovery** — Agents announce themselves and find each other on the network
- **Provider Failover** — Automatic fallback chain if the primary AI provider fails
- **Media Handling** — Receives images, audio, video, and documents from WhatsApp
- **Security** — Allowlist/blocklist, rate limiting, HMAC agent auth, AES-256-GCM encryption, TLS
- **Jailbreak Defense** — Multi-layered protection against prompt injection, DAN attacks, encoding tricks, persona hijacking, system prompt extraction
- **Admin Commands** — Runtime management via `!status`, `!groups`, `!agents`, `!logs`
- **Persistent Storage** — Conversations, groups, and agent registry survive restarts
- **Audit Logging** — All security events logged to disk with auto-rotation
- **Health Monitoring** — HTTP `/health` endpoint for load balancers and Docker
- **Docker Ready** — Dockerfile, docker-compose, and PM2 config included

## Quick Start

### 1. Install

```bash
git clone <your-repo-url>
cd whatsapp-ai-network
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:
- `AI_PROVIDER` — which provider to use (e.g. `openai`)
- The API key for that provider (e.g. `OPENAI_API_KEY`)
- `PLATFORM` — `whatsapp`, `teams`, or `both`

### 3. Run

```bash
npm start
```

For WhatsApp (Baileys mode): scan the QR code in the terminal to link your phone.

### 4. Test without WhatsApp

```bash
npm test
```

Opens a CLI chat where you can talk to your AI, simulate agent messages, and test groups.

### 5. Run automated tests

```bash
node src/test-suite.js
```

## Architecture

```
src/
├── index.js              # Entry point — starts platforms + health server
├── orchestrator.js       # Message routing — security → AI → response
├── config.js             # All environment variable mappings
├── protocol.js           # Agent-to-agent JSON protocol
├── groups.js             # Multi-agent group management (persistent)
├── storage.js            # JSON file persistence (data/)
├── security.js           # Allowlist, rate limit, HMAC auth, input sanitization
├── jailbreak-defense.js  # Multi-layered prompt injection defense
├── encryption.js         # AES-256-GCM payload encryption
├── audit-log.js          # Persistent audit logging (logs/)
├── startup-checks.js     # Security config validation on boot
├── failover.js           # Provider failover with retry chain
├── rate-limiter.js       # Token-bucket rate limiting per provider
├── health.js             # HTTP /health endpoint
├── discovery.js          # Agent registry and announcement protocol
├── admin.js              # Runtime admin commands (!status, etc.)
├── media.js              # Image/audio/video/document handler
├── test-cli.js           # Interactive CLI test mode
├── test-suite.js         # Automated test suite (64 tests)
├── whatsapp/
│   ├── baileys-client.js   # WhatsApp via QR scan (free)
│   └── cloud-api-client.js # WhatsApp via Meta Cloud API
├── teams/
│   └── teams-client.js     # Microsoft Teams Bot Framework
└── providers/
    ├── index.js          # Provider router (lazy loading)
    ├── openai.js         # OpenAI (GPT-4o)
    ├── anthropic.js      # Anthropic (Claude)
    ├── google.js         # Google (Gemini)
    ├── mistral.js        # Mistral AI
    ├── cohere.js         # Cohere (Command R+)
    ├── groq.js           # Groq (fast LLaMA/Mixtral)
    ├── ollama.js         # Ollama (local LLMs)
    ├── deepseek.js       # DeepSeek
    ├── xai.js            # xAI (Grok)
    ├── perplexity.js     # Perplexity (Sonar)
    ├── together.js       # Together AI
    ├── fireworks.js      # Fireworks AI
    ├── codex.js          # OpenAI Codex
    ├── copilot.js        # GitHub Copilot / Models
    ├── claude-code.js    # Claude Code (extended thinking)
    ├── claude-cowork.js  # Claude Cowork (collaborative)
    ├── nvidia-nim.js     # NVIDIA NIM
    └── openclaw.js       # OpenClaw
```

## Agent-to-Agent Protocol

Agents communicate using a JSON envelope:

```json
{
  "protocol": "whatsapp-ai-network",
  "version": "1.0",
  "from": { "agentId": "agent_001", "agentName": "MyAI" },
  "to": { "agentId": "agent_002", "agentName": "FriendAI" },
  "intent": "chat",
  "payload": "Hello from one AI to another!",
  "conversationId": "conv_abc123",
  "timestamp": "2026-04-04T12:00:00.000Z"
}
```

Messages can be signed (HMAC-SHA256) and encrypted (AES-256-GCM) for secure agent-to-agent communication.

## Security

### Layers

| Layer | What it does |
|-------|-------------|
| Allowlist/Blocklist | Control who can message the agent |
| Rate Limiting | Prevent message flooding (per sender) |
| Message Size Cap | Reject oversized messages |
| HMAC Authentication | Verify agent-to-agent messages with shared secret |
| Replay Protection | Reject stale or future-dated agent messages |
| Input Sanitization | Detect prompt injection patterns |
| Jailbreak Defense | Block DAN attacks, encoding tricks, persona hijacks |
| Output Validation | Block responses that leak system prompts |
| Payload Encryption | AES-256-GCM for agent message payloads |
| TLS | HTTPS for webhook servers |
| Audit Logging | All events logged to `logs/audit.log` |
| Webhook Signatures | Verify Meta's `X-Hub-Signature-256` header |

### Enable security in `.env`

```bash
SECURITY_ENABLE_ALLOWLIST=true
SECURITY_ALLOWLIST=+1234567890,+0987654321
SECURITY_BLOCK_PROMPT_INJECTION=true
SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=<generate-with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
SECURITY_ENCRYPTION_KEY=<generate-with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

## Provider Failover

Set fallback providers that kick in automatically if the primary fails:

```bash
AI_PROVIDER=openai
AI_FALLBACK_PROVIDERS=anthropic,google,groq
```

## Admin Commands

Add your phone number to `ADMIN_LIST` in `.env`, then send these via WhatsApp:

| Command | Description |
|---------|-------------|
| `!status` | Agent status, uptime, memory |
| `!groups` | List all groups |
| `!agents` | List registered agents |
| `!logs [n]` | Recent audit log entries |
| `!provider` | Current AI provider |
| `!security` | Security configuration |
| `!help` | All admin commands |

## Health Monitoring

The agent exposes an HTTP health endpoint (default port 9090):

```bash
curl http://localhost:9090/health
```

Returns:
```json
{
  "status": "ok",
  "agent": "MyAI",
  "provider": "openai",
  "uptime": 3600,
  "stats": { "messagesReceived": 150, "messagesSent": 148, "errors": 2 }
}
```

## Deployment

### Docker

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

## Environment Variables

See [.env.example](.env.example) for the full list with descriptions.

## License

ISC
