// ==========================================
// Entry Point — Multi-Platform AI Agent
// ==========================================

import config from './config.js';
import { handleMessage } from './orchestrator.js';
import { runStartupChecks } from './startup-checks.js';
import { startHealthServer, recordError } from './health.js';
import { registerSelf } from './discovery.js';
import { downloadBaileysMedia, describeMedia } from './media.js';

function attachListeners(client, label, baileysSocket = null) {
  client.on('message', async ({ sender, text, isGroup, participant, raw }) => {
    try {
      // Handle media messages (Baileys only for now)
      let mediaInfo = null;
      if (baileysSocket && raw?.message && !text) {
        const hasMedia = raw.message.imageMessage || raw.message.audioMessage
          || raw.message.videoMessage || raw.message.documentMessage;
        if (hasMedia) {
          mediaInfo = await downloadBaileysMedia(baileysSocket, raw);
          const caption = raw.message.imageMessage?.caption
            || raw.message.videoMessage?.caption || '';
          text = caption || describeMedia(mediaInfo) || '[media]';
        }
      }
      if (!text) return; // skip empty

      await handleMessage(sender, text, client, isGroup, mediaInfo);
    } catch (err) {
      console.error(`[${label} Error] Failed to handle message:`, err);
      recordError();
      await client.sendMessage(sender, 'Sorry, I encountered an error processing your message.');
    }
  });

  client.on('ready', () => {
    console.log(`\n[Ready] ${label} agent is listening for messages!\n`);
  });
}

async function startWhatsApp() {
  let client;
  if (config.whatsapp.mode === 'cloud-api') {
    const { CloudAPIClient } = await import('./whatsapp/cloud-api-client.js');
    client = new CloudAPIClient();
    await client.connect();
    attachListeners(client, 'WhatsApp');
  } else {
    const { WhatsAppClient } = await import('./whatsapp/baileys-client.js');
    client = new WhatsAppClient();
    await client.connect();
    attachListeners(client, 'WhatsApp', client.sock);
  }
  return client;
}

async function startTeams() {
  const { TeamsClient } = await import('./teams/teams-client.js');
  const client = new TeamsClient();
  await client.connect();
  attachListeners(client, 'Teams');
  return client;
}

async function startTelegram() {
  const { TelegramClient } = await import('./telegram/telegram-client.js');
  const client = new TelegramClient();
  await client.connect();
  attachListeners(client, 'Telegram');
  return client;
}

// ---- Global error handlers ----
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled promise rejection:', reason);
  recordError();
});

process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception:', err);
  recordError();
  // Give logs time to flush, then exit
  setTimeout(() => process.exit(1), 1000).unref();
});

// ---- Graceful shutdown ----
const activeClients = [];
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Shutdown] Received ${signal}, cleaning up...`);

  // Close platform clients
  for (const client of activeClients) {
    try {
      if (typeof client.close === 'function') await client.close();
      else if (typeof client.disconnect === 'function') await client.disconnect();
    } catch (err) {
      console.error('[Shutdown] Error closing client:', err.message);
    }
  }

  console.log('[Shutdown] Done. Exiting.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  console.log('===========================================');
  console.log(`  AI COMMS — ${config.agent.name}`);
  console.log(`  AI Provider: ${config.aiProvider}`);
  console.log(`  Platform: ${config.platform}`);
  console.log('===========================================\n');

  runStartupChecks();

  // Start health monitoring endpoint
  const healthPort = parseInt(process.env.HEALTH_PORT || '9090');
  startHealthServer(healthPort);

  // Register self in agent discovery
  registerSelf();

  const platform = config.platform.toLowerCase();

  if (platform === 'whatsapp' || platform === 'both') {
    const client = await startWhatsApp();
    activeClients.push(client);
  }

  if (platform === 'teams' || platform === 'both') {
    const client = await startTeams();
    activeClients.push(client);
  }

  if (platform === 'telegram' || platform === 'both') {
    const client = await startTelegram();
    activeClients.push(client);
  }

  if (!['whatsapp', 'teams', 'telegram', 'both'].includes(platform)) {
    console.error(`Unknown platform "${platform}". Use: whatsapp | teams | telegram | both`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Fatal] Startup failed:', err);
  process.exit(1);
});
