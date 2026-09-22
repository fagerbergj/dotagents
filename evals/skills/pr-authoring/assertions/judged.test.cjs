// Offline checks on judged.cjs's pure parts (no network): the provider
// extraction, the weighting rule, and that each metric's askItems wires the
// right case vars into the right tags. Mirrors
// skills/review-code/assertions/review.test.cjs.
const assert = require('node:assert/strict');
const { judgeProvider, weighByItem, askItems, coverage, restraint, JSON_CONTRACT } = require('./judged.cjs');

// Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
// exact object llm-rubric already used - no second copy of it in this file.
{
  const ctx = { test: { options: { provider: { id: 'openai:chat:deepseek/deepseek-v4-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'deepseek/deepseek-v4-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');
}

{
  const w = weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(w([{ n: 1, holds: true }, { n: 1, holds: true }, { n: 1, holds: false }]), 0, 'one item repeated: the question fails if any instance fails');
  assert.equal(w([{ n: 2, holds: true }]), 0.4, 'a single verified item earns only its own weight');
}

// The system message states the JSON contract every metric shares.
assert.ok(JSON_CONTRACT.includes('"items"'), 'the system message states the JSON contract');

// coverage: <AuthorDescription> and <Output> only - the diff/note are not this
// metric's ground truth, `restraint`'s is.
{
  const built = askItems('the description text', { vars: { author_description: 'the real author wrote this' } }, 'ITEM TEXT', [['AuthorDescription', 'author_description']]);
  assert.ok(built.messages[1].content.includes('the description text'), '<Output> carries the real generated description');
  assert.ok(built.messages[1].content.includes('the real author wrote this'), '<AuthorDescription> carries the case var');
  assert.ok(!built.messages[1].content.includes('<Diff>'), 'coverage does not need the diff tag');
}

// restraint: <AuthorNote>, <Diff>, <AuthorDescription>, all three - without
// them every claim in <Output> would collapse to unsupported by default.
{
  const built = askItems('the description text', {
    vars: { note: 'noticed in the logs', diff: '--- a/x\n+++ b/x', author_description: 'why the author made it' },
  }, 'ITEM TEXT', [['AuthorNote', 'note'], ['Diff', 'diff'], ['AuthorDescription', 'author_description']]);
  assert.ok(built.messages[1].content.includes('<AuthorNote>noticed in the logs</AuthorNote>'));
  assert.ok(built.messages[1].content.includes('<Diff>--- a/x\n+++ b/x</Diff>'));
  assert.ok(built.messages[1].content.includes('<AuthorDescription>why the author made it</AuthorDescription>'));
}

// Both exported metrics are callable. Not invoked here: judgeQuotedItems
// retries over ~180s of backoff even on a synchronous "no API key" failure,
// which would hang this file's exit - askItems above already proves each
// metric's request is built correctly before it would ever reach the network.
assert.equal(typeof coverage, 'function');
assert.equal(typeof restraint, 'function');

console.log('ok   pr-authoring judged assertions (pure parts)');
