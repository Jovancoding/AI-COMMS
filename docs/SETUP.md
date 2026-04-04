# Setup Guide

Step-by-step instructions for getting AI COMMS running on each platform.

---

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **A phone** with WhatsApp installed (for Baileys mode)
- **At least one AI provider API key** (see [PROVIDERS.md](PROVIDERS.md))

---

## 1. Install

```bash
git clone https://github.com/Jovancoding/AI-COMMS.git
cd AI-COMMS
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` in your editor and set these three things at minimum:

```bash
AI_PROVIDER=openai           # which AI to use
OPENAI_API_KEY=sk-...        # that provider's API key
PLATFORM=whatsapp            # whatsapp | teams | both
```

---

## WhatsApp — Baileys (Free, QR Code)

This is the simplest way to get started. No Meta Business account needed.

### How it works

Baileys connects to WhatsApp Web by scanning a QR code, just like linking a second phone. Your agent runs as a linked device on your personal WhatsApp number.

### Setup

1. Set in `.env`:
   ```bash
   PLATFORM=whatsapp
   WHATSAPP_MODE=baileys
   ```

2. Start the agent:
   ```bash
   npm start
   ```

3. A QR code appears in your terminal. Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → scan the QR code.

4. Once connected, you'll see:
   ```
   [WhatsApp] Connected!
   [Ready] WhatsApp agent is listening for messages!
   ```

5. Send a message to your own number from another phone (or have someone message you). The AI agent will respond automatically.

### Auth persistence

After the first scan, credentials are saved to `auth_info/`. On subsequent starts, the agent reconnects automatically — no QR code needed.

To re-link: delete the `auth_info/` folder and restart.

### Reconnection

If the connection drops (network issues, phone goes offline), Baileys automatically reconnects. If you get logged out (e.g., you unlinked the device from your phone), delete `auth_info/` and scan again.

---

## WhatsApp — Cloud API (Official Meta Webhook)

For production deployments where you need a dedicated business number.

### Prerequisites

- A [Meta Developer](https://developers.facebook.com/) account
- A [Meta Business](https://business.facebook.com/) account
- A WhatsApp Business API phone number

### Setup

1. Go to **Meta Developer Dashboard** → Create an App → Select **Business** type → Add **WhatsApp** product.

2. Under **WhatsApp > API Setup**, you'll find:
   - **Phone Number ID** — your WhatsApp business number ID
   - **Temporary Access Token** (or generate a permanent one via System Users)

3. Set in `.env`:
   ```bash
   PLATFORM=whatsapp
   WHATSAPP_MODE=cloud-api
   WHATSAPP_PHONE_NUMBER_ID=1234567890
   WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx...
   WHATSAPP_VERIFY_TOKEN=my-secret-verify-token    # you choose this
   WHATSAPP_WEBHOOK_PORT=3000
   ```

4. Start the agent:
   ```bash
   npm start
   ```

5. Your webhook server starts at `http://localhost:3000/webhook`.

6. **Expose your webhook** to the internet. Options:
   - **ngrok** (development): `ngrok http 3000` → use the HTTPS URL
   - **Reverse proxy** (production): Nginx/Caddy pointing to port 3000
   - **TLS direct** (production): Set `TLS_CERT_PATH` and `TLS_KEY_PATH` in `.env`

7. In Meta Developer Dashboard → **WhatsApp > Configuration**:
   - **Callback URL**: `https://your-domain.com/webhook`
   - **Verify Token**: same value you set in `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to **messages**

### Webhook signature verification

For production, set your app secret to verify Meta's webhook signatures:

```bash
WHATSAPP_APP_SECRET=your_meta_app_secret
```

This verifies the `X-Hub-Signature-256` header on every incoming webhook.

---

## Microsoft Teams

### Prerequisites

- An Azure account or access to [Bot Framework Portal](https://dev.botframework.com/)
- A Microsoft 365 tenant where you can install bots

### Setup

1. **Register a bot**:
   - Go to [Azure Portal](https://portal.azure.com/) → **Create a resource** → **Azure Bot**
   - Or use [Bot Framework Portal](https://dev.botframework.com/) → **My bots** → **Create a bot**
   - Choose **Multi Tenant** for app type
   - Note your **App ID** and **App Password**

2. Set in `.env`:
   ```bash
   PLATFORM=teams                    # or "both" for WhatsApp + Teams
   TEAMS_APP_ID=your-app-id
   TEAMS_APP_PASSWORD=your-app-password
   TEAMS_PORT=3978
   ```

3. Start the agent:
   ```bash
   npm start
   ```

4. Your Teams endpoint runs at `http://localhost:3978/api/messages`.

5. **Set the messaging endpoint** in your bot registration:
   - **Development**: Use ngrok — `ngrok http 3978` → set endpoint to `https://xxx.ngrok.io/api/messages`
   - **Production**: Deploy behind a reverse proxy with HTTPS

6. **Install the bot in Teams**:
   - In Azure Portal → your bot → **Channels** → add **Microsoft Teams**
   - Create an app manifest or use Teams Developer Portal to install the bot in your tenant

7. Open Teams, find your bot, and start chatting.

---

## Running Both Platforms

To connect to both WhatsApp and Teams simultaneously:

```bash
PLATFORM=both
```

Both clients start together. Messages from either platform go through the same orchestrator, security stack, and AI provider.

---

## Health Check

After starting, verify the agent is running:

```bash
curl http://localhost:9090/health
```

Response:
```json
{
  "status": "ok",
  "agent": "MyAI",
  "provider": "openai",
  "uptime": 60,
  "stats": { "messagesReceived": 0, "messagesSent": 0, "errors": 0 }
}
```

Change the health port with `HEALTH_PORT=9090` in `.env`.

---

## Docker

```bash
docker compose up -d
```

For Baileys mode, you need to scan the QR code on first run:
```bash
docker compose up        # foreground to see QR code
# scan QR, then Ctrl+C
docker compose up -d     # restart in background
```

The `auth_info/` directory is mounted as a volume so credentials persist across container restarts.

---

## PM2 (Process Manager)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # auto-start on system boot
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code doesn't appear | Delete `auth_info/` and restart |
| "Logged out" message | Device was unlinked from phone. Delete `auth_info/`, restart, scan again |
| Cloud API webhook not receiving messages | Check your callback URL is accessible from the internet. Verify the verify token matches. |
| Teams bot not responding | Verify messaging endpoint is set to `https://your-host/api/messages`. Check App ID and Password. |
| `[Config Error] AI_PROVIDER="openai" requires OPENAI_API_KEY` | Set the required API key in `.env` |
| Agent starts but no messages come through | Check `SECURITY_ENABLE_ALLOWLIST` — if `true`, your number must be in `SECURITY_ALLOWLIST` |
| Port already in use | Change `WHATSAPP_WEBHOOK_PORT`, `TEAMS_PORT`, or `HEALTH_PORT` in `.env` |

---

Next: [Configure your AI provider →](PROVIDERS.md)
