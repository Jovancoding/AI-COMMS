// ==========================================
// Claude Code Bridge Client
// Forwards messages to the Claude Code CLI agent
// ==========================================

import config from './config.js';

const BRIDGE_PORT = process.env.CLAUDE_CODE_BRIDGE_PORT || 3121;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_TOKEN = process.env.CLAUDE_CODE_BRIDGE_TOKEN || '';
const TIMEOUT_MS = 180_000; // 3 minutes — Claude Code runs multi-step tasks

function bridgeHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (BRIDGE_TOKEN) h['Authorization'] = `Bearer ${BRIDGE_TOKEN}`;
  return h;
}

/**
 * Check if a message is an explicit Claude Code Bridge request.
 * Prefix: !claude or !cc
 */
export function isClaudeCodeRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!claude ') || t.startsWith('!cc ') ||
         t === '!claude' || t === '!cc';
}

/**
 * Extract the actual message (strip prefix if present).
 */
function extractMessage(text) {
  const t = text.trim();
  if (t.toLowerCase().startsWith('!claude ')) return t.slice(8).trim();
  if (t.toLowerCase().startsWith('!cc ')) return t.slice(4).trim();
  if (t.toLowerCase() === '!claude' || t.toLowerCase() === '!cc') return 'hello';
  return t;
}

/**
 * Check if the Claude Code bridge is running.
 */
export async function isClaudeCodeBridgeAvailable() {
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
 * Send a message to the Claude Code Bridge and get the response.
 */
export async function handleClaudeCodeBridge(sender, text) {
  const message = extractMessage(text);
  console.log(`[ClaudeCodeBridge] Sending to bridge: "${message.slice(0, 80)}" from ${sender}`);

  const available = await isClaudeCodeBridgeAvailable();
  if (!available) {
    return '⚠️ Claude Code Bridge is not running.\n\n' +
      'To use this feature:\n' +
      '1. Start the Claude Code bridge server\n' +
      '2. Ensure it is listening on port ' + BRIDGE_PORT + '\n' +
      '3. Set CLAUDE_CODE_BRIDGE_PORT in .env if using a different port';
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
      return `⚠️ Claude Code Bridge error: ${err.error || res.statusText}`;
    }

    const data = await res.json();
    return data.response || '(Empty response from Claude Code)';
  } catch (err) {
    if (err.name === 'AbortError') {
      return '⏰ Claude Code Bridge request timed out (3 min). The task may still be running.';
    }
    return `⚠️ Claude Code Bridge connection failed: ${err.message}`;
  }
}
