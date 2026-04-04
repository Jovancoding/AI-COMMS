// ==========================================
// Startup Security Checks — runs on boot
// ==========================================
// Checks file permissions, config hygiene, and prints warnings.

import fs from 'fs';
import path from 'path';
import { auditLog } from './audit-log.js';
import config from './config.js';

const SENSITIVE_PATHS = [
  '.env',
  'auth_info',
];

function checkFilePermissions() {
  for (const rel of SENSITIVE_PATHS) {
    const full = path.resolve(rel);
    try {
      const stat = fs.statSync(full);
      // On Windows, check if file exists and warn generically.
      // On Unix, check mode bits.
      if (process.platform !== 'win32') {
        const mode = stat.mode & 0o777;
        // Warn if group- or world-readable
        if (mode & 0o044) {
          const msg = `${rel} is readable by other users (mode: ${mode.toString(8)}). Run: chmod 600 ${rel}`;
          console.warn(`[Security Warning] ${msg}`);
          auditLog('WARN', 'insecure-file-permissions', { path: rel, mode: mode.toString(8) });
        }
      } else {
        // Windows — just confirm the file exists, recommend NTFS ACL review
        if (stat.isFile() || stat.isDirectory()) {
          auditLog('INFO', 'sensitive-path-exists', {
            path: rel,
            tip: `Review NTFS permissions: icacls "${full}"`,
          });
        }
      }
    } catch {
      // File doesn't exist — fine for auth_info on first run
    }
  }
}

function checkConfigHygiene() {
  const warnings = [];

  // Check if agent secret is weak
  if (config.security.agentSecret && config.security.agentSecret.length < 32) {
    warnings.push('SECURITY_AGENT_SECRET is short (< 32 chars). Use: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  // Check if encryption key is weak
  if (config.security.encryptionKey && config.security.encryptionKey.length < 32) {
    warnings.push('SECURITY_ENCRYPTION_KEY is short (< 32 chars). Use at least 32 random characters.');
  }

  // Check if allowlist is off and agent is publicly exposed
  if (!config.security.enableAllowlist) {
    warnings.push('Allowlist is disabled — anyone can message this agent. Set SECURITY_ENABLE_ALLOWLIST=true to restrict.');
  }

  // Check if agent auth is off
  if (!config.security.requireAgentAuth) {
    warnings.push('Agent authentication is disabled — any AI can impersonate an agent. Set SECURITY_REQUIRE_AGENT_AUTH=true for networks.');
  }

  // Check if prompt injection is log-only
  if (config.security.enableInputSanitization && !config.security.blockPromptInjection) {
    warnings.push('Prompt injection detection is log-only. Set SECURITY_BLOCK_PROMPT_INJECTION=true to block.');
  }

  // Check if HTTPS is not configured for webhook modes
  if (config.whatsapp.mode === 'cloud-api' && !config.security.tlsCertPath) {
    warnings.push('Cloud API webhook has no TLS configured. Deploy behind a reverse proxy with HTTPS or set TLS_CERT_PATH/TLS_KEY_PATH.');
  }

  for (const w of warnings) {
    console.warn(`[Security Warning] ${w}`);
    auditLog('WARN', 'config-hygiene', { warning: w });
  }

  if (warnings.length === 0) {
    console.log('[Security] All config checks passed.');
    auditLog('INFO', 'config-hygiene-ok');
  }
}

function checkGitIgnore() {
  const gitignorePath = path.resolve('.gitignore');
  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const required = ['.env', 'auth_info', 'logs/'];
    const missing = required.filter(r => !content.includes(r));
    if (missing.length > 0) {
      const msg = `These should be in .gitignore: ${missing.join(', ')}`;
      console.warn(`[Security Warning] ${msg}`);
      auditLog('WARN', 'gitignore-incomplete', { missing });
    }
  } catch {
    console.warn('[Security Warning] No .gitignore found. Sensitive files may be committed.');
    auditLog('WARN', 'no-gitignore');
  }
}

export function runStartupChecks() {
  console.log('\n[Security] Running startup security checks...');
  auditLog('INFO', 'startup-security-check');
  validateEnv();
  checkFilePermissions();
  checkConfigHygiene();
  checkGitIgnore();
  console.log('[Security] Startup checks complete.\n');
}

// ---- Environment Validation ----
// Fail-hard on critical missing config so the app doesn't start broken.

const PROVIDER_KEY_MAP = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'claude-code': 'ANTHROPIC_API_KEY',
  'claude-cowork': 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  together: 'TOGETHER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  codex: 'OPENAI_API_KEY',
  copilot: 'COPILOT_TOKEN',
  'nvidia-nim': 'NVIDIA_NIM_API_KEY',
  // ollama + openclaw don't require API keys
};

function validateEnv() {
  const errors = [];

  // Check that the active AI provider has its API key
  const provider = config.aiProvider;
  const requiredKey = PROVIDER_KEY_MAP[provider];
  if (requiredKey && !process.env[requiredKey]) {
    errors.push(`AI_PROVIDER="${provider}" requires ${requiredKey} to be set.`);
  }

  // Check Cloud API has required fields
  if (config.whatsapp.mode === 'cloud-api') {
    if (!config.whatsapp.phoneNumberId) errors.push('WHATSAPP_PHONE_NUMBER_ID is required for cloud-api mode.');
    if (!config.whatsapp.accessToken) errors.push('WHATSAPP_ACCESS_TOKEN is required for cloud-api mode.');
    if (!config.whatsapp.verifyToken) errors.push('WHATSAPP_VERIFY_TOKEN is required for cloud-api mode.');
  }

  // Check Teams has required fields
  const platform = config.platform.toLowerCase();
  if (platform === 'teams' || platform === 'both') {
    if (!config.teams.appId) errors.push('TEAMS_APP_ID is required when platform includes Teams.');
    if (!config.teams.appPassword) errors.push('TEAMS_APP_PASSWORD is required when platform includes Teams.');
  }

  // Check Telegram has required fields
  if (platform === 'telegram' || platform === 'both') {
    if (!config.telegram.botToken) errors.push('TELEGRAM_BOT_TOKEN is required when platform includes Telegram.');
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[Config Error] ${e}`);
      auditLog('ERROR', 'env-validation-failed', { error: e });
    }
    if (process.env.NODE_ENV !== 'test') {
      console.error('\n[Config] Fix the above errors and restart.');
      process.exit(1);
    }
  }
}
