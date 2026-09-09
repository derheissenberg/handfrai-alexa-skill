'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { answer } = require('../lib/providers/claude-http');

/** Fake https.request: captures what was sent, replays a canned response. */
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
        setImmediate(() => {
          cb(res);
          res.emit('data', JSON.stringify(body));
          res.emit('end');
        });
      };
      return req;
    },
  };
}

test('http transport sends the right request and parses the answer', async () => {
  const captured = {};
  const transport = fakeTransport({
    captured,
    body: {
      content: [{ type: 'text', text: 'Lisbon.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 90, output_tokens: 12 },
    },
  });
  const result = await answer({ apiKey: 'k', messages: [{ role: 'user', content: 'capital of Portugal' }], timeoutMs: 5000, transport });

  assert.equal(result.text, 'Lisbon.');
  assert.equal(result.usage.input, 90);
  assert.equal(result.usage.output, 12);
  assert.equal(captured.options.headers['x-api-key'], 'k');
  assert.equal(captured.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(captured.payload.max_tokens, 300);
  assert.equal(captured.payload.output_config.effort, 'low');
  assert.ok(captured.payload.system[0].text.includes('smart speaker'));
});

test('http transport turns an API error status into a rejected promise', async () => {
  const transport = fakeTransport({ status: 401, body: { error: { message: 'invalid x-api-key' } } });
  await assert.rejects(
    () => answer({ apiKey: 'bad', messages: [{ role: 'user', content: 'x' }], timeoutMs: 5000, transport }),
    (err) => err.status === 401 && /invalid x-api-key/.test(err.message),
  );
});
