// Offline checks on the quote-verified graders' pure parts, plus a pass over
// the config shape, mirroring review.test.cjs and adr.test.cjs.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const checks = require('./rfc.cjs');

const root = path.join(__dirname, '..');

// PyYAML, not a regex: anchors and aliases have to be resolved before anything
// can be asserted about the assertion list.
function load(file) {
  return JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
    path.join(root, file)], { encoding: 'utf8' }));
}

const config = load('promptfooconfig.yaml');
const cases = load('tests/cases.yaml');

// --- quote-verified pure parts (no network) ---------------------------------
{
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = checks.judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(checks.judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w4 = checks.weighByItem({ 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 });
  assert.equal(w4([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.25, 'only a holding item earns its weight');
  assert.equal(w4([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }, { n: 4, holds: true }]), 1, 'all four items sum to 1');
  assert.equal(w4([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(w4([{ n: 1, holds: true }, { n: 1, holds: true }, { n: 1, holds: false }]), 0, 'one item per finding: the question fails if any finding fails');
  assert.equal(w4([{ n: 2, holds: true }, { n: 2, holds: true }]), 0.25, 'repeated items earn the weight once');

  const w5 = checks.weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 });
  assert.equal(w5([{ n: 1, holds: true }, { n: 5, holds: true }]), 0.4, 'two of five items sum correctly');

  const built = checks.askItems('the document text', { vars: { task: 'the situation', rubric: 'the case requirement' } }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the document text'), '<Output> carries the real document');
  assert.ok(built.messages[1].content.includes('the situation'), '<Situation> carries the task var');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');
}

// Each per-case var (task, rubric) has to actually reach the judge - the
// whole reason these moved off a shared llm-rubric block is that item 4
// (proposalQuality) and item 5's context (controlQuality) still grade a
// different concrete fact per case.
{
  const p = require('./rfc.cjs');
  assert.equal(typeof p.proposalQuality, 'function');
  assert.equal(typeof p.honestTradeoffs, 'function');
  assert.equal(typeof p.noInventedSpecifics, 'function');
  assert.equal(typeof p.controlQuality, 'function');
}

// no_invented_specifics' own score rule: 0.25 per verified invented item,
// capped at 2 before subtracting - the same arithmetic the old llm-rubric did
// in prose, now run by code on items whose quotes already passed verification.
{
  const scoreFn = (verified) => 1 - 0.25 * Math.min(2, verified.filter((it) => it.holds).length);
  assert.equal(scoreFn([]), 1, 'nothing invented scores 1.00');
  assert.equal(scoreFn([{ holds: false }, { holds: false }]), 1, 'items that are NOT invented do not cost anything');
  assert.equal(scoreFn([{ holds: true }]), 0.75, 'one invented item costs 0.25');
  assert.equal(scoreFn([{ holds: true }, { holds: true }]), 0.5, 'two invented items cost 0.50');
  assert.equal(scoreFn([{ holds: true }, { holds: true }, { holds: true }, { holds: true }, { holds: true }]), 0.5, 'capped at two - a long document is not fined for proposing more');
}

// --- config shape -------------------------------------------------------------
const graders = [
  ...(config.defaultTest.assert || []),
  ...cases.flatMap((testCase) => testCase.assert || []),
];

assert.ok(graders.length >= 4, `only ${graders.length} assertions survived`);

for (const grader of graders) {
  assert.ok(grader && typeof grader === 'object', `assertion is not a mapping: ${JSON.stringify(grader)}`);
  assert.ok(grader.type, `assertion with no type: ${JSON.stringify(grader)}`);
  assert.notEqual(grader.type, 'llm-rubric', 'this suite moved every judged metric to type: javascript + judgeQuotedItems');
  assert.notEqual(grader.type, 'g-eval', 'g-eval drops pretty-printed verdicts; this suite uses judgeQuotedItems instead');
  if (grader.type !== 'latency') assert.ok(grader.metric, `assertion with no metric: ${JSON.stringify(grader).slice(0, 120)}`);
}

// A latency assertion stays UNNAMED (evals/AGENTS.md): named, it becomes a
// graded column beside the quality metrics, and a row slow enough to trip it
// is a row the completion cap already truncated, which those metrics fine
// on their own.
for (const a of graders) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

// A file:// reference to a module that no longer exports the named function
// fails every row at runtime, not at validate time.
for (const ref of [...config.prompts.map((p) => p.id), ...graders.map((g) => g.value)]) {
  if (typeof ref !== 'string' || !ref.startsWith('file://')) continue;
  const [file, fn] = ref.slice('file://'.length).split(':');
  const loaded = require(path.join(root, file));
  assert.equal(typeof loaded[fn], 'function', `${ref} does not resolve to an export`);
}

// Every case has to be gradeable on its own terms.
for (const testCase of cases) {
  const metrics = (testCase.assert || []).map((g) => g.metric);
  assert.ok(metrics.length, `no assertions: ${testCase.description}`);
  assert.equal(new Set(metrics).size, metrics.length, `duplicate metric: ${testCase.description}`);
}

// Fabrication rides on its own axis, on every proposal case (the &proposal
// alias) - never the controls, where "invents nothing" is already item 5 of
// control_quality.
const grounded = cases.filter((c) => (c.assert || []).some((g) => g.metric === 'no_invented_specifics'));
assert.equal(grounded.length, 8, `no_invented_specifics rides on ${grounded.length} cases, not all 8 proposals`);

// The whole point of the control expansion: a metric riding on two cases moves
// by more than any delta it can report.
const controls = cases.filter((c) => (c.assert || []).some((g) => g.metric === 'control_quality'));
assert.equal(controls.length, 5, `control_quality rides on ${controls.length} cases, not all 5 controls`);

console.log(`rfc config: ok (${cases.length} cases, ${graders.length} assertions)`);
