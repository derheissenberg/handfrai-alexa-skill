'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toSpokenText, speechProblems } = require('../lib/speech-text');

const NL = '\n';

/**
 * The golden corpus: model answers as they actually arrive, and what a speaker should say.
 * Every surface shares this layer, so a regression here is a regression everywhere.
 */
const CORPUS = [
  {
    name: 'a markdown answer, which is what Claude returns by default',
    locale: 'de-DE',
    input: '## Antwort' + '\n' + NL + 'Die **Hauptstadt** ist Lissabon.' + '\n' + NL + '- rund 545.000 Menschen' + '\n' + '- im Umland mehr',
    expect: 'Antwort Die Hauptstadt ist Lissabon. rund 545.000 Menschen im Umland mehr',
  },
  {
    name: 'a link keeps its words and loses its address',
    locale: 'de-DE',
    input: 'Siehe [die Wikipedia-Seite](https://de.wikipedia.org/wiki/Lissabon) dazu.',
    expect: 'Siehe die Wikipedia-Seite dazu.',
  },
  {
    name: 'a bare address is spoken, not spelled at random',
    locale: 'de-DE',
    input: 'Schreib an info@handfrai.com',
    expect: 'Schreib an info at handfrai Punkt com',
  },
  {
    name: 'the same address in English uses English words',
    locale: 'en-US',
    input: 'Write to info@handfrai.com',
    expect: 'Write to info at handfrai dot com',
  },
  {
    name: 'a code block is dropped rather than read out',
    locale: 'en-US',
    input: 'Try this:' + '\n' + '```js' + '\n' + 'console.log(1)' + '\n' + '```' + '\n' + 'That is all.',
    expect: 'Try this: That is all.',
  },
  {
    name: 'a table becomes words instead of pipes',
    locale: 'en-US',
    input: '| Stadt | Menschen |' + '\n' + '| --- | --- |' + '\n' + '| Lissabon | 545000 |',
    expect: 'Stadt Menschen Lissabon 545000',
  },
  {
    name: 'German umlauts and eszett are untouched',
    locale: 'de-DE',
    input: 'Im Gro\u00dfraum leben mehr Menschen als in der Stadt. Sch\u00f6ne Gr\u00fc\u00dfe!',
    expect: 'Im Gro\u00dfraum leben mehr Menschen als in der Stadt. Sch\u00f6ne Gr\u00fc\u00dfe!',
  },
  {
    name: 'an ellipsis becomes a full stop, which a speech engine can pronounce',
    locale: 'en-US',
    input: 'Well\u2026 it depends...',
    expect: 'Well. it depends.',
  },
];

for (const item of CORPUS) {
  test('speech corpus: ' + item.name, () => {
    const spoken = toSpokenText(item.input, { locale: item.locale });
    assert.equal(spoken, item.expect);
    assert.deepEqual(speechProblems(spoken), [], 'normalised text must pass the rubric');
  });
}

test('the rubric names what is wrong with raw model output', () => {
  assert.deepEqual(speechProblems('Die **Hauptstadt**'), ['markdown markers']);
  assert.deepEqual(speechProblems('Siehe https://handfrai.com'), ['spoken URL']);
  assert.deepEqual(speechProblems('Warte\u2026'), ['ellipsis']);
  assert.deepEqual(speechProblems('x'.repeat(700)), ['longer than 600 characters']);
  assert.deepEqual(speechProblems('Ein klarer Satz.'), []);
});

test('length is capped at a sentence boundary, never mid-word', () => {
  const long = ('Dies ist ein vollstaendiger Satz. ').repeat(40);
  const out = toSpokenText(long, { locale: 'de-DE' });
  assert.ok(out.length <= 600);
  assert.ok(out.endsWith('.'), 'ends on a sentence, not mid-word');
});

test('empty and missing answers do not throw', () => {
  assert.equal(toSpokenText(''), '');
  assert.equal(toSpokenText(null), '');
  assert.equal(toSpokenText(undefined), '');
});
