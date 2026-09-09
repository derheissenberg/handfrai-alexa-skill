'use strict';

/**
 * Claude provider, zero-dependency variant.
 *
 * Why this exists: Alexa-hosted skills (the free option that needs no AWS account) pin an old
 * Node runtime, and the Anthropic SDK needs Node 18+. This file talks to the same API over the
 * built-in https module, so the skill runs anywhere Node runs — including Alexa-hosted.
 *
 * Selected with HANDFRAI_TRANSPORT=http. Behaviour and return shape are identical to
 * lib/providers/claude.js; keep the two in step.
 */

const https = require('node:https');
const { SYSTEM_PROMPT } = require('../prompt');
const config = require('../config');
const { outputConfigFor } = require('../effort');

const API_HOST = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';

/** Minimal POST helper. `transport` is injectable so tests never open a socket. */
function postJson({ apiKey, body, timeoutMs, transport = https }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = transport.request(
      {
        host: API_HOST,
        path: API_PATH,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'user-agent': 'handfrai/0.1.0',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            return reject(new Error(`Anthropic API returned unparseable body (status ${res.statusCode})`));
          }
          if (res.statusCode >= 400) {
            const err = new Error((parsed.error && parsed.error.message) || `Anthropic API error ${res.statusCode}`);
            err.status = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        });
      },
    );
    req.on('timeout', () => {
      const err = new Error('Request timed out.');
      err.name = 'APIConnectionTimeoutError';
      req.destroy(err);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Same contract as lib/providers/claude.js — see lib/ai.js. */
async function answer({ apiKey, model, messages, timeoutMs, transport }) {
  const chosenModel = model || config.model;
  const outputConfig = outputConfigFor(chosenModel, config.effort);

  const response = await postJson({
    apiKey,
    timeoutMs,
    transport,
    body: {
      model: chosenModel,
      max_tokens: config.maxTokens,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      ...(outputConfig ? { output_config: outputConfig } : {}),
      messages,
    },
  });

  const text = (response.content || [])
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

module.exports = { answer, postJson };
