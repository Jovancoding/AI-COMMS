import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.ollama;

// Ollama runs locally — no API key needed
export async function chat(messages) {
  const data = await safeFetch(`${cfg.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: false,
    }),
  }, 120000); // 2 min timeout for local models
  return data.message?.content || '';
}
