// Offline checks on rubrics.cjs's pure parts (no network). Mirrors
// review-code/assertions/review.test.cjs and fix-bug/assertions/fixbug.test.cjs.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askItems } = require('./rubrics.cjs');

// Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
// exact object each assertion already receives - no second copy of it here.
const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
const cfg = judgeProvider(ctx);
assert.equal(cfg.model, 'google/gemini-3.8-flash');
assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

const w = weighByItem({ 1: 0.6, 2: 0.4 });
assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
assert.equal(w([{ n: 1, holds: true }, { n: 1, holds: true }, { n: 1, holds: false }]), 0, 'one item per finding: the question fails if any finding fails');
assert.equal(w([{ n: 2, holds: true }, { n: 2, holds: true }]), 0.4, 'repeated items earn the weight once, never more than 1 in total');

const w3 = weighByItem({ 1: 0.34, 2: 0.33, 3: 0.33 });
assert.equal(w3([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'three-item weights sum to 1');
assert.ok(Math.abs(w3([{ n: 1, holds: true }]) - 0.34) < 1e-9, 'a single item earns its own weight');

const built = askItems('the diagram output', { vars: { task: 'draw the checkout flow', rubric: 'per something' } }, 'ITEM TEXT', [['Request', 'draw the checkout flow'], ['Rubric', 'per something']]);
assert.ok(built.messages[1].content.includes('the diagram output'), '<Output> carries the real model output');
assert.ok(built.messages[1].content.includes('<Request>draw the checkout flow</Request>'), 'the request is passed as its own tag');
assert.ok(built.messages[1].content.includes('<Rubric>per something</Rubric>'), 'the case rubric is passed as its own tag');
assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

console.log('ok   mermaid rubric assertions (pure parts)');
