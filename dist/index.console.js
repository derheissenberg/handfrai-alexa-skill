'use strict';
/**
 * Handfrai \u2014 single-file build for the Alexa-hosted code editor. GENERATED, do not edit.
 * Source: lambda/ \u2014 rebuild with tools/build-console-bundle.js
 *
 * Paste this as index.js, keep package.json, and create config.local.js next to it with
 * your key (see config.local.example.js). Everything else is inlined below.
 */
var __handfrai = {};
function __req(name) {
  if (name === '__config_local__') {
    try { return require('./config.local.js'); } catch (e) { return {}; }
  }
  var m = __handfrai[name];
  if (!m) throw new Error('Unknown internal module: ' + name);
  if (!m.loaded) { m.loaded = true; m.fn(m.module, m.module.exports); }
  return m.module.exports;
}
function __def(name, fn) { __handfrai[name] = { fn: fn, module: { exports: {} }, loaded: false }; }

__def('./lib/config', function (module, exports) {
'use strict';

/**
 * Configuration, resolved in this order:
 *   1. environment variables            \u2014 AWS Lambda, and Alexa-hosted if your console offers them
 *   2. ./config.local.js                \u2014 Alexa-hosted fallback: a file you create, never committed
 *   3. built-in defaults
 *
 * Two routes can be configured:
 *   primary   \u2014 the user's own AI (bring your own key). Claude by default.
 *   fallback  \u2014 optional "included" model, used only when the primary has no key or rejects it.
 *               In the product this is the model that ships with a subscription; in developer
 *               mode it is simply a second key you configure (DECISIONS.md, "The fallback model").
 *
 * config.local.js is git-ignored. Copy config.local.example.js to config.local.js and paste keys.
 * Never commit a key, never log one, never speak one.
 */

let local = {};
try {
  // eslint-disable-next-line global-require
  local = __req('__config_local__');
} catch (_) {
  // absent is the normal case on AWS Lambda
}

function pick(envName, localName, fallback) {
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const fromLocal = local[localName];
  if (fromLocal !== undefined && fromLocal !== '') return fromLocal;
  return fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

/** Providers: 'claude' (Anthropic Messages API) or 'openai-compatible' (chat completions). */
function normalizeProvider(name) {
  return name === 'openai-compatible' ? 'openai-compatible' : 'claude';
}

const config = {
  // ---- primary route: the user's own AI ------------------------------------------------
  get provider() { return normalizeProvider(pick('HANDFRAI_PROVIDER', 'provider', 'claude')); },
  /** The user's own key. ANTHROPIC_API_KEY keeps working for the Claude default. */
  get apiKey() {
    return pick('HANDFRAI_API_KEY', 'apiKey', '') || pick('ANTHROPIC_API_KEY', 'anthropicApiKey', '');
  },
  // Measured, not chosen by taste \u2014 see DECISIONS.md, "Model choice is a latency decision".
  get model() { return pick('HANDFRAI_MODEL', 'model', 'claude-sonnet-5'); },
  /** Only for openai-compatible providers, e.g. https://api.minimax.io/v1 */
  get baseUrl() { return pick('HANDFRAI_BASE_URL', 'baseUrl', ''); },
  /** Extra JSON merged into the request body \u2014 e.g. a provider's switch to turn thinking off. */
  get extraBody() { return parseJson(pick('HANDFRAI_EXTRA_BODY', 'extraBody', ''), {}); },

  // ---- fallback route: the included model (optional) -----------------------------------
  get fallbackProvider() {
    return normalizeProvider(pick('HANDFRAI_FALLBACK_PROVIDER', 'fallbackProvider', 'openai-compatible'));
  },
  get fallbackApiKey() { return pick('HANDFRAI_FALLBACK_API_KEY', 'fallbackApiKey', ''); },
  get fallbackModel() { return pick('HANDFRAI_FALLBACK_MODEL', 'fallbackModel', ''); },
  get fallbackBaseUrl() { return pick('HANDFRAI_FALLBACK_BASE_URL', 'fallbackBaseUrl', ''); },
  get fallbackExtraBody() { return parseJson(pick('HANDFRAI_FALLBACK_EXTRA_BODY', 'fallbackExtraBody', ''), {}); },

  // ---- shared -----------------------------------------------------------------------------
  /** 'sdk' (Claude via @anthropic-ai/sdk, needs Node 18+) or 'http' (zero dependencies). */
  get transport() { return pick('HANDFRAI_TRANSPORT', 'transport', 'sdk') === 'http' ? 'http' : 'sdk'; },
  get effort() { return pick('HANDFRAI_EFFORT', 'effort', 'low'); },
  get maxTokens() { return Number(pick('HANDFRAI_MAX_TOKENS', 'maxTokens', 300)); },
  /** Hard budget for one model call. Alexa allows ~8 s for the whole response. */
  get timeoutMs() { return Number(pick('HANDFRAI_TIMEOUT_MS', 'timeoutMs', 6500)); },
  /** Turns of context kept inside one Alexa session (a turn is one question + one answer). */
  get historyTurns() { return Number(pick('HANDFRAI_HISTORY_TURNS', 'historyTurns', 6)); },
};

module.exports = config;

});

__def('./lib/effort', function (module, exports) {
'use strict';

/**
 * Not every Claude model accepts `output_config.effort`.
 *
 * Haiku 4.5 and the 4.5-era Sonnet reject it with a 400
 * ("This model does not support the effort parameter"), while Opus 4.5+ / Sonnet 5 / Fable accept it.
 * Sending it blindly turns a perfectly good model into a hard failure \u2014 and Haiku is exactly the
 * model a latency measurement tends to pick for a voice skill.
 *
 * Set HANDFRAI_EFFORT=none (or empty) to omit the parameter for every model.
 */

/** Model-id fragments known to reject the parameter. */
const REJECTS_EFFORT = [/haiku/i, /sonnet-4-5/i, /-3-/];

function supportsEffort(model) {
  return !REJECTS_EFFORT.some((pattern) => pattern.test(String(model || '')));
}

/**
 * The `output_config` to send, or undefined when it should be omitted entirely.
 * @param {string} model
 * @param {string} effort  'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'none'
 */
function outputConfigFor(model, effort) {
  if (!effort || effort === 'none') return undefined;
  if (!supportsEffort(model)) return undefined;
  return { effort };
}

module.exports = { supportsEffort, outputConfigFor };

});

__def('./lib/prompt', function (module, exports) {
'use strict';

/**
 * System prompt for the voice channel.
 *
 * Written as flowing prose rather than a bullet list, deliberately: Anthropic documents that
 * "removing markdown from your prompt can reduce the volume of markdown in the output", and every
 * constraint is stated as a thing to do with the reason attached, because their own worked example
 * of that principle is a text-to-speech instruction. See DECISIONS.md, "The speech contract".
 *
 * Frozen text -- no timestamps, no per-request values -- so it stays prompt-cacheable.
 *
 * This is only the asking half of the contract, and it is not trusted: lib/speech-text.js cleans
 * the answer afterwards regardless, because every source that measured prompt-only normalisation
 * found it unreliable.
 */
const SYSTEM_PROMPT = [
  'Your answer will be read out loud by a speech engine on a smart speaker. The person listening cannot see anything and cannot scroll back, so every word has to work in the ear, the first time.',
  '',
  'Write in smoothly flowing spoken prose, the way you would answer someone standing next to you. Lead with the answer itself and add at most one short sentence of reason or context after it. Two short sentences is the target and three is the limit, because a listener loses the thread of anything longer.',
  '',
  'A speech engine reads symbols and punctuation literally, so write out what you mean in words: amounts, dates and measurements the way a person says them, an address as "example dot com", and an abbreviation spelled out if that is how it is spoken. Keep the whole answer as plain spoken sentences.',
  '',
  'Answer in the language the person spoke to you in, and vary how you phrase things from turn to turn so you do not sound recorded.',
  '',
  'When a question genuinely needs more than three sentences, say the one-sentence version and offer to go deeper if they want it.',
  '',
  'If you are asked who or what you are, name the AI model you actually are and say that you are answering through Handfrai on this speaker. You are not Alexa and you are not a generic voice assistant.',
].join('\n');

/** Hard cap on what we ask a speaker to say. Enforced in lib/speech-text.js. */
const MAX_SPOKEN_CHARS = 600;

module.exports = { SYSTEM_PROMPT, MAX_SPOKEN_CHARS };

});

__def('./lib/speech-text', function (module, exports) {
'use strict';

/**
 * Neutral spoken text -- the shared layer of the speech contract (DECISIONS.md, "The speech contract").
 *
 * Takes whatever a model returned and produces text any engine can speak: Alexa, browser
 * speechSynthesis, iOS, Android, Expo, or a cloud voice. No markup is added here; markup is a
 * per-surface, additive last step. Three of our four planned surfaces cannot take SSML at all --
 * the browser reads the tags aloud -- so meaning must never live in markup.
 *
 * Written to be lifted into a shared core unchanged by any other surface.
 */

/** Longest text we hand to a speaker. Alexa's own limit is far higher; this is for pacing. */
const MAX_SPOKEN_CHARS = 600;

/** Ordered so that earlier rules do not hide later ones. */
const RULES = [
  // Fenced code blocks: unspeakable, and usually irrelevant when heard.
  [/```[\s\S]*?```/g, ' '],
  [/~~~[\s\S]*?~~~/g, ' '],
  // Images before links, since both use bracket syntax.
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  // Links: keep the words, drop the address.
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]+)\]\[[^\]]*\]/g, '$1'],
  // Table separator rows and pipes: a table read aloud is noise.
  [/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, ' '],
  [/\|/g, ' '],
  // Headings, block quotes, list bullets and numbering at the start of a line.
  [/^\s{0,3}#{1,6}\s+/gm, ''],
  [/^\s{0,3}>\s?/gm, ''],
  [/^\s{0,3}[-*+]\s+/gm, ''],
  [/^\s{0,3}\d+[.)]\s+/gm, ''],
  // Horizontal rules.
  [/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, ' '],
  // Emphasis and inline code markers.
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/\*([^*\n]+)\*/g, '$1'],
  [/`([^`\n]+)`/g, '$1'],
  // Any stray markers left over.
  [/[*_`#]/g, ''],
  // Ellipses: Anthropic's own example of a character a speech engine cannot pronounce.
  [/\u2026/g, '.'],
  [/\.{3,}/g, '.'],
];

