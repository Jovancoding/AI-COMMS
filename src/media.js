// ==========================================
// Media Handler — processes images, audio, documents
// ==========================================
// Extracts text/descriptions from media attachments and passes
// them through the normal message pipeline.

import fs from 'fs';
import path from 'path';
import { auditLog } from './audit-log.js';

const MEDIA_DIR = path.resolve('data', 'media');
const MAX_MEDIA_SIZE = parseInt(process.env.MAX_MEDIA_SIZE || String(50 * 1024 * 1024), 10); // 50 MB default

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Download media from WhatsApp Baileys message
 */
export async function downloadBaileysMedia(sock, msg) {
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    if (!buffer) return null;

    if (buffer.length > MAX_MEDIA_SIZE) {
      auditLog('WARN', 'media-too-large', { size: buffer.length, maxSize: MAX_MEDIA_SIZE });
      return null;
    }

    const mediaType = detectMediaType(msg);
    const ext = extensionFor(mediaType);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    const filePath = path.join(MEDIA_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    auditLog('INFO', 'media-received', { type: mediaType, size: buffer.length, file: filename });

    return {
      type: mediaType,
      filePath,
      filename,
      size: buffer.length,
      caption: msg.message?.imageMessage?.caption
        || msg.message?.videoMessage?.caption
        || msg.message?.documentMessage?.fileName
        || '',
    };
  } catch (err) {
    auditLog('ERROR', 'media-download-failed', { error: err.message });
    return null;
  }
}

/**
 * Download media from WhatsApp Cloud API
 */
export async function downloadCloudMedia(mediaId, accessToken) {
  try {
    // Step 1: Get media URL
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const urlData = await urlRes.json();
    if (!urlData.url) return null;

    // Step 2: Download the media
    const mediaRes = await fetch(urlData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const buffer = Buffer.from(await mediaRes.arrayBuffer());

    const mimeType = urlData.mime_type || 'application/octet-stream';
    const ext = mimeExtension(mimeType);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    const filePath = path.join(MEDIA_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    auditLog('INFO', 'media-received-cloud', { type: mimeType, size: buffer.length, file: filename });

    return {
      type: mimeType,
      filePath,
      filename,
      size: buffer.length,
    };
  } catch (err) {
    auditLog('ERROR', 'cloud-media-download-failed', { error: err.message });
    return null;
  }
}

function detectMediaType(msg) {
  if (msg.message?.imageMessage) return 'image';
  if (msg.message?.videoMessage) return 'video';
  if (msg.message?.audioMessage) return 'audio';
  if (msg.message?.documentMessage) return 'document';
  if (msg.message?.stickerMessage) return 'sticker';
  return 'unknown';
}

function extensionFor(type) {
  const map = {
    image: '.jpg',
    video: '.mp4',
    audio: '.ogg',
    document: '.bin',
    sticker: '.webp',
  };
  return map[type] || '.bin';
}

function mimeExtension(mime) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
    'application/pdf': '.pdf', 'application/msword': '.doc',
  };
  return map[mime] || '.bin';
}

/**
 * Convert media into a text description for the AI
 */
export function describeMedia(media) {
  if (!media) return null;
  const sizeMb = (media.size / (1024 * 1024)).toFixed(2);
  const caption = media.caption ? ` — caption: "${media.caption}"` : '';
  return `[User sent a ${media.type} file (${sizeMb} MB)${caption}. File saved as: ${media.filename}]`;
}
