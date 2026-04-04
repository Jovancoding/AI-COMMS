// ==========================================
// OpenClaw Provider
// Connects to a running OpenClaw Gateway via its HTTP API
// OpenClaw is a personal AI assistant (https://openclaw.ai)
// It routes to whatever model is configured on the OpenClaw instance
// ==========================================

import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.openclaw;

export async function chat(messages) {
  // OpenClaw Gateway exposes a WebSocket + HTTP control plane.
  // We send messages via the CLI-compatible HTTP endpoint or
  // the OpenAI-compatible proxy that OpenClaw can expose.
  const lastMessage = messages[messages.length - 1]?.content || '';

  let data;
  try {
    data = await safeFetch(`${cfg.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.authToken ? { 'Authorization': `Bearer ${cfg.authToken}` } : {}),
      },
      body: JSON.stringify({
        message: lastMessage,
        session: cfg.session,
        history: messages.slice(0, -1),
      }),
    });
  } catch {
    // Fallback: try OpenAI-compatible endpoint (openclaw can proxy as /v1/chat/completions)
    data = await safeFetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.authToken ? { 'Authorization': `Bearer ${cfg.authToken}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model || 'default',
        messages,
      }),
    });
    return data.choices?.[0]?.message?.content || '';
  }

  return data.reply || data.response || data.choices?.[0]?.message?.content || '';
}
