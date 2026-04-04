import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.claudeCode;

// Claude Code — Anthropic's agentic coding model
// Optimized for code generation, debugging, and multi-step coding tasks
// Uses extended thinking for complex reasoning chains
export async function chat(messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const turns = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: `${system}\n\nYou are operating in code-agent mode. Provide precise, working code solutions. Think step-by-step for complex problems.`,
    messages: turns,
  };

  // Enable extended thinking if budget is set
  if (cfg.thinkingBudget > 0) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: cfg.thinkingBudget,
    };
  }

  const data = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Extract text from content blocks (may include thinking blocks)
  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('\n') || '';
}
