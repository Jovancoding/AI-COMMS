// ==========================================
// NVIDIA NIM / NemoClaw Provider
// Uses NVIDIA's NIM inference endpoints (OpenAI-compatible)
// Models: Nemotron, Llama, Gemma, MiniMax, Kimi — via build.nvidia.com
// Get an API key at https://build.nvidia.com
// ==========================================

import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.nvidiaNim;

export async function chat(messages) {
  const data = await safeFetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: cfg.maxTokens,
    }),
  });
  return data.choices?.[0]?.message?.content || '';
}
