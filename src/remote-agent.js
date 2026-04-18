// ==========================================
// Remote Agent — execute real work via WhatsApp/Telegram/Teams
// ==========================================
// Receives task messages, uses AI to plan steps,
// executes file operations & terminal commands,
// and reports results back on the messaging platform.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import config from './config.js';
import { chatWithFailover } from './failover.js';
import { auditLog } from './audit-log.js';
import { getHardenedSystemPrompt } from './jailbreak-defense.js';

// ---- Configuration ----

const WORKSPACE = path.resolve(config.remoteAgent.workspace || '.');
const MAX_EXEC_TIMEOUT_MS = 30_000; // 30 seconds per command
const MAX_OUTPUT_LENGTH = 3000; // truncate command output for WhatsApp readability
const MAX_STEPS = 10; // max actions per task

// Commands that are never allowed
const BLOCKED_COMMANDS = [
  'format', 'diskpart', 'shutdown', 'reboot', 'poweroff',
  'rm -rf /', 'del /f /s /q c:', 'mkfs',
  'dd if=', 'curl | bash', 'wget | bash',
  ':(){:|:&};:', 'fork bomb',
  'npm publish', 'npm unpublish', 'git push --force',
  'DROP DATABASE', 'DROP TABLE', 'TRUNCATE',
];

