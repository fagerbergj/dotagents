// No javascript grader survives in this suite: every check that is left is a
// rubric, because nothing here computes against machine-readable input. What is
// worth testing offline is the config itself - an earlier pass left four
// assertions with no metric, still executing, while `validate config` said the
// configuration was valid.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

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

const graders = [
  ...(config.defaultTest.assert || []),
  ...cases.flatMap((testCase) => testCase.assert || []),
];

assert.ok(graders.length >= 12, `only ${graders.length} assertions survived`);

for (const grader of graders) {
  assert.ok(grader && typeof grader === 'object', `assertion is not a mapping: ${JSON.stringify(grader)}`);
  assert.ok(grader.type, `assertion with no type: ${JSON.stringify(grader)}`);
  assert.ok(grader.metric, `assertion with no metric: ${JSON.stringify(grader).slice(0, 120)}`);
  assert.notEqual(grader.type, 'g-eval', 'g-eval drops pretty-printed verdicts; use llm-rubric');

  if (grader.type === 'llm-rubric') {
    assert.equal(typeof grader.value, 'string', `rubric value is not a string: ${grader.metric}`);
    assert.match(grader.value, /score from 0 to 1, never above 1/i,
      `${grader.metric} does not bound the judge's score`);
    assert.ok(grader.threshold > 0 && grader.threshold <= 1, `${grader.metric} threshold out of range`);
  }
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
  for (const grader of testCase.assert) {
    if (grader.type !== 'llm-rubric') continue;
    for (const [, name] of grader.value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      assert.ok(name in testCase.vars, `${testCase.description}: rubric reads undefined var {{${name}}}`);
    }
  }
}

// The whole point of the expansion: a metric riding on one or three cases moves
// by more than any delta it can report.
for (const [metric, floor] of [['control_quality', 5], ['finds_the_decision', 5]]) {
  const n = cases.filter((c) => c.assert.some((g) => g.metric === metric)).length;
  assert.ok(n >= floor, `${metric} rides on only ${n} cases`);
}

// One metric name, one rubric. framing_quality used to cover both the seven
// authored RFDs and the single review of someone else's draft - two questions
// over two populations averaged into one n=8 cell under one reliability band.
const rubricsFor = (metric) => new Set(cases.flatMap((c) => c.assert)
  .filter((g) => g.metric === metric).map((g) => g.value));
for (const metric of new Set(cases.flatMap((c) => c.assert).map((g) => g.metric))) {
  assert.equal(rubricsFor(metric).size, 1, `${metric} carries more than one rubric`);
}
const exploratory = cases.filter((c) => c.assert.some((g) => g.metric === 'framing_quality'));
assert.ok(exploratory.every((c) => !/^review/.test(c.description)),
  'framing_quality grades an authored RFD; a review case needs review_framing');

// One metric, one property. Only no_invented_specifics may subtract, and its
// entire score is that subtraction - every other rubric awards and never fines,
// so a missed criterion and a fabrication can no longer produce the same number.
// Matched on the arithmetic word rather than on what is being penalised: the
// phrasings differ per suite ("each INVENTED cancels one satisfied criterion",
// "subtract 0.2 for each system, number or team the review names") and a pattern
// keyed to "invent" walks straight past the second one.
for (const grader of graders) {
  if (grader.type !== 'llm-rubric' || grader.metric === 'no_invented_specifics') continue;
  assert.doesNotMatch(grader.value, /\b(subtract|subtracts|subtracting|cancel|cancels|cancelling|deduct|deducts)\b/i,
    `${grader.metric} subtracts inside its own score; only no_invented_specifics may, and its whole score is that subtraction`);
}
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
// colleague at all, so the rubric has to say what it is looking at.
const controlRubric = control.assert.find((g) => g.metric === 'control_quality').value;
assert.match(controlRubric, /IS the reply being graded/,
  'control_quality must say that a document addressed to third parties is the answer, not raw material for one');

console.log(`rfd config: ok (${cases.length} cases, ${graders.length} assertions)`);
