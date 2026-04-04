# AI Providers Guide

AI COMMS supports 18 AI providers. You activate one with `AI_PROVIDER` and set its API key — that's it.

---

## Switching Providers

Change one line in `.env`:

```bash
AI_PROVIDER=anthropic
```

Restart the agent. Done. The provider router loads the right adapter automatically.

---

## Provider Reference

### OpenAI

The default. GPT-4o, GPT-4, GPT-3.5 Turbo, and any OpenAI model.

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o              # optional, defaults to gpt-4o
```

Get a key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

---

### Anthropic (Claude)

Claude Sonnet 4, Claude Haiku, Claude Opus.

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514    # optional
```

Get a key: [console.anthropic.com](https://console.anthropic.com/)

---

### Google (Gemini)

Gemini 2.0 Flash, Gemini Pro, and other Gemini models.

```bash
AI_PROVIDER=google
GOOGLE_API_KEY=AIza...
GOOGLE_MODEL=gemini-2.0-flash    # optional
```

Get a key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

### Mistral AI

Mistral Large, Mistral Medium, Mistral Small.

```bash
AI_PROVIDER=mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-large-latest    # optional
```

Get a key: [console.mistral.ai](https://console.mistral.ai/)

---

### Cohere

Command R+, Command R, and other Cohere models.

```bash
AI_PROVIDER=cohere
COHERE_API_KEY=...
COHERE_MODEL=command-r-plus    # optional
```

Get a key: [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys)

---

### Groq

Blazing-fast inference for LLaMA, Mixtral, and Gemma models.

```bash
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile    # optional
```

Get a key: [console.groq.com/keys](https://console.groq.com/keys)

---

### DeepSeek

DeepSeek Chat and DeepSeek Coder models.

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat    # optional
```

Get a key: [platform.deepseek.com](https://platform.deepseek.com/)

---

### xAI (Grok)

Grok 2 and Grok models from xAI.

```bash
AI_PROVIDER=xai
XAI_API_KEY=xai-...
XAI_MODEL=grok-2-latest    # optional
```

Get a key: [console.x.ai](https://console.x.ai/)

---

### Perplexity

Sonar Pro and Sonar models — AI with built-in web search.

```bash
AI_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...
PERPLEXITY_MODEL=sonar-pro    # optional
```

Get a key: [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)

---

### Together AI

Open-source models (LLaMA, Mistral, etc.) hosted by Together.

```bash
AI_PROVIDER=together
TOGETHER_API_KEY=...
TOGETHER_MODEL=meta-llama/Llama-3-70b-chat-hf    # optional
```

Get a key: [api.together.xyz/settings/api-keys](https://api.together.xyz/settings/api-keys)

---

### Fireworks AI

Fast inference for open-source models.

```bash
AI_PROVIDER=fireworks
FIREWORKS_API_KEY=fw_...
FIREWORKS_MODEL=accounts/fireworks/models/llama-v3p1-70b-instruct    # optional
```

Get a key: [fireworks.ai/account/api-keys](https://fireworks.ai/account/api-keys)

---

### NVIDIA NIM (NemoClaw)

NVIDIA-hosted inference — Nemotron, LLaMA, Gemma, and more via NVIDIA's NIM platform.

```bash
AI_PROVIDER=nvidia-nim
NVIDIA_API_KEY=nvapi-...
NVIDIA_NIM_MODEL=nvidia/nemotron-3-super-120b-a12b    # optional
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1    # optional
NVIDIA_NIM_MAX_TOKENS=4096    # optional
```

Get a key: [build.nvidia.com](https://build.nvidia.com/)

**Self-hosted NIM**: If you run NIM containers locally, point `NVIDIA_NIM_BASE_URL` to your server:
```bash
NVIDIA_NIM_BASE_URL=http://your-nim-server:8000/v1
```

---

### OpenClaw (ClawHub)

Connects to a running OpenClaw Gateway instance. Routes to whatever model you've configured on your OpenClaw instance.

```bash
AI_PROVIDER=openclaw
OPENCLAW_BASE_URL=http://localhost:18789    # your OpenClaw Gateway
OPENCLAW_AUTH_TOKEN=your-secret            # optional auth token
OPENCLAW_SESSION=main                      # optional session ID
OPENCLAW_MODEL=default                     # optional model override
```

The provider tries two endpoints:
1. `POST /api/chat` — OpenClaw's native API
2. `POST /v1/chat/completions` — OpenAI-compatible fallback

---

### Ollama (Local LLMs)

Run models locally with Ollama — no API key, no cloud, fully private.

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434    # optional, this is the default
OLLAMA_MODEL=llama3                       # any model you've pulled
```

Install Ollama: [ollama.com](https://ollama.com/)

Pull a model first:
```bash
ollama pull llama3
```

The timeout for Ollama is set to 2 minutes (vs 60 seconds for cloud providers) to account for local model loading time.

---

### Codex

OpenAI's code-optimized model (o4-mini). Uses the same API key as OpenAI.

```bash
AI_PROVIDER=codex
CODEX_API_KEY=sk-...            # or falls back to OPENAI_API_KEY
CODEX_MODEL=o4-mini             # optional
```

---

### GitHub Copilot

Use GPT-4o and other models via GitHub's inference endpoint.

```bash
AI_PROVIDER=copilot
COPILOT_TOKEN=ghp_...
COPILOT_MODEL=gpt-4o                                     # optional
COPILOT_BASE_URL=https://models.github.ai/inference      # optional
```

Get a token: [github.com/settings/tokens](https://github.com/settings/tokens) (needs `copilot` scope)

---

### Claude Code

Anthropic's agentic coding model with extended thinking for complex reasoning.

```bash
AI_PROVIDER=claude-code
CLAUDE_CODE_API_KEY=sk-ant-...           # or falls back to ANTHROPIC_API_KEY
CLAUDE_CODE_MODEL=claude-sonnet-4-20250514   # optional
CLAUDE_CODE_MAX_TOKENS=16384            # optional
CLAUDE_CODE_THINKING_BUDGET=10000       # optional, tokens for extended thinking
```

The thinking budget controls how many tokens Claude spends on internal reasoning before responding. Set to `0` to disable extended thinking.

---

### Claude Cowork

Anthropic's collaborative agent model, designed for multi-agent teamwork and task delegation.

```bash
AI_PROVIDER=claude-cowork
CLAUDE_COWORK_API_KEY=sk-ant-...          # or falls back to ANTHROPIC_API_KEY
CLAUDE_COWORK_MODEL=claude-sonnet-4-20250514  # optional
CLAUDE_COWORK_MAX_TOKENS=8192           # optional
CLAUDE_COWORK_THINKING_BUDGET=8000      # optional
```

---

## Provider Failover

Set a fallback chain so if your primary provider fails, the next one takes over automatically:

```bash
AI_PROVIDER=openai
AI_FALLBACK_PROVIDERS=anthropic,google,groq
```

Failover order: OpenAI → Anthropic → Google → Groq.

Each provider in the chain is tried once. If all fail, the error is returned to the user.

### Per-Provider Rate Limits

Optional — cap requests per minute to stay within provider quotas:

```bash
RATE_LIMIT_OPENAI_RPM=60
RATE_LIMIT_ANTHROPIC_RPM=40
RATE_LIMIT_GOOGLE_RPM=60
```

If the rate limit is hit, the failover chain kicks in automatically.

---

## Which Provider Should I Use?

| Use Case | Recommended |
|----------|-------------|
| General purpose | `openai` (GPT-4o) or `anthropic` (Claude) |
| Fastest responses | `groq` |
| Best reasoning | `anthropic` (Claude Code with thinking) |
| Cheapest | `ollama` (free, local) or `deepseek` |
| Code tasks | `codex` or `claude-code` |
| Web search built in | `perplexity` |
| Privacy (no cloud) | `ollama` |
| NVIDIA GPUs | `nvidia-nim` |
| Self-hosted gateway | `openclaw` |
| Multi-agent collab | `claude-cowork` |

---

Next: [Security configuration →](SECURITY.md)
