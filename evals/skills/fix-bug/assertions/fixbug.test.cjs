// Offline checks on the deterministic graders, backed by the materialised
// fixtures. Run `node lib/fetch-bugfix-fixtures.js .` first; skips cleanly if
// that hasn't happened yet (same convention as review-code's assertion test).
const assert = require('node:assert');
const { noInventedFileRefs, touchesRealFix } = require('./fixbug.cjs');

const ctx = (fixture, issueBody = '') => ({ vars: { fixture, issueBody } });

try {
  // touchesRealFix - bug fixtures
  assert.equal(touchesRealFix('Edit src/flask/app.py to use urlsplit.', ctx('flask-6096')).score, 1 / 3, 'one of three signals (2 files + 1 function) hits');
  assert.equal(touchesRealFix('The fix belongs in session_transaction inside src/flask/app.py and src/flask/testing.py.', ctx('flask-6096')).score, 1, 'both files and the function all hit');
  assert.equal(touchesRealFix('Nothing wrong here, ship it.', ctx('flask-6096')).pass, false, 'naming no real file fails');
  assert.equal(touchesRealFix('The bug is in looseEqual, packages/shared/src/looseEqual.ts.', ctx('vue-15328')).score, 1, 'vue: file + function both cited');
  assert.equal(touchesRealFix('getCompletions in completions.go mutates the args slice.', ctx('cobra-2356')).score, 1, 'cobra: file + function both cited');
  assert.equal(touchesRealFix('findRoute in tree.go should dedupe.', ctx('chi-1029')).score, 1, 'chi: file + function both cited');

  // touchesRealFix - the "not a bug" control: no diff proposed passes,
  // a proposed diff against the source fails even if well-formed.
  assert.equal(touchesRealFix('This traces to a local http.py shadowing the stdlib module. No change needed in requests.', ctx('requests-7006')).pass, true, 'no phantom fix: pass');
  const phantom = touchesRealFix('```diff\n--- a/src/requests/models.py\n+++ b/src/requests/models.py\n@@ -1,2 +1,2 @@\n-old\n+new\n```', ctx('requests-7006'));
  assert.equal(phantom.pass, false, 'a diff block against a non-bug fails');

  // noInventedFileRefs
  assert.equal(noInventedFileRefs('See src/flask/app.py for the fix.', ctx('flask-6096')).score, 1, 'real path in the tree passes');
  assert.equal(noInventedFileRefs('See src/flask/nonexistent_module.py for the fix.', ctx('flask-6096')).pass, false, 'a fabricated path fails');
  const withReportPath = noInventedFileRefs(
    'The traceback goes through urllib3/exceptions.py, but that is a dependency, not requests itself.',
    ctx('requests-7006', 'File "/usr/lib/python3.13/site-packages/urllib3/exceptions.py", line 7'),
  );
  assert.equal(withReportPath.pass, true, 'a path quoted back from the report is not a fabrication');
  assert.equal(noInventedFileRefs('No file paths mentioned at all.', ctx('flask-6096')).score, 1, 'citing nothing invents nothing');

  // Regression: basename substring collision (defect #2). Python's
  // test_<module>.py convention makes the test filename CONTAIN the source
  // basename - "test_app.py".includes("app.py") - so a declined fix must not
  // get credit for naming a source file it explicitly did not touch.
  const declined = touchesRealFix('Add a regression test in tests/test_app.py; no source change needed yet.', ctx('flask-6096'));
  assert.equal(declined.pass, false, 'test_app.py must not be credited as citing app.py');
  assert.equal(declined.score, 0, 'declining with only a same-stem test file scores 0');
  // Go's _test.go and Vue's .spec.ts must not collide with their subjects either.
  assert.equal(touchesRealFix('See completions_test.go for coverage.', ctx('cobra-2356')).pass, false, 'completions_test.go must not be credited as citing completions.go');
  assert.equal(touchesRealFix('See looseEqual.spec.ts for coverage.', ctx('vue-15328')).pass, false, 'looseEqual.spec.ts must not be credited as citing looseEqual.ts');
  // A real citation using the bare basename still has to work.
  assert.equal(touchesRealFix('The bug is in completions.go.', ctx('cobra-2356')).pass, true, 'a genuine bare-basename citation still hits');

  // Regression: precision component (defect #3). Naming ten real files with
  // the right one buried inside must score below naming the right one alone,
  // and both must still beat a precise-but-wrong answer (0).
  const precise = touchesRealFix('Edit src/flask/app.py to use urlsplit.', ctx('flask-6096'));
  const manyFiles = 'src/flask/app.py, src/flask/cli.py, src/flask/ctx.py, src/flask/helpers.py, src/flask/json/__init__.py, src/flask/logging.py, src/flask/sessions.py, src/flask/signals.py, src/flask/templating.py, src/flask/wrappers.py';
  const scattergun = touchesRealFix(`Could be in any of: ${manyFiles}`, ctx('flask-6096'));
  const preciseWrong = touchesRealFix('Nothing wrong here, ship it.', ctx('flask-6096'));
  assert.ok(scattergun.pass, 'scattergun still names the real file, so it still passes');
  assert.ok(scattergun.score < precise.score, `scattergun (${scattergun.score}) must score below a precise single citation (${precise.score})`);
  assert.ok(scattergun.score > preciseWrong.score, `scattergun (${scattergun.score}) must still beat naming no real file (${preciseWrong.score})`);

  // Regression: empty/whitespace output must not score a control pass (defect #4).
  assert.deepEqual(touchesRealFix('', ctx('requests-7006')), { pass: false, score: 0, reason: 'Empty or whitespace-only output - nothing to grade.' }, 'empty output fails touchesRealFix even on the not-a-bug control');
  assert.deepEqual(noInventedFileRefs('', ctx('requests-7006')), { pass: false, score: 0, reason: 'Empty or whitespace-only output - nothing to grade.' }, 'empty output fails noInventedFileRefs even on the not-a-bug control');
  assert.equal(touchesRealFix('   \n\t  ', ctx('requests-7006')).pass, false, 'whitespace-only output is treated as empty');
  assert.equal(noInventedFileRefs('   \n\t  ', ctx('flask-6096')).pass, false, 'whitespace-only output is treated as empty on a bug fixture too');
} catch (err) {
  if (/not materialised/.test(err.message)) {
    console.log('ok   fixbug assertions (skipped - fixtures not fetched; run lib/fetch-bugfix-fixtures.js .)');
    process.exit(0);
  }
  throw err;
}
console.log('ok   fixbug assertions (resolved against the materialised fixtures)');
