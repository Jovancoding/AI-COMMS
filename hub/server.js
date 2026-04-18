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
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import { randomUUID, timingSafeEqual } from 'crypto';

const PORT = parseInt(process.env.PORT || '8090', 10);
const HUB_SECRET = process.env.HUB_SECRET || '';
const MAX_AGENTS = parseInt(process.env.HUB_MAX_AGENTS || '50', 10);
const LOG_LEVEL = process.env.HUB_LOG_LEVEL || 'info';
const ALLOWED_ORIGINS = process.env.HUB_ALLOWED_ORIGINS || ''; // comma-separated, empty = localhost only
const TLS_CERT = process.env.TLS_CERT_PATH || '';
const TLS_KEY = process.env.TLS_KEY_PATH || '';
const MAX_BODY_SIZE = 1_048_576; // 1 MB
const MAX_WS_PAYLOAD = 1_048_576; // 1 MB
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.HUB_MAX_PER_IP || '5', 10);
const BROADCAST_COOLDOWN_MS = 10_000; // 10 seconds between broadcasts

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, ...args) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL]) {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

// ── Security Helpers ──────────────────────────────────────

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser requests (curl, agents)
  if (ALLOWED_ORIGINS) {
    return ALLOWED_ORIGINS.split(',').map(o => o.trim()).includes(origin);
  }
  // Default: only localhost origins
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** @type {Map<string, number>} */
const ipConnections = new Map();
let lastBroadcastTime = 0;

// ── Per-IP HTTP Rate Limiting (sliding window) ────────────

const HTTP_RATE_LIMIT = 60;         // requests per window
const HTTP_RATE_WINDOW_MS = 60_000; // 1 minute window

/** @type {Map<string, {count: number, windowStart: number}>} */
const httpRateBuckets = new Map();

function checkHttpRateLimit(ip) {
  const now = Date.now();
  const bucket = httpRateBuckets.get(ip);
  if (!bucket || (now - bucket.windowStart) > HTTP_RATE_WINDOW_MS) {
    httpRateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= HTTP_RATE_LIMIT;
}

// Cleanup stale HTTP rate buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of httpRateBuckets) {
    if (now - bucket.windowStart > HTTP_RATE_WINDOW_MS * 2) {
      httpRateBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

// ── Per-IP WebSocket Connect Rate Limiting ────────────────

const WS_CONNECT_RATE_LIMIT = 10;       // connections per window
const WS_CONNECT_RATE_WINDOW_MS = 60_000;

/** @type {Map<string, {count: number, windowStart: number}>} */
const wsConnectRateBuckets = new Map();

function checkWsConnectRate(ip) {
  const now = Date.now();
  const bucket = wsConnectRateBuckets.get(ip);
  if (!bucket || (now - bucket.windowStart) > WS_CONNECT_RATE_WINDOW_MS) {
    wsConnectRateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count++;
  return bucket.count <= WS_CONNECT_RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of wsConnectRateBuckets) {
    if (now - bucket.windowStart > WS_CONNECT_RATE_WINDOW_MS * 2) {
      wsConnectRateBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

// ── Agent Registry ────────────────────────────────────────

/** @type {Map<string, {ws: WebSocket, name: string, workspace: string, skills: string[], connectedAt: number, lastPing: number}>} */
const agents = new Map();

/** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
const pendingRequests = new Map();

const HEARTBEAT_INTERVAL = 30_000;
const AGENT_TIMEOUT = 90_000; // no pong in 90s → dead
const REQUEST_TIMEOUT = 180_000; // 3 min per task

// ── HTTP + WebSocket Server ───────────────────────────────

function createRequestHandler(req, res) {
  // REST API for bot-side queries (no WebSocket needed)
  res.setHeader('Content-Type', 'application/json');

  // Per-IP HTTP rate limiting
  const reqIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!checkHttpRateLimit(reqIp)) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Too many requests — rate limited' }));
    return;
  }

  // CORS: restrict to allowed origins
  const origin = req.headers['origin'] || '';
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'null');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check for non-health endpoints
  if (HUB_SECRET && req.url !== '/health') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeCompare(token, HUB_SECRET)) {
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

  // GET /agents — list connected agents (auth required, sanitized output)
  if (req.method === 'GET' && req.url === '/agents') {
    const list = [...agents.entries()].map(([id, a]) => ({
      id, name: a.name, skills: a.skills,
    }));
    res.writeHead(200);
    res.end(JSON.stringify({ agents: list }));
    return;
  }

  // POST /task — send a task to a specific agent
  if (req.method === 'POST' && req.url === '/task') {
    readBody(req, res, async (body) => {
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
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // POST /broadcast — send to all agents (rate limited)
  if (req.method === 'POST' && req.url === '/broadcast') {
    const now = Date.now();
    if (now - lastBroadcastTime < BROADCAST_COOLDOWN_MS) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: 'Broadcast rate limited — wait 10 seconds' }));
      return;
    }
    readBody(req, res, async (body) => {
      try {
        const { message, sender } = JSON.parse(body);
        if (!message) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing message' }));
          return;
        }
        lastBroadcastTime = Date.now();
        const results = await broadcastTask(message, sender || 'bot');
        res.writeHead(200);
        res.end(JSON.stringify({ results }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Size-limited body reader
function readBody(req, res, callback) {
  let body = '';
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      req.destroy();
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'Request body too large (max 1MB)' }));
      return;
    }
    body += chunk;
  });
  req.on('end', () => callback(body));
}

// ── Server Creation (HTTP or HTTPS) ───────────────────────

let httpServer;
if (TLS_CERT && TLS_KEY) {
  httpServer = createHttpsServer({
    cert: readFileSync(TLS_CERT),
    key: readFileSync(TLS_KEY),
  }, createRequestHandler);
  log('info', 'TLS enabled');
} else {
  httpServer = createServer(createRequestHandler);
  if (process.env.NODE_ENV === 'production') {
    log('warn', '⚠️  Running without TLS — set TLS_CERT_PATH and TLS_KEY_PATH for production');
  }
}

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_WS_PAYLOAD });

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // Per-IP connect rate limit (prevents rapid open/close attacks)
  if (!checkWsConnectRate(ip)) {
    log('warn', `Rejected connection from ${ip} — connect rate limit`);
    ws.close(4006, 'Too many connection attempts');
    return;
  }

  // Per-IP connection limit
  const currentCount = ipConnections.get(ip) || 0;
  if (currentCount >= MAX_CONNECTIONS_PER_IP) {
    log('warn', `Rejected connection from ${ip} — per-IP limit (${MAX_CONNECTIONS_PER_IP})`);
    ws.close(4005, 'Too many connections from this IP');
    return;
  }
  ipConnections.set(ip, currentCount + 1);

  log('info', `New connection from ${ip}`);

  let agentId = null;
  let authenticated = false;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    // Payload size enforced by maxPayload on WSS, but double-check
    if (raw.length > MAX_WS_PAYLOAD) {
      ws.send(JSON.stringify({ type: 'error', error: 'Payload too large' }));
      return;
    }

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

      // Verify hub secret (timing-safe)
      if (HUB_SECRET && !safeCompare(msg.secret || '', HUB_SECRET)) {
        log('warn', `Auth failed from ${ip}`);
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
      log('info', `Agent registered: ${name} (${agentId})`);

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
    // Decrement per-IP counter
    const count = ipConnections.get(ip) || 1;
    if (count <= 1) ipConnections.delete(ip);
    else ipConnections.set(ip, count - 1);

    if (agentId && agents.has(agentId)) {
      const agent = agents.get(agentId);
      log('info', `Agent disconnected: ${agent.name} (${agentId})`);
      agents.delete(agentId);
      broadcastEvent('agent-left', { name: agent.name });
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
  log('info', `  TLS: ${TLS_CERT ? 'ENABLED' : 'DISABLED'}`);
  log('info', `  Auth: ${HUB_SECRET ? 'ENABLED' : 'DISABLED (set HUB_SECRET for production)'}`);  
  log('info', `  CORS: ${ALLOWED_ORIGINS || 'localhost only'}`);  
  log('info', `  Per-IP limit: ${MAX_CONNECTIONS_PER_IP}`);
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
