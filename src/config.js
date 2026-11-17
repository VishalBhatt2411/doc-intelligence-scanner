require('dotenv').config();

function parseList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  port: Number(process.env.PORT || 8787),
  corsOrigins: parseList(process.env.CORS_ORIGINS),
  apiKeys: new Set(parseList(process.env.API_KEYS)),

  aiProvider: (process.env.AI_PROVIDER || 'claude').toLowerCase(),

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
  },

  maxFileBytes: Number(process.env.MAX_FILE_MB || 10) * 1024 * 1024,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 60),

  webhook: {
    // Empty = allow any public https host (still blocked: private/internal IP ranges).
    allowedHosts: parseList(process.env.WEBHOOK_ALLOWED_HOSTS),
    allowInsecure: process.env.WEBHOOK_ALLOW_INSECURE === 'true'
  }
};

module.exports = config;
