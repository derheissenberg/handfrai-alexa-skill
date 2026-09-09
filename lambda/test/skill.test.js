'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { skill, _internal } = require('../index');

function envelope({ type = 'IntentRequest', intent, slots = {}, sessionAttributes = {}, locale = 'en-US' } = {}) {
  const slotObj = Object.fromEntries(
    Object.entries(slots).map(([k, v]) => [k, { name: k, value: v, confirmationStatus: 'NONE' }]),
  );
  return {
    version: '1.0',
    session: {
      new: true, sessionId: 'S', application: { applicationId: 'A' }, user: { userId: 'U' },
      attributes: sessionAttributes,
    },
    context: {
      System: {
        application: { applicationId: 'A' }, user: { userId: 'U' },
        apiEndpoint: 'https://api.amazonalexa.com',
      },
    },
    request: {
      type, requestId: 'R', timestamp: new Date().toISOString(), locale,
      ...(type === 'IntentRequest'
        ? { intent: { name: intent, confirmationStatus: 'NONE', slots: slotObj }, dialogState: 'IN_PROGRESS' }
        : {}),
      ...(type === 'SessionEndedRequest' ? { reason: 'USER_INITIATED' } : {}),
    },
  };
}

function fakeClient(text, extra = {}) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        ...extra,
      }),
    },
  };
}

function failingClient(err) {
  return { messages: { create: async () => { throw err; } } };
}

/** The directive that re-opens the microphone for a free-form answer. */
function elicitDirective(res) {
  return (res.response.directives || []).find((d) => d.type === 'Dialog.ElicitSlot');
}

test.beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; });

test('launch greets and opens the microphone for a free-form question', async () => {
  const res = await skill.invoke(envelope({ type: 'LaunchRequest' }));
  assert.match(res.response.outputSpeech.ssml, /Hello, I am <phoneme[^>]*>Handfrai<\/phoneme>/);
  assert.equal(res.response.shouldEndSession, false);
  const directive = elicitDirective(res);
  assert.equal(directive.slotToElicit, 'query');
  assert.equal(directive.updatedIntent.name, 'AskIntent');
});

test('launch speaks German for a German locale', async () => {
  const res = await skill.invoke(envelope({ type: 'LaunchRequest', locale: 'de-DE' }));
  assert.match(res.response.outputSpeech.ssml, /Hallo, ich bin <phoneme[^>]*>Handfrai<\/phoneme>/);
});

test('a question is answered, and the microphone stays open for the next one', async () => {
  const res = await skill.invoke(
    envelope({ intent: 'AskIntent', slots: { query: 'how tall is the Eiffel tower' } }),
    { aiClient: fakeClient('About 330 metres, including the antenna.') },
  );
  assert.match(res.response.outputSpeech.ssml, /330 metres/);
  assert.ok(elicitDirective(res), 'follow-up questions need no carrier phrase');
  assert.equal(res.sessionAttributes.history.length, 2);
  assert.equal(res.sessionAttributes.totals.turns, 1);
  assert.equal(res.sessionAttributes.totals.input, 120);
});

test('conversation history is carried into the next call and capped', async () => {
  let seen;
  const client = {
    messages: {
      create: async (body) => {
        seen = body.messages;
        return {
          content: [{ type: 'text', text: 'Yes.' }], stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        };
      },
    },
  };
  const history = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }];
  const res = await skill.invoke(
    envelope({ intent: 'AskIntent', slots: { query: 'and then?' }, sessionAttributes: { history, totals: { input: 10, output: 5, turns: 1 } } }),
    { aiClient: client },
  );
  assert.equal(seen.length, 3);
  assert.equal(seen[2].content, 'and then?');
  assert.equal(res.sessionAttributes.totals.turns, 2);
  assert.equal(res.sessionAttributes.totals.input, 20);
});

test('an empty question re-asks instead of calling the model', async () => {
  const res = await skill.invoke(
    envelope({ intent: 'AskIntent', slots: {} }),
    { aiClient: fakeClient('should not be called') },
  );
  assert.match(res.response.outputSpeech.ssml, /did not catch a question/);
  assert.ok(elicitDirective(res));
});

