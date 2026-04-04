// ==========================================
// Persistent JSON Storage — survives restarts
// ==========================================
// Stores data as JSON files in the data/ directory.
// Provides a simple key-value interface with auto-save.

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class JsonStore {
  constructor(filename) {
    this.filePath = path.join(DATA_DIR, filename);
    this.data = this._load();
    this._saveTimer = null;
    this._writing = false;
    this._pendingWrite = false;
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[Storage] Failed to load ${this.filePath}:`, err.message);
    }
    return {};
  }

  _scheduleSave() {
    // Debounce writes — flush at most every 2 seconds
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flush();
    }, 2000);
    this._saveTimer.unref();
  }

  _flush() {
    if (this._writing) {
      this._pendingWrite = true;
      return;
    }
    this._writing = true;
    try {
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error(`[Storage] Failed to save ${this.filePath}:`, err.message);
    } finally {
      this._writing = false;
      if (this._pendingWrite) {
        this._pendingWrite = false;
        this._flush();
      }
    }
  }

  get(key) {
    return this.data[key] ?? null;
  }

  set(key, value) {
    this.data[key] = value;
    this._scheduleSave();
  }

  delete(key) {
    delete this.data[key];
    this._scheduleSave();
  }

  has(key) {
    return key in this.data;
  }

  keys() {
    return Object.keys(this.data);
  }

  values() {
    return Object.values(this.data);
  }

  entries() {
    return Object.entries(this.data);
  }

  get size() {
    return Object.keys(this.data).length;
  }

  clear() {
    this.data = {};
    this._scheduleSave();
  }

  /** Force an immediate write to disk */
  saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._flush();
  }
}
