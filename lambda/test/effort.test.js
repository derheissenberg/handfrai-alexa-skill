'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { supportsEffort, outputConfigFor } = require('../lib/effort');
const { answer: claudeHttpAnswer } = require('../lib/providers/claude-http');

test('models that reject the effort parameter are known', () => {
  assert.equal(supportsEffort('claude-opus-5'), true);
  assert.equal(supportsEffort('claude-sonnet-5'), true);
  assert.equal(supportsEffort('claude-haiku-4-5'), false);
  assert.equal(supportsEffort('claude-sonnet-4-5'), false);
});

test('output_config is omitted for those models and when effort is none', () => {
  assert.deepEqual(outputConfigFor('claude-opus-5', 'low'), { effort: 'low' });
  assert.equal(outputConfigFor('claude-haiku-4-5', 'low'), undefined);
  assert.equal(outputConfigFor('claude-opus-5', 'none'), undefined);
  assert.equal(outputConfigFor('claude-opus-5', ''), undefined);
});

function captureTransport(captured) {
  return {
    request(options, cb) {
      const req = new EventEmitter();
      req.write = (payload) => { captured.body = JSON.parse(payload); };
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.setEncoding = () => {};
        setImmediate(() => {
          cb(res);
          res.emit('data', JSON.stringify({
            content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }));
          res.emit('end');
        });
      };
      return req;
    },
  };
}

test('the Claude request omits output_config for Haiku and includes it for Opus', async () => {
  const haiku = {};
  await claudeHttpAnswer({ apiKey: 'k', model: 'claude-haiku-4-5', messages: [], timeoutMs: 1000, transport: captureTransport(haiku) });
  assert.equal(haiku.body.output_config, undefined, 'Haiku 4.5 returns 400 when effort is sent');
  assert.equal(haiku.body.model, 'claude-haiku-4-5');

  const opus = {};
  await claudeHttpAnswer({ apiKey: 'k', model: 'claude-opus-5', messages: [], timeoutMs: 1000, transport: captureTransport(opus) });
  assert.deepEqual(opus.body.output_config, { effort: 'low' });
});
