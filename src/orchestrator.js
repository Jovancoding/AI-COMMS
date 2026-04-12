// ==========================================
// Main Orchestrator — ties WhatsApp + AI + Protocol together
// ==========================================

import config from './config.js';
import { chat } from './providers/index.js';
import { chatWithFailover } from './failover.js';
import { parseIncoming, createAgentMessage, createReply } from './protocol.js';
import { securityGate, securityGateAgent, signAgentMessage } from './security.js';
import { encryptAgentPayload, decryptAgentPayload } from './encryption.js';
import { auditLog } from './audit-log.js';
import {
  createGroup, addMember, removeMember, listGroups, getGroup,
  getGroupByJid, broadcastToGroup, recordGroupMessage, getGroupContext,
} from './groups.js';
import {
  checkJailbreak, validateOutput, wrapUserInput,
  getHardenedSystemPrompt,
} from './jailbreak-defense.js';
import { JsonStore } from './storage.js';
import { describeMedia } from './media.js';
import { handleAnnouncement, markAgentSeen } from './discovery.js';
import { handleAdminCommand } from './admin.js';
import { recordIncoming, recordOutgoing, recordError } from './health.js';
import { isRemoteTask, handleRemoteTask } from './remote-agent.js';
import { isCopilotRequest, handleCopilotBridge, isBridgeAvailable } from './copilot-bridge.js';
import { isClaudeCodeRequest, handleClaudeCodeBridge } from './claude-code-bridge.js';
import { isCodexRequest, handleCodexBridge } from './codex-bridge.js';
import { isCursorRequest, handleCursorBridge } from './cursor-bridge.js';
import { isMultiAgentCommand, handleMultiAgentCommand } from './multi-agent.js';

const BASE_PROMPT = `You are ${config.agent.name}, a personal AI assistant connected to WhatsApp.
You can communicate with both humans and other AI agents.

When you receive a message from another AI agent (structured JSON), respond in the same structured format.
When you receive a message from a human, respond naturally and helpfully.

Your agent ID is: ${config.agent.id}
Current date: ${new Date().toISOString().split('T')[0]}

You can manage AI groups. When a human asks to create a group, add members, or send to a group, respond with a JSON command block like:
  {"command": "create-group", "name": "...", "purpose": "..."}
  {"command": "add-member", "groupId": "...", "phone": "...", "agentName": "..."}
  {"command": "group-message", "groupId": "...", "message": "..."}
  {"command": "list-groups"}
Wrap the JSON in \`\`\`json code fences so it can be detected.`;

const SYSTEM_PROMPT = getHardenedSystemPrompt(BASE_PROMPT);

// Persistent conversation store backed by data/conversations.json
const convStore = new JsonStore('conversations.json');

// Conversation memory per sender (hydrate from disk)
const conversations = new Map(convStore.entries().map(([k, v]) => [k, v]));

// Purge stale conversations every 30 minutes
const CONVERSATION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const conversationLastAccess = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [sender, ts] of conversationLastAccess) {
    if (now - ts > CONVERSATION_MAX_AGE_MS) {
      conversations.delete(sender);
      convStore.delete(sender);
      conversationLastAccess.delete(sender);
    }
  }
}, 30 * 60 * 1000).unref();

