// Offline checks on the quote-verified rubrics' pure parts (no network),
// mirroring review-code/assertions/review.test.cjs.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askItems } = require('./rubrics.cjs');

// Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
// exact object llm-rubric already used - no second copy of it in this file.
const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
const cfg = judgeProvider(ctx);
assert.equal(cfg.model, 'google/gemini-3.8-flash');
assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

const w3 = weighByItem({ 1: 0.4, 2: 0.3, 3: 0.3 });
assert.equal(w3([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'all three items sum to 1');
assert.equal(w3([{ n: 1, holds: true }]), 0.4, 'item 1 alone earns its own weight');
assert.equal(w3([]), 0, 'nothing verified scores 0, not an error');

const w2 = weighByItem({ 1: 0.5, 2: 0.5 });
assert.equal(w2([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.5, 'proportionate_fix: one axis failing lands on the old rubric\'s middle value');
assert.equal(w2([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both axes holding is fully proportionate');
assert.equal(w2([{ n: 1, holds: false }, { n: 2, holds: false }]), 0, 'both axes failing is the old 0');

const built = askItems('the output text', { vars: { issueBody: 'report text', rootCause: 'the real mechanism', verdict: 'bug' } }, 'ITEM TEXT', [
  ['BugReport', 'report text'],
  ['ActualRootCause', 'the real mechanism'],
  ['Verdict', 'bug'],
]);
assert.ok(built.messages[1].content.includes('the output text'), '<Output> carries the real answer');
assert.ok(built.messages[1].content.includes('<BugReport>report text</BugReport>'), '<BugReport> carries the case var');
assert.ok(built.messages[1].content.includes('<ActualRootCause>the real mechanism</ActualRootCause>'), '<ActualRootCause> carries the case var');
assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

// A latency assertion stays UNNAMED - see promptfooconfig.yaml's comment and
// review-code's identical check. PyYAML rather than a regex - the configs
// are structured and cases.yaml carries anchors.
const yamlLoadCfg = (f) => JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  require('node:path').join(__dirname, '..', f)], { encoding: 'utf8' }));
for (const a of [...(yamlLoadCfg('promptfooconfig.yaml').defaultTest.assert || []),
  ...yamlLoadCfg('tests/cases.yaml').flatMap((c) => c.assert || [])]) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

// Every case that references the three anchors gets exactly the three
// javascript assertions, each with the metric name and file the anchor names
// - a broken YAML anchor (a case missing one, or one still on llm-rubric)
// would otherwise only show up after spending judge calls.
const cases = yamlLoadCfg('tests/cases.yaml');
const EXPECTED = new Map([
  ['root_cause_depth', 'assertions/rubrics.cjs:rootCauseDepth'],
  ['regression_proof', 'assertions/rubrics.cjs:regressionProof'],
  ['proportionate_fix', 'assertions/rubrics.cjs:proportionateFix'],
]);
let checked = 0;
for (const c of cases) {
  for (const a of c.assert || []) {
    if (!EXPECTED.has(a.metric)) continue;
    assert.equal(a.type, 'javascript', `${c.description}: ${a.metric} must be type: javascript, not ${a.type}`);
    assert.equal(a.value, `file://${EXPECTED.get(a.metric)}`, `${c.description}: ${a.metric} must point at rubrics.cjs`);
    checked += 1;
  }
}
assert.equal(checked, cases.length * 3, `every one of the ${cases.length} cases must carry all three judged metrics`);

console.log('ok   fix-bug rubrics (pure parts; judge calls not made)');
