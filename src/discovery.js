// ==========================================
// Agent Discovery — find and register AI agents on the network
// ==========================================
// Maintains a registry of known agents. Agents can announce themselves
// and discover other agents by querying the local registry or a
// shared discovery server.

import config from './config.js';
import { JsonStore } from './storage.js';
import { createAgentMessage } from './protocol.js';
import { auditLog } from './audit-log.js';

const registry = new JsonStore('agent-registry.json');

/**
 * Register an agent in the local directory.
 */
export function registerAgent({ agentId, agentName, phone, providers = [], capabilities = [] }) {
  const entry = {
    agentId,
    agentName,
    phone,
    providers,        // e.g. ['openai', 'anthropic']
    capabilities,     // e.g. ['chat', 'code', 'research']
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    status: 'online',
  };
  registry.set(agentId, entry);
  auditLog('INFO', 'agent-registered', { agentId, agentName });
  return entry;
}

/**
 * Update an agent's last-seen timestamp.
 */
export function markAgentSeen(agentId) {
  const agent = registry.get(agentId);
  if (agent) {
    agent.lastSeenAt = new Date().toISOString();
    agent.status = 'online';
    registry.set(agentId, agent);
  }
}

/**
 * Mark an agent as offline.
 */
export function markAgentOffline(agentId) {
  const agent = registry.get(agentId);
  if (agent) {
    agent.status = 'offline';
    registry.set(agentId, agent);
  }
}

/**
 * Get all known agents.
 */
export function listAgents() {
  return registry.values();
}

/**
 * Get a specific agent by ID.
 */
export function getAgent(agentId) {
  return registry.get(agentId);
}

/**
 * Find agents by capability.
 */
export function findAgentsByCapability(capability) {
  return registry.values().filter(a =>
    a.capabilities.includes(capability) && a.status === 'online'
  );
}

/**
 * Find agents by provider.
 */
export function findAgentsByProvider(provider) {
  return registry.values().filter(a =>
    a.providers.includes(provider) && a.status === 'online'
  );
}

/**
 * Remove an agent from the registry.
 */
export function unregisterAgent(agentId) {
  registry.delete(agentId);
  auditLog('INFO', 'agent-unregistered', { agentId });
}

/**
 * Register this agent (self) on startup.
 */
export function registerSelf() {
  return registerAgent({
    agentId: config.agent.id,
    agentName: config.agent.name,
    phone: 'self',
    providers: [config.aiProvider],
    capabilities: ['chat', 'groups'],
  });
}

/**
 * Create an announcement message for other agents.
 * Send this to new contacts to introduce yourself.
 */
export function createAnnouncement() {
  return createAgentMessage({
    from: {
      agentId: config.agent.id,
      agentName: config.agent.name,
    },
    to: { agentId: 'broadcast' },
    intent: 'announce',
    payload: {
      agentId: config.agent.id,
      agentName: config.agent.name,
      providers: [config.aiProvider],
      capabilities: ['chat', 'groups'],
      message: `Hello! I am ${config.agent.name}, an AI agent on AI COMMS.`,
    },
  });
}

/**
 * Handle an incoming announcement from another agent.
 */
export function handleAnnouncement(agentMsg) {
  if (agentMsg.intent !== 'announce') return false;
  const payload = agentMsg.payload;
  registerAgent({
    agentId: payload.agentId || agentMsg.from?.agentId,
    agentName: payload.agentName || agentMsg.from?.agentName,
    phone: agentMsg.from?.phone || '',
    providers: payload.providers || [],
    capabilities: payload.capabilities || [],
  });
  return true;
}
