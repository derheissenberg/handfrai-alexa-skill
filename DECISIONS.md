# Decisions behind this code

The comments in `lambda/lib/` point here. These are the five decisions that shaped the skill,
each with the reasoning and, where it exists, the measurement. They are extracted from the
project's decision records so that this repository explains itself.

---

## Bring your own key

**"Talk to your own AI" means a provider API key — never a consumer subscription.**

The obvious implementation, "log in with your Claude / ChatGPT / Gemini account", is closed:
Anthropic prohibits third-party apps from routing requests through Free/Pro/Max credentials or
storing Claude.ai session tokens; Google suspended accounts that proxied Gemini consumer OAuth;
OpenAI's "Sign in with ChatGPT" shares identity, not plan usage. This is the same across the big
providers, so the copy in this repository says **"your own API key"** and never "your subscription".

In this developer-mode build the key lives in the skill's configuration: one user, no backend,
stored nowhere else. Keys are never spoken, never logged, never put in a URL, never sent to Alexa.

Making the skill genuinely multi-user means account linking — an OAuth 2.0 authorization server
whose login page is "paste your API key, pick your provider", plus a key vault. That is not in
this repository.

---

## Model choice is a latency decision

Alexa requires the full response within **~8 seconds**, including cold start, model round-trip and
the TTS handoff. A Handfrai turn is roughly 150–400 tokens, so even the most expensive model costs
well under a cent per question. **Cost is not the constraint; time is.**

Measured 2026-09-07, three spoken-style questions per model, run from Cologne:

| Model | Min | Max | **Spread** | Output tokens |
|---|---|---|---|---|
| `claude-haiku-4-5` | 1353 ms | 1451 ms | **98 ms** | 49–61 |
| **`claude-sonnet-5`** | 1314 ms | 2041 ms | 727 ms | 17–82 |
| `claude-opus-5` | 1815 ms | 3552 ms | 1737 ms | 45–91 |

All three clear the 8-second wall, so pass/fail did not discriminate. **Variance did.**

**`claude-sonnet-5` at `effort: low` is the default.** Its worst case of 2.0 s leaves ~4 s of
headroom for a cold start and a harder question, and its answers are audibly better than Haiku's
on the same prompt.

- **Opus is not used** — not because 3.5 s fails, but because a 1.7 s spread on three *easy*
  questions is how a hard question plus a cold start finds the wall. On a speaker, a timeout is
  far worse than a plainer sentence.
- **Haiku 4.5 is the documented safety swap** — 98 ms of spread is remarkable. Set
  `HANDFRAI_MODEL=claude-haiku-4-5` if real-world latency disappoints.
- The Lambda gets ≥512 MB and a 10 s timeout; the client timeout is 6.5 s with no retries.

Two things the measurement taught beyond the ranking:

1. **Haiku 4.5 rejects `output_config.effort` with a 400.** Since Haiku is exactly what a latency
   test tends to select for a voice skill, this would have shipped. Hence `lib/effort.js`, which
   decides per model.
2. **Tokenizers differ** — the same three questions counted 197–204 input tokens on Haiku and
   264–270 on Sonnet and Opus. Cost comparisons across model families need re-baselining, not
   arithmetic on one number.

Numbers from a laptop are not the honest p95. Every request logs `ai_answer` with `ms`; read the
real distribution after a week of use and revise.

---

## The speech contract

**One neutral spoken text, produced once, encoded per surface at the last moment.**

Two findings force this. Most speech surfaces cannot take SSML at all — browser `speechSynthesis`
reads the tags aloud (`<speak>hello</speak>` becomes *"speak hello speak"*), Android's behaviour is
engine-dependent, `expo-speech` has no SSML parameter. And prompt-only normalisation is measurably
unreliable: every production voice framework ships a markdown filter regardless of what its prompt
says.

**1. The prompt asks, positively and with a reason.** `lib/prompt.js` is flowing prose, not a
bullet list — Anthropic documents that removing markdown from a prompt reduces markdown in the
output. Every constraint is a thing to do, with the reason attached.

**We never ask a model for SSML or for JSON-wrapped speech.** Model-authored SSML is unportable
and breaks on unsupported tags; JSON wrapping measurably flattens phrasing (diversity 1.80 → 1.58
bits, modal-answer share 41 % → 64 %) and costs accuracy on small models.

**2. The normalisation layer does the work, deterministically.** `lib/speech-text.js` turns
whatever the model returned into neutral spoken text: markdown removed, ellipses removed, URLs and
email addresses spoken or dropped, emoji and control characters stripped, whitespace collapsed,
length capped at a sentence boundary. It runs whether or not the prompt behaved, and it is the
layer every future surface shares.

**3. Markup is additive, per surface, and never load-bearing.** Only `lib/ssml.js` adds markup, and
only from the portable subset: `speak`, `p`, `s`, `break` (≤ 3 s), `sub alias`,
`phoneme alphabet="ipa"`, and `say-as` limited to cardinal, ordinal, characters, date, telephone.
**The test of the design: dropping all markup must lose decoration and never meaning.**

**4. Speech-readiness is asserted, not hoped for.** `speechProblems(text)` implements the rubric as
code — no markdown tokens, no URLs, no emoji, no ellipses, no unescaped ampersand, within the
length cap. It runs in tests and warns in production when a model answer arrives dirty, which is
how you find out the prompt is drifting.

---

## The fallback model, and where it must not be used

The skill can carry a second, cheap model behind the same `answer()` contract
(`lib/ai.js`, `lib/providers/openai-compatible.js`). The route order is fixed and deliberate:

**Your own key first. The fallback only when no key is configured or the key is rejected — never
on a timeout, and never as a silent substitute.**

If you configure one, use an **open-weight model on a European host — never a Chinese first-party
API**. The weights are fine; the data path is not. Regulatory action against DeepSeek in Italy and
Berlin targeted the app sending data to China, not the weights — open weights on an EU host trigger
no international transfer at all. Sensible choices: DeepSeek-V4-Flash on Scaleway (Paris),
MiniMax-M3 on Nebius (Finland).

On Alexa, keep the model's thinking mode **off** — the 8-second wall does not have room for it.

---

## No emotion inference

🔴 **This skill will never infer emotion, sentiment, stress or engagement from anyone's voice, and
neither should anything built on it.**

The EU AI Act bans emotion inference in the workplace and explicitly includes voice patterns
(fines to €35M or 7 % of global turnover). It is also the wrong thing to build. Pull requests that
add it will be declined.
