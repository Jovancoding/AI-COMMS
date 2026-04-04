import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ActivityHandler,
  TurnContext,
} from 'botbuilder';
import express from 'express';
import https from 'https';
import fs from 'fs';
import EventEmitter from 'events';
import config from '../config.js';

/**
 * Teams Bot Client — connects your AI agent to Microsoft Teams
 * via the Bot Framework SDK.
 *
 * Setup steps:
 * 1. Register a bot at https://dev.botframework.com or in Azure Portal
 * 2. Get your TEAMS_APP_ID and TEAMS_APP_PASSWORD
 * 3. Deploy this server (or use ngrok for local dev)
 * 4. Set the messaging endpoint to https://your-host/api/messages
 * 5. Install the bot in your Teams tenant
 */
export class TeamsClient extends EventEmitter {
  constructor() {
    super();
    this.app = express();
    this.app.use(express.json());
    this.conversationReferences = new Map(); // store refs to reply later
    this.adapter = null;
  }

  async connect() {
    const { appId, appPassword, port } = config.teams;

    // Bot Framework authentication
    const botAuth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: appId,
      MicrosoftAppPassword: appPassword,
      MicrosoftAppType: 'MultiTenant',
    });

    this.adapter = new CloudAdapter(botAuth);

    // Error handler
    this.adapter.onTurnError = async (context, error) => {
      console.error('[Teams] Error:', error.message);
      await context.sendActivity('Sorry, I encountered an error.');
    };

    // Activity handler (processes messages)
    const bot = new TeamsBot(this);

    // Messaging endpoint
    this.app.post('/api/messages', async (req, res) => {
      await this.adapter.process(req, res, (context) => bot.run(context));
    });

    // Health check
    this.app.get('/health', (req, res) => res.json({ status: 'ok', platform: 'teams' }));

    const { tlsCertPath, tlsKeyPath } = config.security;
    if (tlsCertPath && tlsKeyPath) {
      const sslOptions = {
        cert: fs.readFileSync(tlsCertPath),
        key: fs.readFileSync(tlsKeyPath),
      };
      https.createServer(sslOptions, this.app).listen(port, () => {
        console.log(`[Teams] Bot listening on port ${port} (HTTPS)`);
        console.log(`[Teams] Messaging endpoint: https://localhost:${port}/api/messages`);
        this.emit('ready');
      });
    } else {
      this.app.listen(port, () => {
        console.log(`[Teams] Bot listening on port ${port} (HTTP — use a reverse proxy for HTTPS)`);
        console.log(`[Teams] Messaging endpoint: http://localhost:${port}/api/messages`);
        this.emit('ready');
      });
    }
  }

  /**
   * Send a message to a Teams conversation.
   * @param {string} conversationId — Teams conversation ID or stored reference key
   * @param {string} text — message text
   */
  async sendMessage(conversationId, text) {
    const ref = this.conversationReferences.get(conversationId);
    if (ref) {
      await this.adapter.continueConversationAsync(
        config.teams.appId,
        ref,
        async (context) => {
          await context.sendActivity(text);
        }
      );
    } else {
      console.warn(`[Teams] No conversation reference for "${conversationId}". Cannot send proactively.`);
    }
  }

  /**
   * Store a conversation reference so we can send proactive messages later.
   */
  saveConversationReference(activity) {
    const ref = TurnContext.getConversationReference(activity);
    const key = ref.conversation.id;
    this.conversationReferences.set(key, ref);
    return key;
  }
}

/**
 * Bot Framework ActivityHandler — handles incoming Teams events.
 */
class TeamsBot extends ActivityHandler {
  constructor(teamsClient) {
    super();
    this.teamsClient = teamsClient;

    // Handle regular messages
    this.onMessage(async (context, next) => {
      const text = context.activity.text?.trim() || '';
      if (!text) return next();

      // Remove @mention of the bot from the text
      const cleanText = this._removeBotMention(context);

      const sender = context.activity.conversation.id;
      const isGroup = context.activity.conversation.isGroup || false;

      // Save reference for proactive messaging
      this.teamsClient.saveConversationReference(context.activity);

      // Emit to orchestrator
      this.teamsClient.emit('message', {
        sender,
        text: cleanText,
        isGroup,
        participant: context.activity.from?.id || sender,
        raw: context.activity,
        _teamsContext: context, // pass context for direct reply
      });

      await next();
    });

    // Welcome new members
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            `Hello! I'm ${config.agent.name}, an AI agent. Send me a message to get started.`
          );
        }
      }
      await next();
    });
  }

  /**
   * Remove the @bot mention from message text in group/channel chats.
   */
  _removeBotMention(context) {
    let text = context.activity.text || '';
    const mentions = context.activity.entities?.filter(e => e.type === 'mention') || [];
    for (const mention of mentions) {
      if (mention.mentioned?.id === context.activity.recipient.id) {
        text = text.replace(mention.text, '').trim();
      }
    }
    return text;
  }
}
