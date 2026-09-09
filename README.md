# Handfrai — the Alexa skill

**Put your own AI on your Echo.** Ask a question out loud; your own model answers in a few short
sentences, written to be heard rather than read. Keep asking without repeating the name. Say stop,
and it tells you what the session cost in tokens.

English and German both ship. Setup takes about 45 minutes and needs no AWS account.

```
"Alexa, open hand fry."
  → "Handfrai here. What would you like to ask?"
  → you ask anything, in plain language, without repeating the name
  → your own Claude answers in a few short sentences
```

**Start here: [SETUP.md](SETUP.md)** — written for someone who has never used AWS and has never
published an Alexa skill.

## Your key, your model, your bill

Handfrai has no model of its own and sells no tokens. Your question goes from Alexa straight to the
provider you already pay for, on **your own API key**.

One thing worth knowing before you start, because it surprises people: **a Claude Pro or Max plan
cannot be used this way, and the same is true across the big providers.** Third-party apps need a
separate API account. You will be creating a Console key and paying for usage — fractions of a cent
per question — not reusing a subscription you already have. The reasoning is in
[DECISIONS.md](DECISIONS.md) § "Bring your own key".

## What's in here

```
lambda/               the skill backend
  index.js            Alexa handlers: launch, ask, follow-up, help, stop
  lib/prompt.js       the system prompt — frozen text, so it stays prompt-cacheable
  lib/speech-text.js  markdown, emoji and URLs out; neutral spoken text in
  lib/ssml.js         the last-mile Alexa encoder — decoration only, never meaning
  lib/ai.js           the answer() contract: primary route, optional fallback route
  lib/providers/      claude (SDK), claude-http (zero-dependency), openai-compatible
  lib/effort.js       per-model effort handling; Haiku rejects what Sonnet requires
  lib/config.js       env vars, config.local.js, defaults
  test/               15 unit tests, no test framework — just node --test
  scripts/smoke-live.js   live latency probe across models (spends a few cents)
skill-package/        manifest, en-US + de-DE interaction models, icons
dist/index.console.js single-file build for the Alexa-hosted code editor (generated)
tools/                build the console bundle, or a zip for AWS Lambda
```

## Run the tests

No dependencies needed for the test run itself:

```bash
cd lambda && npm install && npm test
```

## Measure model latency before you choose one

This spends a few cents and is worth it — on a speaker, the model you want is the one with the
smallest *spread*, not the smallest median:

```bash
cd lambda && ANTHROPIC_API_KEY=sk-ant-... HANDFRAI_MODELS=claude-haiku-4-5,claude-sonnet-5,claude-opus-5 npm run smoke
```

The numbers that produced the current default are in [DECISIONS.md](DECISIONS.md).

## Configuration

`ANTHROPIC_API_KEY` for Claude, or `HANDFRAI_PROVIDER=openai-compatible` plus `HANDFRAI_BASE_URL`,
`HANDFRAI_API_KEY` and `HANDFRAI_MODEL` for DeepSeek, MiniMax, Qwen, Kimi, GLM or OpenAI. On
Alexa-hosted, also set `HANDFRAI_TRANSPORT=http` — that is the zero-dependency transport, for the
older Node runtime Alexa-hosted pins.

An optional fallback model (`HANDFRAI_FALLBACK_*`) answers only when the primary has no key or the
key is rejected — never on a timeout, never as a silent substitute. Full table in
[SETUP.md](SETUP.md) Appendix B.

## Design constraints, in one place

- **~8 seconds** for the whole turn, including cold start and the TTS handoff. Anything added to
  the request path has to justify its latency.
- **Answers are spoken**: no markdown, at most three sentences, in the user's language. This is
  enforced deterministically in `lib/speech-text.js`, not merely requested in the prompt.
- **Never log, speak or URL-encode an API key.**

The reasoning behind each of these — with the measurements — is in [DECISIONS.md](DECISIONS.md).

## Scope

This repository is the Alexa skill: the part you can self-host today with your own key. Handfrai's
other surfaces and its paid features live elsewhere and are not open source.

🔴 One thing this skill will never do: infer emotion, sentiment or stress from anyone's voice.
Banned in the workplace by the EU AI Act, which names voice patterns explicitly, and the wrong
thing to build regardless.

## Licence

[Apache-2.0](LICENSE). Contributions by [DCO sign-off](CONTRIBUTING.md) — `git commit -s`.
