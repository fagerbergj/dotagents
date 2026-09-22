// Offline self-test on quality.cjs's pure parts: no network, no judge call.
// Mirrors review.cjs's assertions/review.test.cjs.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askItems,
  designQuality, docFixQuality, alreadyCoveredQuality, noChangeQuality,
  contradiction204Quality, contradictionRequiredQuality } = require('./quality.cjs');

// Model comes off `test.options.provider.id`, the exact object llm-rubric
// already used - no second copy of it in this file.
{
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');
}

{
  const w = weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');

  const w5 = weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 });
  assert.equal(w5([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }, { n: 4, holds: true }]), 0.8, 'design_quality weights are 0.2 per item');
}

// askItems interpolates task, the attached contract (when the case var is
// present), and the output into <Task>/<Attached>/<Output>.
{
  const ctxNoContract = { vars: { task: 'add the widgets endpoint' } };
  const built = askItems('the reply text', ctxNoContract, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the reply text'), '<Output> carries the real reply');
  assert.ok(built.messages[1].content.includes('add the widgets endpoint'), '<Task> carries the case var');
  assert.ok(!built.messages[1].content.includes('<Attached>'), 'no contract var means no <Attached> block');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

  const ctxWithContract = { vars: { task: 'fix the docs', contract: 'openapi: 3.0.3' } };
  const built2 = askItems('the reply text', ctxWithContract, 'ITEM TEXT');
  assert.ok(built2.messages[1].content.includes('<Attached>openapi: 3.0.3</Attached>'), 'a contract var is carried as <Attached>');
}

// Every judged function is a plain (output, context) -> Promise shape, same
// contract judgeQuotedItems returns: a missing API key must resolve to a dead
// row (metadata.graderError), never throw or hang - judgeWithRetry catches
// callJudge's throw internally.
async function main() {
  delete process.env.OPENROUTER_API_KEY;
  const ctx = { vars: { task: 't', rubric: 'r', contract: 'openapi: 3.0.3' }, test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  // One representative call (each retries 3x with backoff, ~6s) is enough to
  // pin the error contract; every function routes through the same
  // judgeQuotedItems call, checked structurally below instead of by re-running it.
  const res = await designQuality('some output', ctx);
  assert.equal(res.pass, false);
  assert.equal(res.metadata && res.metadata.graderError, true, 'a graderError, not a bare 0, when no judge is reachable');
  for (const fn of [docFixQuality, alreadyCoveredQuality, noChangeQuality, contradiction204Quality, contradictionRequiredQuality]) {
    assert.equal(typeof fn, 'function', `${fn.name || 'export'} is a function`);
    assert.equal(fn.length, 2, `${fn.name} takes (output, context)`);
  }
}

main().then(() => {
  console.log('ok   rest-api-authoring quality assertions (pure parts; no judge reachable)');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