/** Illegal in XML 1.0, plus lone surrogates. Either one fails an entire Alexa response. */
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;

/** Spoken forms per language. Only unambiguous cases -- number pronunciation stays with the engine. */
const SPOKEN = {
  de: { dot: ' Punkt ', at: ' at ', slash: ' Schr\u00e4gstrich ' },
  en: { dot: ' dot ', at: ' at ', slash: ' slash ' },
};

function languageOf(locale) {
  const language = String(locale || 'en').slice(0, 2).toLowerCase();
  return SPOKEN[language] ? language : 'en';
}

/** "info@handfrai.com" becomes "info at handfrai Punkt com"; URLs likewise. */
function speakAddresses(text, words) {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, (url) => url
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .replace(/\./g, words.dot)
      .replace(/\//g, words.slash))
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, (mail) => mail
      .replace(/@/, words.at)
      .replace(/\./g, words.dot));
}

/**
 * Turn model output into neutral spoken text.
 * @param {string} text
 * @param {{locale?: string, maxChars?: number}} [options]
 */
function toSpokenText(text, options = {}) {
  const words = SPOKEN[languageOf(options.locale)];
  const maxChars = options.maxChars || MAX_SPOKEN_CHARS;

  let out = String(text == null ? '' : text);
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  out = speakAddresses(out, words)
    .replace(EMOJI, '')
    .replace(ILLEGAL_XML, '')
    .replace(LONE_SURROGATE, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  if (out.length > maxChars) {
    let cut = out.slice(0, maxChars);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1); // never split a surrogate pair
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    out = end > 0 ? cut.slice(0, end + 1) : cut;
  }
  return out;
}

