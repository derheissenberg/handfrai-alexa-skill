'use strict';

/**
 * Configuration, resolved in this order:
 *   1. environment variables            — AWS Lambda, and Alexa-hosted if your console offers them
 *   2. ./config.local.js                — Alexa-hosted fallback: a file you create, never committed
 *   3. built-in defaults
 *
 * Two routes can be configured:
 *   primary   — the user's own AI (bring your own key). Claude by default.
 *   fallback  — optional "included" model, used only when the primary has no key or rejects it.
 *               In the product this is the model that ships with a subscription; in developer
 *               mode it is simply a second key you configure (DECISIONS.md, "The fallback model").
 *
 * config.local.js is git-ignored. Copy config.local.example.js to config.local.js and paste keys.
 * Never commit a key, never log one, never speak one.
 */

let local = {};
try {
  // eslint-disable-next-line global-require
  local = require('../config.local.js');
} catch (_) {
  // absent is the normal case on AWS Lambda
}

function pick(envName, localName, fallback) {
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const fromLocal = local[localName];
  if (fromLocal !== undefined && fromLocal !== '') return fromLocal;
  return fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

/** Providers: 'claude' (Anthropic Messages API) or 'openai-compatible' (chat completions). */
function normalizeProvider(name) {
  return name === 'openai-compatible' ? 'openai-compatible' : 'claude';
}

const config = {
  // ---- primary route: the user's own AI ------------------------------------------------
  get provider() { return normalizeProvider(pick('HANDFRAI_PROVIDER', 'provider', 'claude')); },
  /** The user's own key. ANTHROPIC_API_KEY keeps working for the Claude default. */
  get apiKey() {
    return pick('HANDFRAI_API_KEY', 'apiKey', '') || pick('ANTHROPIC_API_KEY', 'anthropicApiKey', '');
  },
  // Measured, not chosen by taste — see DECISIONS.md, "Model choice is a latency decision".
  get model() { return pick('HANDFRAI_MODEL', 'model', 'claude-sonnet-5'); },
  /** Only for openai-compatible providers, e.g. https://api.minimax.io/v1 */
  get baseUrl() { return pick('HANDFRAI_BASE_URL', 'baseUrl', ''); },
  /** Extra JSON merged into the request body — e.g. a provider's switch to turn thinking off. */
  get extraBody() { return parseJson(pick('HANDFRAI_EXTRA_BODY', 'extraBody', ''), {}); },

  // ---- fallback route: the included model (optional) -----------------------------------
  get fallbackProvider() {
    return normalizeProvider(pick('HANDFRAI_FALLBACK_PROVIDER', 'fallbackProvider', 'openai-compatible'));
  },
  get fallbackApiKey() { return pick('HANDFRAI_FALLBACK_API_KEY', 'fallbackApiKey', ''); },
  get fallbackModel() { return pick('HANDFRAI_FALLBACK_MODEL', 'fallbackModel', ''); },
  get fallbackBaseUrl() { return pick('HANDFRAI_FALLBACK_BASE_URL', 'fallbackBaseUrl', ''); },
  get fallbackExtraBody() { return parseJson(pick('HANDFRAI_FALLBACK_EXTRA_BODY', 'fallbackExtraBody', ''), {}); },

  // ---- shared -----------------------------------------------------------------------------
  /** 'sdk' (Claude via @anthropic-ai/sdk, needs Node 18+) or 'http' (zero dependencies). */
  get transport() { return pick('HANDFRAI_TRANSPORT', 'transport', 'sdk') === 'http' ? 'http' : 'sdk'; },
  get effort() { return pick('HANDFRAI_EFFORT', 'effort', 'low'); },
  get maxTokens() { return Number(pick('HANDFRAI_MAX_TOKENS', 'maxTokens', 300)); },
  /** Hard budget for one model call. Alexa allows ~8 s for the whole response. */
  get timeoutMs() { return Number(pick('HANDFRAI_TIMEOUT_MS', 'timeoutMs', 6500)); },
  /** Turns of context kept inside one Alexa session (a turn is one question + one answer). */
  get historyTurns() { return Number(pick('HANDFRAI_HISTORY_TURNS', 'historyTurns', 6)); },
};

module.exports = config;
