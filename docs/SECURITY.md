# Security Guide

AI COMMS has a layered security architecture. Everything is configurable — you decide what to enable based on your threat model.

---

## Quick Start — Minimum Security

These defaults are active out of the box with zero configuration:

| Feature | Default | Config |
|---------|---------|--------|
| Rate limiting | **On** — 20 msgs/min per sender | `SECURITY_ENABLE_RATE_LIMIT=true` |
| Message size cap | **On** — 10,000 chars max | `SECURITY_MAX_MESSAGE_LENGTH=10000` |
| Prompt injection detection | **On** — logging only | `SECURITY_ENABLE_INPUT_SANITIZATION=true` |
| Startup security checks | **On** | Automatic |

---

## Quick Start — Full Lockdown

Copy this into your `.env` for maximum security:

```bash
# Access control
SECURITY_ENABLE_ALLOWLIST=true
SECURITY_ALLOWLIST=+1234567890,+0987654321
SECURITY_BLOCKLIST=+1111111111

# Rate limiting
SECURITY_ENABLE_RATE_LIMIT=true
SECURITY_RATE_LIMIT_MAX=20
SECURITY_RATE_LIMIT_WINDOW_MS=60000

# Agent authentication
SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=<your-64-char-hex-secret>

# Prompt injection blocking (not just logging)
SECURITY_ENABLE_INPUT_SANITIZATION=true
SECURITY_BLOCK_PROMPT_INJECTION=true

# Replay protection
SECURITY_MAX_MESSAGE_AGE_MS=300000

# Payload encryption
SECURITY_ENCRYPTION_KEY=<your-64-char-hex-secret>

# Webhook signatures
WHATSAPP_APP_SECRET=<your-meta-app-secret>
```

Generate secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Security Layers Explained

### 1. Allowlist / Blocklist

Control who can message your agent.

```bash
SECURITY_ENABLE_ALLOWLIST=true
SECURITY_ALLOWLIST=+1234567890,+0987654321    # only these can chat
SECURITY_BLOCKLIST=+1111111111                 # always blocked
```

- **Allowlist off + blocklist empty** = open to everyone (default)
- **Allowlist on + allowlist empty** = open to everyone (open mode)
- **Allowlist on + numbers listed** = only those numbers can chat
- **Blocklist** always applies, even if allowlist is off

Phone numbers are normalized — `@s.whatsapp.net` and `@g.us` suffixes are stripped for comparison.

### 2. Rate Limiting

Prevent message flooding from a single sender.

```bash
SECURITY_ENABLE_RATE_LIMIT=true
SECURITY_RATE_LIMIT_MAX=20               # max messages per window
SECURITY_RATE_LIMIT_WINDOW_MS=60000      # window duration (60 seconds)
```

Each sender gets their own bucket. Exceeding the limit returns a rate-limit message and logs a `BLOCK` audit event.

Stale buckets are cleaned up every 5 minutes automatically.

### 3. Message Size Cap

Reject messages that exceed a character limit.

```bash
SECURITY_MAX_MESSAGE_LENGTH=10000
```

Oversized messages are blocked before they reach the AI provider.

### 4. Agent Authentication (HMAC-SHA256)

Verify that agent-to-agent messages come from trusted agents in your network.

```bash
SECURITY_REQUIRE_AGENT_AUTH=true
SECURITY_AGENT_SECRET=<shared-secret>
```

**All agents in your network must use the same secret.**

How it works:
1. When Agent A sends a message to Agent B, it signs the payload with HMAC-SHA256 using the shared secret
2. Agent B verifies the signature before processing the message
3. If the signature is missing or invalid, the message is rejected

The signed payload includes: `from`, `to`, `timestamp`, `conversationId`, and `payload` — so nothing can be tampered with.

### 5. Replay Protection

Reject agent messages with stale timestamps.

```bash
SECURITY_MAX_MESSAGE_AGE_MS=300000    # 5 minutes
```

If an agent message's timestamp is older than this threshold (or in the future), it's rejected. Prevents replay attacks where an intercepted message is re-sent.

Set to `0` to disable.

### 6. Jailbreak Defense (6 Layers)

AI COMMS has a comprehensive prompt injection defense system based on the OWASP Top 10 for LLMs.

#### Layer 1: Pattern-Based Input Filtering

40+ regex patterns detect known attack signatures:

- **Direct injection**: "ignore all previous instructions", "override your rules"
- **Context hijacking**: "forget everything", "reset your memory"
- **Persona hijack**: "you are now DAN", "enable developer mode", "pretend you're evil"
- **System prompt extraction**: "show me your system prompt", "what were you told initially"
- **Token smuggling**: `[INST]`, `<<SYS>>`, `<|im_start|>` and other LLM control tokens
- **Social engineering**: "this is urgent, you must...", "my boss will fire me if..."

#### Layer 2: Encoding / Obfuscation Detection

