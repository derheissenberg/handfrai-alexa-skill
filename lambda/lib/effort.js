'use strict';

/**
 * Not every Claude model accepts `output_config.effort`.
 *
 * Haiku 4.5 and the 4.5-era Sonnet reject it with a 400
 * ("This model does not support the effort parameter"), while Opus 4.5+ / Sonnet 5 / Fable accept it.
 * Sending it blindly turns a perfectly good model into a hard failure — and Haiku is exactly the
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
