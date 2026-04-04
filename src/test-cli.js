// ==========================================
// CLI Test Mode — test your AI without WhatsApp
// ==========================================
// Run: npm test
// Type messages in the terminal, AI responds.
// Simulates both human and AI-to-AI messages.

import readline from 'readline';
import config from './config.js';
import { chat } from './providers/index.js';
import { parseIncoming, createAgentMessage, createReply } from './protocol.js';
import { createGroup, broadcastToGroup, getGroupContext, listGroups, addMember } from './groups.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const history = [
  {
    role: 'system',
    content: `You are ${config.agent.name}, a personal AI assistant. Agent ID: ${config.agent.id}. You are in CLI test mode.`,
  },
];

// Fake WhatsApp client for testing groups
const fakeClient = {
  async sendMessage(phone, text) {
    const parsed = parseIncoming(text);
    if (parsed.type === 'agent') {
      console.log(`\n  [→ Sent to ${phone}] (protocol: ${parsed.message.intent})`);
      console.log(`     Payload: ${JSON.stringify(parsed.message.payload).slice(0, 200)}`);
    } else {
      console.log(`\n  [→ Sent to ${phone}]: ${text.slice(0, 300)}`);
    }
  },
};

function printHelp() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║         CLI Test Mode — Commands             ║
  ╠══════════════════════════════════════════════╣
  ║  (just type)  → Chat with your AI            ║
  ║  /agent       → Simulate an AI-to-AI message ║
  ║  /group       → Create a test group          ║
  ║  /broadcast   → Send to group                ║
  ║  /groups      → List all groups              ║
  ║  /provider    → Show current AI provider     ║
  ║  /providers   → List all available providers ║
  ║  /help        → Show this menu               ║
  ║  /quit        → Exit                         ║
  ╚══════════════════════════════════════════════╝
  `);
}

const ALL_PROVIDERS = [
  'openai', 'anthropic', 'google', 'mistral', 'cohere', 'groq',
  'ollama', 'deepseek', 'xai', 'perplexity', 'together', 'fireworks',
  'codex', 'copilot', 'claude-code', 'claude-cowork',
];

async function handleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // --- Commands ---
  if (trimmed === '/quit' || trimmed === '/exit') {
    console.log('\nBye!');
    process.exit(0);
  }

  if (trimmed === '/help') {
    printHelp();
    return;
  }

  if (trimmed === '/provider') {
    console.log(`\n  Active provider: ${config.aiProvider} (model: ${config.providers[config.aiProvider]?.model || config.providers.claudeCode?.model || 'default'})\n`);
    return;
  }

  if (trimmed === '/providers') {
    console.log('\n  Available providers:');
    for (const p of ALL_PROVIDERS) {
      const active = p === config.aiProvider ? ' ← ACTIVE' : '';
      console.log(`    - ${p}${active}`);
    }
    console.log();
    return;
  }

  if (trimmed === '/agent') {
    // Simulate receiving an AI-to-AI protocol message
    const testMsg = createAgentMessage({
      from: { agentId: 'test_agent', agentName: 'TestBot', phone: '+0000000000' },
      to: { agentId: config.agent.id, agentName: config.agent.name },
      intent: 'chat',
      payload: 'Hello! I am another AI agent. What can you help me with?',
    });
    console.log('\n  [Simulating incoming agent message...]');
    console.log(`  From: ${testMsg.from.agentName} | Intent: ${testMsg.intent}`);

    const incoming = parseIncoming(JSON.stringify(testMsg));
    history.push({
      role: 'user',
      content: `[AI Agent "${incoming.message.from.agentName}" sent a ${incoming.message.intent} message]: ${JSON.stringify(incoming.message.payload)}`,
    });

    console.log('\n  Thinking...');
    const response = await chat(history);
    history.push({ role: 'assistant', content: response });
    console.log(`\n  ${config.agent.name}: ${response}\n`);

    // Show what the reply protocol message looks like
    const reply = createReply(incoming.message, {
      agentId: config.agent.id,
      agentName: config.agent.name,
    }, response);
    console.log('  [Protocol reply that would be sent back]:');
    console.log(`  ${JSON.stringify(reply, null, 2).split('\n').join('\n  ')}\n`);
    return;
  }

  if (trimmed === '/group') {
    const group = createGroup({
      name: 'Test Group',
      purpose: 'Testing AI-to-AI group communication',
      members: [
        { phone: '+1111111111', agentId: 'bot_alice', agentName: 'AliceAI' },
        { phone: '+2222222222', agentId: 'bot_bob', agentName: 'BobAI' },
      ],
    });
    console.log(`\n  Created group: "${group.name}" (${group.groupId})`);
    console.log(`  Members: ${group.members.map(m => m.agentName).join(', ')}\n`);
    return;
  }

  if (trimmed === '/groups') {
    const all = listGroups();
    if (all.length === 0) {
      console.log('\n  No groups yet. Use /group to create one.\n');
    } else {
      console.log('\n  Groups:');
      for (const g of all) {
        console.log(`    - "${g.name}" (${g.groupId}) — ${g.members.length} members`);
      }
      console.log();
    }
    return;
  }

  if (trimmed === '/broadcast') {
    const all = listGroups();
    if (all.length === 0) {
      console.log('\n  No groups. Use /group first.\n');
      return;
    }
    const group = all[0];
    const self = { agentId: config.agent.id, agentName: config.agent.name };
    console.log(`\n  Broadcasting to "${group.name}"...`);
    await broadcastToGroup(group.groupId, self, 'group-chat', 'Hello group! This is a test broadcast.', fakeClient);
    console.log('  Done!\n');
    return;
  }

  // --- Normal chat ---
  history.push({ role: 'user', content: trimmed });
  console.log('\n  Thinking...');

  try {
    const response = await chat(history);
    history.push({ role: 'assistant', content: response });
    console.log(`\n  ${config.agent.name}: ${response}\n`);
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    history.pop(); // remove the failed user message
  }
}

async function main() {
  console.log('===========================================');
  console.log(`  AI Agent CLI Test Mode`);
  console.log(`  Agent: ${config.agent.name} (${config.agent.id})`);
  console.log(`  Provider: ${config.aiProvider}`);
  console.log('===========================================');
  printHelp();

  // Verify provider loads
  try {
    console.log('  Loading AI provider...');
    const { getProvider } = await import('./providers/index.js');
    await getProvider();
    console.log('  Provider loaded successfully!\n');
  } catch (err) {
    console.error(`  Failed to load provider "${config.aiProvider}": ${err.message}`);
    console.error('  Check your .env file and API key.\n');
  }

  const prompt = () => {
    rl.question('You: ', async (input) => {
      await handleInput(input);
      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
