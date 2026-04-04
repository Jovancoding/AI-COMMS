# Multi-Agent Networking Guide

The real power of AI COMMS is running multiple AI agents that communicate with each other — and with humans — over WhatsApp.

---

## Concept

Each agent is a separate running instance of AI COMMS with its own:
- Phone number (or WhatsApp-linked device)
- AI provider
- Identity (name + ID)
- Configuration

Agents message each other over WhatsApp using a structured JSON protocol. From WhatsApp's perspective, it's just two phone numbers texting each other. Under the hood, the messages are structured, authenticated, and encrypted.

```
┌──────────────┐         WhatsApp         ┌──────────────┐
│  Agent: Atlas│◄───────────────────────►│  Agent: Nova  │
│  Provider:   │   Encrypted JSON Protocol│  Provider:    │
│  OpenAI      │                          │  Anthropic    │
│  Phone: +1.. │                          │  Phone: +44.. │
└──────┬───────┘                          └───────┬───────┘
       │                                          │
       │          ┌──────────────┐                │
       └─────────►│  Agent: Bolt │◄───────────────┘
                  │  Provider:   │
                  │  Groq        │
                  │  Phone: +91..│
                  └──────────────┘
```

---

## Setting Up Two Agents

### Agent 1 — "Atlas" (OpenAI)

Machine A (or container 1), with phone number A:

```bash
# .env for Atlas
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

AGENT_NAME=Atlas
AGENT_ID=atlas_001

PLATFORM=whatsapp
WHATSAPP_MODE=baileys

SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=a]f8k2...your-shared-secret...m9x1z
SECURITY_ENCRYPTION_KEY=b7d3e...your-shared-key...4f2a8

HEALTH_PORT=9090
```

```bash
npm start    # scan QR with phone A
```

### Agent 2 — "Nova" (Anthropic)

Machine B (or container 2), with phone number B:

```bash
# .env for Nova
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

AGENT_NAME=Nova
AGENT_ID=nova_001

PLATFORM=whatsapp
WHATSAPP_MODE=baileys

SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=a]f8k2...your-shared-secret...m9x1z    # SAME secret
SECURITY_ENCRYPTION_KEY=b7d3e...your-shared-key...4f2a8      # SAME key

HEALTH_PORT=9091
```

```bash
npm start    # scan QR with phone B
```

### Critical: Shared Secrets

All agents in the network **must** have the same:
- `SECURITY_AGENT_SECRET` — for HMAC authentication
- `SECURITY_ENCRYPTION_KEY` — for payload encryption

Generate them once and copy to all agents:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Agent-to-Agent Protocol

When Agent Atlas wants to talk to Agent Nova, it sends a structured JSON message over WhatsApp:

```json
{
  "protocol": "ai-comms",
  "version": "1.0",
  "from": {
    "agentId": "atlas_001",
    "agentName": "Atlas"
  },
  "to": {
    "agentId": "nova_001",
    "agentName": "Nova"
  },
  "intent": "chat",
  "payload": "What's your analysis of the latest climate data?",
  "conversationId": "conv_abc123",
  "timestamp": "2026-04-04T12:00:00.000Z",
  "auth": {
    "hmac": "a1b2c3d4...",
    "algorithm": "sha256"
  }
}
```

The receiving agent:
1. Verifies the HMAC signature
2. Checks the timestamp (replay protection)
3. Decrypts the payload (if encrypted)
4. Processes the message through its AI provider
5. Sends a structured reply back

All of this happens automatically — you don't need to construct these messages manually.

---

## Agent Discovery

When an agent starts, it can announce itself to the network. Other agents that receive the announcement automatically register it in their discovery registry.

### How it works

1. Agent Atlas sends a message to Agent Nova's phone number
2. If the message contains an announcement intent, Nova registers Atlas in its local registry
3. Nova responds with its own identity

### Viewing registered agents

From WhatsApp (as an admin):
```
!agents
```

Or via the discovery module in code:
```javascript
import { listAgents } from './discovery.js';
const agents = listAgents();
```

---

## Multi-Agent Groups

Groups let multiple agents (and humans) collaborate in a shared conversation.

### Creating a group

Send a message to your agent via WhatsApp:

```
Create a research group with Atlas, Nova, and Bolt
```

The AI interprets this and creates a group. Behind the scenes, it executes:

```json
{"command": "create-group", "name": "Research Team", "purpose": "Collaborative research"}
```

### Adding members

```
Add the agent at +44... with name Nova to the Research Team group
```

### Sending to a group

```
Tell the Research Team: What are your thoughts on quantum error correction?
```

The agent broadcasts the message to all group members. Each member processes it with their own AI and responds.

### Group context

When agents reply within a group, recent group messages are included as context so each agent knows what the others have said. This enables genuine multi-agent discussion.

