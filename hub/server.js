// ============================================================
// Agent Hub — Production WebSocket relay for multi-agent coordination
// Deploy anywhere: Render, Railway, VPS, or localhost for testing
//
// Usage:
//   node hub/server.js                     (default port 8090)
//   PORT=9000 HUB_SECRET=mysecret node hub/server.js
//
// Env vars:
//   PORT          — listen port (default 8090)
//   HUB_SECRET    — shared secret for agent auth (required in production)
//   HUB_MAX_AGENTS — max concurrent agents (default 50)
//   HUB_LOG_LEVEL  — 'debug' | 'info' | 'warn' | 'error' (default 'info')
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

const PORT = parseInt(process.env.PORT || '8090', 10);
const HUB_SECRET = process.env.HUB_SECRET || '';
const MAX_AGENTS = parseInt(process.env.HUB_MAX_AGENTS || '50', 10);
const LOG_LEVEL = process.env.HUB_LOG_LEVEL || 'info';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, ...args) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL]) {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

// ── Agent Registry ────────────────────────────────────────

/** @type {Map<string, {ws: WebSocket, name: string, workspace: string, skills: string[], connectedAt: number, lastPing: number}>} */
const agents = new Map();

/** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
const pendingRequests = new Map();

const HEARTBEAT_INTERVAL = 30_000;
const AGENT_TIMEOUT = 90_000; // no pong in 90s → dead
const REQUEST_TIMEOUT = 180_000; // 3 min per task

// ── HTTP + WebSocket Server ───────────────────────────────

const httpServer = createServer((req, res) => {
  // REST API for bot-side queries (no WebSocket needed)
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check for non-health endpoints
  if (HUB_SECRET && req.url !== '/health') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== HUB_SECRET) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  // GET /health — public, no auth
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      agents: agents.size,
      uptime: Math.round(process.uptime()),
    }));
    return;
  }

  // GET /agents — list connected agents
  if (req.method === 'GET' && req.url === '/agents') {
    const list = [...agents.entries()].map(([id, a]) => ({
      id, name: a.name, workspace: a.workspace, skills: a.skills,
      connectedAt: a.connectedAt, lastPing: a.lastPing,
    }));
    res.writeHead(200);
    res.end(JSON.stringify({ agents: list }));
    return;
  }

  // POST /task — send a task to a specific agent
  if (req.method === 'POST' && req.url === '/task') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const { agent: agentName, message, sender } = JSON.parse(body);
        if (!agentName || !message) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing agent or message' }));
          return;
        }
        const result = await routeToAgent(agentName, message, sender || 'bot');
        res.writeHead(result.success ? 200 : 502);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // POST /broadcast — send to all agents
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const { message, sender } = JSON.parse(body);
        if (!message) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing message' }));
          return;
        }
        const results = await broadcastTask(message, sender || 'bot');
        res.writeHead(200);
        res.end(JSON.stringify({ results }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  log('info', `New connection from ${ip}`);

  let agentId = null;
  let authenticated = false;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    // ── Authentication (first message must be 'register') ──
    if (!authenticated) {
      if (msg.type !== 'register') {
        ws.send(JSON.stringify({ type: 'error', error: 'Must register first' }));
        ws.close(4001, 'Not registered');
        return;
      }

      // Verify hub secret
      if (HUB_SECRET && msg.secret !== HUB_SECRET) {
        log('warn', `Auth failed from ${ip} — bad secret`);
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid hub secret' }));
        ws.close(4003, 'Auth failed');
        return;
      }

      if (agents.size >= MAX_AGENTS) {
        ws.send(JSON.stringify({ type: 'error', error: 'Hub full — max agents reached' }));
        ws.close(4004, 'Hub full');
        return;
      }

      agentId = randomUUID();
      const name = msg.name || 'unnamed';
      const workspace = msg.workspace || '';
      const skills = msg.skills || [];

      agents.set(agentId, {
        ws, name, workspace, skills,
        connectedAt: Date.now(),
        lastPing: Date.now(),
      });

      authenticated = true;
      log('info', `Agent registered: ${name} (${agentId}) workspace=${workspace} skills=[${skills.join(',')}]`);

      ws.send(JSON.stringify({
        type: 'registered',
        agentId,
        message: `Welcome, ${name}. ${agents.size} agent(s) online.`,
      }));

      // Notify all other agents
      broadcastEvent('agent-joined', { name, workspace, skills }, agentId);
      return;
    }

    // ── Authenticated message handling ──
    const agent = agents.get(agentId);
    if (agent) agent.lastPing = Date.now();

    switch (msg.type) {
      case 'task-response': {
        // Agent responding to a task we routed to it
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          pending.resolve({
            success: true,
            agent: agent?.name || 'unknown',
            response: msg.response,
          });
        }
        break;
      }

      case 'task-error': {
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          pending.resolve({
            success: false,
            agent: agent?.name || 'unknown',
            error: msg.error || 'Agent reported error',
          });
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      case 'agent-message': {
        // Agent-to-agent direct message
        const target = findAgentByName(msg.target);
        if (target) {
          target.ws.send(JSON.stringify({
            type: 'agent-message',
            from: agent?.name,
            message: msg.message,
          }));
        } else {
          ws.send(JSON.stringify({ type: 'error', error: `Agent "${msg.target}" not found` }));
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    if (agentId && agents.has(agentId)) {
      const agent = agents.get(agentId);
      log('info', `Agent disconnected: ${agent.name} (${agentId})`);
      agents.delete(agentId);
      broadcastEvent('agent-left', { name: agent.name });

      // Fail any pending requests for this agent
      for (const [reqId, pending] of pendingRequests) {
        // Can't easily know which pending is for which agent here,
        // but the timeout will handle it
      }
    }
  });

  ws.on('error', (err) => {
    log('error', `WebSocket error for ${agentId || 'unknown'}:`, err.message);
  });
});

// ── Heartbeat — detect dead connections ───────────────────

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      log('warn', 'Terminating unresponsive connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// ── Routing Functions ─────────────────────────────────────

function findAgentByName(name) {
  for (const [, agent] of agents) {
    if (agent.name.toLowerCase() === name.toLowerCase()) return agent;
  }
  return null;
}

function routeToAgent(agentName, message, sender) {
  return new Promise((resolve) => {
    const agent = findAgentByName(agentName);
    if (!agent) {
      resolve({ success: false, agent: agentName, error: `Agent "${agentName}" not connected` });
      return;
    }

    if (agent.ws.readyState !== WebSocket.OPEN) {
      resolve({ success: false, agent: agentName, error: 'Agent connection not open' });
      return;
    }

    const requestId = randomUUID();
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ success: false, agent: agentName, error: 'Timed out (3 min)' });
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, { resolve, timer });

    agent.ws.send(JSON.stringify({
      type: 'task',
      requestId,
      message,
      sender,
    }));

    log('debug', `Routed task ${requestId} to ${agentName}`);
  });
}

async function broadcastTask(message, sender) {
  const promises = [...agents.values()]
    .filter(a => a.ws.readyState === WebSocket.OPEN)
    .map(a => routeToAgent(a.name, message, sender));
  return Promise.all(promises);
}

function broadcastEvent(event, data, excludeId = null) {
  const msg = JSON.stringify({ type: 'event', event, ...data });
  for (const [id, agent] of agents) {
    if (id !== excludeId && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(msg);
    }
  }
}

// ── Start ─────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  log('info', '═══════════════════════════════════════════');
  log('info', `  Agent Hub running on port ${PORT}`);
  log('info', `  Auth: ${HUB_SECRET ? 'ENABLED' : 'DISABLED (set HUB_SECRET for production)'}`);
  log('info', `  Max agents: ${MAX_AGENTS}`);
  log('info', `  Endpoints:`);
  log('info', `    GET  /health    — hub status`);
  log('info', `    GET  /agents    — list connected agents`);
  log('info', `    POST /task      — send task to agent`);
  log('info', `    POST /broadcast — send to all agents`);
  log('info', `    WS   /          — agent connections`);
  log('info', '═══════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'Shutting down...');
  broadcastEvent('hub-shutdown', { message: 'Hub is shutting down' });
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'Interrupted — shutting down...');
  broadcastEvent('hub-shutdown', { message: 'Hub is shutting down' });
  wss.close();
  httpServer.close();
  process.exit(0);
});
