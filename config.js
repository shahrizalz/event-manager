require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),

  // Public URL this app is reachable at (used for OAuth redirect).
  // For localhost testing: http://localhost:3000
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  // Secret used to sign the session cookie storing Google tokens.
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',

  llm: {
    // openai | anthropic | ollama | openai-compat
    provider: process.env.LLM_PROVIDER || 'openai-compat',
    model: process.env.LLM_MODEL || '',

    // "openai" (OpenAI official) and "openai-compat" (any OpenAI-compatible
    // endpoint, e.g. NanoGPT, Groq, Together, OpenRouter) both use these:
    openaiKey: process.env.LLM_API_KEY || '',
    openaiBase: process.env.LLM_API_BASE || '', // e.g. https://api.nanogpt.dev/v1

    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    ollamaBase: process.env.OLLAMA_BASE || 'http://localhost:11434',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
};
