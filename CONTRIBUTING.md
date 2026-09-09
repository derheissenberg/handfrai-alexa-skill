# Contributing

Issues and pull requests are welcome. Two things to know before you open one.

## Sign your commits off (DCO)

Contributions are accepted under the [Developer Certificate of Origin](https://developercertificate.org/).
Add a sign-off line to each commit — `git commit -s` does it for you:

```
Signed-off-by: Your Name <your.email@example.com>
```

That line says you wrote the change, or have the right to submit it under the Apache-2.0 licence
this project uses. No CLA, no copyright assignment.

## Before you open a pull request

- **Tests pass:** `cd lambda && npm install && npm test`. Add a test for every handler change.
- **The 8-second wall:** anything you add to the request path has to state its latency cost. Alexa
  gives the whole turn about 8 seconds, including cold start and the TTS handoff.
- **Answers are spoken:** no markdown, at most three sentences, in the user's language. If you
  touch the output path, read [DECISIONS.md](DECISIONS.md) § "The speech contract" first.
- **Provider code goes behind the `answer()` contract** in `lambda/lib/ai.js`. No provider-specific
  logic in the handlers.
- **Never log, speak, or URL-encode an API key.**
- **`lambda/lib/prompt.js` is frozen text** so it stays prompt-cacheable. Change it deliberately,
  and say why in the pull request.

## One thing this project will not accept

🔴 **No emotion, sentiment, tone, stress or engagement scoring from anyone's voice.** The EU AI Act
bans emotion inference in the workplace and names voice patterns explicitly. It is also the wrong
thing to build. Pull requests adding it will be declined, however they are framed.
