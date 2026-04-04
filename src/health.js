// ==========================================
// Health Check & Monitoring — HTTP endpoint for status
// ==========================================
// Exposes /health on a configurable port so load balancers,
// Docker, and monitoring tools can check if the agent is alive.

import express from 'express';
import config from './config.js';

const startTime = Date.now();
const stats = {
  messagesReceived: 0,
  messagesSent: 0,
  errors: 0,
  lastMessageAt: null,
};

export function recordIncoming() {
  stats.messagesReceived++;
  stats.lastMessageAt = new Date().toISOString();
}

export function recordOutgoing() {
  stats.messagesSent++;
}

export function recordError() {
  stats.errors++;
}

export function startHealthServer(port) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      agent: config.agent.name,
      agentId: config.agent.id,
      provider: config.aiProvider,
      platform: config.platform,
      uptime: Math.round((Date.now() - startTime) / 1000),
      stats,
    });
  });

  app.get('/ready', (_req, res) => {
    // Readiness check — can be extended to check provider connectivity
    res.json({ ready: true });
  });

  app.listen(port, () => {
    console.log(`[Health] Monitoring endpoint at http://localhost:${port}/health`);
  });
}
