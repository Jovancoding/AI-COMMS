import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.cohere;

export async function chat(messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const chatHistory = [];
  const turns = messages.filter(m => m.role !== 'system');

  // Last user message is the "message", rest are history
  const lastMsg = turns.pop();
  for (const t of turns) {
    chatHistory.push({
      role: t.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: t.content,
    });
  }

  const data = await safeFetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      message: lastMsg?.content || '',
      preamble: system,
      chat_history: chatHistory,
    }),
  });
  return data.text || '';
}
