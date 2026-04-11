// ==========================================
// Copilot Bridge Client
// Forwards messages to the VS Code Copilot Bridge extension
// ==========================================

import config from './config.js';

const BRIDGE_PORT = process.env.COPILOT_BRIDGE_PORT || 3120;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const TIMEOUT_MS = 120_000; // 2 minutes — tool-calling can take time

/**
 * Check if a message is an explicit Copilot Bridge request.
 * Prefix: !copilot or !cp
 */
export function isCopilotRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!copilot ') || t.startsWith('!cp ') ||
         t === '!copilot' || t === '!cp';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!copilot ')) return t.slice(9).trim();
  if (t.toLowerCase().startsWith('!cp ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!copilot' || t.toLowerCase() === '!cp') return 'hello';
  return t; // no prefix — pass through as-is
}

/**
 * Check if the bridge extension is running.
 */
export async function isBridgeAvailable() {
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
 * Send a message to the Copilot Bridge and get the response.
 */
export async function handleCopilotBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[CopilotBridge] Sending to bridge: "${message.slice(0, 80)}" from ${sender}`);

  // Check if bridge is available
  const available = await isBridgeAvailable();
  if (!available) {
    return '⚠️ Copilot Bridge is not running.\n\n' +
      'To use this feature:\n' +
      '1. Open VS Code with the workspace\n' +
      '2. The Copilot Bridge extension auto-starts\n' +
      '3. Or run: Copilot Bridge: Start Server from the Command Palette';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${BRIDGE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sender }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return `⚠️ Copilot Bridge error: ${err.error || res.statusText}`;
    }

    const data = await res.json();
    return data.response || '(Empty response from Copilot)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ Copilot Bridge request timed out (2 min). The task may still be running in VS Code.';
    }
    return `⚠️ Copilot Bridge connection failed: ${err.message}`;
  }
}