// Shell metacharacters that indicate injection attempts
const SHELL_METACHAR_RE = /[;&|`$(){}]|&&|\|\||\$\(|<\(|>\(/;

// Allowed first-word commands (whitelist)
const ALLOWED_EXECUTABLES = new Set([
  'node', 'npm', 'npx', 'git', 'ls', 'dir', 'cat', 'head', 'tail',
  'echo', 'grep', 'find', 'pwd', 'cd', 'mkdir', 'cp', 'mv',
  'python', 'python3', 'pip', 'pip3',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha',
  'docker', 'docker-compose',
  'curl', 'wget',  // allowed standalone (not piped)
]);

// File paths that are never writable
const PROTECTED_PATHS = [
  '.env', '.git', 'node_modules', 'auth_info',
  'package-lock.json',
];

// ---- Task State ----

// Pending confirmations: sender -> { task, steps, timestamp }
const pendingConfirmations = new Map();

// ---- System Prompt for Task Planning ----

const TASK_PLANNER_PROMPT = getHardenedSystemPrompt(`You are ${config.agent.name}, a remote coding agent. The user sends you tasks via WhatsApp/Telegram/Teams and you execute them on their machine.

You MUST respond with a JSON plan. Do NOT include any text outside the JSON block.

Respond with a JSON array of steps:
[
  {"action": "read", "path": "relative/path/to/file"},
  {"action": "write", "path": "relative/path/to/file", "content": "full file content"},
  {"action": "edit", "path": "relative/path/to/file", "find": "exact text to find", "replace": "replacement text"},
  {"action": "run", "command": "shell command to execute"},
  {"action": "mkdir", "path": "relative/path/to/dir"},
  {"action": "delete", "path": "relative/path/to/file"},
  {"action": "list", "path": "relative/path/to/dir"}
]

Rules:
- Paths are relative to the workspace root: ${WORKSPACE}
- NEVER modify .env, .git, node_modules, or auth_info
- NEVER run destructive system commands (format, shutdown, rm -rf /, etc.)
- Keep commands short and safe
- For edits, provide exact "find" text that uniquely identifies the location
- For writes, provide the COMPLETE file content
- Maximum ${MAX_STEPS} steps per task
- If the task is unclear, return: [{"action": "ask", "question": "your clarifying question"}]

Current workspace: ${WORKSPACE}
Current date: ${new Date().toISOString().split('T')[0]}`);

// ---- Security Checks ----

function isRemoteAgentAllowed(sender) {
  const allowlist = config.remoteAgent.allowlist;
  if (!allowlist || allowlist.length === 0) return false; // DENY by default
  return allowlist.includes(sender);
}

function isCommandBlocked(command) {
  const lower = command.toLowerCase();
  // Blacklist check
  if (BLOCKED_COMMANDS.some(blocked => lower.includes(blocked.toLowerCase()))) return true;
  // Shell metacharacter injection check
  if (SHELL_METACHAR_RE.test(command)) return true;
  // Whitelist check: first word must be an allowed executable
  const firstWord = command.trim().split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_EXECUTABLES.has(firstWord)) return true;
  return false;
}

function isPathProtected(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return PROTECTED_PATHS.some(p => normalized.includes(p));
}

function isPathInWorkspace(filePath) {
  const resolved = path.resolve(WORKSPACE, filePath);
  return resolved.startsWith(WORKSPACE);
}

function validateStep(step) {
  if (step.action === 'run' && isCommandBlocked(step.command)) {
    return { valid: false, reason: `Blocked command: ${step.command}` };
  }
  if (step.path) {
    if (isPathProtected(step.path)) {
      return { valid: false, reason: `Protected path: ${step.path}` };
    }
    if (!isPathInWorkspace(step.path)) {
      return { valid: false, reason: `Path outside workspace: ${step.path}` };
    }
  }
  if (step.action === 'delete') {
    return { valid: true, requiresConfirmation: true };
  }
  if (step.action === 'run') {
    return { valid: true, requiresConfirmation: true };
  }
  return { valid: true };
}

// ---- Step Executors ----

function executeRead(step) {
  const full = path.resolve(WORKSPACE, step.path);
  if (!fs.existsSync(full)) return { success: false, output: `File not found: ${step.path}` };
  const content = fs.readFileSync(full, 'utf8');
  const truncated = content.length > MAX_OUTPUT_LENGTH
    ? content.slice(0, MAX_OUTPUT_LENGTH) + `\n... (${content.length} chars total, truncated)`
    : content;
  return { success: true, output: truncated };
}

function executeWrite(step) {
  const full = path.resolve(WORKSPACE, step.path);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, step.content, 'utf8');
  return { success: true, output: `Wrote ${step.content.length} chars to ${step.path}` };
}

function executeEdit(step) {
  const full = path.resolve(WORKSPACE, step.path);
  if (!fs.existsSync(full)) return { success: false, output: `File not found: ${step.path}` };
  let content = fs.readFileSync(full, 'utf8');
  if (!content.includes(step.find)) {
    return { success: false, output: `Could not find text to replace in ${step.path}` };
  }
  content = content.replace(step.find, step.replace);
  fs.writeFileSync(full, content, 'utf8');
  return { success: true, output: `Edited ${step.path}` };
}

function executeRun(step) {
  try {
    // Split command into executable + args (no shell interpretation)
    const parts = step.command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    const output = execFileSync(cmd, args, {
      cwd: WORKSPACE,
      timeout: MAX_EXEC_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024, // 1MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const truncated = output.length > MAX_OUTPUT_LENGTH
      ? output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : output;
    return { success: true, output: truncated || '(no output)' };
  } catch (err) {
    const stderr = err.stderr?.slice(0, MAX_OUTPUT_LENGTH) || err.message;
    return { success: false, output: `Command failed: ${stderr}` };
  }
}

function executeMkdir(step) {
  const full = path.resolve(WORKSPACE, step.path);
  fs.mkdirSync(full, { recursive: true });
  return { success: true, output: `Created directory: ${step.path}` };
}

function executeDelete(step) {
  const full = path.resolve(WORKSPACE, step.path);
  if (!fs.existsSync(full)) return { success: false, output: `Not found: ${step.path}` };
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    fs.rmSync(full, { recursive: true });
  } else {
    fs.unlinkSync(full);
  }
  return { success: true, output: `Deleted: ${step.path}` };
}

function executeList(step) {
  const full = path.resolve(WORKSPACE, step.path || '.');
  if (!fs.existsSync(full)) return { success: false, output: `Not found: ${step.path}` };
  const items = fs.readdirSync(full, { withFileTypes: true });
  const listing = items.map(i => `${i.isDirectory() ? '📁' : '📄'} ${i.name}`).join('\n');
  return { success: true, output: listing || '(empty directory)' };
}

const EXECUTORS = {
  read: executeRead,
  write: executeWrite,
  edit: executeEdit,
  run: executeRun,
  mkdir: executeMkdir,
  delete: executeDelete,
  list: executeList,
};

// ---- Main Handler ----

/**
 * Check if a message is a remote agent task.
 * Tasks start with "!do " or "!task ".
 */
export function isRemoteTask(text) {
  if (!config.remoteAgent.enabled) return false;
  const lower = text.toLowerCase().trim();
  return lower.startsWith('!do ') || lower.startsWith('!task ');
}

/**
 * Handle a remote agent task from a messaging platform.
 * Returns the response string to send back.
 */
export async function handleRemoteTask(sender, text, client) {
  // Security: only allowlisted senders
  if (!isRemoteAgentAllowed(sender)) {
    auditLog('BLOCK', 'remote-agent-denied', { sender });
    return '⛔ Remote agent access denied. Your number is not in REMOTE_AGENT_ALLOWLIST.';
  }

  // Check for confirmation response
  if (pendingConfirmations.has(sender)) {
    const lower = text.toLowerCase().trim();
    if (lower === '!do yes' || lower === '!task yes' || lower === 'yes' || lower === 'y') {
      return await executeConfirmedTask(sender);
    } else {
      pendingConfirmations.delete(sender);
      return '❌ Task cancelled.';
    }
  }

  // Extract the task description
  const task = text.replace(/^!(do|task)\s+/i, '').trim();
  if (!task) return 'Usage: !do <describe what you want me to do>';

  auditLog('INFO', 'remote-task-received', { sender, task: task.slice(0, 200) });

  // Get workspace context for AI
  let workspaceContext = '';
  try {
    const items = fs.readdirSync(WORKSPACE, { withFileTypes: true });
    workspaceContext = '\n\nWorkspace files:\n' + items
      .slice(0, 50)
      .map(i => `${i.isDirectory() ? '📁' : '📄'} ${i.name}`)
      .join('\n');
  } catch { /* ignore */ }

  // Ask AI to plan the steps
  const planMessages = [
    { role: 'system', content: TASK_PLANNER_PROMPT },
    { role: 'user', content: `Task: ${task}${workspaceContext}` },
  ];

  await client.sendMessage(sender, '🔧 Planning task...');

  let planResponse;
  try {
    planResponse = await chatWithFailover(planMessages);
  } catch (err) {
    return `❌ Failed to plan task: ${err.message}`;
  }

  // Parse the plan
  let steps;
  try {
    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = planResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : planResponse.trim();
    steps = JSON.parse(raw);
    if (!Array.isArray(steps)) steps = [steps];
  } catch {
    return `❌ AI returned an invalid plan. Try rephrasing your task.\n\nRaw response:\n${planResponse.slice(0, 500)}`;
  }

  // Handle clarifying questions
  if (steps.length === 1 && steps[0].action === 'ask') {
    return `❓ ${steps[0].question}`;
  }

  // Limit steps
  if (steps.length > MAX_STEPS) {
    return `❌ Task too complex (${steps.length} steps, max ${MAX_STEPS}). Break it into smaller tasks.`;
  }

  // Validate all steps
  let needsConfirmation = false;
  const stepSummary = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const validation = validateStep(step);
    if (!validation.valid) {
      auditLog('BLOCK', 'remote-step-blocked', { sender, step: step.action, reason: validation.reason });
      return `⛔ Step ${i + 1} blocked: ${validation.reason}`;
    }
    if (validation.requiresConfirmation) needsConfirmation = true;

    // Build summary
    switch (step.action) {
      case 'read': stepSummary.push(`${i + 1}. 📖 Read ${step.path}`); break;
      case 'write': stepSummary.push(`${i + 1}. ✏️ Write ${step.path} (${step.content?.length || 0} chars)`); break;
      case 'edit': stepSummary.push(`${i + 1}. 🔧 Edit ${step.path}`); break;
      case 'run': stepSummary.push(`${i + 1}. ▶️ Run: ${step.command}`); break;
      case 'mkdir': stepSummary.push(`${i + 1}. 📁 Create dir: ${step.path}`); break;
      case 'delete': stepSummary.push(`${i + 1}. 🗑️ Delete: ${step.path}`); break;
      case 'list': stepSummary.push(`${i + 1}. 📋 List: ${step.path || '.'}`); break;
      default: stepSummary.push(`${i + 1}. ❓ Unknown: ${step.action}`);
    }
  }

  // If destructive actions, ask for confirmation
  if (needsConfirmation) {
    pendingConfirmations.set(sender, {
      steps,
      task,
      timestamp: Date.now(),
    });

    // Auto-expire after 5 minutes
    setTimeout(() => pendingConfirmations.delete(sender), 5 * 60 * 1000);

    return `⚠️ This task includes commands or deletions that need your approval.\n\n*Plan:*\n${stepSummary.join('\n')}\n\nReply *yes* to proceed or anything else to cancel.`;
  }

  // Execute immediately (safe actions only)
  return await executeSteps(sender, steps, stepSummary);
}

async function executeConfirmedTask(sender) {
  const pending = pendingConfirmations.get(sender);
  pendingConfirmations.delete(sender);

  if (!pending) return '❌ No pending task found.';

  // Check if expired (5 min)
  if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
    return '❌ Task expired. Please submit it again.';
  }

  const stepSummary = pending.steps.map((step, i) => {
    switch (step.action) {
      case 'run': return `${i + 1}. ▶️ Run: ${step.command}`;
      case 'delete': return `${i + 1}. 🗑️ Delete: ${step.path}`;
      default: return `${i + 1}. ${step.action}: ${step.path || step.command || ''}`;
    }
  });

  return await executeSteps(sender, pending.steps, stepSummary);
}

async function executeSteps(sender, steps, stepSummary) {
  auditLog('INFO', 'remote-task-executing', { sender, stepCount: steps.length });

  const results = [];
  let allSuccess = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const executor = EXECUTORS[step.action];

    if (!executor) {
      results.push(`${i + 1}. ❌ Unknown action: ${step.action}`);
      allSuccess = false;
      break;
    }

    try {
      const result = executor(step);
      const icon = result.success ? '✅' : '❌';
      results.push(`${i + 1}. ${icon} ${result.output}`);
      if (!result.success) {
        allSuccess = false;
        break; // Stop on first failure
      }
    } catch (err) {
      results.push(`${i + 1}. ❌ Error: ${err.message}`);
      allSuccess = false;
      break;
    }
  }

  const status = allSuccess ? '✅ Task completed!' : '⚠️ Task partially completed (stopped on error)';
  auditLog('INFO', 'remote-task-done', { sender, success: allSuccess });

  return `${status}\n\n${results.join('\n\n')}`;
}

// Clean up expired confirmations every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sender, pending] of pendingConfirmations) {
    if (now - pending.timestamp > 5 * 60 * 1000) {
      pendingConfirmations.delete(sender);
    }
  }
}, 10 * 60 * 1000).unref();
