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
  de: { dot: ' Punkt ', at: ' at ', slash: ' Schrägstrich ' },
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
  if (/…|\.{3,}/.test(value)) problems.push('ellipsis');
  if (new RegExp(EMOJI.source, 'u').test(value)) problems.push('emoji');
  if (new RegExp(ILLEGAL_XML.source).test(value)) problems.push('control characters');
  if (new RegExp(LONE_SURROGATE.source).test(value)) problems.push('lone surrogate');
  if (value.length > maxChars) problems.push('longer than ' + maxChars + ' characters');
  return problems;
}

module.exports = { toSpokenText, speechProblems, MAX_SPOKEN_CHARS };
