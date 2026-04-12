// ==========================================
// Codex Bridge Client
// Forwards messages to the OpenAI Codex CLI agent
// ==========================================

import config from './config.js';

const BRIDGE_PORT = process.env.CODEX_BRIDGE_PORT || 3122;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_TOKEN = process.env.CODEX_BRIDGE_TOKEN || '';
const TIMEOUT_MS = 180_000; // 3 minutes — Codex tasks can be long

function bridgeHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (BRIDGE_TOKEN) h['Authorization'] = `Bearer ${BRIDGE_TOKEN}`;
  return h;
}

/**
 * Check if a message is an explicit Codex Bridge request.
 * Prefix: !codex or !cx
 */
export function isCodexRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!codex ') || t.startsWith('!cx ') ||
         t === '!codex' || t === '!cx';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!codex ')) return t.slice(7).trim();
  if (t.toLowerCase().startsWith('!cx ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!codex' || t.toLowerCase() === '!cx') return 'hello';
  return t;
}

/**
 * Check if the Codex bridge is running.
 */
export async function isCodexBridgeAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a message to the Codex Bridge and get the response.
 */
export async function handleCodexBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[CodexBridge] Sending to bridge: "${message.slice(0, 80)}" from ${sender}`);

  const available = await isCodexBridgeAvailable();
  if (!available) {
    return '⚠️ Codex Bridge is not running.\n\n' +
      'To use this feature:\n' +
      '1. Start the Codex bridge server\n' +
      '2. Ensure it is listening on port ' + BRIDGE_PORT + '\n' +
      '3. Set CODEX_BRIDGE_PORT in .env if using a different port';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${BRIDGE_URL}/chat`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify({ message, sender }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return `⚠️ Codex Bridge error: ${err.error || res.statusText}`;
    }

    const data = await res.json();
    return data.response || '(Empty response from Codex)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ Codex Bridge request timed out (3 min). The task may still be running.';
    }
    return `⚠️ Codex Bridge connection failed: ${err.message}`;
  }
}
