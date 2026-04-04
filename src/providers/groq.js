import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.groq;

// Groq uses OpenAI-compatible API
export async function chat(messages) {
  const data = await safeFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
    }),
  });
  return data.choices?.[0]?.message?.content || '';
}
