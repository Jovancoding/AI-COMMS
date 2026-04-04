import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import EventEmitter from 'events';

export class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,   // scan QR to link
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason !== DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Reconnecting...');
          this.connect();
        } else {
          console.log('[WhatsApp] Logged out. Delete auth_info/ and restart to re-link.');
        }
      } else if (connection === 'open') {
        console.log('[WhatsApp] Connected!');
        this.emit('ready');
      }
    });

    // Listen for incoming messages (DMs and groups)
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue; // skip own messages
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
    await this.sock.sendMessage(jid, { text });
  }
}