### Managing groups (admin commands)

```
!groups                    # list all groups
```

---

## Provider Failover in Multi-Agent Networks

Each agent can have its own failover chain:

**Agent Atlas:**
```bash
AI_PROVIDER=openai
AI_FALLBACK_PROVIDERS=anthropic,groq
```

**Agent Nova:**
```bash
AI_PROVIDER=anthropic
AI_FALLBACK_PROVIDERS=google,openai
```

If Atlas's OpenAI goes down, it falls over to Anthropic, then Groq. Nova has its own independent chain. This gives the network resilience — even if a major provider has an outage, agents stay online.

---

## Example: ClawHub + NemoClaw Network

A real-world setup using OpenClaw and NVIDIA NIM:

**Agent: ClawHub** (self-hosted via OpenClaw)
```bash
AI_PROVIDER=openclaw
OPENCLAW_BASE_URL=http://localhost:18789
OPENCLAW_AUTH_TOKEN=secret

AGENT_NAME=ClawHub
AGENT_ID=clawhub_001

AI_FALLBACK_PROVIDERS=nvidia-nim
NVIDIA_API_KEY=nvapi-...

SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=<shared>
SECURITY_ENCRYPTION_KEY=<shared>
```

**Agent: NemoClaw** (NVIDIA NIM cloud)
```bash
AI_PROVIDER=nvidia-nim
NVIDIA_API_KEY=nvapi-...

AGENT_NAME=NemoClaw
AGENT_ID=nemoclaw_001

AI_FALLBACK_PROVIDERS=groq,anthropic
GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...

SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=<shared>
SECURITY_ENCRYPTION_KEY=<shared>
```

ClawHub handles personal tasks through your private OpenClaw gateway. NemoClaw handles heavy reasoning via NVIDIA. If OpenClaw goes down, ClawHub automatically fails over to NemoClaw's NVIDIA endpoint.

---

## Scaling to Many Agents

### Docker Compose

Run multiple agents on one machine:

```yaml
version: '3.8'
services:
  atlas:
    build: .
    env_file: .env.atlas
    volumes:
      - ./auth_atlas:/app/auth_info
      - ./data_atlas:/app/data
    ports:
      - "9090:9090"

  nova:
    build: .
    env_file: .env.nova
    volumes:
      - ./auth_nova:/app/auth_info
      - ./data_nova:/app/data
    ports:
      - "9091:9090"

  bolt:
    build: .
    env_file: .env.bolt
    volumes:
      - ./auth_bolt:/app/auth_info
      - ./data_bolt:/app/data
    ports:
      - "9092:9090"
```

Each agent gets its own auth directory, data directory, and health port.

### Deployment tips

- **One phone number per agent** — each Baileys instance needs its own WhatsApp-linked device
- **Unique AGENT_ID** — every agent must have a distinct ID
- **Unique HEALTH_PORT** — if running on the same host, set different ports
- **Shared secrets** — all agents need the same `SECURITY_AGENT_SECRET` and `SECURITY_ENCRYPTION_KEY`
- **Separate data directories** — mount different volumes for `auth_info/` and `data/`

---

## Architecture of a Multi-Agent Message

```
Human sends "Research quantum error correction" to Atlas on WhatsApp
    │
    ▼
┌─ Atlas ──────────────────────────────────────────────┐
│  1. Security gate (allowlist, rate limit)             │
│  2. Jailbreak defense (pattern check, escalation)    │
│  3. AI processing (OpenAI GPT-4o)                    │
│  4. AI decides to broadcast to Research Team group   │
│  5. Creates signed + encrypted agent messages        │
│  6. Sends to Nova and Bolt via WhatsApp              │
└──────────────────────────────────────────────────────┘
    │                              │
    ▼                              ▼
┌─ Nova ───────────────┐   ┌─ Bolt ───────────────┐
│  1. Verify HMAC sig  │   │  1. Verify HMAC sig  │
│  2. Decrypt payload  │   │  2. Decrypt payload  │
│  3. Check timestamp  │   │  3. Check timestamp  │
│  4. AI processing    │   │  4. AI processing    │
│     (Anthropic)      │   │     (Groq)           │
│  5. Reply to group   │   │  5. Reply to group   │
└──────────────────────┘   └──────────────────────┘
    │                              │
    ▼                              ▼
Atlas receives both replies, includes them in group context
    │
    ▼
Human sees the collaborative response on WhatsApp
```

---

## Conversation Cleanup

Agent conversations are automatically purged after 24 hours of inactivity to prevent unbounded memory growth. This applies to both human and agent conversations.

Active conversations are kept in memory and persisted to `data/conversations.json`. Stale entries are cleaned up every 30 minutes.

---

Next: [Back to README →](../README.md)
