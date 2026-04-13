#!/usr/bin/env node
// ============================================================
// OpenClaw ↔ Hub Connector
// Bridges an OpenClaw Gateway to the AI COMMS Agent Hub,
// making OpenClaw agents visible on the multi-agent mesh.
//
// Usage:
//   node src/openclaw-hub-connector.js
//   OPENCLAW_GATEWAY=ws://localhost:18789 HUB_URL=ws://localhost:8090 node src/openclaw-hub-connector.js
//
// The connector registers as an agent on the Hub, then forwards:
//   Hub → OpenClaw:  tasks and agent-messages arrive on Hub WS → forwarded to OpenClaw via agent send
//   OpenClaw → Hub:  OpenClaw sessions can message Hub agents via sessions_send
// ============================================================

import WebSocket from 'ws';
import { randomUUID } from 'crypto';

// --- Config ---
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';
const HUB_URL = process.env.HUB_URL || 'ws://127.0.0.1:8090';
const HUB_SECRET = process.env.HUB_SECRET || '';
const AGENT_NAME = process.env.OPENCLAW_HUB_NAME || 'openclaw';
const RECONNECT_DELAY = 5000;
const HEARTBEAT_INTERVAL = 25_000;

let hubWs = null;
let clawWs = null;
let hubAgentId = null;
let hubHeartbeat = null;
let clawHeartbeat = null;
let shuttingDown = false;

function ts() { return new Date().toISOString().slice(11, 23); }
function log(level, ...args) {
  console.log(`[${ts()}] [${level.toUpperCase()}] [connector]`, ...args);
}

// ── Hub Connection ────────────────────────────────────────

