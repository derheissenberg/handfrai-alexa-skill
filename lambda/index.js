'use strict';

/**
 * Handfrai — Alexa skill backend.
 *
 * Flow: Alexa turns speech into text → this function sends it to the user's own AI with a
 * prompt that asks for a short spoken answer → Alexa speaks the answer.
 *
 * The conversation stays open by eliciting the `query` slot after every turn, which lets the
 * user speak freely (no carrier phrase, no invocation name) until they stop or fall silent.
 */

const Alexa = require('ask-sdk-core');
const config = require('./lib/config');
const { ask } = require('./lib/ai');
const { speechFor } = require('./lib/speech');
const { toSpokenText, speechProblems } = require('./lib/speech-text');
const { escape } = require('./lib/ssml');

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
    // usage() ends with the farewell itself — the cost first, "bye" last, as a person would say it.
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
