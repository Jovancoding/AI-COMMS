// ==========================================
// OpenClaw Bridge Client
// Forwards messages to a running OpenClaw Gateway
// ==========================================

import config from './config.js';

const BRIDGE_PORT = process.env.OPENCLAW_BRIDGE_PORT || 3124;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || '';
const TIMEOUT_MS = 180_000; // 3 minutes — OpenClaw runs multi-step tasks

function bridgeHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (BRIDGE_TOKEN) h['Authorization'] = `Bearer ${BRIDGE_TOKEN}`;
  return h;
}

/**
 * Check if a message is an explicit OpenClaw Bridge request.
 * Prefix: !claw or !oc
 */
export function isOpenClawRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!claw ') || t.startsWith('!oc ') ||
         t === '!claw' || t === '!oc';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!claw ')) return t.slice(6).trim();
  if (t.toLowerCase().startsWith('!oc ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!claw' || t.toLowerCase() === '!oc') return 'hello';
  return t;
}

/**
 * Check if the OpenClaw bridge is running.
 */
export async function isOpenClawBridgeAvailable() {
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
 * Send a message to the OpenClaw Bridge and get the response.
 */
export async function handleOpenClawBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[OpenClawBridge] Sending to bridge: "${message.slice(0, 80)}" from ${sender}`);

  const available = await isOpenClawBridgeAvailable();
  if (!available) {
    return '⚠️ OpenClaw Bridge is not running.\n\n' +
      'To use this feature:\n' +
      '1. Start the OpenClaw gateway: openclaw gateway --port 18789\n' +
      '2. Start the bridge adapter on port ' + BRIDGE_PORT + '\n' +
      '3. Set OPENCLAW_BRIDGE_PORT in .env if using a different port';
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
      return `⚠️ OpenClaw Bridge error: ${err.error || res.statusText}`;
    }

    const data = await res.json();
    return data.response || '(Empty response from OpenClaw)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ OpenClaw Bridge request timed out (3 min). The task may still be running.';
    }
    return `⚠️ OpenClaw Bridge connection failed: ${err.message}`;
  }
}
