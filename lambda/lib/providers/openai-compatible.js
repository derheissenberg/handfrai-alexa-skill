'use strict';

/**
 * Generic provider for any API that speaks OpenAI's chat-completions format.
 *
 * That is most of the cheap open-weight reasoning models — MiniMax, DeepSeek, Qwen, Kimi, GLM —
 * whether served first-party or by a European or US host, and OpenAI itself. Zero dependencies,
 * so it runs on the old runtime Alexa-hosted pins.
 *
 * Reasoning models often return their thinking inline as <think>…</think> or in a separate
 * `reasoning_content` field. Both are dropped: on a speaker only the answer is spoken.
 */

const https = require('node:https');
const { URL } = require('node:url');
const { SYSTEM_PROMPT } = require('../prompt');
const config = require('../config');

const THINK_RE = /<think>[\s\S]*?<\/think>/gi;

function stripThinking(text) {
  return String(text || '').replace(THINK_RE, '').replace(/<\/?think>/gi, '').trim();
}

function postJson({ url, apiKey, body, timeoutMs, transport = https }) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = transport.request(
      {
        host: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          authorization: `Bearer ${apiKey}`,
          'user-agent': 'handfrai/0.3.0',
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
            return reject(new Error(`Provider returned an unparseable body (status ${res.statusCode})`));
          }
          if (res.statusCode >= 400) {
            const message = (parsed.error && (parsed.error.message || parsed.error)) || `Provider error ${res.statusCode}`;
            const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
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

/**
 * Same contract as the Claude providers — see lib/ai.js.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.baseUrl     e.g. https://api.minimax.io/v1 — "/chat/completions" is appended
 * @param {object} [opts.extraBody] provider-specific switches, e.g. { enable_thinking: false }
 */
async function answer({ apiKey, model, baseUrl, extraBody, messages, timeoutMs, transport }) {
  if (!baseUrl) throw new Error('openai-compatible provider needs a baseUrl');
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await postJson({
    url,
    apiKey,
    timeoutMs,
    transport,
    body: {
      model,
      max_tokens: config.maxTokens,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      ...(extraBody || {}),
    },
  });

  const choice = (response.choices && response.choices[0]) || {};
  const message = choice.message || {};
  const text = stripThinking(message.content);
  const usage = response.usage || {};

  return {
    text,
    stopReason: choice.finish_reason === 'content_filter' ? 'refusal' : (choice.finish_reason || 'end_turn'),
    usage: {
      input: usage.prompt_tokens || 0,
      output: usage.completion_tokens || 0,
    },
  };
}

module.exports = { answer, postJson, stripThinking };
