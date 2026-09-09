'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_PROMPT } = require('../lib/prompt');

test('the prompt asks positively and gives the reason, per Anthropic guidance', () => {
  assert.match(SYSTEM_PROMPT, /read out loud by a speech engine/);
  assert.match(SYSTEM_PROMPT, /smoothly flowing spoken prose/);
  assert.match(SYSTEM_PROMPT, /because a listener loses the thread/);
});

test('the prompt is itself free of markdown -- its style shapes the output style', () => {
  assert.ok(!/[*_`#]/.test(SYSTEM_PROMPT), 'no emphasis, code or heading markers');
  assert.ok(!/^\s*[-+]\s/m.test(SYSTEM_PROMPT), 'no bullet list');
});

test('the prompt still carries the spoken-answer constraints', () => {
  assert.match(SYSTEM_PROMPT, /three is the limit/);
  assert.match(SYSTEM_PROMPT, /language the person spoke to you in/);
  assert.match(SYSTEM_PROMPT, /name the AI model you actually are/);
  assert.match(SYSTEM_PROMPT, /not Alexa/);
});

test('the prompt names no vendor -- the same text serves the included model', () => {
  assert.ok(!/\bClaude\b|\bAnthropic\b|\bMiniMax\b|\bDeepSeek\b|\bGPT\b/.test(SYSTEM_PROMPT));
});
