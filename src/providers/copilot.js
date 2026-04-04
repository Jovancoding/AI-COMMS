import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.copilot;

// GitHub Copilot — uses the GitHub Models / Copilot API
// Requires a GitHub token with Copilot access
// Works with models hosted on GitHub's inference endpoint
export async function chat(messages) {
  const data = await safeFetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
    }),
  });
  return data.choices?.[0]?.message?.content || '';
}