/**
 * The speech-readiness rubric, as code. Returns [] when the text is fit to speak.
 * Runs in tests against a golden corpus, and logs in production so prompt drift becomes visible.
 */
function speechProblems(text, options = {}) {
  const maxChars = options.maxChars || MAX_SPOKEN_CHARS;
  const problems = [];
  const value = String(text == null ? '' : text);

  if (/[*_`#]/.test(value) || /^\s{0,3}[-+]\s/m.test(value)) problems.push('markdown markers');
  if (/https?:\/\/|www\./i.test(value)) problems.push('spoken URL');
  if (/\u2026|\.{3,}/.test(value)) problems.push('ellipsis');
  if (new RegExp(EMOJI.source, 'u').test(value)) problems.push('emoji');
  if (new RegExp(ILLEGAL_XML.source).test(value)) problems.push('control characters');
  if (new RegExp(LONE_SURROGATE.source).test(value)) problems.push('lone surrogate');
  if (value.length > maxChars) problems.push('longer than ' + maxChars + ' characters');
  return problems;
}

module.exports = { toSpokenText, speechProblems, MAX_SPOKEN_CHARS };

});

__def('./lib/ssml', function (module, exports) {
'use strict';

/**
 * The Alexa last-mile encoder: neutral spoken text in, SSML out.
 *
 * Markup added here is additive and drawn from the portable subset only, so that dropping it loses
 * decoration and never meaning (DECISIONS.md, "The speech contract"). The ASK SDK wraps the result in
 * <speak> itself.
 */

const Alexa = require('ask-sdk-core');

/** The brand, pronounced. The written form stays "Handfrai" wherever it is displayed. */
const BRAND_IPA = { de: '\u02c8hantf\u0281a\u026a', en: '\u02c8h\u00e6ndfra\u026a' };

function brandFor(language) {
  const ipa = BRAND_IPA[language] || BRAND_IPA.en;
  return "<phoneme alphabet='ipa' ph='" + ipa + "'>Handfrai</phoneme>";
}

/** Escape XML specials. An unescaped ampersand has historically failed whole Alexa responses. */
function escape(text) {
  return Alexa.escapeXmlCharacters(String(text == null ? '' : text));
}

module.exports = { brandFor, escape, BRAND_IPA };

});

__def('./lib/speech', function (module, exports) {
'use strict';

/**
 * Everything Handfrai says, per language.
 *
 * Alexa gives the request locale (en-US, de-DE, \u2026); we key off the language part, so
 * en-GB and en-US share one voice. Adding a language means adding one block here plus
 * an interaction model in skill-package/interactionModels/custom/.
 *
 * These strings are spoken as SSML \u2014 the ASK SDK wraps them in <speak> for us \u2014 so the brand name
 * carries a <phoneme> tag. Left as plain text, "Handfrai" is a word in no language and each TTS
 * voice guesses differently; on the German voice it came out as something Stefan could not even
 * repeat. The name is meant to sound like German "handfrei" / English "hand fry".
 *
 * Anything added here must be valid SSML: escape a literal & as &amp; and < as &lt;.
 */

/** The brand, pronounced. Written form stays "Handfrai" for anything displayed. */
const BRAND = {
  de: "<phoneme alphabet='ipa' ph='\u02c8hantf\u0281a\u026a'>Handfrai</phoneme>",
  en: "<phoneme alphabet='ipa' ph='\u02c8h\u00e6ndfra\u026a'>Handfrai</phoneme>",
};

const SPEECH = {
  en: {
    welcome: `Hello, I am ${BRAND.en}. What would you like to ask?`,
    welcomeAgain: `Hello again. What would you like to ask?`,
    reprompt: 'What would you like to ask?',
    thinking: 'Let me think.',
    noKey: `${BRAND.en} has no A I key configured yet. Add your key to the skill, then try again.`,
    keyRejected: 'Your A I provider rejected the key. Please check the key in your skill configuration.',
    rateLimited: 'Your A I provider is rate limiting the request. Please try again in a moment.',
    timeout: 'That took too long to think about. Try asking again, or ask something shorter.',
    refusal: 'I cannot help with that one. Ask me something else.',
    error: 'Something went wrong talking to your A I. Please try again.',
    empty: 'I did not catch a question. What would you like to ask?',
    help: 'Ask me anything and your own A I answers in a few short sentences. You can keep asking without saying the name again. Say stop when you are done.',
    goodbye: 'Goodbye, see you soon.',
    // Spoken at the end of a session: the useful part first, the farewell last, which is how a
    // person ends a conversation. `goodbye` alone is used when there is nothing to report.
    usage: (tokens, turns) =>
      `This session used about ${tokens} tokens over ${turns} ${turns === 1 ? 'question' : 'questions'}. Goodbye, see you soon.`,
  },
  de: {
    welcome: `Hallo, ich bin ${BRAND.de}. Was m\u00f6chtest du fragen?`,
    welcomeAgain: 'Hallo, da bin ich wieder. Was m\u00f6chtest du fragen?',
    reprompt: 'Was m\u00f6chtest du fragen?',
    thinking: 'Ich denke kurz nach.',
    noKey: `F\u00fcr ${BRAND.de} ist noch kein K I Schl\u00fcssel hinterlegt. Trag deinen Schl\u00fcssel ein und versuch es noch einmal.`,
    keyRejected: 'Dein K I Anbieter hat den Schl\u00fcssel abgelehnt. Bitte pr\u00fcfe den Schl\u00fcssel in der Konfiguration.',
    rateLimited: 'Dein K I Anbieter drosselt gerade die Anfragen. Bitte versuch es gleich noch einmal.',
    timeout: 'Das hat zu lange gedauert. Frag es noch einmal, gern etwas k\u00fcrzer.',
    refusal: 'Dabei kann ich nicht helfen. Frag mich gern etwas anderes.',
    error: 'Bei der Verbindung zu deiner K I ist etwas schiefgegangen. Bitte versuch es noch einmal.',
    empty: 'Ich habe keine Frage verstanden. Was m\u00f6chtest du wissen?',
    help: 'Frag mich einfach etwas, deine eigene K I antwortet in wenigen S\u00e4tzen. Du kannst weiterfragen, ohne den Namen noch einmal zu sagen. Sag Stopp, wenn du fertig bist.',
    goodbye: 'Tsch\u00fcss, bis bald.',
    usage: (tokens, turns) =>
      `Diese Sitzung hat etwa ${tokens} Token f\u00fcr ${turns} ${turns === 1 ? 'Frage' : 'Fragen'} gebraucht. Tsch\u00fcss, bis bald.`,
  },
};

/** @param {string} locale e.g. "de-DE" */
function speechFor(locale) {
  const language = String(locale || 'en-US').slice(0, 2).toLowerCase();
  return SPEECH[language] || SPEECH.en;
}

module.exports = { speechFor, SPEECH, BRAND };

});

__def('./lib/providers/claude', function (module, exports) {
'use strict';

const { SYSTEM_PROMPT } = __req('./lib/prompt');
const config = __req('./lib/config');
const { outputConfigFor } = __req('./lib/effort');

/**
 * The SDK is loaded lazily, on first use.
 *
 * Alexa-hosted skills run an old Node and do not ship @anthropic-ai/sdk. Requiring it at module
 * load would crash the whole skill at cold start \u2014 even when config.transport is 'http' and the
 * SDK is never needed. Never move this back to the top of the file.
 */
function loadSdk() {
  // eslint-disable-next-line global-require
  return require('@anthropic-ai/sdk');
}

/**
 * Claude provider \u2014 the MVP's only provider.
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

});

__def('./lib/providers/claude-http', function (module, exports) {
'use strict';

/**
 * Claude provider, zero-dependency variant.
 *
 * Why this exists: Alexa-hosted skills (the free option that needs no AWS account) pin an old
 * Node runtime, and the Anthropic SDK needs Node 18+. This file talks to the same API over the
 * built-in https module, so the skill runs anywhere Node runs \u2014 including Alexa-hosted.
 *
 * Selected with HANDFRAI_TRANSPORT=http. Behaviour and return shape are identical to
 * lib/providers/claude.js; keep the two in step.
 */

const https = require('node:https');
const { SYSTEM_PROMPT } = __req('./lib/prompt');
const config = __req('./lib/config');
const { outputConfigFor } = __req('./lib/effort');

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

/** Same contract as lib/providers/claude.js \u2014 see lib/ai.js. */
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

});

__def('./lib/providers/openai-compatible', function (module, exports) {
'use strict';

/**
 * Generic provider for any API that speaks OpenAI's chat-completions format.
 *
 * That is most of the cheap open-weight reasoning models \u2014 MiniMax, DeepSeek, Qwen, Kimi, GLM \u2014
 * whether served first-party or by a European or US host, and OpenAI itself. Zero dependencies,
 * so it runs on the old runtime Alexa-hosted pins.
 *
 * Reasoning models often return their thinking inline as <think>\u2026</think> or in a separate
 * `reasoning_content` field. Both are dropped: on a speaker only the answer is spoken.
 */

const https = require('node:https');
const { URL } = require('node:url');
const { SYSTEM_PROMPT } = __req('./lib/prompt');
const config = __req('./lib/config');

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
 * Same contract as the Claude providers \u2014 see lib/ai.js.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.baseUrl     e.g. https://api.minimax.io/v1 \u2014 "/chat/completions" is appended
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

});

__def('./lib/ai', function (module, exports) {
'use strict';

const config = __req('./lib/config');

/**
 * Providers and routes.
 *
 * Every provider implements the same call:
 *   answer({ apiKey, model, baseUrl?, extraBody?, messages, timeoutMs, client?, transport? })
 *     \u2192 { text, stopReason, usage: { input, output } }
 *
 * A route is a provider plus the credentials and model to use with it. Two routes exist:
 *   primary  \u2014 the user's own AI (bring your own key)
 *   fallback \u2014 the optional included model, used when the primary has no key or rejects it
 * See DECISIONS.md, "The fallback model" for why the fallback exists and where it must not be used.
 */

/**
 * Provider modules are required on demand, never at load time: the Claude SDK provider pulls in
 * @anthropic-ai/sdk, which does not exist on Alexa-hosted. Loading it eagerly crashes the skill
 * at cold start even when the HTTP transport is configured.
 */
function providerFor(name) {
  // eslint-disable-next-line global-require
  if (name === 'openai-compatible') return __req('./lib/providers/openai-compatible');
  if (name === 'claude') {
    // eslint-disable-next-line global-require
    return config.transport === 'http' ? __req('./lib/providers/claude-http') : __req('./lib/providers/claude');
  }
  throw new Error(`Unknown AI provider: ${name}`);
}

function primaryRoute() {
  return {
    name: 'primary',
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    extraBody: config.extraBody,
  };
}

function fallbackRoute() {
  if (!config.fallbackApiKey || !config.fallbackModel) return null;
  return {
    name: 'fallback',
    provider: config.fallbackProvider,
    apiKey: config.fallbackApiKey,
    model: config.fallbackModel,
    baseUrl: config.fallbackBaseUrl,
    extraBody: config.fallbackExtraBody,
  };
}

/** Errors that mean "this route will not work no matter how often we retry". */
function isCredentialError(err) {
  return err && (err.status === 401 || err.status === 403);
}

/**
 * Ask the user's AI; fall back to the included model only when the primary route is unusable
 * (no key, or the key is rejected). Never on a timeout \u2014 on a speaker there is no time to retry.
 *
 * @returns {Promise<{text, stopReason, usage, route: 'primary'|'fallback'}>}
 * @throws the primary route's error when no fallback exists, or the fallback's error otherwise.
 *         Throws { code: 'NO_ROUTE' } when neither route has a key.
 */
async function ask({ messages, timeoutMs, client, transport }) {
  const primary = primaryRoute();
  const fallback = fallbackRoute();
  const call = (route) => providerFor(route.provider).answer({
    ...route, messages, timeoutMs, client, transport,
  }).then((result) => ({ ...result, route: route.name }));

  if (primary.apiKey) {
    try {
      return await call(primary);
    } catch (err) {
      if (!fallback || !isCredentialError(err)) throw err;
      console.warn('route_fallback', { reason: 'primary_rejected', status: err.status });
    }
  } else if (!fallback) {
    const err = new Error('No AI configured: neither a primary key nor a fallback route.');
    err.code = 'NO_ROUTE';
    throw err;
  } else {
    console.warn('route_fallback', { reason: 'no_primary_key' });
  }

  return call(fallback);
}

module.exports = { ask, providerFor, primaryRoute, fallbackRoute };

});

/* ---- index.js ---- */
'use strict';

/**
 * Handfrai \u2014 Alexa skill backend.
 *
 * Flow: Alexa turns speech into text \u2192 this function sends it to the user's own AI with a
 * prompt that asks for a short spoken answer \u2192 Alexa speaks the answer.
 *
 * The conversation stays open by eliciting the `query` slot after every turn, which lets the
 * user speak freely (no carrier phrase, no invocation name) until they stop or fall silent.
 */

const Alexa = require('ask-sdk-core');
const config = __req('./lib/config');
const { ask } = __req('./lib/ai');
const { speechFor } = __req('./lib/speech');
const { toSpokenText, speechProblems } = __req('./lib/speech-text');
const { escape } = __req('./lib/ssml');

/** Alexa expects the full response within ~8 s, including cold start and text-to-speech. */
const MAX_SPOKEN_CHARS = 600;

/** The intent whose free-form slot we keep re-opening so the user can just talk. */
const ASK_INTENT = 'AskIntent';
const QUERY_SLOT = 'query';

/** An empty AskIntent, used to re-open the microphone for a free-form answer. */
function emptyAskIntent() {
  return {
    name: ASK_INTENT,
    confirmationStatus: 'NONE',
    slots: { [QUERY_SLOT]: { name: QUERY_SLOT, confirmationStatus: 'NONE' } },
  };
}

/**
 * The Alexa last mile: neutral spoken text (lib/speech-text.js) plus XML escaping (lib/ssml.js).
 * Nothing surface-specific happens before this point, so the same normalisation serves the web,
 * desktop and mobile apps unchanged -- see DECISIONS.md, "The speech contract".
 */
function sanitizeForSpeech(text, locale) {
  return escape(toSpokenText(text, { locale, maxChars: MAX_SPOKEN_CHARS }));
}

/** Optional "thinking" cue that covers model latency. Never throws. */
async function sendProgressive(handlerInput, text) {
  try {
    const { requestId } = handlerInput.requestEnvelope.request;
    const client = handlerInput.serviceClientFactory.getDirectiveServiceClient();
    await client.enqueue({
      header: { requestId },
      directive: { type: 'VoicePlayer.Speak', speech: text },
    });
  } catch (_) {
    // no directive service in tests, or the device does not support it
  }
}

/** Map a provider error to the right spoken line. */
function speechForError(err, phrases) {
  const status = err && err.status;
  const timedOut = (err && err.name === 'APIConnectionTimeoutError')
    || /timeout|timed out|abort/i.test(String(err && err.message));
  if (timedOut) return phrases.timeout;
  if (status === 401 || status === 403) return phrases.keyRejected;
  if (status === 429) return phrases.rateLimited;
  return phrases.error;
}

const LaunchRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle(h) {
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    return h.responseBuilder
      .speak(phrases.welcome)
      .reprompt(phrases.reprompt)
      // Elicit the free-form slot: whatever the user says next becomes the whole question,
      // with no carrier phrase needed.
      .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
      .getResponse();
  },
};

const AskIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === ASK_INTENT,
  async handle(h) {
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    const question = (Alexa.getSlotValue(h.requestEnvelope, QUERY_SLOT) || '').trim();

    if (!question) {
      return h.responseBuilder
        .speak(phrases.empty)
        .reprompt(phrases.reprompt)
        .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
        .getResponse();
    }

    const attributes = h.attributesManager.getSessionAttributes();
    const history = Array.isArray(attributes.history) ? attributes.history : [];
    const messages = [...history, { role: 'user', content: question }];

    await sendProgressive(h, phrases.thinking);

    const started = Date.now();
    let result;
    try {
      result = await ask({
        messages,
        timeoutMs: config.timeoutMs,
        client: h.context && h.context.aiClient,
        transport: h.context && h.context.aiTransport,
      });
    } catch (err) {
      if (err && err.code === 'NO_ROUTE') {
        // Nothing to call. End the session: repeating the question will not help.
        return h.responseBuilder.speak(phrases.noKey).withShouldEndSession(true).getResponse();
      }
      console.error('ai_error', {
        name: err && err.name, status: err && err.status, message: err && err.message, ms: Date.now() - started,
      });
      return h.responseBuilder
        .speak(speechForError(err, phrases))
        .reprompt(phrases.reprompt)
        .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
        .getResponse();
    }

    // The rubric on the RAW answer: how often the prompt alone produced speakable text. The
    // normaliser fixes it either way; this is how prompt drift becomes visible instead of silent.
    const problems = speechProblems(result.text);
    console.log('ai_answer', {
      ms: Date.now() - started, route: result.route, usage: result.usage, stop: result.stopReason,
      ...(problems.length ? { speech_problems: problems } : {}),
    });

    if (result.stopReason === 'refusal' || !result.text) {
      return h.responseBuilder
        .speak(phrases.refusal)
        .reprompt(phrases.reprompt)
        .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
        .getResponse();
    }

    const totals = attributes.totals || { input: 0, output: 0, turns: 0 };
    h.attributesManager.setSessionAttributes({
      history: [...messages, { role: 'assistant', content: result.text }].slice(-config.historyTurns * 2),
      totals: {
        input: totals.input + result.usage.input,
        output: totals.output + result.usage.output,
        turns: totals.turns + 1,
      },
    });

    return h.responseBuilder
      .speak(sanitizeForSpeech(result.text, Alexa.getLocale(h.requestEnvelope)))
      .reprompt(phrases.reprompt)
      .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
      .withSimpleCard('Handfrai', result.text)
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle(h) {
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    return h.responseBuilder
      .speak(phrases.help)
      .reprompt(phrases.reprompt)
      .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
      .getResponse();
  },
};

const StopIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && ['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent']
      .includes(Alexa.getIntentName(h.requestEnvelope)),
  handle(h) {
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    const { totals } = h.attributesManager.getSessionAttributes();
    // usage() ends with the farewell itself \u2014 the cost first, "bye" last, as a person would say it.
    const speech = totals && totals.turns
      ? phrases.usage(totals.input + totals.output, totals.turns)
      : phrases.goodbye;
    return h.responseBuilder.speak(speech).withShouldEndSession(true).getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent',
  handle(h) {
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    return h.responseBuilder
      .speak(phrases.empty)
      .reprompt(phrases.reprompt)
      .addElicitSlotDirective(QUERY_SLOT, emptyAskIntent())
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle(h) {
    const request = Alexa.getRequest(h.requestEnvelope);
    console.log('session_ended', { reason: request.reason, error: request.error });
    return h.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('unhandled_error', error);
    const phrases = speechFor(Alexa.getLocale(h.requestEnvelope));
    return h.responseBuilder.speak(phrases.error).reprompt(phrases.reprompt).getResponse();
  },
};

const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AskIntentHandler,
    HelpIntentHandler,
    StopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .withCustomUserAgent('handfrai/0.3.0');

exports.handler = skillBuilder.lambda();
exports.skill = skillBuilder.create();
exports._internal = { sanitizeForSpeech, speechForError, emptyAskIntent };

