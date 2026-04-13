// ==========================================
// CLI Tools — native file, shell, and HTTP tools for standalone mode
// ==========================================
// These tools give the AI direct control over the local machine
// without needing any IDE bridge running.

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { resolve, dirname, basename, join } from 'path';
import { homedir, platform, hostname, cpus, totalmem, freemem } from 'os';

// --- Tool Definitions (sent to the AI as function schemas) ---

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating it if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: 'Append content to the end of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to append' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: current directory)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files matching a pattern (glob-like) in a directory tree. Returns matching file paths.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Root directory to search from' },
          pattern: { type: 'string', description: 'Substring or pattern to match in file names' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for a text pattern inside files. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          directory: { type: 'string', description: 'Directory to search in (default: current directory)' },
          file_extension: { type: 'string', description: 'Optional file extension filter, e.g. ".js" or ".py"' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return stdout/stderr. Use for running tests, installing packages, git operations, builds, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (default: current directory)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_info',
      description: 'Get metadata about a file or directory: size, modified date, type.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Move or rename a file or directory.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path' },
          to: { type: 'string', description: 'Destination path' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. Requires confirmation for safety.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to delete' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request. Use for APIs, webhooks, downloading data.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL' },
          method: { type: 'string', description: 'HTTP method: GET, POST, PUT, DELETE, PATCH (default: GET)' },
          headers: { type: 'object', description: 'Request headers' },
          body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_info',
      description: 'Get system information: OS, hostname, CPU, memory.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// --- Tool Implementations ---

const MAX_OUTPUT = 50_000; // 50KB max output per tool call

function truncate(text, max = MAX_OUTPUT) {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (truncated, ${text.length} total chars)`;
}

function resolvePath(p) {
  return resolve(p || '.');
}

function walkDir(dir, matches, pattern, ext, depth = 0, maxDepth = 8) {
  if (depth > maxDepth || matches.length > 200) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(full, matches, pattern, ext, depth + 1, maxDepth);
      } else {
        if (ext && !entry.name.endsWith(ext)) continue;
        if (pattern && !entry.name.includes(pattern) && !full.includes(pattern)) continue;
        matches.push(full);
      }
    }
  } catch { /* permission denied, etc */ }
}

function grepDir(dir, pattern, ext, depth = 0, maxDepth = 6) {
  const results = [];
  if (depth > maxDepth || results.length > 100) return results;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...grepDir(full, pattern, ext, depth + 1, maxDepth));
      } else {
        if (ext && !entry.name.endsWith(ext)) continue;
        try {
          const content = readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          const re = new RegExp(pattern, 'gi');
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              results.push(`${full}:${i + 1}: ${lines[i].trim()}`);
              if (results.length >= 100) return results;
            }
          }
        } catch { /* binary file, etc */ }
      }
    }
  } catch { /* permission denied */ }
  return results;
}

export async function executeTool(name, args) {
  switch (name) {
    case 'read_file': {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return `Error: File not found: ${p}`;
      const content = readFileSync(p, 'utf-8');
      return truncate(content);
    }

    case 'write_file': {
      const p = resolvePath(args.path);
      const dir = dirname(p);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(p, args.content, 'utf-8');
      return `Written ${args.content.length} bytes to ${p}`;
    }

    case 'append_file': {
      const p = resolvePath(args.path);
      appendFileSync(p, args.content, 'utf-8');
      return `Appended ${args.content.length} bytes to ${p}`;
    }

    case 'list_directory': {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return `Error: Directory not found: ${p}`;
      const entries = readdirSync(p, { withFileTypes: true });
      const lines = entries.map(e => {
        const suffix = e.isDirectory() ? '/' : '';
        try {
          const s = statSync(join(p, e.name));
          const size = e.isDirectory() ? '' : ` (${s.size} bytes)`;
          return `  ${e.name}${suffix}${size}`;
        } catch {
          return `  ${e.name}${suffix}`;
        }
      });
      return `${p}/\n${lines.join('\n')}`;
    }

    case 'search_files': {
      const dir = resolvePath(args.directory || '.');
      const matches = [];
      walkDir(dir, matches, args.pattern, null);
      if (matches.length === 0) return `No files matching "${args.pattern}" found in ${dir}`;
      return truncate(matches.join('\n'));
    }

    case 'grep': {
      const dir = resolvePath(args.directory || '.');
      const results = grepDir(dir, args.pattern, args.file_extension);
      if (results.length === 0) return `No matches for "${args.pattern}" in ${dir}`;
      return truncate(results.join('\n'));
    }

    case 'run_command': {
      const cwd = resolvePath(args.cwd || '.');
      const timeout = Math.min(args.timeout || 30000, 120000); // max 2 min
      try {
        const output = execSync(args.command, {
          cwd,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return truncate(output || '(no output)');
      } catch (err) {
        const stdout = err.stdout || '';
        const stderr = err.stderr || '';
        return truncate(`Exit code: ${err.status || 1}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`);
      }
    }

    case 'file_info': {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return `Error: Not found: ${p}`;
      const s = statSync(p);
      return JSON.stringify({
        path: p,
        type: s.isDirectory() ? 'directory' : 'file',
        size: s.size,
        modified: s.mtime.toISOString(),
        created: s.birthtime.toISOString(),
      }, null, 2);
    }

    case 'move_file': {
      const from = resolvePath(args.from);
      const to = resolvePath(args.to);
      if (!existsSync(from)) return `Error: Source not found: ${from}`;
      const toDir = dirname(to);
      if (!existsSync(toDir)) mkdirSync(toDir, { recursive: true });
      renameSync(from, to);
      return `Moved ${from} → ${to}`;
    }

    case 'delete_file': {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return `Error: File not found: ${p}`;
      unlinkSync(p);
      return `Deleted ${p}`;
    }

    case 'http_request': {
      const method = (args.method || 'GET').toUpperCase();
      const headers = args.headers || {};
      const opts = { method, headers };
      if (args.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        opts.body = args.body;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(args.url, { ...opts, signal: controller.signal });
        clearTimeout(timer);
        const text = await res.text();
        return truncate(`HTTP ${res.status} ${res.statusText}\n\n${text}`);
      } catch (err) {
        clearTimeout(timer);
        return `Error: ${err.message}`;
      }
    }

    case 'system_info': {
      return JSON.stringify({
        platform: platform(),
        hostname: hostname(),
        cpus: cpus().length,
        totalMemory: `${Math.round(totalmem() / 1024 / 1024)} MB`,
        freeMemory: `${Math.round(freemem() / 1024 / 1024)} MB`,
        cwd: process.cwd(),
        nodeVersion: process.version,
        user: homedir(),
      }, null, 2);
    }

    default:
      return `Error: Unknown tool "${name}"`;
  }
}
