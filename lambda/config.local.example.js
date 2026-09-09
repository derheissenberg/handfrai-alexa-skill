'use strict';

/**
 * Copy this file to config.local.js and paste your own key(s).
 *
 *   cp config.local.example.js config.local.js
 *
 * Use this on Alexa-hosted skills, where there is no place to set environment variables.
 * config.local.js is git-ignored — it must never reach a public repository.
 * On AWS Lambda, set environment variables instead and delete this file.
 */
module.exports = {
  // ---- Your own AI (the primary route) -------------------------------------------------
  // Claude is the default provider. Create a key at https://platform.claude.com → API keys.
  anthropicApiKey: 'sk-ant-REPLACE-ME',

  // Alexa-hosted runs an old Node version, so it needs the dependency-free transport.
  transport: 'http',

  // Optional. Defaults shown; change only after you have measured latency (npm run smoke).
  // model: 'claude-opus-5',
  // effort: 'low',
  // maxTokens: 300,
  // timeoutMs: 6500,

  // To use an OpenAI-compatible model as your primary instead of Claude, replace the block
  // above with (the DeepSeek example is illustrative — any chat-completions endpoint works):
  // provider: 'openai-compatible',
  // apiKey: 'REPLACE-ME',
  // baseUrl: 'https://api.deepseek.com/v1',
  // model: 'deepseek-chat',
  // extraBody: { },   // provider-specific switches, e.g. to turn thinking off

  // ---- The included model (optional fallback) ------------------------------------------
  // Used only when the primary route has no key or its key is rejected — never on a timeout.
  // This is what a Handfrai subscription ships with; in developer mode it is just a second key.
  // Pick ONE of the candidates below (DECISIONS.md, "The fallback model"). On Alexa keep thinking
  // OFF — the whole answer must arrive inside ~8 seconds.

  // Candidate 1 — DeepSeek-V4-Flash on Scaleway (Paris, EU, zero retention):
  // fallbackProvider: 'openai-compatible',
  // fallbackApiKey: 'REPLACE-ME',
  // fallbackBaseUrl: 'https://api.scaleway.ai/v1',
  // fallbackModel: 'deepseek-v4-flash-0731',
  // fallbackExtraBody: { thinking: { type: 'disabled' } },

  // Candidate 2 — MiniMax-M3 (thinking is off by default on M3). EU host: Nebius; US ZDR: DeepInfra.
  // For a quick developer test the first-party endpoint works too — but never ship that one.
  // fallbackProvider: 'openai-compatible',
  // fallbackApiKey: 'REPLACE-ME',
  // fallbackBaseUrl: 'https://api.minimax.io/v1',
  // fallbackModel: 'MiniMax-M3',
  // fallbackExtraBody: { },

  // Qwen-family hosts use  { enable_thinking: false }  to switch thinking off.
};
