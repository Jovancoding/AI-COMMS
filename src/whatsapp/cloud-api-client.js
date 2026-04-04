import express from 'express';
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import EventEmitter from 'events';
import config from '../config.js';

export class CloudAPIClient extends EventEmitter {
  constructor() {
    super();
    this.app = express();
  }

  async connect() {
    const { verifyToken, webhookPort, accessToken, phoneNumberId } = config.whatsapp;
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';

    // Raw body capture for signature verification
    this.app.use(express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }));

    // Webhook verification (GET)
    this.app.get('/webhook', (req, res) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === verifyToken) {
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    });

    // Incoming messages (POST)
    this.app.post('/webhook', (req, res) => {
      // Verify X-Hub-Signature-256 if app secret is configured
      if (appSecret) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature || !req.rawBody) {
          return res.sendStatus(401);
        }
        const expected = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(req.rawBody)
          .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          return res.sendStatus(401);
        }
      }

      const body = req.body;
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            for (const msg of change.value?.messages || []) {
              if (msg.type === 'text') {
                this.emit('message', {
                  sender: msg.from,
                  text: msg.text.body,
                  raw: msg,
                });
              }
            }
          }
        }
      }
      res.sendStatus(200);
    });

    const { tlsCertPath, tlsKeyPath } = config.security;
    if (tlsCertPath && tlsKeyPath) {
      const sslOptions = {
        cert: fs.readFileSync(tlsCertPath),
        key: fs.readFileSync(tlsKeyPath),
      };
      https.createServer(sslOptions, this.app).listen(webhookPort, () => {
        console.log(`[WhatsApp Cloud API] HTTPS webhook listening on port ${webhookPort}`);
        this.emit('ready');
      });
    } else {
    this.app.listen(webhookPort, () => {
      console.log(`[WhatsApp Cloud API] HTTP webhook listening on port ${webhookPort} (no TLS — use a reverse proxy for HTTPS)`);
      this.emit('ready');
    });
    }
  }

  async sendMessage(phone, text) {
    const { accessToken, phoneNumberId } = config.whatsapp;
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      console.error('[Cloud API] Send failed:', await res.text());
    }
  }
}
