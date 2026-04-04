import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.anthropic;

export async function chat(messages) {
  // Convert OpenAI-style messages to Anthropic format
  const system = messages.find(m => m.role === 'system')?.content || '';
  const turns = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const data = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      system,
      messages: turns,
    }),
  });
  return data.content?.[0]?.text || '';
}
