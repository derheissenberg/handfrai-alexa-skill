'use strict';

const config = require('./config');

/**
 * Providers and routes.
 *
 * Every provider implements the same call:
 *   answer({ apiKey, model, baseUrl?, extraBody?, messages, timeoutMs, client?, transport? })
 *     → { text, stopReason, usage: { input, output } }
 *
 * A route is a provider plus the credentials and model to use with it. Two routes exist:
 *   primary  — the user's own AI (bring your own key)
 *   fallback — the optional included model, used when the primary has no key or rejects it
 * See DECISIONS.md, "The fallback model" for why the fallback exists and where it must not be used.
 */

/**
 * Provider modules are required on demand, never at load time: the Claude SDK provider pulls in
 * @anthropic-ai/sdk, which does not exist on Alexa-hosted. Loading it eagerly crashes the skill
 * at cold start even when the HTTP transport is configured.
 */
function providerFor(name) {
  // eslint-disable-next-line global-require
  if (name === 'openai-compatible') return require('./providers/openai-compatible');
  if (name === 'claude') {
    // eslint-disable-next-line global-require
    return config.transport === 'http' ? require('./providers/claude-http') : require('./providers/claude');
  }
  throw new Error(`Unknown AI provider: ${name}`);
}

function primaryRoute() {
  return {
    name: 'primary',
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    extraBody: config.extraBody,
  };
}

function fallbackRoute() {
  if (!config.fallbackApiKey || !config.fallbackModel) return null;
  return {
    name: 'fallback',
    provider: config.fallbackProvider,
    apiKey: config.fallbackApiKey,
    model: config.fallbackModel,
    baseUrl: config.fallbackBaseUrl,
    extraBody: config.fallbackExtraBody,
  };
}

/** Errors that mean "this route will not work no matter how often we retry". */
function isCredentialError(err) {
  return err && (err.status === 401 || err.status === 403);
}

/**
 * Ask the user's AI; fall back to the included model only when the primary route is unusable
 * (no key, or the key is rejected). Never on a timeout — on a speaker there is no time to retry.
 *
 * @returns {Promise<{text, stopReason, usage, route: 'primary'|'fallback'}>}
 * @throws the primary route's error when no fallback exists, or the fallback's error otherwise.
 *         Throws { code: 'NO_ROUTE' } when neither route has a key.
 */
async function ask({ messages, timeoutMs, client, transport }) {
  const primary = primaryRoute();
  const fallback = fallbackRoute();
  const call = (route) => providerFor(route.provider).answer({
    ...route, messages, timeoutMs, client, transport,
  }).then((result) => ({ ...result, route: route.name }));

  if (primary.apiKey) {
    try {
      return await call(primary);
    } catch (err) {
      if (!fallback || !isCredentialError(err)) throw err;
      console.warn('route_fallback', { reason: 'primary_rejected', status: err.status });
    }
  } else if (!fallback) {
    const err = new Error('No AI configured: neither a primary key nor a fallback route.');
    err.code = 'NO_ROUTE';
    throw err;
  } else {
    console.warn('route_fallback', { reason: 'no_primary_key' });
  }

  return call(fallback);
}

module.exports = { ask, providerFor, primaryRoute, fallbackRoute };