function connectHub() {
  if (shuttingDown) return;
  log('info', `Connecting to Hub: ${HUB_URL}`);

  hubWs = new WebSocket(HUB_URL);

  hubWs.on('open', () => {
    log('info', 'Hub connected — registering...');
    hubWs.send(JSON.stringify({
      type: 'register',
      name: AGENT_NAME,
      workspace: 'openclaw-gateway',
      skills: ['chat', 'code', 'browser', 'canvas', 'voice', 'cron'],
      secret: HUB_SECRET,
    }));

    // Heartbeat
    clearInterval(hubHeartbeat);
    hubHeartbeat = setInterval(() => {
      if (hubWs?.readyState === WebSocket.OPEN) {
        hubWs.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  });

  hubWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'registered':
        hubAgentId = msg.agentId;
        log('info', `Registered on Hub as "${AGENT_NAME}" (${hubAgentId}). ${msg.message}`);
        break;

      case 'task':
        // Hub is routing a task to us — forward to OpenClaw
        log('info', `Task from Hub: ${msg.requestId} — "${(msg.message || '').slice(0, 80)}"`);
        forwardToOpenClaw(msg.requestId, msg.message, msg.sender);
        break;

      case 'agent-message':
        // Direct message from another Hub agent
        log('info', `Message from ${msg.from}: "${(msg.message || '').slice(0, 80)}"`);
        forwardToOpenClaw(null, `[From Hub agent "${msg.from}"]: ${msg.message}`, msg.from);
        break;

      case 'event':
        if (msg.event === 'agent-joined') {
          log('info', `Hub: agent joined — ${msg.name}`);
        } else if (msg.event === 'agent-left') {
          log('info', `Hub: agent left — ${msg.name}`);
        } else if (msg.event === 'hub-shutdown') {
          log('warn', 'Hub shutting down');
        }
        break;

      case 'pong':
        break;

      case 'error':
        log('error', `Hub error: ${msg.error}`);
        break;
    }
  });

  hubWs.on('close', (code, reason) => {
    log('warn', `Hub disconnected (${code}). Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
    clearInterval(hubHeartbeat);
    hubAgentId = null;
    if (!shuttingDown) setTimeout(connectHub, RECONNECT_DELAY);
  });

  hubWs.on('error', (err) => {
    log('error', `Hub error: ${err.message}`);
  });
}

// ── OpenClaw Gateway Connection ───────────────────────────

function connectClaw() {
  if (shuttingDown) return;
  log('info', `Connecting to OpenClaw Gateway: ${OPENCLAW_GATEWAY}`);

  clawWs = new WebSocket(OPENCLAW_GATEWAY);

  clawWs.on('open', () => {
    log('info', 'OpenClaw Gateway connected');

    // Heartbeat
    clearInterval(clawHeartbeat);
    clawHeartbeat = setInterval(() => {
      if (clawWs?.readyState === WebSocket.OPEN) {
        clawWs.ping();
      }
    }, HEARTBEAT_INTERVAL);
  });

  clawWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Handle responses from OpenClaw and relay back to Hub
    if (msg.type === 'agent.response' || msg.type === 'response') {
      const requestId = msg.requestId || msg.id;
      const response = msg.text || msg.content || msg.response || JSON.stringify(msg);

      if (requestId && hubWs?.readyState === WebSocket.OPEN) {
        hubWs.send(JSON.stringify({
          type: 'task-response',
          requestId,
          response,
        }));
        log('info', `Relayed response for ${requestId} back to Hub`);
      }
    }

    // Handle OpenClaw-initiated outbound messages to Hub agents
    if (msg.type === 'sessions.send' || msg.type === 'agent.send') {
      const target = msg.target || msg.to;
      const message = msg.message || msg.text || msg.content;
      if (target && message && hubWs?.readyState === WebSocket.OPEN) {
        hubWs.send(JSON.stringify({
          type: 'agent-message',
          target,
          message,
        }));
        log('info', `Relayed outbound message to Hub agent "${target}"`);
      }
    }
  });

  clawWs.on('close', (code, reason) => {
    log('warn', `OpenClaw Gateway disconnected (${code}). Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
    clearInterval(clawHeartbeat);
    if (!shuttingDown) setTimeout(connectClaw, RECONNECT_DELAY);
  });

  clawWs.on('error', (err) => {
    log('error', `OpenClaw Gateway error: ${err.message}`);
  });
}

// ── Forward Hub task → OpenClaw ───────────────────────────

function forwardToOpenClaw(requestId, message, sender) {
  if (!clawWs || clawWs.readyState !== WebSocket.OPEN) {
    log('warn', 'OpenClaw Gateway not connected — cannot forward task');
    if (requestId && hubWs?.readyState === WebSocket.OPEN) {
      hubWs.send(JSON.stringify({
        type: 'task-error',
        requestId,
        error: 'OpenClaw Gateway is not connected',
      }));
    }
    return;
  }

  // Send to OpenClaw Gateway as an agent message
  const payload = {
    type: 'agent.message',
    id: requestId || randomUUID(),
    message,
    sender: sender || 'hub',
  };

  // Store requestId mapping so we can relay the response
  clawWs.send(JSON.stringify(payload));
  log('info', `Forwarded to OpenClaw: ${payload.id}`);
}

// ── Startup ───────────────────────────────────────────────

function start() {
  log('info', '═══════════════════════════════════════════');
  log('info', '  OpenClaw ↔ Hub Connector');
  log('info', `  OpenClaw Gateway: ${OPENCLAW_GATEWAY}`);
  log('info', `  Agent Hub:        ${HUB_URL}`);
  log('info', `  Agent Name:       ${AGENT_NAME}`);
  log('info', `  Hub Auth:         ${HUB_SECRET ? 'ENABLED' : 'DISABLED'}`);
  log('info', '═══════════════════════════════════════════');

  connectHub();
  connectClaw();
}

// ── Graceful shutdown ─────────────────────────────────────

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'Shutting down connector...');
  clearInterval(hubHeartbeat);
  clearInterval(clawHeartbeat);
  if (hubWs) hubWs.close(1000, 'Connector shutting down');
  if (clawWs) clawWs.close(1000, 'Connector shutting down');
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Exports for testing ───────────────────────────────────

export { connectHub, connectClaw, forwardToOpenClaw, shutdown, AGENT_NAME };

start();
