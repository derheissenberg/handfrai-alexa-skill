'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SPEECH } = require('../lib/speech');

/**
 * Everything we speak is SSML. A malformed tag does not degrade — Alexa fails the whole response,
 * which is what "there was a problem with the requested skill's response" sounds like to a user.
 */
function ssmlProblems(text) {
  const problems = [];
  // Every < must open a tag we close; count them.
  const opens = (text.match(/<(?!\/)[^>]*>/g) || []).filter((t) => !t.endsWith('/>'));
  const closes = text.match(/<\/[^>]+>/g) || [];
  if (opens.length !== closes.length) problems.push(`unbalanced tags: ${opens.length} open, ${closes.length} close`);
  // A literal ampersand not part of an entity breaks the parse.
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) problems.push('unescaped &');
  // Phoneme tags must carry both attributes.
  for (const tag of text.match(/<phoneme[^>]*>/g) || []) {
    if (!/alphabet=/.test(tag) || !/ph=/.test(tag)) problems.push(`phoneme missing attributes: ${tag}`);
  }
  return problems;
}

test('every spoken string in every language is valid SSML', () => {
  for (const [language, phrases] of Object.entries(SPEECH)) {
    for (const [key, value] of Object.entries(phrases)) {
      const text = typeof value === 'function' ? value(1234, 2) : value;
      const problems = ssmlProblems(text);
      assert.deepEqual(problems, [], `${language}.${key}: ${problems.join('; ')} — in: ${text}`);
    }
  }
});

test('the brand carries a pronunciation in both languages', () => {
  assert.match(SPEECH.de.welcome, /<phoneme alphabet='ipa' ph='[^']+'>Handfrai<\/phoneme>/);
  assert.match(SPEECH.en.welcome, /<phoneme alphabet='ipa' ph='[^']+'>Handfrai<\/phoneme>/);
});

test('German says K I, never A I — KI is the German term and reads correctly', () => {
  for (const [key, value] of Object.entries(SPEECH.de)) {
    const text = typeof value === 'function' ? value(1, 1) : value;
    assert.ok(!/\bA I\b/.test(text), `de.${key} still says "A I": ${text}`);
  }
});

test('the closing ends on a polite farewell, with the cost before it', () => {
  assert.match(SPEECH.de.usage(629, 2), /^Diese Sitzung .* gebraucht\. Tschüss, bis bald\.$/);
  assert.match(SPEECH.en.usage(500, 1), /^This session .* question\. Goodbye, see you soon\.$/);
});

test('greeting and farewell are polite in both languages', () => {
  assert.match(SPEECH.de.welcome, /^Hallo, ich bin /);
  assert.match(SPEECH.en.welcome, /^Hello, I am /);
  assert.match(SPEECH.de.goodbye, /Tschüss, bis bald/);
  assert.match(SPEECH.en.goodbye, /Goodbye, see you soon/);
});
