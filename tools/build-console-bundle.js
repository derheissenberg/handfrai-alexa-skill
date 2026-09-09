#!/usr/bin/env node
'use strict';

/**
 * Build a single-file version of the skill for pasting into the Alexa-hosted code editor.
 *
 *   node tools/build-console-bundle.js
 *
 * Alexa-hosted skills are edited in a browser, and recreating nine files by hand is where
 * setup goes wrong. This inlines every local module into one index.js with a tiny module
 * registry. Generated — never edit the output; change lambda/ and rebuild.
 */

const fs = require('node:fs');
const path = require('node:path');

const LAMBDA = path.join(__dirname, '..', 'lambda');
const OUT = path.join(__dirname, '..', 'dist', 'index.console.js');

/** Local modules, in the order they are registered. Keys are the require paths used in source. */
const MODULES = [
  ['./lib/config', 'lib/config.js'],
  ['./lib/effort', 'lib/effort.js'],
  ['./lib/prompt', 'lib/prompt.js'],
  ['./lib/speech-text', 'lib/speech-text.js'],
  ['./lib/ssml', 'lib/ssml.js'],
  ['./lib/speech', 'lib/speech.js'],
  ['./lib/providers/claude', 'lib/providers/claude.js'],
  ['./lib/providers/claude-http', 'lib/providers/claude-http.js'],
  ['./lib/providers/openai-compatible', 'lib/providers/openai-compatible.js'],
  ['./lib/ai', 'lib/ai.js'],
];

/** Map every relative require, however it is written, onto a registry key. */
const ALIASES = {
  '../config': './lib/config',
  '../effort': './lib/effort',
  './effort': './lib/effort',
  '../prompt': './lib/prompt',
  './speech-text': './lib/speech-text',
  './lib/speech-text': './lib/speech-text',
  './ssml': './lib/ssml',
  './lib/ssml': './lib/ssml',
  '../speech': './lib/speech',
  './config': './lib/config',
  './prompt': './lib/prompt',
  './speech': './lib/speech',
  './providers/claude': './lib/providers/claude',
  './providers/claude-http': './lib/providers/claude-http',
  './providers/openai-compatible': './lib/providers/openai-compatible',
  './ai': './lib/ai',
  './lib/config': './lib/config',
  './lib/ai': './lib/ai',
  './lib/speech': './lib/speech',
  './lib/prompt': './lib/prompt',
  '../config.local.js': '__config_local__',
};

function read(rel) {
  return fs.readFileSync(path.join(LAMBDA, rel), 'utf8');
}

/**
 * Escape every non-ASCII character as \uXXXX.
 *
 * The bundle is pasted through a clipboard into a browser editor and committed by Amazon's tooling.
 * Somewhere on that path UTF-8 was being mangled: the German voice spelled out "m-o-c-h-t-e-s-t",
 * "f-o-r" and "d-s-c-h-o-s-s" — every word containing an umlaut. Escapes make the artefact
 * 7-bit clean, so umlauts and IPA symbols survive any encoding on the way to the console.
 * JavaScript turns \uXXXX back into the character at parse time, so behaviour is unchanged.
 */
function toAscii(source) {
  return source.replace(/[^\x00-\x7F]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

const parts = [];
parts.push(`'use strict';
/**
 * Handfrai — single-file build for the Alexa-hosted code editor. GENERATED, do not edit.
 * Source: skill/alexa-handfrai/lambda/ — rebuild with tools/build-console-bundle.js
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
`);

/** Relative requires that survive into the bundle would fail at runtime — fail the build instead. */
const unresolved = [];

function rewrite(source, file) {
  return source.replace(/require\(\s*'([^']+)'\s*\)/g, (match, spec) => {
    if (ALIASES[spec]) return `__req('${ALIASES[spec]}')`;
    // node:https, ask-sdk-core, @anthropic-ai/sdk stay real requires; anything relative must not.
    if (spec.startsWith('.')) unresolved.push(`${file}: require('${spec}')`);
    return match;
  });
}

for (const [key, file] of MODULES) {
  parts.push(`\n__def('${key}', function (module, exports) {\n${rewrite(read(file), file)}\n});\n`);
}
parts.push(`\n/* ---- index.js ---- */\n${rewrite(read('index.js'), 'index.js')}\n`);

if (unresolved.length) {
  console.error('Unbundled relative requires — add them to MODULES/ALIASES:\n  ' + unresolved.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const bundle = toAscii(parts.join(''));
// eslint-disable-next-line no-control-regex
if (/[^\x00-\x7F]/.test(bundle)) throw new Error('bundle is not pure ASCII');
fs.writeFileSync(OUT, bundle, 'ascii');

const lines = parts.join('').split('\n').length;
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${lines} lines, ${(fs.statSync(OUT).size / 1024).toFixed(1)} kB`);