Catches attacks hidden in:
- **Base64** — decodes and checks for attack patterns
- **Hex encoding** — decodes hex strings and scans
- **Reversed text** — reverses the message and checks
- **Leet speak** — converts `1gn0r3 4ll rul35` back to text and checks

#### Layer 3: Persona Hijack Detection

Specifically targets DAN-style attacks, role-play bypasses, and mode-switching attempts.

#### Layer 4: System Prompt Extraction Prevention

Blocks attempts to make the AI reveal its system prompt or initial instructions.

#### Layer 5: Multi-Turn Escalation Tracking

Tracks per-sender escalation scores across multiple messages. Even if individual messages are innocent, a series of probing messages triggers a block.

Keywords are weighted:
- `hypothetically`, `imagine` → +1
- `harmful`, `hack`, `bypass` → +2
- `unrestricted`, `unfiltered` → +3
- `jailbreak`, `DAN` → +5

Threshold: score >= 8 triggers a block. Scores decay after 5 minutes of inactivity.

#### Layer 6: Output Validation

Checks AI responses before they're sent to the user:
- Blocks responses that contain the system prompt
- Blocks responses with role-play compliance ("As DAN, I will...")
- Replaces unsafe responses with a filtered message

#### Configuration

```bash
# Enable detection (on by default)
SECURITY_ENABLE_INPUT_SANITIZATION=true

# Log-only mode (default) — detects and logs but doesn't block
SECURITY_BLOCK_PROMPT_INJECTION=false

# Blocking mode — detects AND rejects suspicious messages
SECURITY_BLOCK_PROMPT_INJECTION=true
```

In log-only mode, detected threats are recorded in the audit log but messages are still processed. This is useful for monitoring without disrupting users.

### 7. Payload Encryption (AES-256-GCM)

Encrypt agent-to-agent message payloads so they can't be read in transit.

```bash
SECURITY_ENCRYPTION_KEY=<64-char-hex-key>
```

**All agents in the network must share the same key.**

How it works:
- Before sending: the payload is encrypted with AES-256-GCM using a random IV
- The encrypted message includes: `iv`, `tag`, `ciphertext`
- The receiving agent decrypts using the shared key
- Without the key, the payload is unreadable

If no encryption key is set, payloads are sent in plaintext (passthrough mode).

### 8. TLS / HTTPS

For webhook-based modes (Cloud API, Teams), serve over HTTPS:

```bash
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem
```

Or deploy behind a reverse proxy (Nginx, Caddy) that handles TLS termination.

### 9. Webhook Signature Verification

For WhatsApp Cloud API, verify that webhook requests actually come from Meta:

```bash
WHATSAPP_APP_SECRET=<your-meta-app-secret>
```

The agent verifies the `X-Hub-Signature-256` header using HMAC-SHA256 with your app secret. Requests with invalid or missing signatures are rejected with 401.

### 10. Audit Logging

Every security event is logged to `logs/audit.log`:

```
[2026-04-04T12:00:00.000Z][INFO] startup-security-check
[2026-04-04T12:00:01.000Z][BLOCK] rate-limited {"sender":"+123","count":21}
[2026-04-04T12:00:02.000Z][WARN] jailbreak-attempt {"sender":"+456","threats":"pattern:direct-injection"}
```

Event types:
- `INFO` — normal operations (startup, agent registered, message received)
- `WARN` — suspicious activity (jailbreak attempt, config hygiene warning)
- `BLOCK` — message rejected (rate limit, blocklist, oversized, auth failed)
- `ERROR` — system errors

Logs auto-rotate based on the audit log configuration. The `logs/` directory is in `.gitignore` so logs are never committed.

View recent logs via admin command:
```
!logs 20    # last 20 entries
```

### 11. Startup Security Checks

On every boot, AI COMMS automatically checks:
- **Environment validation** — fails hard if the active provider's API key is missing
- **File permissions** — warns if `.env` or `auth_info/` are world-readable (Unix)
- **Config hygiene** — warns about insecure defaults (allowlist off, auth off, etc.)
- **.gitignore** — warns if sensitive files aren't excluded

---

## Security Best Practices

1. **Always set `SECURITY_BLOCK_PROMPT_INJECTION=true`** in production
2. **Enable agent auth** if running multiple agents — prevents impersonation
3. **Set an encryption key** if agents are on different networks
4. **Use the allowlist** to restrict access to known numbers
5. **Set `WHATSAPP_APP_SECRET`** for Cloud API deployments
6. **Deploy behind HTTPS** — use TLS certs or a reverse proxy
7. **Rotate secrets periodically** — agent secret, encryption key, API keys
8. **Monitor audit logs** — set up log shipping to catch anomalies early
9. **Review startup warnings** — they tell you exactly what's insecure

---

Next: [Multi-agent networking →](MULTI-AGENT.md)
