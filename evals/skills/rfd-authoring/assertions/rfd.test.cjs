// dotagents#64/#65 quote-verified pattern (evals/skills/review-code/assertions/
// review.test.cjs, evals/skills/adr-authoring/assertions/adr.test.cjs): offline
// checks on rfd.cjs's pure helpers, plus the config-shape checks this file
// already carried before the conversion - now updated for `type: javascript`
// graders instead of llm-rubric prose. An earlier pass left four assertions
// with no metric, still executing, while `validate config` said the
// configuration was valid; those checks are why this file exists at all.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { judgeProvider, weighByItem, askItems, countTells } = require('./rfd.cjs');

const root = path.join(__dirname, '..');

// --- pure helpers shared with review.cjs / adr.cjs --------------------------
{
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
}

// askItems: task always present, rubric/tells only when the case var exists.
{
  const built = askItems('the document text', { vars: { task: 'colleague note here' } }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the document text'), '<Output> carries the real output');
  assert.ok(built.messages[1].content.includes('colleague note here'), '<Note> carries the task var');
  assert.ok(!built.messages[1].content.includes('<Requirement>'), 'no rubric var means no <Requirement> tag');
  assert.ok(!built.messages[1].content.includes('<Tells>'), 'no tells var means no <Tells> tag');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');

  const withExtras = askItems('out', { vars: { task: 't', rubric: 'r', tells: '1. a\n2. b' } }, 'ITEM TEXT');
  assert.ok(withExtras.messages[1].content.includes('<Requirement>r</Requirement>'));
  assert.ok(withExtras.messages[1].content.includes('<Tells>1. a\n2. b</Tells>'));
}

// countTells: the item count findsTheDecision derives its per-item weight
// from, one item per numbered line in the tells var.
{
  assert.equal(countTells({ vars: { tells: '1. a\n2. b\n3. c' } }), 3);
  assert.equal(countTells({ vars: { tells: '1. a\n\n2. b' } }), 2, 'a blank line between tells does not merge them');
  assert.equal(countTells({ vars: {} }), 0, 'no tells var counts as zero, not a throw');
  assert.equal(countTells({}), 0);
}

// --- config-shape checks over the suite's own YAML --------------------------
// PyYAML, not a regex: anchors and aliases have to be resolved before anything
// can be asserted about the assertion list.
function load(file) {
  return JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
    path.join(root, file)], { encoding: 'utf8' }));
}

const config = load('promptfooconfig.yaml');
const cases = load('tests/cases.yaml');

const graders = [
  ...(config.defaultTest.assert || []),
  ...cases.flatMap((testCase) => testCase.assert || []),
];

assert.ok(graders.length >= 12, `only ${graders.length} assertions survived`);

for (const grader of graders) {
  assert.ok(grader && typeof grader === 'object', `assertion is not a mapping: ${JSON.stringify(grader)}`);
  assert.ok(grader.type, `assertion with no type: ${JSON.stringify(grader)}`);
  assert.notEqual(grader.type, 'llm-rubric', `${grader.metric || '(unnamed)'} is still llm-rubric, not converted to quote-verified javascript`);
  assert.notEqual(grader.type, 'g-eval', 'g-eval drops pretty-printed verdicts; not used here either');
  if (grader.type === 'latency') continue;   // the one deliberately unnamed run-shape guard
  assert.ok(grader.metric, `assertion with no metric: ${JSON.stringify(grader).slice(0, 120)}`);
  assert.ok(grader.threshold > 0 && grader.threshold <= 1, `${grader.metric} threshold out of range`);
}

