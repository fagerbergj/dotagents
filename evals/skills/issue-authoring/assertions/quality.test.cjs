// Offline checks on quality.cjs's pure parts (no network): the shared judge
// plumbing (judgeProvider, weighByItem, askIssueItems) and the config guards
// every suite carries. dotagents#64/#65 pattern; mirrors
// skills/review-code/assertions/review.test.cjs.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askIssueItems, SEMANTIC_QUALITY_ITEMS, SEMANTIC_QUALITY_WEIGHTS } = require('./quality.cjs');

// --- judge plumbing (no network) --------------------------------------------
{
  // Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
  // exact object the harness already builds for the judge call.
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(weighByItem(undefined)([{ n: 1, holds: true }]), 0, 'no weights configured never throws');

  // Per-case weights come from `vars.weights` (string keys, as tests/cases.yaml
  // writes them: { "1": 0.4, "2": 0.3, "3": 0.3 }).
  const wCase = weighByItem({ '1': 0.4, '2': 0.3, '3': 0.3 });
  assert.equal(wCase([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'string-keyed weights sum to 1 too');

  const built = askIssueItems('the write-up text', { vars: { report: 'raw report text' } }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the write-up text'), '<Output> carries the real write-up');
  assert.ok(built.messages[1].content.includes('raw report text'), '<Report> carries the case var');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

  assert.equal(Object.values(SEMANTIC_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 1, 'semantic_quality weights sum to 1.0');
  assert.match(SEMANTIC_QUALITY_ITEMS, /^1\./m, 'items are numbered, not free prose');
}

// A latency assertion stays UNNAMED - see review.test.cjs for why. PyYAML
// rather than a regex: the config is structured and cases.yaml carries anchors.
const yamlLoadCfg = (f) => JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  require('node:path').join(__dirname, '..', f)], { encoding: 'utf8' }));
const cfg = yamlLoadCfg('promptfooconfig.yaml');
const cases = yamlLoadCfg('tests/cases.yaml');
for (const a of [...(cfg.defaultTest.assert || []), ...cases.flatMap((c) => c.assert || [])]) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

// Every case that carries `rubric`/`weights` has weights summing to 1.0 and an
// item text numbered to match - a mismatch here means an item nothing can ever
// earn, or a weight left orphaned when an item was trimmed.
for (const c of cases) {
  if (!c.vars || c.vars.weights === undefined) continue;
  const total = Object.values(c.vars.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `${c.description}: weights sum to ${total}, not 1.0`);
  for (const n of Object.keys(c.vars.weights)) {
    assert.match(c.vars.rubric, new RegExp(`^\\s*${n}\\.`, 'm'), `${c.description}: weight ${n} has no matching numbered item`);
  }
  const itemNums = [...c.vars.rubric.matchAll(/^\s*(\d+)\./gm)].map((m) => m[1]);
  assert.ok(itemNums.length <= 3, `${c.description}: ${itemNums.length} items, task caps items at 1-3`);
}

console.log('ok   quality assertions (judge plumbing; case weights sum to 1.0 and match their items)');
