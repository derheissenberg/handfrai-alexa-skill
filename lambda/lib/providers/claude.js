'use strict';

const { SYSTEM_PROMPT } = require('../prompt');
const config = require('../config');
const { outputConfigFor } = require('../effort');

/**
 * The SDK is loaded lazily, on first use.
 *
 * Alexa-hosted skills run an old Node and do not ship @anthropic-ai/sdk. Requiring it at module
 * load would crash the whole skill at cold start — even when config.transport is 'http' and the
 * SDK is never needed. Never move this back to the top of the file.
 */
function loadSdk() {
  // eslint-disable-next-line global-require
  return require('@anthropic-ai/sdk');
}

/**
 * Claude provider — the MVP's only provider.
 *
 * Model choice is a latency question on Alexa (the platform expects a response within ~8 s).
 * Default is claude-opus-5 at low effort; override with HANDFRAI_MODEL and HANDFRAI_EFFORT
 * after measuring real p95 latency (DECISIONS.md, "Model choice is a latency decision").
 */
function createClient({ apiKey, timeoutMs }) {
  const Anthropic = loadSdk();
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey      the user's own Anthropic API key
 * @param {Array<{role:'user'|'assistant', content:string}>} opts.messages  conversation, ending with the new user turn
 * @param {number} opts.timeoutMs   hard budget for the HTTP call (ms)
 * @param {object} [opts.client]    injectable client (tests)
 * @returns {Promise<{text:string, usage:{input:number, output:number}, stopReason:string}>}
 */
async function answer({ apiKey, model, messages, timeoutMs, client }) {
  const anthropic = client || createClient({ apiKey, timeoutMs });

  const chosenModel = model || config.model;
  const outputConfig = outputConfigFor(chosenModel, config.effort);

  const response = await anthropic.messages.create({
    model: chosenModel,
    max_tokens: config.maxTokens,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    ...(outputConfig ? { output_config: outputConfig } : {}),
    messages,
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();

  const u = response.usage || {};
  return {
    text,
    stopReason: response.stop_reason,
    usage: {
      input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
      output: u.output_tokens || 0,
    },
  };
}

module.exports = { answer };
