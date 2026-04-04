// ==========================================
// Admin Commands — runtime management via WhatsApp messages
// ==========================================
// Prefix commands with ! to execute admin actions.
// Only allowed for senders on the admin list.

import config from './config.js';
import { listGroups, getGroup } from './groups.js';
import { listAgents } from './discovery.js';
import { getRecentLogs } from './audit-log.js';
import { auditLog } from './audit-log.js';

// Admin list from env (comma-separated phone numbers)
const adminList = (process.env.ADMIN_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function isAdmin(sender) {
  if (adminList.length === 0) return false; // no admins configured
  const normalized = sender.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '').trim();
  return adminList.some(a => normalized.includes(a));
}

export async function handleAdminCommand(sender, text) {
  if (!text.startsWith('!')) return null;
  if (!isAdmin(sender)) {
    auditLog('WARN', 'unauthorized-admin-attempt', { sender, command: text.slice(0, 50) });
    return null; // silently ignore — don't reveal admin commands exist
  }

  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case 'status': {
      const uptime = Math.round(process.uptime());
      const mem = process.memoryUsage();
      return [
        `**Agent Status**`,
        `Name: ${config.agent.name} (${config.agent.id})`,
        `Provider: ${config.aiProvider}`,
        `Platform: ${config.platform}`,
        `Uptime: ${formatDuration(uptime)}`,
        `Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        `Node: ${process.version}`,
      ].join('\n');
    }

    case 'groups': {
      const groups = listGroups();
      if (groups.length === 0) return 'No groups.';
      return groups.map(g =>
        `• "${g.name}" (${g.groupId}) — ${g.members.length} members`
      ).join('\n');
    }

    case 'agents': {
      const agents = listAgents();
      if (agents.length === 0) return 'No agents registered.';
      return agents.map(a =>
        `• ${a.agentName} (${a.agentId}) — ${a.status} — providers: ${a.providers.join(', ')}`
      ).join('\n');
    }

    case 'logs': {
      const count = parseInt(parts[1]) || 10;
      const logs = getRecentLogs(Math.min(count, 50));
      if (logs.length === 0) return 'No recent logs.';
      return logs.map(l =>
        `[${l.level}] ${l.event} — ${l.timestamp?.slice(11, 19) || ''}`
      ).join('\n');
    }

    case 'provider': {
      return `Current: ${config.aiProvider} (model: ${config.providers[config.aiProvider]?.model || 'default'})`;
    }

    case 'security': {
      const sec = config.security;
      return [
        `**Security Config**`,
        `Allowlist: ${sec.enableAllowlist ? 'ON' : 'OFF'} (${sec.allowlist.length} entries)`,
        `Rate limit: ${sec.enableRateLimit ? 'ON' : 'OFF'} (${sec.rateLimitMaxMessages}/${sec.rateLimitWindowMs}ms)`,
        `Input sanitization: ${sec.enableInputSanitization ? 'ON' : 'OFF'}`,
        `Block injection: ${sec.blockPromptInjection ? 'YES' : 'log-only'}`,
        `Agent auth: ${sec.requireAgentAuth ? 'REQUIRED' : 'OFF'}`,
        `Encryption: ${sec.encryptionKey ? 'ON' : 'OFF'}`,
        `TLS: ${sec.tlsCertPath ? 'ON' : 'OFF'}`,
      ].join('\n');
    }

    case 'help':
      return [
        `**Admin Commands**`,
        `!status  — Agent status & memory usage`,
        `!groups  — List all groups`,
        `!agents  — List registered agents`,
        `!logs [n] — Show recent audit logs`,
        `!provider — Current AI provider`,
        `!security — Security configuration`,
        `!help    — This menu`,
      ].join('\n');

    default:
      return `Unknown command: !${cmd}. Try !help`;
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
