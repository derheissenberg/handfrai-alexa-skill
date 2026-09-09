# Setting up Handfrai — from nothing to talking to your own Claude

> Written for someone who has never used AWS and has never published an Alexa skill. Follow it top to bottom. **Time: about 45 minutes**, most of it waiting for two builds. Nothing here costs money except the Claude usage, which is fractions of a cent per question.
>
> You need: an Amazon account (**the same one your Echo is registered to**), a browser, and a payment card for the Claude account.

---

## Before you start: what you are building

Three things have to exist and know about each other.

1. **The skill** — the name Alexa listens for, and the list of things people might say. Lives in Amazon's developer console.
2. **The code** — a small program that takes your question, asks Claude, and returns the answer. Also hosted by Amazon, in the same console.
3. **Your Claude API key** — the credential the code uses to reach Claude. Yours, billed to you, pasted into the code's configuration.

The path below uses **Alexa-hosted**, so there is no AWS account, no credit card at Amazon, and nothing to deploy from your laptop. If you would rather run it on AWS Lambda, skip to [Appendix A](#appendix-a--the-aws-lambda-path).

---

## Step 1 — Get a Claude API key (10 minutes)

The key is what makes the skill *yours*. It is not your Claude Pro subscription — subscriptions cannot be used by third-party apps. This is a separate, pay-as-you-go account, and for personal use it costs a few euros a month at most.

1. Go to **https://platform.claude.com** and sign in (you can use the same email as your Claude subscription; it is still a separate account for billing).
2. Open **Billing** and add a payment method. Load a small starting amount — €10 is plenty for months of personal use.
3. Still in Billing, set a **monthly spend limit**. Put in something you would not mind losing, for example €20. This is your safety net and it takes ten seconds.
4. Open **API keys → Create key**. Name it `handfrai-alexa`. Copy the key that appears — it starts with `sk-ant-` and **you will not be shown it again**.
5. Paste it somewhere safe for the next ten minutes (a password manager, not a chat window).

> **A question costs roughly a tenth of a cent.** Asking Handfrai fifty questions a day for a month lands well under €5.

---

## Step 2 — Create the skill (10 minutes)

1. Go to **https://developer.amazon.com/alexa/console/ask** and sign in **with the same Amazon account your Echo uses**. That is what makes the skill appear on your own device automatically.
2. If this is your first visit, fill in the developer profile it asks for. When it asks about payments or monetisation, say no — you are not selling anything.
3. Click **Create Skill**.
    - **Skill name:** `Handfrai`
    - **Primary locale:** `English (US)` — or `German (DE)` if you want to test in German first. You can add the other one later in Step 6.
    - **Experience type:** `Other`  ·  **Model:** `Custom`  ·  **Hosting:** **`Alexa-hosted (Node.js)`**
4. On the template screen choose **Start from Scratch**, then **Create skill**. Amazon now provisions your code environment — this takes a minute or two.

---

## Step 3 — Give Alexa the words (5 minutes)

This tells Alexa what to listen for.

1. **Where:** top tab bar → **Build**. Then in the left sidebar: **Custom → Interaction Model → JSON Editor**. The screen splits — JSON on the left, an **Utterance Profiler** panel on the right.
2. Open the matching file from this repository and copy **all** of it:
    - English: `skill-package/interactionModels/custom/en-US.json`
    - German: `skill-package/interactionModels/custom/de-DE.json`
3. Select everything in the console's editor, delete it, and paste the file in its place.
4. **Top right of that screen:** click **Save**, then **Build skill**. (Not *Evaluate model* — that only tests an already-built model.) The build takes one to three minutes; the header shows "Last successful build" when it is done.
5. **Check it understood you.** In the right-hand **Utterance Profiler** panel, bottom edge, type `was ist die Hauptstadt von Portugal` into *"Type or say an utterance…"* and press **Submit**. It must resolve to **AskIntent** with the slot **query** filled. This tests only speech-to-intent mapping — no code runs, no API key needed, no answer is produced.

> **What the invocation name is, and why it is two words.** The English model listens for **"hand fry"**, the German one for **"hand frei"**. Amazon rejects single-word invocation names unless you own the trademark, and two words also transcribe far more reliably. The skill is still called Handfrai everywhere a human reads it.

---

## Step 4 — Put the code in place (10 minutes)

1. In the left sidebar, open the **Code** tab. You will see a small starter project with `index.js` and `package.json`.
2. **The short way — one file instead of nine.** From the root of this repository, copy the whole single-file build to the clipboard (`pbcopy` on macOS; use `xclip -sel c <` on Linux, or just open the file and select all):

    ```bash
    pbcopy < dist/index.console.js
    ```

    In the console's file tree click **`index.js`**, select all in the editor (`cmd+A`), and paste. That file is a generated build of the whole skill — rebuild it any time with `npm run bundle`. It is deliberately **pure ASCII**: umlauts and phonetic symbols are stored as `\uXXXX` escapes, because somewhere between clipboard, browser editor and deploy the UTF-8 was being mangled and the German voice spelled out every word containing an umlaut.

    **Also replace `package.json`** with this repository's `dist/package.json` (`pbcopy < dist/package.json`). It lists only the Alexa SDK — **not** `@anthropic-ai/sdk`, which Alexa-hosted's Node is too old for and which the HTTP transport makes unnecessary. Then skip to point 3.

    **The long way**, if you would rather keep the same file layout as the repository: recreate these files from `lambda/`, using the file-tree icons in the console to create folders and files, and pasting each file's contents:

    ```
    index.js
    package.json
    config.local.js          ← you create this one, see step 3 below
    lib/config.js
    lib/speech.js
    lib/prompt.js
    lib/ai.js
    lib/providers/claude.js
    lib/providers/claude-http.js
    ```

     Replace the starter `index.js` and `package.json` completely. Either way, keep `package.json`.

3. Create **`config.local.js`** at the top level (next to `index.js`) and paste this, with your key from Step 1:

    ```js
    'use strict';
    module.exports = {
     anthropicApiKey: 'sk-ant-PASTE-YOUR-KEY-HERE',
     transport: 'http',
    };
    ```

    `transport: 'http'` matters: Alexa-hosted runs an older version of Node than the official Anthropic library needs, so the skill talks to Claude directly instead. If the console offers you a Node 18 or newer runtime **and** a place to set environment variables, you can use `ANTHROPIC_API_KEY` there instead and skip this file.

4. **Top right:** click **Save**, then **Deploy**. Takes about a minute; wait for the "deployed" confirmation before testing.

> **Where your key lives.** In Amazon's private code repository for this skill, visible only to you. It is not in this project's GitHub repository — `config.local.js` is git-ignored precisely so it can never be pushed by accident.

---

## Step 5 — Talk to it (5 minutes)

1. **Where:** top tab bar → **Test**. Top left of that screen is a dropdown reading *Off* — switch it to **Development**. The chat/microphone area below it becomes active.
2. In the input box (bottom, *"Type or ask Alexa a question…"*) type: **`öffne hand frei`** — German skill — or **`open hand fry`** on an English one. You should hear *"Handfrai ist da. Was möchtest du fragen?"*
3. Now just ask something in the same box — **no need to repeat the name**: `was ist die Hauptstadt von Portugal`.
4. Ask a follow-up straight after: `und wie viele Menschen leben dort`. It should keep context.
5. Type `stopp`. It says goodbye and tells you how many tokens the conversation used.

**Then try it on your actual Echo.** It is already there — a skill in development is enabled on every device of the same Amazon account. Say: *"Alexa, open hand fry."*

### If something goes wrong

| What you hear | What it means | Fix |
|---|---|---|
| "Handfrai has no A I key configured yet" | The code cannot find your key | Check `config.local.js` exists next to `index.js`, exports `anthropicApiKey`, and that you clicked **Deploy** |
| "Your A I provider rejected the key" | The key is wrong, or the account has no credit | Re-copy the key; check Billing at platform.claude.com |
| "That took too long to think about" | Claude did not answer inside Alexa's 8-second limit | Normal on the very first request (cold start). If it repeats, see Step 7 |
| "Something went wrong talking to your A I" | Anything else | Open **Code → Logs** (CloudWatch) and read the last `ai_error` line |
| Alexa says the skill is not available | The model is not built, or you are on a different Amazon account | Re-run **Build Model**; check the account matches your Echo |
| It answers, but mishears your questions | Speech recognition, not the code | Try the phrasing that failed in **Build → Utterance Profiler** and note it — this is exactly the data Step 8 asks for |

---

## Step 6 — Add the second language (5 minutes, optional)

1. **Build → Custom → Interaction Model**, then in the language dropdown at the top right choose **Add new language**.
2. Add **German (DE)**, open its **JSON Editor**, and paste `de-DE.json`.
3. **Save Model → Build Model.**

No code change is needed: the skill answers in the language of the request, and Claude replies in the language you speak.

---

## Step 7 — Measure, then choose the model (15 minutes, do this in week one)

Alexa hangs up if the whole answer takes more than about eight seconds. Which Claude model you use is therefore a timing decision, and it should be made with numbers rather than taste.

On your laptop, from `lambda/`:

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... HANDFRAI_MODELS=claude-haiku-4-5,claude-sonnet-5,claude-opus-5 npm run smoke
```

It asks three spoken-style questions of each model and prints how long each took. Costs a few cents.

Pick the model whose slowest answer stays comfortably under five seconds, then set it in `config.local.js`:

```js
model: 'claude-haiku-4-5',   // or whichever won
```

Deploy again. Write the numbers down somewhere you will find them again — the model you pick is a latency decision before it is a quality one, and the numbers are the only honest way to make it.

---

## Step 8 — Use it for a week, and write things down

This is the part that decides what gets built next, and it is worth more than any benchmark.

Keep two lists as you go:

- **The utterance log** — every phrasing that failed, what you meant, and what Alexa heard.
- **The friction log** — every moment during normal work where speaking would have been faster than typing, and every moment speaking failed you. Fifteen dated entries is enough to be useful.

Fifteen dated entries in each is enough to tell you whether a speaker is the right surface for you at all — which is a more useful thing to learn in week one than any benchmark.

---

## Optional — an included model as a fallback (10 minutes)

Handfrai can carry a second, cheap model that answers **only when no key is configured or the key is rejected** — never on a timeout. In the product this is what a subscription ships with; in developer mode it is simply a second key you paste. It also lets you *hear* the subscription experience before deciding whether it is worth selling.

1. Pick a cheap model on an EU-hosted endpoint. A good default is **DeepSeek-V4-Flash on Scaleway** (Paris, zero retention, about €0.40 per million input tokens; Scaleway gives 1M free tokens to start). MiniMax-M3 is the second.
2. Create a key with that host and add the `fallback*` block from `config.local.example.js` to your `config.local.js`. Keep thinking switched off on Alexa (`thinking: { type: 'disabled' }` for DeepSeek; MiniMax-M3 is off by default).
3. Deploy. To try the fallback on the Echo, temporarily blank `anthropicApiKey` and ask the same questions as before. The log line `route_fallback` confirms which route answered.
4. Measure it the same way as Step 7: `HANDFRAI_PROVIDER=openai-compatible HANDFRAI_BASE_URL=https://api.scaleway.ai/v1 HANDFRAI_API_KEY=… HANDFRAI_MODELS=deepseek-v4-flash-0731 HANDFRAI_EXTRA_BODY='{"thinking":{"type":"disabled"}}' npm run smoke`.

**Never use a Chinese first-party endpoint for anything you ship** — the weights are fine, the data path is not. The setup above keeps inference in the EU.

## What "publishing" means, honestly

Right now you have a **development skill**: fully working, on all your own devices, free, private. For most of what you want, that is the finished state.

**Beta testing** is the next step and it is easy: **Distribution → Availability → Beta Test**, add up to 500 email addresses. Testers need an Amazon account in a country you distribute to. This works with everything you have now.

**Publishing to the Alexa Skills Store is a different decision, and there is a catch worth understanding before you spend a weekend on it.** With today's build, every user's questions would be billed to *your* API key. That is fine for a handful of beta testers and financially unwise for the public. Making it genuinely public means account linking, so each user brings their own key — an OAuth server, a key vault and per-user token accounting. That is not in this repository, and it is a few weeks of work.

If you do go to certification, these are the pieces that must be in place first:

- **Privacy policy and terms live at real URLs.** Write your own, publish them, and replace the `handfrai.com` links in `skill-package/skill.json` with yours.
- **The invocation name.** "Handfrai" as a single word will be rejected without trademark proof. The two-word names in the shipped models avoid the problem entirely.
- **Icons** — already in `skill-package/assets/` at both required sizes.
- **Testing instructions for the reviewer** — already written into `skill-package/skill.json`; if you have added account linking, you must also supply test credentials.
- **The description already carries the "not medical, legal or financial advice" line**, which an open-ended AI skill needs.

---

## Appendix A — The AWS Lambda path

Only worth doing when you need proper logs, control over the region, or you are moving toward the phase-2 backend anyway.

1. Create an AWS account and open the **Lambda** console in **eu-west-1 (Ireland)**.
2. **Create function → Author from scratch.** Name `handfrai`, runtime **Node.js 22**, architecture arm64.
3. **Configuration → General → Edit:** memory **512 MB**, timeout **10 seconds**.
4. **Configuration → Environment variables:** add `ANTHROPIC_API_KEY` with your key. (No `config.local.js` needed here, and no `transport` setting — Node 22 runs the official library.)
5. Build the upload package on your laptop:

    ```bash
    ./tools/package-lambda.sh
    ```

    Upload the resulting `handfrai-lambda.zip` under **Code → Upload from → .zip file**.
6. **Add trigger → Alexa Skills Kit**, and paste your Skill ID (developer console, **Build → Endpoint**).
7. Copy the function's **ARN** from the top right of the Lambda page.
8. In the Alexa console: **Build → Endpoint → AWS Lambda ARN**, paste it into **Default Region**, and save. (This requires a skill created with "Provision your own" hosting rather than Alexa-hosted.)

The ASK CLI can also do all of this in one command if you prefer: `ask-resources.json` in the repository root is already configured for `ask deploy`.

---

## Appendix B — Configuration reference

Set these as environment variables (AWS) or as keys in `config.local.js` (Alexa-hosted).

**Your own AI (the primary route)**

| Setting | Environment variable | Default | What it does |
|---|---|---|---|
| API key | `ANTHROPIC_API_KEY` (or `HANDFRAI_API_KEY`) | — | **Required** unless a fallback is configured. Your key |
| Provider | `HANDFRAI_PROVIDER` | `claude` | `claude`, or `openai-compatible` for DeepSeek, MiniMax, Qwen, Kimi, GLM, OpenAI and any host that speaks the chat-completions format |
| Base URL | `HANDFRAI_BASE_URL` | — | Only for `openai-compatible`, e.g. `https://api.deepseek.com/v1` |
| Model | `HANDFRAI_MODEL` | `claude-opus-5` | Set from the Step 7 measurement |
| Extra body | `HANDFRAI_EXTRA_BODY` | — | JSON merged into the request, e.g. a provider's switch to turn thinking off |
| Transport | `HANDFRAI_TRANSPORT` | `sdk` | Claude only: `http` for Alexa-hosted's old runtime, `sdk` on Node 18+ |
| Effort | `HANDFRAI_EFFORT` | `low` | Claude only: how hard the model thinks. Higher is slower |

**The included model (optional fallback)** — used only when the primary has no key or its key is rejected, never on a timeout. In the product this ships with a subscription; in developer mode it is a second key you configure.

| Setting | Environment variable | Default |
|---|---|---|
| Provider | `HANDFRAI_FALLBACK_PROVIDER` | `openai-compatible` |
| API key | `HANDFRAI_FALLBACK_API_KEY` | — (fallback is off without it) |
| Base URL | `HANDFRAI_FALLBACK_BASE_URL` | — |
| Model | `HANDFRAI_FALLBACK_MODEL` | — |
| Extra body | `HANDFRAI_FALLBACK_EXTRA_BODY` | — |

**Shared**

| Setting | Environment variable | Default | What it does |
|---|---|---|---|
| Answer length | `HANDFRAI_MAX_TOKENS` | `300` | Roughly 200 spoken words maximum |
| Timeout | `HANDFRAI_TIMEOUT_MS` | `6500` | Must stay under Alexa's ~8 s budget |
| Context depth | `HANDFRAI_HISTORY_TURNS` | `6` | Question-and-answer pairs kept in one conversation |

In `config.local.js` the same settings use the names shown in `config.local.example.js` (`apiKey`, `provider`, `baseUrl`, `fallbackApiKey`, …).

## Appendix C — Changing what Handfrai says

- **The answers' style** — `lambda/lib/prompt.js`. This is the instruction that makes answers short and speakable. Editing it changes the product more than anything else in the codebase.
- **The skill's own lines** (greeting, errors, goodbye) — `lambda/lib/speech.js`, one block per language.
- **What Alexa listens for** — the interaction model JSON, then **Build Model** again.

After any change: `npm test` on your laptop, then Deploy.
