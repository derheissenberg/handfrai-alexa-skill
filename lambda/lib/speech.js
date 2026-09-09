'use strict';

/**
 * Everything Handfrai says, per language.
 *
 * Alexa gives the request locale (en-US, de-DE, …); we key off the language part, so
 * en-GB and en-US share one voice. Adding a language means adding one block here plus
 * an interaction model in skill-package/interactionModels/custom/.
 *
 * These strings are spoken as SSML — the ASK SDK wraps them in <speak> for us — so the brand name
 * carries a <phoneme> tag. Left as plain text, "Handfrai" is a word in no language and each TTS
 * voice guesses differently; on the German voice it came out as something Stefan could not even
 * repeat. The name is meant to sound like German "handfrei" / English "hand fry".
 *
 * Anything added here must be valid SSML: escape a literal & as &amp; and < as &lt;.
 */

/** The brand, pronounced. Written form stays "Handfrai" for anything displayed. */
const BRAND = {
  de: "<phoneme alphabet='ipa' ph='ˈhantfʁaɪ'>Handfrai</phoneme>",
  en: "<phoneme alphabet='ipa' ph='ˈhændfraɪ'>Handfrai</phoneme>",
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
    welcome: `Hallo, ich bin ${BRAND.de}. Was möchtest du fragen?`,
    welcomeAgain: 'Hallo, da bin ich wieder. Was möchtest du fragen?',
    reprompt: 'Was möchtest du fragen?',
    thinking: 'Ich denke kurz nach.',
    noKey: `Für ${BRAND.de} ist noch kein K I Schlüssel hinterlegt. Trag deinen Schlüssel ein und versuch es noch einmal.`,
    keyRejected: 'Dein K I Anbieter hat den Schlüssel abgelehnt. Bitte prüfe den Schlüssel in der Konfiguration.',
    rateLimited: 'Dein K I Anbieter drosselt gerade die Anfragen. Bitte versuch es gleich noch einmal.',
    timeout: 'Das hat zu lange gedauert. Frag es noch einmal, gern etwas kürzer.',
    refusal: 'Dabei kann ich nicht helfen. Frag mich gern etwas anderes.',
    error: 'Bei der Verbindung zu deiner K I ist etwas schiefgegangen. Bitte versuch es noch einmal.',
    empty: 'Ich habe keine Frage verstanden. Was möchtest du wissen?',
    help: 'Frag mich einfach etwas, deine eigene K I antwortet in wenigen Sätzen. Du kannst weiterfragen, ohne den Namen noch einmal zu sagen. Sag Stopp, wenn du fertig bist.',
    goodbye: 'Tschüss, bis bald.',
    usage: (tokens, turns) =>
      `Diese Sitzung hat etwa ${tokens} Token für ${turns} ${turns === 1 ? 'Frage' : 'Fragen'} gebraucht. Tschüss, bis bald.`,
  },
};

/** @param {string} locale e.g. "de-DE" */
function speechFor(locale) {
  const language = String(locale || 'en-US').slice(0, 2).toLowerCase();
  return SPEECH[language] || SPEECH.en;
}

module.exports = { speechFor, SPEECH, BRAND };
