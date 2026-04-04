import config from '../config.js';
import { safeFetch } from '../safe-fetch.js';

const cfg = config.providers.claudeCowork;

// Claude Cowork — Anthropic's collaborative AI agent
// Designed for multi-agent teamwork, delegation, and task coordination
// Uses tool_use capabilities for structured collaboration
export async function chat(messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const turns = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: `${system}\n\nYou are operating in collaborative cowork mode. You coordinate with other AI agents and humans. Break complex tasks into delegatable subtasks. Summarize progress clearly.`,
    messages: turns,
  };

  // Enable extended thinking for planning
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

  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('\n') || '';
}