test('a missing API key says so plainly and ends the session', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const res = await skill.invoke(envelope({ intent: 'AskIntent', slots: { query: 'hello' } }), { aiClient: fakeClient('x') });
  assert.match(res.response.outputSpeech.ssml, /no A I key configured/);
  assert.equal(res.response.shouldEndSession, true);
});

test('a rejected key, a rate limit and a timeout each get their own spoken line', async () => {
  const cases = [
    [Object.assign(new Error('invalid x-api-key'), { status: 401 }), /rejected the key/],
    [Object.assign(new Error('rate limit'), { status: 429 }), /rate limiting/],
    [Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }), /took too long/],
    [Object.assign(new Error('boom'), { status: 500 }), /Something went wrong/],
  ];
  for (const [err, expected] of cases) {
    const res = await skill.invoke(
      envelope({ intent: 'AskIntent', slots: { query: 'x' } }),
      { aiClient: failingClient(err) },
    );
    assert.match(res.response.outputSpeech.ssml, expected);
    assert.ok(elicitDirective(res), 'the user can try again without re-invoking');
  }
});

test('a refusal is spoken politely and the session continues', async () => {
  const res = await skill.invoke(
    envelope({ intent: 'AskIntent', slots: { query: 'x' } }),
    { aiClient: fakeClient('', { stop_reason: 'refusal' }) },
  );
  assert.match(res.response.outputSpeech.ssml, /cannot help/);
});

test('help explains the skill and keeps the microphone open', async () => {
  const res = await skill.invoke(envelope({ intent: 'AMAZON.HelpIntent' }));
  assert.match(res.response.outputSpeech.ssml, /own A I answers/);
  assert.ok(elicitDirective(res));
});

test('stop speaks the session token summary and ends the session', async () => {
  const res = await skill.invoke(envelope({
    intent: 'AMAZON.StopIntent', sessionAttributes: { totals: { input: 400, output: 100, turns: 3 } },
  }));
  assert.match(res.response.outputSpeech.ssml, /500 tokens over 3 questions\. Goodbye, see you soon\./);
  assert.equal(res.response.shouldEndSession, true);
});

test('stop in German summarises in German and uses the singular', async () => {
  const res = await skill.invoke(envelope({
    intent: 'AMAZON.StopIntent', locale: 'de-DE', sessionAttributes: { totals: { input: 40, output: 10, turns: 1 } },
  }));
  assert.match(res.response.outputSpeech.ssml, /50 Token für 1 Frage gebraucht\. Tschüss, bis bald\./);
});

test('a session ended request is acknowledged without speech', async () => {
  const res = await skill.invoke(envelope({ type: 'SessionEndedRequest' }));
  assert.equal(res.response.outputSpeech, undefined);
});

test('sanitizeForSpeech strips markdown, caps length at a sentence, escapes XML', () => {
  const long = ('This is a **bold** sentence & more. ').repeat(40);
  const out = _internal.sanitizeForSpeech(long);
  assert.ok(!out.includes('*'));
  assert.ok(out.includes('&amp;'));
  assert.ok(out.length <= 700);
  assert.ok(out.trim().endsWith('.'));
});


test('German text from the model survives untouched: umlauts, eszett, punctuation', () => {
  const german = 'Im Gro\u00dfraum Lissabon leben rund 2,9 Millionen Menschen. Sch\u00f6ne Gr\u00fc\u00dfe!';
  assert.equal(_internal.sanitizeForSpeech(german), german);
});

test('characters that would break the XML response are removed, not passed on', () => {
  // A control character is illegal in XML 1.0 and makes Alexa reject the whole response.
  assert.equal(_internal.sanitizeForSpeech('Hallo\u0007 Welt'), 'Hallo Welt');
  // A lone surrogate (half an emoji) is equally fatal.
  assert.equal(_internal.sanitizeForSpeech('Hallo \ud83d Welt'), 'Hallo Welt');
  // Emoji are removed: no engine speaks them usefully.
  assert.equal(_internal.sanitizeForSpeech('Hallo \ud83d\ude42'), 'Hallo');
});

test('truncation never splits a character in half', () => {
  const long = '\u00e4'.repeat(599) + '\ud83d\ude42' + ' und weiter geht es hier.';
  const out = _internal.sanitizeForSpeech(long);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out), 'no dangling high surrogate');
  assert.ok(!/(?<![\ud800-\udbff])[\udc00-\udfff]/.test(out), 'no dangling low surrogate');
});