// A latency assertion stays UNNAMED (review-code's review.test.cjs): named,
// it becomes a graded column beside the quality metrics.
for (const a of graders) {
  assert.ok(!(a.type === 'latency' && a.metric),
    `latency carries metric "${a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

// A file:// reference to a module that no longer exports the named function
// fails every row at runtime, not at validate time.
for (const ref of [...config.prompts.map((p) => p.id), ...graders.map((g) => g.value)]) {
  if (typeof ref !== 'string' || !ref.startsWith('file://')) continue;
  const [file, fn] = ref.slice('file://'.length).split(':');
  const loaded = require(path.join(root, file));
  assert.equal(typeof loaded[fn], 'function', `${ref} does not resolve to an export`);
}

// The judge is the settled one (evals/AGENTS.md, "Judge settings are
// settled"): a different family from the reviewer, temperature 0, reasoning
// enabled under passthrough (a bare `reasoning: {enabled}` under `config` is
// silently dropped).
const judge = config.defaultTest.options.provider;
assert.equal(judge.id, 'openai:chat:google/gemini-3.8-flash');
assert.equal(judge.config.temperature, 0);
assert.equal(judge.config.passthrough.reasoning.enabled, true);

// Every case has to be gradeable on its own terms.
for (const testCase of cases) {
  const metrics = (testCase.assert || []).map((g) => g.metric);
  assert.ok(metrics.length, `no assertions: ${testCase.description}`);
  assert.equal(new Set(metrics).size, metrics.length, `duplicate metric: ${testCase.description}`);
}

// The whole point of the expansion: a metric riding on one or three cases moves
// by more than any delta it can report.
for (const [metric, floor] of [['control_quality', 5], ['finds_the_decision', 4]]) {
  const n = cases.filter((c) => c.assert.some((g) => g.metric === metric)).length;
  assert.ok(n >= floor, `${metric} rides on only ${n} cases`);
}

// One metric name, one grader value (module + exported function). framing_quality
// used to cover both the seven authored RFDs and the single review of someone
// else's draft - two questions over two populations averaged into one n=8 cell
// under one reliability band.
const gradersFor = (metric) => new Set(cases.flatMap((c) => c.assert)
  .filter((g) => g.metric === metric).map((g) => g.value));
for (const metric of new Set(cases.flatMap((c) => c.assert).map((g) => g.metric))) {
  assert.equal(gradersFor(metric).size, 1, `${metric} carries more than one grader`);
}
const exploratory = cases.filter((c) => c.assert.some((g) => g.metric === 'framing_quality'));
assert.ok(exploratory.every((c) => !/^review/.test(c.description)),
  'framing_quality grades an authored RFD; a review case needs review_framing');

// no_invented_specifics rides on every case judged against the colleague's
// note - the seven exploratory documents and the six reviews - and not the
// five negative controls, which are judged on control_quality's own terms.
const judged = cases.filter((c) => !/negative control/.test(c.description));
const grounded = cases.filter((c) => c.assert.some((g) => g.metric === 'no_invented_specifics'));
assert.equal(grounded.length, judged.length,
  `no_invented_specifics rides on ${grounded.length} of the ${judged.length} cases judged against a source`);

// The task template is the only place a permission to push back can live and
// still reach both arms; a skill body carrying it would BE the delta. adr and
// rfc both offer that out and score control_quality positive; rfd offered none
// and scored -0.29, so every control row was graded on an answer its own prompt
// gave the model no way to give.
const armsModule = require('../prompts/arms.js');
const control = cases.find((c) => c.assert.some((g) => g.metric === 'control_quality'));
const userTurn = (arm) => arm({ vars: control.vars }).prompt
  ? arm({ vars: control.vars }).prompt.at(-1).content
  : arm({ vars: control.vars }).at(-1).content;
const noSkillTask = userTurn(armsModule.noSkill);
assert.match(noSkillTask, /if an open-ended write-up is not the right response here, say that instead/i,
  'the task template must let the model decline the exploratory shape, or control_quality grades an answer the prompt forbids');
// Same sentence, same wording, both arms. The skill body is the only difference
// the suite is allowed to measure.
assert.equal(userTurn(armsModule.skillCurrent), noSkillTask,
  'the two arms must receive a byte-identical task; only the system message may differ');

// The judge used to read the artifact as raw material for a missing reply -
// "the output is the proposal email itself, not a reply" - and score a correct
// baseline answer 0 on all three items. The prompt asks for what the author
// would SEND to the people involved, which is often not addressed to the
// colleague at all, so the item text has to say what it is looking at. The
// rubric prose now lives in rfd.cjs's CONTROL_QUALITY_ITEMS, not in cases.yaml.
const rfdSource = require('node:fs').readFileSync(path.join(root, 'assertions/rfd.cjs'), 'utf8');
assert.match(rfdSource, /IS the reply\s+being graded/,
  'control_quality must say that a document addressed to third parties is the answer, not raw material for one');

console.log(`rfd config: ok (${cases.length} cases, ${graders.length} assertions)`);
