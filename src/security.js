// ==========================================
// Security Module — Protects the AI Agent Network
// ==========================================
// Handles: allowlists, rate limiting, agent auth,
// message size caps, input sanitization, and audit logging.

import crypto from 'crypto';
import config from './config.js';
import { auditLog } from './audit-log.js';
import { checkJailbreak } from './jailbreak-defense.js';

const sec = config.security;

// ---- 1. Allowlist / Blocklist ----

export function isAllowed(sender) {
  if (!sec.enableAllowlist) return true;

  // Check blocklist first (always blocks even if allowlist is off)
  if (sec.blocklist.length > 0) {
    const normalized = normalizeSender(sender);
    if (sec.blocklist.some(b => normalized.includes(normalizeSender(b)))) {
      auditLog('BLOCK', 'blocklist-hit', { sender });
      return false;
    }
  }

  // If allowlist is enabled but empty, allow everyone (open mode)
  if (sec.allowlist.length === 0) return true;

  const normalized = normalizeSender(sender);
  const allowed = sec.allowlist.some(a => normalized.includes(normalizeSender(a)));

  if (!allowed) {
    auditLog('BLOCK', 'not-on-allowlist', { sender });
  }
  return allowed;
}

function normalizeSender(s) {
  // Strip WhatsApp suffixes like @s.whatsapp.net or @g.us for comparison
  return s.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '').trim();
}

// ---- 2. Rate Limiting ----

const rateBuckets = new Map(); // sender -> { count, windowStart }

export function checkRateLimit(sender) {
  if (!sec.enableRateLimit) return true;

  const now = Date.now();
  const bucket = rateBuckets.get(sender);

  if (!bucket || (now - bucket.windowStart) > sec.rateLimitWindowMs) {
    // New window
    rateBuckets.set(sender, { count: 1, windowStart: now });
    return true;
  }

  bucket.count++;

  if (bucket.count > sec.rateLimitMaxMessages) {
    auditLog('BLOCK', 'rate-limited', { sender, count: bucket.count, window: sec.rateLimitWindowMs });
    return false;
  }

  return true;
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.windowStart > sec.rateLimitWindowMs * 2) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// ---- 3. Message Size Limits ----

export function checkMessageSize(text) {
  if (text.length > sec.maxMessageLength) {
    auditLog('BLOCK', 'message-too-large', { length: text.length, max: sec.maxMessageLength });
    return false;
  }
  return true;
}

// ---- 4. Agent Authentication (shared secret HMAC) ----

export function signAgentMessage(messageObj) {
  if (!sec.agentSecret) return messageObj;

  const payload = JSON.stringify({
    from: messageObj.from,
    to: messageObj.to,
    timestamp: messageObj.timestamp,
    conversationId: messageObj.conversationId,
    payload: messageObj.payload,
  });

  const hmac = crypto.createHmac('sha256', sec.agentSecret).update(payload).digest('hex');
  return { ...messageObj, auth: { hmac, algorithm: 'sha256' } };
}

export function verifyAgentMessage(messageObj) {
  if (!sec.requireAgentAuth) return true;
  if (!sec.agentSecret) return true; // no secret configured, skip

  if (!messageObj.auth?.hmac) {
    auditLog('BLOCK', 'missing-agent-auth', { from: messageObj.from?.agentName });
    return false;
  }

  const payload = JSON.stringify({
    from: messageObj.from,
    to: messageObj.to,
    timestamp: messageObj.timestamp,
    conversationId: messageObj.conversationId,
    payload: messageObj.payload,
  });

  const expected = crypto.createHmac('sha256', sec.agentSecret).update(payload).digest('hex');
  const valid = crypto.timingSafeEqual(
    Buffer.from(messageObj.auth.hmac, 'hex'),
    Buffer.from(expected, 'hex')
  );

  if (!valid) {
    auditLog('BLOCK', 'invalid-agent-hmac', { from: messageObj.from?.agentName });
  }
  return valid;
}

// ---- 5. Input Sanitization (prompt injection guards) ----
// Now delegates to the comprehensive jailbreak-defense module

export function sanitizeInput(text) {
  if (!sec.enableInputSanitization) return { clean: true, text };

  const result = checkJailbreak('security-gate', text);
  if (result.blocked && sec.blockPromptInjection) {
    auditLog('WARN', 'prompt-injection-attempt', {
      threats: result.threats.map(t => `${t.layer}:${t.category || ''}`).join(', '),
      snippet: text.slice(0, 100),
    });
    return { clean: false, text, reason: 'Suspicious input detected and blocked.' };
  }

  return { clean: true, text };
}

// ---- 6. Message Timestamp Validation (replay attack prevention) ----

export function checkMessageAge(messageObj) {
  if (!sec.maxMessageAgeMs) return true;
  if (!messageObj.timestamp) return true;

  const age = Date.now() - new Date(messageObj.timestamp).getTime();
  if (Math.abs(age) > sec.maxMessageAgeMs) {
    auditLog('BLOCK', 'stale-or-future-message', {
      from: messageObj.from?.agentName,
      age: Math.round(age / 1000) + 's',
    });
    return false;
  }
  return true;
}

// ---- Master Gate — run all checks ----

export function securityGate(sender, text) {
  // 1. Allowlist
  if (!isAllowed(sender)) {
    return { allowed: false, reason: 'You are not authorized to use this agent.' };
  }

  // 2. Rate limit
  if (!checkRateLimit(sender)) {
    return { allowed: false, reason: 'Too many messages. Please wait a moment.' };
  }

  // 3. Message size
  if (!checkMessageSize(text)) {
    return { allowed: false, reason: `Message too long (max ${sec.maxMessageLength} chars).` };
  }

  // 4. Input sanitization
  const sanitized = sanitizeInput(text);
  if (!sanitized.clean) {
    return { allowed: false, reason: sanitized.reason };
  }

  return { allowed: true };
}

export function securityGateAgent(sender, text, agentMsg) {
  // Run the base checks
  const base = securityGate(sender, text);
  if (!base.allowed) return base;

  // 5. Agent HMAC auth
  if (!verifyAgentMessage(agentMsg)) {
    return { allowed: false, reason: 'Agent authentication failed.' };
  }

  // 6. Replay protection
  if (!checkMessageAge(agentMsg)) {
    return { allowed: false, reason: 'Message expired or from the future.' };
  }

  return { allowed: true };
}
