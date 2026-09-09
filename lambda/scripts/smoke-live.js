'use strict';
/**
 * Live latency probe. Asks a few short spoken-style questions and prints how long each took.
 * Spends real tokens (a few cents). Usage:
 *
 *   # Claude models on your Anthropic key
 *   ANTHROPIC_API_KEY=sk-ant-... HANDFRAI_MODELS=claude-haiku-4-5,claude-sonnet-5,claude-opus-5 npm run smoke
 *
 *   # any OpenAI-compatible model (DeepSeek, MiniMax, Qwen, Kimi, GLM, a European host …)
 *   HANDFRAI_PROVIDER=openai-compatible HANDFRAI_BASE_URL=https://api.minimax.io/v1 \
 *   HANDFRAI_API_KEY=... HANDFRAI_MODELS=MiniMax-M3 HANDFRAI_EXTRA_BODY='{"enable_thinking":false}' npm run smoke
 */
const config = require('../lib/config');
const { providerFor } = require('../lib/ai');

const questions = [
  'what is the capital of Portugal',
  'explain compound interest to a ten year old',
  'how long should I boil an egg for a soft yolk',
];
const models = (process.env.HANDFRAI_MODELS || config.model).split(',');

(async () => {
  const provider = providerFor(config.provider);
  for (const model of models) {
    const times = [];
    for (const q of questions) {
      const t = Date.now();
      const r = await provider.answer({
        apiKey: config.apiKey, model, baseUrl: config.baseUrl, extraBody: config.extraBody,
        messages: [{ role: 'user', content: q }], timeoutMs: 20000,
      });
      const ms = Date.now() - t;
      times.push(ms);
      console.log(`${model} | ${ms} ms | in ${r.usage.input} out ${r.usage.output} | ${r.text.slice(0, 110)}`);
    }
    times.sort((a, b) => a - b);
    console.log(`== ${model}: min ${times[0]} ms, max ${times[times.length - 1]} ms`);
  }
})().catch((e) => { console.error(e.name, e.status, e.message); process.exit(1); });
