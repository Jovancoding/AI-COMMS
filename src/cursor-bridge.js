// ==========================================
// Cursor Bridge Client
// Forwards messages to the Cursor IDE agent
// ==========================================

import config from './config.js';

const BRIDGE_PORT = process.env.CURSOR_BRIDGE_PORT || 3123;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_TOKEN = process.env.CURSOR_BRIDGE_TOKEN || '';
const TIMEOUT_MS = 180_000; // 3 minutes — Cursor agent tasks can be long

function bridgeHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (BRIDGE_TOKEN) h['Authorization'] = `Bearer ${BRIDGE_TOKEN}`;
  return h;
}

/**
 * Check if a message is an explicit Cursor Bridge request.
 * Prefix: !cursor or !cu
 */
export function isCursorRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!cursor ') || t.startsWith('!cu ') ||
         t === '!cursor' || t === '!cu';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!cursor ')) return t.slice(8).trim();
  if (t.toLowerCase().startsWith('!cu ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!cursor' || t.toLowerCase() === '!cu') return 'hello';
  return t;
}

/**
 * Check if the Cursor bridge is running.
 */
export async function isCursorBridgeAvailable() {
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
 * Send a message to the Cursor Bridge and get the response.
 */
export async function handleCursorBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[CursorBridge] Sending to bridge: "${message.slice(0, 80)}" from ${sender}`);

  const available = await isCursorBridgeAvailable();
  if (!available) {
    return '⚠️ Cursor Bridge is not running.\n\n' +
      'To use this feature:\n' +
      '1. Start the Cursor bridge server\n' +
      '2. Ensure it is listening on port ' + BRIDGE_PORT + '\n' +
      '3. Set CURSOR_BRIDGE_PORT in .env if using a different port';
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
      return `⚠️ Cursor Bridge error: ${err.error || res.statusText}`;
    }

    const data = await res.json();
    return data.response || '(Empty response from Cursor)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ Cursor Bridge request timed out (3 min). The task may still be running.';
    }
    return `⚠️ Cursor Bridge connection failed: ${err.message}`;
  }
}
