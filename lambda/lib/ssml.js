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
const BRAND_IPA = { de: 'ˈhantfʁaɪ', en: 'ˈhændfraɪ' };

function brandFor(language) {
  const ipa = BRAND_IPA[language] || BRAND_IPA.en;
  return "<phoneme alphabet='ipa' ph='" + ipa + "'>Handfrai</phoneme>";
}

/** Escape XML specials. An unescaped ampersand has historically failed whole Alexa responses. */
function escape(text) {
  return Alexa.escapeXmlCharacters(String(text == null ? '' : text));
}

module.exports = { brandFor, escape, BRAND_IPA };
