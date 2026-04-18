// ==========================================
// Persistent Audit Logger — writes security events to disk
// ==========================================
// Logs to: logs/audit.log (one JSON line per event)
// Rotates when file exceeds MAX_LOG_SIZE_BYTES

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve('logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= MAX_LOG_SIZE_BYTES) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = path.join(LOG_DIR, `audit-${ts}.log`);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

function atomicAppend(line) {
  // Write to temp file then append — survives crashes during rotate
  const tmp = LOG_FILE + '.tmp';
  try {
    rotateIfNeeded();
    fs.writeFileSync(tmp, line, 'utf8');
    fs.appendFileSync(LOG_FILE, fs.readFileSync(tmp, 'utf8'));
    fs.unlinkSync(tmp);
  } catch (err) {
    // Fallback: direct append
    try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch { /* last resort */ }
    try { fs.unlinkSync(tmp); } catch { /* cleanup */ }
  }
}

export function auditLog(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,       // INFO | WARN | BLOCK | ERROR
    event,
    ...details,
  };

  const line = JSON.stringify(entry) + '\n';

  // Console output
  if (level === 'BLOCK' || level === 'WARN' || level === 'ERROR') {
    console.warn(`[Audit][${level}] ${event}:`, JSON.stringify(details));
  } else {
    console.log(`[Audit][${level}] ${event}`);
  }

  // Persistent file output (atomic)
  try {
    atomicAppend(line);
  } catch (err) {
    console.error('[Audit] Failed to write log:', err.message);
  }
}

export function getRecentLogs(count = 50) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-count).map(l => {
      try { return JSON.parse(l); } catch { return l; }
    });
  } catch {
    return [];
  }
}
