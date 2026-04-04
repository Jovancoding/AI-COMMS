// ==========================================
// Provider Router — dynamically loads the active AI provider
// ==========================================

import config from '../config.js';

const providerModules = {
  openai:     () => import('./openai.js'),
  anthropic:  () => import('./anthropic.js'),
  google:     () => import('./google.js'),
  mistral:    () => import('./mistral.js'),
  cohere:     () => import('./cohere.js'),
  groq:       () => import('./groq.js'),
  ollama:     () => import('./ollama.js'),
  deepseek:   () => import('./deepseek.js'),
  xai:        () => import('./xai.js'),
  perplexity: () => import('./perplexity.js'),
  together:   () => import('./together.js'),
  fireworks:  () => import('./fireworks.js'),
  codex:          () => import('./codex.js'),
  copilot:        () => import('./copilot.js'),
  'claude-code':  () => import('./claude-code.js'),
  'claude-cowork': () => import('./claude-cowork.js'),
  'nvidia-nim':   () => import('./nvidia-nim.js'),
  openclaw:       () => import('./openclaw.js'),
};

let _provider = null;

export async function getProvider() {
  if (_provider) return _provider;

  const name = config.aiProvider;
  const loader = providerModules[name];
  if (!loader) {
    throw new Error(
      `Unknown AI provider "${name}". Available: ${Object.keys(providerModules).join(', ')}`
    );
  }

  _provider = await loader();
  console.log(`[AI] Loaded provider: ${name} (model: ${config.providers[name]?.model || 'default'})`);
  return _provider;
}

export async function chat(messages) {
  const provider = await getProvider();
  return provider.chat(messages);
}
