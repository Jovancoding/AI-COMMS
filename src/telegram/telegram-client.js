import TelegramBot from 'node-telegram-bot-api';
import EventEmitter from 'events';
import config from '../config.js';

/**
 * Telegram Bot Client — connects your AI agent to Telegram
 * via the Bot API (long-polling or webhook).
 *
 * Setup steps:
 * 1. Message @BotFather on Telegram → /newbot → get your bot token
 * 2. Set TELEGRAM_BOT_TOKEN in .env
 * 3. Optional: set TELEGRAM_WEBHOOK_URL for webhook mode (production)
 *    or leave empty for long-polling (dev/local)
 */
export class TelegramClient extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
  }

  async connect() {
    const { botToken, webhookUrl, webhookPort } = config.telegram;

    if (webhookUrl) {
      // Webhook mode — production
      this.bot = new TelegramBot(botToken, { webHook: { port: webhookPort } });
      await this.bot.setWebHook(webhookUrl);
      console.log(`[Telegram] Webhook set: ${webhookUrl}`);
      console.log(`[Telegram] Listening on port ${webhookPort}`);
    } else {
      // Long-polling mode — development
      this.bot = new TelegramBot(botToken, { polling: true });
      console.log('[Telegram] Using long-polling mode');
    }

    // Handle incoming messages
    this.bot.on('message', (msg) => {
      const text = msg.text;
      if (!text) return; // skip non-text (stickers, photos without caption, etc.)

      const chatId = String(msg.chat.id);
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      const participant = msg.from ? String(msg.from.id) : chatId;

      this.emit('message', {
        sender: chatId,
        text,
        isGroup,
        participant,
        raw: msg,
      });
    });

    // Handle polling errors
    this.bot.on('polling_error', (err) => {
      console.error('[Telegram] Polling error:', err.message);
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (err) => {
      console.error('[Telegram] Webhook error:', err.message);
    });

    this.emit('ready');
  }

  /**
   * Send a message to a Telegram chat.
   * @param {string} chatId — Telegram chat ID (user or group)
   * @param {string} text — message text
   */
  async sendMessage(chatId, text) {
    if (!this.bot) {
      console.error('[Telegram] Bot not initialized. Call connect() first.');
      return;
    }

    // Telegram has a 4096 char limit per message — split if needed
    const MAX_LENGTH = 4096;
    if (text.length <= MAX_LENGTH) {
      await this.bot.sendMessage(chatId, text);
    } else {
      // Split into chunks
      for (let i = 0; i < text.length; i += MAX_LENGTH) {
        await this.bot.sendMessage(chatId, text.slice(i, i + MAX_LENGTH));
      }
    }
  }

  /**
   * Gracefully stop the bot.
   */
  async close() {
    if (this.bot) {
      if (this.bot.isPolling()) {
        await this.bot.stopPolling();
      }
      console.log('[Telegram] Bot stopped.');
    }
  }
}
