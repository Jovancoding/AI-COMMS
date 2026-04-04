// ==========================================
// Provider Failover — automatic fallback on AI provider errors
// ==========================================
// Wraps the provider router with retry + fallback logic.
// If the primary provider fails, tries the fallback chain.

import config from './config.js';
import { auditLog } from './audit-log.js';
import { acquireToken } from './rate-limiter.js';

const providerModules = {
  openai:          () => import('./providers/openai.js'),
  anthropic:       () => import('./providers/anthropic.js'),
  google:          () => import('./providers/google.js'),
  mistral:         () => import('./providers/mistral.js'),
  cohere:          () => import('./providers/cohere.js'),
  groq:            () => import('./providers/groq.js'),
  ollama:          () => import('./providers/ollama.js'),
  deepseek:        () => import('./providers/deepseek.js'),
  xai:             () => import('./providers/xai.js'),
  perplexity:      () => import('./providers/perplexity.js'),
  together:        () => import('./providers/together.js'),
  fireworks:       () => import('./providers/fireworks.js'),
  codex:           () => import('./providers/codex.js'),
  copilot:         () => import('./providers/copilot.js'),
  'claude-code':   () => import('./providers/claude-code.js'),
  'claude-cowork': () => import('./providers/claude-cowork.js'),
  'nvidia-nim':    () => import('./providers/nvidia-nim.js'),
  openclaw:        () => import('./providers/openclaw.js'),
};

// Fallback chain from env, e.g. "anthropic,google,groq"
const fallbackChain = (process.env.AI_FALLBACK_PROVIDERS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const providerCache = new Map();

async function loadProvider(name) {
  if (providerCache.has(name)) return providerCache.get(name);
  const loader = providerModules[name];
  if (!loader) return null;
  const mod = await loader();
  providerCache.set(name, mod);
  return mod;
}

export async function chatWithFailover(messages) {
  const primary = config.aiProvider;
  const chain = [primary, ...fallbackChain.filter(p => p !== primary)];

  for (const providerName of chain) {
    try {
      const provider = await loadProvider(providerName);
      if (!provider) continue;
      await acquireToken(providerName); // wait for rate limit token
      const response = await provider.chat(messages);
      if (response && providerName !== primary) {
        auditLog('WARN', 'provider-failover', { from: primary, to: providerName });
      }
      return response;
    } catch (err) {
      auditLog('ERROR', 'provider-error', {
        provider: providerName,
        error: err.message,
      });
      console.error(`[Failover] ${providerName} failed: ${err.message}`);
      // Try next in chain
    }
  }

  // All providers failed
  auditLog('ERROR', 'all-providers-failed', { chain });
  return 'I apologize, but I am temporarily unable to process your message. Please try again later.';
}
