// Offline checks on fabrication.cjs's pure parts. Runs before any tokens are
// bought, same shape as review-code/assertions/review.test.cjs.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askItems } = require('./fabrication.cjs');

// Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
// exact object the old llm-rubric already used - no second copy of it here.
const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
const cfg = judgeProvider(ctx);
assert.equal(cfg.model, 'google/gemini-3.8-flash');
assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

const w = weighByItem({ 1: 0.34, 2: 0.33, 3: 0.33 });
assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'all three items sum to 1');
assert.ok(w([{ n: 1, holds: true }, { n: 2, holds: true }]) < 0.7, 'two of three items still fails the 0.7 threshold, as the old rubric did');
assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
assert.equal(w([{ n: 1, holds: true }, { n: 1, holds: false }]), 0, 'a repeated item earns its weight only if every answer for it holds');

const built = askItems('the reply text', { vars: { brief: 'the actual request' } }, 'ITEM TEXT');
assert.ok(built.messages[1].content.includes('the reply text'), '<Output> carries the real reply');
assert.ok(built.messages[1].content.includes('the actual request'), '<Brief> carries the case var');
assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

console.log('ok   fabrication assertions (pure parts)');
