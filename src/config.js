import 'dotenv/config';

const config = {
  // Active AI provider
  aiProvider: process.env.AI_PROVIDER || 'openai',

  // Agent identity
  agent: {
    name: process.env.AGENT_NAME || 'MyAI',
    id: process.env.AGENT_ID || 'agent_001',
  },

  // Messaging platform: "whatsapp" or "teams" or "both"
  platform: process.env.PLATFORM || 'whatsapp',

  // WhatsApp mode
  whatsapp: {
    mode: process.env.WHATSAPP_MODE || 'baileys',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    webhookPort: parseInt(process.env.WHATSAPP_WEBHOOK_PORT || '3000'),
  },

  // Microsoft Teams
  teams: {
    appId: process.env.TEAMS_APP_ID || '',
    appPassword: process.env.TEAMS_APP_PASSWORD || '',
    port: parseInt(process.env.TEAMS_PORT || '3978'),
  },

  // All provider configs
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
    },
    mistral: {
      apiKey: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
    },
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
      model: process.env.COHERE_MODEL || 'command-r-plus',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3',
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
    xai: {
      apiKey: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL || 'grok-2-latest',
    },
    perplexity: {
      apiKey: process.env.PERPLEXITY_API_KEY,
      model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
    },
    together: {
      apiKey: process.env.TOGETHER_API_KEY,
      model: process.env.TOGETHER_MODEL || 'meta-llama/Llama-3-70b-chat-hf',
    },
    fireworks: {
      apiKey: process.env.FIREWORKS_API_KEY,
      model: process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    },
    codex: {
      apiKey: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
      model: process.env.CODEX_MODEL || 'o4-mini',
    },
    copilot: {
      token: process.env.COPILOT_TOKEN,
      model: process.env.COPILOT_MODEL || 'gpt-4o',
      baseUrl: process.env.COPILOT_BASE_URL || 'https://models.github.ai/inference',
    },
    claudeCode: {
      apiKey: process.env.CLAUDE_CODE_API_KEY || process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_CODE_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(process.env.CLAUDE_CODE_MAX_TOKENS || '16384'),
      thinkingBudget: parseInt(process.env.CLAUDE_CODE_THINKING_BUDGET || '10000'),
    },
    claudeCowork: {
      apiKey: process.env.CLAUDE_COWORK_API_KEY || process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_COWORK_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(process.env.CLAUDE_COWORK_MAX_TOKENS || '8192'),
      thinkingBudget: parseInt(process.env.CLAUDE_COWORK_THINKING_BUDGET || '8000'),
    },
    nvidiaNim: {
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      model: process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
      maxTokens: parseInt(process.env.NVIDIA_NIM_MAX_TOKENS || '4096'),
    },
    openclaw: {
      baseUrl: process.env.OPENCLAW_BASE_URL || 'http://localhost:18789',
      authToken: process.env.OPENCLAW_AUTH_TOKEN || '',
      session: process.env.OPENCLAW_SESSION || 'main',
      model: process.env.OPENCLAW_MODEL || 'default',
    },
  },

  // Security settings
  security: {
    // Allowlist — only these senders can interact (empty = allow all)
    enableAllowlist: process.env.SECURITY_ENABLE_ALLOWLIST === 'true',
    allowlist: (process.env.SECURITY_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean),
    blocklist: (process.env.SECURITY_BLOCKLIST || '').split(',').map(s => s.trim()).filter(Boolean),

    // Rate limiting
    enableRateLimit: process.env.SECURITY_ENABLE_RATE_LIMIT !== 'false', // on by default
    rateLimitMaxMessages: parseInt(process.env.SECURITY_RATE_LIMIT_MAX || '20'),
    rateLimitWindowMs: parseInt(process.env.SECURITY_RATE_LIMIT_WINDOW_MS || '60000'),

    // Message size cap
    maxMessageLength: parseInt(process.env.SECURITY_MAX_MESSAGE_LENGTH || '10000'),

    // Agent-to-agent authentication (shared secret HMAC)
    agentSecret: process.env.SECURITY_AGENT_SECRET || '',
    requireAgentAuth: process.env.SECURITY_REQUIRE_AGENT_AUTH === 'true',

    // Input sanitization (prompt injection detection)
    enableInputSanitization: process.env.SECURITY_ENABLE_INPUT_SANITIZATION !== 'false', // on by default
    blockPromptInjection: process.env.SECURITY_BLOCK_PROMPT_INJECTION === 'true',

    // Replay protection — reject agent messages older than this (ms), 0 = disabled
    maxMessageAgeMs: parseInt(process.env.SECURITY_MAX_MESSAGE_AGE_MS || '300000'), // 5 min

    // Payload encryption (AES-256-GCM)
    encryptionKey: process.env.SECURITY_ENCRYPTION_KEY || '',

    // TLS for webhook servers (Cloud API / Teams)
    tlsCertPath: process.env.TLS_CERT_PATH || '',
    tlsKeyPath: process.env.TLS_KEY_PATH || '',
  },
};

export default config;
