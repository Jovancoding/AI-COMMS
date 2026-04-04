// ==========================================
// Agent Protocol — Structured AI-to-AI messages
// ==========================================
// When two AIs talk, they wrap messages in this envelope
// so any AI (regardless of provider) can understand the intent.

/**
 * Create an agent-protocol message envelope.
 */
export function createAgentMessage({ from, to, intent, payload, conversationId, replyTo, group }) {
  const msg = {
    protocol: 'whatsapp-ai-network',
    version: '1.0',
    timestamp: new Date().toISOString(),
    conversationId: conversationId || crypto.randomUUID(),
    from,      // { agentId, agentName, phone }
    to,        // { agentId, agentName, phone } OR { groupId, groupName }
    intent,    // string: "chat" | "task-request" | "task-response" | "negotiate" | "info" | "group-invite" | "group-chat" | ...
    payload,   // any — the actual content
    replyTo,   // optional conversationId this is replying to
  };
  if (group) msg.group = group; // { groupId, groupName, memberCount }
  return msg;
}

/**
 * Detect whether an incoming WhatsApp message is an AI-protocol message
 * (JSON with our protocol header) or a plain human message.
 */
export function parseIncoming(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed.protocol === 'whatsapp-ai-network') {
      return { type: 'agent', message: parsed };
    }
  } catch {
    // not JSON — treat as human message
  }
  return { type: 'human', message: text };
}

/**
 * Wrap a simple text reply in protocol format.
 */
export function createReply(originalMessage, fromAgent, payload) {
  return createAgentMessage({
    from: fromAgent,
    to: originalMessage.from,
    intent: 'task-response',
    payload,
    conversationId: originalMessage.conversationId,
    replyTo: originalMessage.conversationId,
  });
}
