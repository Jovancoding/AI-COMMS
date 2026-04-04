// ==========================================
// Group Manager — Multi-agent group conversations
// ==========================================
// Allows multiple AI agents to form groups and collaborate.
// A group can be:
//   1. A real WhatsApp group (all agents added to one group chat)
//   2. A virtual group (this agent fans out messages to all members)

import config from './config.js';
import { createAgentMessage } from './protocol.js';
import { JsonStore } from './storage.js';

// Persistent group store backed by data/groups.json
const store = new JsonStore('groups.json');

// In-memory map kept in sync with disk for fast access
const groups = new Map(store.entries().map(([k, v]) => [k, v]));

function persistGroup(groupId) {
  store.set(groupId, groups.get(groupId));
}

/**
 * @typedef {Object} GroupMember
 * @property {string} phone    - WhatsApp number or JID
 * @property {string} agentId  - Agent identifier
 * @property {string} agentName - Display name
 * @property {string} role     - "admin" | "member"
 */

/**
 * @typedef {Object} GroupInfo
 * @property {string} groupId
 * @property {string} name
 * @property {string} purpose     - What the group is for
 * @property {string} createdBy   - agentId of creator
 * @property {string} createdAt
 * @property {GroupMember[]} members
 * @property {Array} history      - Shared conversation history
 * @property {string} mode        - "whatsapp-group" | "virtual"
 * @property {string} [whatsappGroupJid] - If mode is whatsapp-group
 */

/**
 * Create a new virtual group.
 */
export function createGroup({ name, purpose, members = [] }) {
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Always include self as admin
  const self = {
    phone: 'self',
    agentId: config.agent.id,
    agentName: config.agent.name,
    role: 'admin',
  };

  const group = {
    groupId,
    name,
    purpose: purpose || '',
    createdBy: config.agent.id,
    createdAt: new Date().toISOString(),
    members: [self, ...members.map(m => ({ ...m, role: m.role || 'member' }))],
    history: [],
    mode: 'virtual',
  };

  groups.set(groupId, group);
  persistGroup(groupId);
  console.log(`[Group] Created "${name}" (${groupId}) with ${group.members.length} members`);
  return group;
}

/**
 * Register an existing WhatsApp group chat for AI-to-AI use.
 */
export function registerWhatsAppGroup({ whatsappGroupJid, name, purpose, members = [] }) {
  const groupId = `wag_${Date.now()}`;
  const group = {
    groupId,
    name,
    purpose: purpose || '',
    createdBy: config.agent.id,
    createdAt: new Date().toISOString(),
    members,
    history: [],
    mode: 'whatsapp-group',
    whatsappGroupJid,
  };

  groups.set(groupId, group);
  persistGroup(groupId);
  console.log(`[Group] Registered WhatsApp group "${name}" (${whatsappGroupJid})`);
  return group;
}

/**
 * Add a member to a group.
 */
export function addMember(groupId, member) {
  const group = groups.get(groupId);
  if (!group) throw new Error(`Group ${groupId} not found`);

  if (group.members.some(m => m.phone === member.phone)) {
    console.log(`[Group] ${member.agentName} is already in "${group.name}"`);
    return group;
  }

  group.members.push({ ...member, role: member.role || 'member' });
  persistGroup(groupId);
  console.log(`[Group] Added ${member.agentName} to "${group.name}"`);
  return group;
}

/**
 * Remove a member from a group.
 */
export function removeMember(groupId, phone) {
  const group = groups.get(groupId);
  if (!group) throw new Error(`Group ${groupId} not found`);
  group.members = group.members.filter(m => m.phone !== phone);
  persistGroup(groupId);
  return group;
}

/**
 * Get all groups this agent is part of.
 */
export function listGroups() {
  return [...groups.values()];
}

/**
 * Get a specific group.
 */
export function getGroup(groupId) {
  return groups.get(groupId) || null;
}

/**
 * Find a group by WhatsApp group JID.
 */
export function getGroupByJid(jid) {
  for (const group of groups.values()) {
    if (group.whatsappGroupJid === jid) return group;
  }
  return null;
}

/**
 * Broadcast a message to all members of a virtual group.
 * Sends the protocol message to each member except the sender.
 */
export async function broadcastToGroup(groupId, fromAgent, intent, payload, whatsappClient) {
  const group = groups.get(groupId);
  if (!group) throw new Error(`Group ${groupId} not found`);

  const envelope = createAgentMessage({
    from: fromAgent,
    to: { groupId, groupName: group.name },
    intent,
    payload,
    conversationId: groupId, // use groupId as ongoing conversation
  });

  // Add group context to the envelope
  envelope.group = {
    groupId: group.groupId,
    groupName: group.name,
    memberCount: group.members.length,
  };

  // Record in group history
  group.history.push({
    from: fromAgent,
    intent,
    payload,
    timestamp: envelope.timestamp,
  });

  // Trim group history
  if (group.history.length > 100) {
    group.history = group.history.slice(-100);
  }

  persistGroup(groupId);

  const jsonMsg = JSON.stringify(envelope);

  if (group.mode === 'whatsapp-group' && group.whatsappGroupJid) {
    // Send once to the WhatsApp group
    await whatsappClient.sendMessage(group.whatsappGroupJid, jsonMsg);
  } else {
    // Virtual group: fan out to each member individually
    for (const member of group.members) {
      if (member.agentId === fromAgent.agentId) continue; // skip self
      if (member.phone === 'self') continue;
      await whatsappClient.sendMessage(member.phone, jsonMsg);
    }
  }

  console.log(`[Group] Broadcast ${intent} to "${group.name}" (${group.members.length} members)`);
  return envelope;
}

/**
 * Handle an incoming group message — records it and returns context.
 */
export function recordGroupMessage(groupId, fromAgent, text) {
  const group = groups.get(groupId);
  if (!group) return null;

  group.history.push({
    from: fromAgent,
    intent: 'chat',
    payload: text,
    timestamp: new Date().toISOString(),
  });

  if (group.history.length > 100) {
    group.history = group.history.slice(-100);
  }

  persistGroup(groupId);
  return group;
}

/**
 * Get a summary of group history for AI context.
 */
export function getGroupContext(groupId) {
  const group = groups.get(groupId);
  if (!group) return '';

  const lines = [
    `Group: "${group.name}" | Purpose: ${group.purpose || 'general'}`,
    `Members: ${group.members.map(m => m.agentName).join(', ')}`,
    '--- Recent messages ---',
  ];

  for (const entry of group.history.slice(-20)) {
    const name = entry.from?.agentName || 'Unknown';
    const content = typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload);
    lines.push(`[${name}]: ${content}`);
  }

  return lines.join('\n');
}
