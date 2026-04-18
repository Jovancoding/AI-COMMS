// ==========================================
// Hermes Agent Bridge Client
// Forwards messages to a running Hermes Agent API Server
// (OpenAI-compatible at /v1/chat/completions)
// ==========================================

import config from './config.js';

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642';
const HERMES_API_KEY = process.env.HERMES_API_KEY || '';
const TIMEOUT_MS = 300_000; // 5 minutes — Hermes runs multi-step agentic tasks

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (HERMES_API_KEY) h['Authorization'] = `Bearer ${HERMES_API_KEY}`;
  return h;
}

/**
 * Check if a message is an explicit Hermes Agent request.
 * Prefix: !hermes or !ha
 */
export function isHermesRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!hermes ') || t.startsWith('!ha ') ||
         t === '!hermes' || t === '!ha';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!hermes ')) return t.slice(8).trim();
  if (t.toLowerCase().startsWith('!ha ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!hermes' || t.toLowerCase() === '!ha') return 'hello';
  return t;
}

/**
 * Check if the Hermes Agent API server is running.
 */
export async function isHermesBridgeAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${HERMES_API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a message to Hermes Agent via its OpenAI-compatible API and get the response.
 */
export async function handleHermesBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[HermesBridge] Sending to Hermes Agent: "${message.slice(0, 80)}" from ${sender}`);

  const available = await isHermesBridgeAvailable();
  if (!available) {
    return '⚠️ Hermes Agent is not running.\n\n' +
      'To use this feature:\n' +
      '1. Install Hermes Agent: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash\n' +
      '2. Enable the API server: set API_SERVER_ENABLED=true in ~/.hermes/.env\n' +
      '3. Set API_SERVER_KEY in ~/.hermes/.env and HERMES_API_KEY in AI COMMS .env\n' +
      '4. Start the gateway: hermes gateway\n' +
      '5. Verify: curl http://localhost:8642/health';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${HERMES_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: [
          { role: 'system', content: `Request relayed from ${config.agent.name} via AI COMMS WhatsApp bridge. Sender: ${sender}` },
          { role: 'user', content: message },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
      const errMsg = err.error?.message || err.error || res.statusText;
      return `⚠️ Hermes Agent error: ${errMsg}`;
    }

    const data = await res.json();

    // OpenAI-compatible response format
    const reply = data.choices?.[0]?.message?.content;
    return reply || '(Empty response from Hermes Agent)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ Hermes Agent request timed out (5 min). The task may still be running in Hermes.';
    }
    return `⚠️ Hermes Agent connection failed: ${err.message}`;
  }
}
