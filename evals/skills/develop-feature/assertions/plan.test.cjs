// Offline checks on the graders here. namesExistingSolution is a substring
// check on output against context.vars, so unlike the cut noInventedCitations
// it needs no materialised tree and this file does no network fetch on a cold
// cache. lib/fetch-repo.js is still what puts the tree in place for the eval
// itself. The quote-verified helpers below mirror
// review-code/assertions/review.test.cjs's offline pure-part checks - only
// their non-network parts (judgeProvider, weighByItem, askItems); the actual
// judge call is exercised by the eval run, not here.
const assert = require('node:assert');
const {
  namesExistingSolution, judgeProvider, weighByItem, askItems,
} = require('./plan.cjs');

assert.deepEqual(
  namesExistingSolution('use the cenkalti/backoff package already in go.mod', { vars: { existingIdentifier: 'cenkalti/backoff' } }),
  { pass: true, score: 1, reason: 'Plan names the existing mechanism: "cenkalti/backoff".' },
);
assert.equal(namesExistingSolution('add a manual retry loop with time.Sleep', { vars: { existingIdentifier: 'cenkalti/backoff' } }).score, 0);
// The exact false positive this guard exists to catch: a judge awarded the
// plan_quality rubric's item 1 while writing "the literal name appears in
// <ExistingMechanism>", i.e. quoting its own prompt variable. Describing the
// same strategy in the plan's own words is not naming it.
assert.equal(namesExistingSolution('reset the cached version and compare semver properly', { vars: { existingIdentifier: 'versionGreaterThan' } }).score, 0);
assert.equal(namesExistingSolution('anything', { vars: {} }).score, 1, 'no existingIdentifier on the case means nothing to check');

// --- quote-verified metrics' pure parts (no network) ------------------------
{
  // Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
  // exact object llm-rubric already used - no second copy of it in this file.
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = weighByItem({ 1: 0.5, 2: 0.25, 3: 0.25 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }, { n: 3, holds: false }]), 0.5, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'all three items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(w([{ n: 1, holds: true }, { n: 1, holds: true }, { n: 1, holds: false }]), 0, 'one item answered twice: the question fails if any answer fails');

  const built = askItems('the plan text', { vars: { request: 'the ask', existingIdentifier: 'cenkalti/backoff' } }, 'ITEM TEXT', { includeExisting: true });
  assert.ok(built.messages[1].content.includes('the plan text'), '<Output> carries the real plan');
  assert.ok(built.messages[1].content.includes('the ask'), '<FeatureRequest> carries the case var');
  assert.ok(built.messages[1].content.includes('cenkalti/backoff'), '<ExistingMechanism> carries the case var when requested');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

  const withoutExisting = askItems('the plan text', { vars: { request: 'the ask' } }, 'ITEM TEXT');
  assert.ok(!withoutExisting.messages[1].content.includes('ExistingMechanism'), 'tests_as_gate carries no <ExistingMechanism> tag, matching its original rubricPrompt');
}

// A latency assertion stays UNNAMED as a run-shape guard elsewhere in this
// suite... except develop-feature's already carries `metric: latency`
// (promptfooconfig.yaml, deliberately, per its own comment there) - this test
// only pins that every judged rubric metric now resolves to a real export.
const yamlLoadCfg = (f) => JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  require('node:path').join(__dirname, '..', f)], { encoding: 'utf8' }));
const caseAsserts = yamlLoadCfg('tests/cases.yaml').flatMap((c) => c.assert || []);
for (const a of caseAsserts) {
  assert.notEqual(a && a.type, 'llm-rubric', 'no llm-rubric left in cases.yaml; every judged metric moved to type: javascript');
  assert.notEqual(a && a.type, 'g-eval', 'no g-eval left in cases.yaml');
}
assert.ok(caseAsserts.some((a) => a && a.metric === 'plan_quality'), 'plan_quality metric still present');
assert.ok(caseAsserts.some((a) => a && a.metric === 'tests_as_gate'), 'tests_as_gate metric still present');
assert.ok(caseAsserts.some((a) => a && a.metric === 'recognizes_existing'), 'recognizes_existing metric still present');

console.log('ok   plan assertions (existing-mechanism naming; quote-verified rubric conversion)');
