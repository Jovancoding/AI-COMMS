import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import EventEmitter from 'events';

export class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this._retryCount = 0;
    this._maxRetries = 10;
    this._sentMessageIds = new Set(); // track bot-sent messages to avoid loops
    this._connectedAt = 0; // timestamp when connection opened (to skip offline messages)
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    // Fetch latest WA Web version so the pairing handshake isn't rejected
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Using WA Web version: ${version.join('.')}`);

    this.sock = makeWASocket({
      auth: state,
      version,
      browser: ['AI COMMS', 'Chrome', '22.0'],
      syncFullHistory: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Display QR code in terminal when available
      if (qr) {
        this._retryCount = 0; // reset retry count when QR shows
        console.log('\n[WhatsApp] Scan this QR code with your phone:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n');
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Logged out. Delete auth_info/ and restart to re-link.');
          return;
        }

        this._retryCount++;
        if (this._retryCount > this._maxRetries) {
          console.error('[WhatsApp] Max retries reached. Restart the app to try again.');
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, ... max 30s
        const delay = Math.min(2000 * Math.pow(2, this._retryCount - 1), 30000);
        console.log(`[WhatsApp] Reconnecting in ${delay / 1000}s... (attempt ${this._retryCount}/${this._maxRetries})`);
        setTimeout(() => this.connect(), delay);
      } else if (connection === 'open') {
        this._retryCount = 0;
        this._connectedAt = Date.now();
        console.log('[WhatsApp] Connected!');
        this.emit('ready');
      }
    });

    // Listen for incoming messages (DMs and groups)
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        // Skip old/offline messages delivered on reconnect (older than 30s before connect)
        const msgTs = (msg.messageTimestamp || 0) * 1000;
        if (this._connectedAt && msgTs > 0 && msgTs < this._connectedAt - 30000) {
          continue;
        }
        // Skip messages sent by the bot (AI replies), but allow user's own messages
        if (msg.key.fromMe && this._sentMessageIds.has(msg.key.id)) {
          this._sentMessageIds.delete(msg.key.id);
          continue;
        }
        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || '';
        // Accept text or media messages (images, audio, video, documents)
        const hasMedia = msg.message?.imageMessage || msg.message?.audioMessage
          || msg.message?.videoMessage || msg.message?.documentMessage;
        if (!text && !hasMedia) continue;

        const sender = msg.key.remoteJid;
        const isGroup = sender?.endsWith('@g.us') || false;
        const participant = msg.key.participant || sender; // in groups, participant is the actual sender

        this.emit('message', { sender, text, raw: msg, isGroup, participant });
      }
    });
  }

  async sendMessage(phone, text) {
    // phone should be like "1234567890@s.whatsapp.net"
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    const sent = await this.sock.sendMessage(jid, { text });
    if (sent?.key?.id) this._sentMessageIds.add(sent.key.id);
  }
}
