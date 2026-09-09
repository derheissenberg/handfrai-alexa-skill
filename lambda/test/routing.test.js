'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ask } = require('../lib/ai');
const { answer: openaiAnswer, stripThinking } = require('../lib/providers/openai-compatible');

const ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'HANDFRAI_API_KEY', 'HANDFRAI_PROVIDER', 'HANDFRAI_BASE_URL', 'HANDFRAI_MODEL',
  'HANDFRAI_FALLBACK_API_KEY', 'HANDFRAI_FALLBACK_MODEL', 'HANDFRAI_FALLBACK_BASE_URL', 'HANDFRAI_FALLBACK_PROVIDER',
  'HANDFRAI_FALLBACK_EXTRA_BODY', 'HANDFRAI_TRANSPORT',
];
test.beforeEach(() => { for (const k of ENV_KEYS) delete process.env[k]; });

/** Fake https.request for openai-compatible: captures the request, replays a canned response. */
function fakeTransport({ status = 200, body = {}, captured = {} }) {
  return {
    request(options, cb) {
      captured.options = options;
      const req = new EventEmitter();
      req.write = (payload) => { captured.payload = JSON.parse(payload); };
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = status;
        res.setEncoding = () => {};
        setImmediate(() => { cb(res); res.emit('data', JSON.stringify(body)); res.emit('end'); });
      };
      return req;
    },
  };
}

const chatCompletion = (content, extra = {}) => ({
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 80, completion_tokens: 20 },
  ...extra,
});

test('openai-compatible: builds a chat-completions request and strips inline thinking', async () => {
  const captured = {};
  const transport = fakeTransport({ captured, body: chatCompletion('<think>hmm, capital…</think>Lisbon.') });
  const result = await openaiAnswer({
    apiKey: 'mm-key', model: 'MiniMax-M3', baseUrl: 'https://api.minimax.io/v1/',
    extraBody: { enable_thinking: false },
    messages: [{ role: 'user', content: 'capital of Portugal' }], timeoutMs: 5000, transport,
  });
  assert.equal(result.text, 'Lisbon.');
  assert.equal(result.usage.input, 80);
  assert.equal(result.usage.output, 20);
  assert.equal(captured.options.host, 'api.minimax.io');
  assert.equal(captured.options.path, '/v1/chat/completions');
  assert.equal(captured.options.headers.authorization, 'Bearer mm-key');
  assert.equal(captured.payload.model, 'MiniMax-M3');
  assert.equal(captured.payload.enable_thinking, false);
  assert.equal(captured.payload.messages[0].role, 'system');
  assert.ok(captured.payload.messages[0].content.includes('smart speaker'));
});

test('openai-compatible: a content filter is reported as a refusal', async () => {
  const transport = fakeTransport({ body: chatCompletion('', { choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }) });
  const result = await openaiAnswer({ apiKey: 'k', model: 'm', baseUrl: 'https://x.test/v1', messages: [], timeoutMs: 1000, transport });
  assert.equal(result.stopReason, 'refusal');
});

test('stripThinking removes think blocks and stray tags', () => {
  assert.equal(stripThinking('<think>a\nb</think>  Answer. </think>'), 'Answer.');
  assert.equal(stripThinking('plain'), 'plain');
});

test('routing: no keys at all → NO_ROUTE', async () => {
  await assert.rejects(() => ask({ messages: [], timeoutMs: 1000 }), (err) => err.code === 'NO_ROUTE');
});

test('routing: no primary key but a fallback → the included model answers', async () => {
  process.env.HANDFRAI_FALLBACK_API_KEY = 'fb';
  process.env.HANDFRAI_FALLBACK_MODEL = 'MiniMax-M3';
  process.env.HANDFRAI_FALLBACK_BASE_URL = 'https://api.minimax.io/v1';
  const transport = fakeTransport({ body: chatCompletion('From the included model.') });
  const result = await ask({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 1000, transport });
  assert.equal(result.route, 'fallback');
  assert.match(result.text, /included model/);
});

test('routing: primary key rejected (401) → fallback; a timeout does NOT fall back', async () => {
  process.env.ANTHROPIC_API_KEY = 'bad';
  process.env.HANDFRAI_FALLBACK_API_KEY = 'fb';
  process.env.HANDFRAI_FALLBACK_MODEL = 'MiniMax-M3';
  process.env.HANDFRAI_FALLBACK_BASE_URL = 'https://api.minimax.io/v1';

  const rejected = Object.assign(new Error('invalid x-api-key'), { status: 401 });
  const client = { messages: { create: async () => { throw rejected; } } };
  const transport = fakeTransport({ body: chatCompletion('Fallback answer.') });
  const result = await ask({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 1000, client, transport });
  assert.equal(result.route, 'fallback');

  const timeout = Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
  const slowClient = { messages: { create: async () => { throw timeout; } } };
  await assert.rejects(
    () => ask({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 1000, client: slowClient, transport }),
    (err) => err.name === 'APIConnectionTimeoutError',
  );
});

test('routing: the primary can itself be an openai-compatible model', async () => {
  process.env.HANDFRAI_PROVIDER = 'openai-compatible';
  process.env.HANDFRAI_API_KEY = 'ds';
  process.env.HANDFRAI_MODEL = 'deepseek-chat';
  process.env.HANDFRAI_BASE_URL = 'https://api.deepseek.com/v1';
  const captured = {};
  const transport = fakeTransport({ captured, body: chatCompletion('Primary, not Claude.') });
  const result = await ask({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 1000, transport });
  assert.equal(result.route, 'primary');
  assert.equal(captured.options.host, 'api.deepseek.com');
  assert.equal(captured.payload.model, 'deepseek-chat');
});
