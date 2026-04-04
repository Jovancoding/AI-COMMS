// ==========================================
// Payload Encryption — AES-256-GCM for agent-to-agent messages
// ==========================================
// Encrypts the message payload so only agents sharing the same
// encryption key can read message contents. WhatsApp/Teams carry
// the ciphertext — even if intercepted, the body is unreadable.

import crypto from 'crypto';
import config from './config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // GCM standard
const TAG_LENGTH = 16;      // 128-bit auth tag
const ENCODING = 'base64';

function getKey() {
  const secret = config.security.encryptionKey;
  if (!secret) return null;
  // Derive a 256-bit key from the user-provided secret via SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns a compact string:
 *   base64(iv):base64(ciphertext):base64(authTag)
 */
export function encrypt(plaintext) {
  const key = getKey();
  if (!key) return plaintext; // no key configured, pass through

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString(ENCODING)}:${encrypted}:${tag.toString(ENCODING)}`;
}

/**
 * Decrypt a string produced by encrypt().
 * Returns the original plaintext, or throws on tampering/wrong key.
 */
export function decrypt(cipherString) {
  const key = getKey();
  if (!key) return cipherString; // no key configured, pass through

  if (!cipherString.startsWith('enc:')) {
    // Not encrypted — return as-is (backwards compat with unencrypted agents)
    return cipherString;
  }

  const parts = cipherString.slice(4).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload');
  }

  const [ivB64, dataB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, ENCODING);
  const encryptedData = Buffer.from(dataB64, ENCODING);
  const tag = Buffer.from(tagB64, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypt the payload field of an agent protocol message.
 */
export function encryptAgentPayload(messageObj) {
  if (!getKey()) return messageObj;
  if (typeof messageObj.payload === 'string') {
    return { ...messageObj, payload: encrypt(messageObj.payload), encrypted: true };
  }
  // For object payloads, stringify then encrypt
  return {
    ...messageObj,
    payload: encrypt(JSON.stringify(messageObj.payload)),
    encrypted: true,
  };
}

/**
 * Decrypt the payload field of an agent protocol message.
 */
export function decryptAgentPayload(messageObj) {
  if (!messageObj.encrypted) return messageObj;
  if (!getKey()) return messageObj;

  const decrypted = decrypt(messageObj.payload);
  // Try to parse back as JSON
  try {
    return { ...messageObj, payload: JSON.parse(decrypted), encrypted: false };
  } catch {
    return { ...messageObj, payload: decrypted, encrypted: false };
  }
}
