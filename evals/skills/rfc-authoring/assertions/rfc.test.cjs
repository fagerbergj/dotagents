// No javascript grader survives in this suite. `staysLightweight` counted words
// and headings on the negative controls - the magic number AGENTS.md warns
// about, and a 0-or-1 verdict bolted onto a graded scale. Its job is now one of
// five enumerated points inside `control_quality`, worth the same fixed
// fraction as the rest.
//
// What is worth testing offline is the config itself: an earlier pass elsewhere
// left four assertions with no metric, still executing, while `validate config`
// reported the configuration valid.
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

assert.ok(graders.length >= 20, `only ${graders.length} assertions survived`);

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

// The whole point of the control expansion: a metric riding on two cases moves
// by more than any delta it can report.
const controls = cases.filter((c) => c.assert.some((g) => g.metric === 'control_quality'));
assert.ok(controls.length >= 5, `control_quality rides on only ${controls.length} cases`);

console.log(`rfc config: ok (${cases.length} cases, ${graders.length} assertions)`);