function getHistory(sender) {
  conversationLastAccess.set(sender, Date.now());
  if (!conversations.has(sender)) {
    conversations.set(sender, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }
  return conversations.get(sender);
}

function persistHistory(sender) {
  convStore.set(sender, conversations.get(sender));
}

export async function handleMessage(sender, text, whatsappClient, isGroup = false, mediaInfo = null) {
  recordIncoming();
  const incoming = parseIncoming(text);

  // --- Admin commands (bypass normal flow) ---
  if (!isGroup && incoming.type !== 'agent') {
    // Copilot Bridge: explicit !copilot / !cp prefix always goes to bridge
    if (isCopilotRequest(text)) {
      auditLog('INFO', 'copilot-bridge-request', { sender, length: text.length, explicit: true });
      const result = await handleCopilotBridge(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    // Claude Code Bridge: !claude / !cc prefix
    if (isClaudeCodeRequest(text)) {
      auditLog('INFO', 'claude-code-bridge-request', { sender, length: text.length });
      const result = await handleClaudeCodeBridge(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    // Codex Bridge: !codex / !cx prefix
    if (isCodexRequest(text)) {
      auditLog('INFO', 'codex-bridge-request', { sender, length: text.length });
      const result = await handleCodexBridge(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    // Cursor Bridge: !cursor / !cu prefix
    if (isCursorRequest(text)) {
      auditLog('INFO', 'cursor-bridge-request', { sender, length: text.length });
      const result = await handleCursorBridge(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    // Multi-agent commands: !agents, !team, !multi
    if (isMultiAgentCommand(text)) {
      auditLog('INFO', 'multi-agent-command', { sender, length: text.length });
      const result = await handleMultiAgentCommand(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    // Remote agent tasks: !do or !task
    if (isRemoteTask(text)) {
      const result = await handleRemoteTask(sender, text, whatsappClient);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }

    const adminResult = await handleAdminCommand(sender, text);
    if (adminResult) {
      await whatsappClient.sendMessage(sender, adminResult);
      recordOutgoing();
      return;
    }

    // Auto-route to Copilot Bridge when available and enabled (opt-in via env)
    if (process.env.COPILOT_BRIDGE_AUTO_ROUTE === 'true' && await isBridgeAvailable()) {
      auditLog('INFO', 'copilot-bridge-auto', { sender, length: text.length });
      const result = await handleCopilotBridge(sender, text);
      await whatsappClient.sendMessage(sender, result);
      recordOutgoing();
      return;
    }
  }

  // --- Security gate (agent messages get extra checks) ---
  if (incoming.type === 'agent') {
    const gate = securityGateAgent(sender, text, incoming.message);
    if (!gate.allowed) {
      console.warn(`[Security] Blocked agent message from ${sender}: ${gate.reason}`);
      await whatsappClient.sendMessage(sender, gate.reason);
      return;
    }
  } else {
    const gate = securityGate(sender, text);
    if (!gate.allowed) {
      console.warn(`[Security] Blocked message from ${sender}: ${gate.reason}`);
      return; // silently drop — don't reply to unauthorized senders
    }
  }

  // --- AI-to-AI protocol message (possibly group) ---
  if (incoming.type === 'agent') {
    const agentMsg = decryptAgentPayload(incoming.message);
    auditLog('INFO', 'agent-message-received', { from: agentMsg.from?.agentName, intent: agentMsg.intent });

    // Track agent in discovery registry
    if (agentMsg.from?.agentId) {
      markAgentSeen(agentMsg.from.agentId);
    }

    // Handle agent announcements
    if (handleAnnouncement(agentMsg)) {
      const reply = createReply(agentMsg, {
        agentId: config.agent.id,
        agentName: config.agent.name,
      }, `Hello ${agentMsg.from?.agentName}! I am ${config.agent.name}. Nice to meet you!`);
      const secured = encryptAgentPayload(signAgentMessage(reply));
      await whatsappClient.sendMessage(sender, JSON.stringify(secured));
      recordOutgoing();
      return;
    }

    // If it's a group message, record in group history
    if (agentMsg.group?.groupId) {
      recordGroupMessage(agentMsg.group.groupId, agentMsg.from, agentMsg.payload);
    }

    const history = getHistory(sender);
    const groupCtx = agentMsg.group?.groupId ? `\n[Group context]\n${getGroupContext(agentMsg.group.groupId)}` : '';

    console.log(`[Agent] Received from ${agentMsg.from.agentName}: ${agentMsg.intent}${agentMsg.group ? ` (group: ${agentMsg.group.groupName})` : ''}`);

    history.push({
      role: 'user',
      content: `[AI Agent "${agentMsg.from.agentName}" sent a ${agentMsg.intent} message]: ${JSON.stringify(agentMsg.payload)}${groupCtx}`,
    });

    const aiResponse = await chatWithFailover(history);
    history.push({ role: 'assistant', content: aiResponse });

    // If group message, broadcast reply back to group
    if (agentMsg.group?.groupId) {
      const selfAgent = { agentId: config.agent.id, agentName: config.agent.name };
      await broadcastToGroup(agentMsg.group.groupId, selfAgent, 'group-chat', aiResponse, whatsappClient);
    } else {
      const reply = createReply(agentMsg, {
        agentId: config.agent.id,
        agentName: config.agent.name,
      }, aiResponse);
      const secured = encryptAgentPayload(signAgentMessage(reply));
      await whatsappClient.sendMessage(sender, JSON.stringify(secured));
    }
    recordOutgoing();
    trimHistory(sender, history);
    return;
  }

  // --- WhatsApp group chat message (non-protocol, from a real WA group) ---
  if (isGroup) {
    const group = getGroupByJid(sender);
    if (group) {
      recordGroupMessage(group.groupId, { agentName: 'Human' }, text);
    }
  }

  // --- Jailbreak defense for human messages ---
  const jailCheck = checkJailbreak(sender, text);
  if (jailCheck.blocked) {
    console.warn(`[Jailbreak] Blocked from ${sender}: ${jailCheck.severity} — ${jailCheck.threats.map(t => t.layer).join(', ')}`);
    await whatsappClient.sendMessage(sender, "I can't process that request. How else can I help you?");
    return;
  }

  // --- Human message (direct or group) ---
  auditLog('INFO', 'human-message', { sender, length: text.length });
  const history = getHistory(sender);

  // Include media description if present
  const mediaDesc = mediaInfo ? describeMedia(mediaInfo) : '';
  const userContent = mediaDesc ? `${mediaDesc}\n${text}` : text;

  // Sandwich defense: wrap user input in XML tags
  history.push({ role: 'user', content: wrapUserInput(userContent) });

  const aiResponse = await chatWithFailover(history);

  // Output validation: check AI response before sending
  const outputCheck = validateOutput(aiResponse);
  if (!outputCheck.safe) {
    console.warn(`[Output] Blocked unsafe output for ${sender}: ${outputCheck.category}`);
    history.push({ role: 'assistant', content: outputCheck.filtered });
    await whatsappClient.sendMessage(sender, outputCheck.filtered);
    trimHistory(sender, history);
    return;
  }

  history.push({ role: 'assistant', content: aiResponse });

  // Check if AI wants to execute a group command
  const commandResult = await executeGroupCommands(aiResponse, whatsappClient);

  if (commandResult) {
    // Send both the AI response and the command result
    await whatsappClient.sendMessage(sender, `${aiResponse}\n\n${commandResult}`);
  } else {
    await whatsappClient.sendMessage(sender, aiResponse);
  }

  recordOutgoing();
  trimHistory(sender, history);
}

function trimHistory(sender, history) {
  if (history.length > 51) {
    const system = history[0];
    conversations.set(sender, [system, ...history.slice(-50)]);
  }
  persistHistory(sender);
}

/**
 * Parse and execute group commands from AI responses.
 */
async function executeGroupCommands(aiResponse, whatsappClient) {
  const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const cmd = JSON.parse(jsonMatch[1].trim());

    switch (cmd.command) {
      case 'create-group': {
        const group = createGroup({ name: cmd.name, purpose: cmd.purpose, members: cmd.members || [] });
        return `Group created: "${group.name}" (ID: ${group.groupId})`;
      }
      case 'add-member': {
        const group = addMember(cmd.groupId, {
          phone: cmd.phone,
          agentId: cmd.agentId || cmd.phone,
          agentName: cmd.agentName || 'Agent',
        });
        return `Added ${cmd.agentName || cmd.phone} to "${group.name}"`;
      }
      case 'remove-member': {
        const group = removeMember(cmd.groupId, cmd.phone);
        return `Removed ${cmd.phone} from "${group.name}"`;
      }
      case 'group-message': {
        const selfAgent = { agentId: config.agent.id, agentName: config.agent.name };
        await broadcastToGroup(cmd.groupId, selfAgent, 'group-chat', cmd.message, whatsappClient);
        return `Message sent to group "${getGroup(cmd.groupId)?.name}"`;
      }
      case 'list-groups': {
        const all = listGroups();
        if (all.length === 0) return 'No groups yet.';
        return all.map(g =>
          `- "${g.name}" (${g.groupId}) — ${g.members.length} members — ${g.purpose || 'no purpose set'}`
        ).join('\n');
      }
      default:
        return null;
    }
  } catch (err) {
    console.error('[Group Command] Failed:', err.message);
    return null;
  }
}

/**
 * Send a message from this AI agent to another AI agent's WhatsApp number.
 */
export async function sendToAgent(whatsappClient, targetPhone, intent, payload) {
  const msg = createAgentMessage({
    from: {
      agentId: config.agent.id,
      agentName: config.agent.name,
    },
    to: { phone: targetPhone },
    intent,
    payload,
  });

  const secured = encryptAgentPayload(signAgentMessage(msg));
  await whatsappClient.sendMessage(targetPhone, JSON.stringify(secured));
  auditLog('INFO', 'agent-message-sent', { to: targetPhone, intent });
  return secured;
}

/**
 * Send a message from this AI agent to an AI group.
 */
export async function sendToGroup(whatsappClient, groupId, message) {
  const selfAgent = { agentId: config.agent.id, agentName: config.agent.name };
  return broadcastToGroup(groupId, selfAgent, 'group-chat', message, whatsappClient);
}

// Re-export group management for external use
export { createGroup, addMember, removeMember, listGroups, getGroup } from './groups.js';
