// Offline checks on the deterministic graders, backed by the materialised
// fixtures. Run `node lib/fetch-bugfix-fixtures.js .` first; skips cleanly if
// that hasn't happened yet (same convention as review-code's assertion test).
const assert = require('node:assert');
const path = require('node:path');
const { noInventedFileRefs, findsTheFix } = require('./fixbug.cjs');
const { specs } = require('../lib/bugfix-fixtures.js');

// Same resolution fixbug.cjs uses: independent of the cwd the test is run from.
const CONTROLS = specs(path.resolve(__dirname, '..')).filter((f) => f.verdict === 'not-a-bug');

const ctx = (fixture, issueBody = '') => ({ vars: { fixture, issueBody } });

try {
  // findsTheFix - bug fixtures
  assert.equal(findsTheFix('Edit src/flask/app.py to use urlsplit.', ctx('flask-6096')).score, 1 / 3, 'one of three signals (2 files + 1 function) hits');
  assert.equal(findsTheFix('The fix belongs in session_transaction inside src/flask/app.py and src/flask/testing.py.', ctx('flask-6096')).score, 1, 'both files and the function all hit');
  assert.equal(findsTheFix('Nothing wrong here, ship it.', ctx('flask-6096')).pass, false, 'naming no real file fails');
  assert.equal(findsTheFix('The bug is in looseEqual, packages/shared/src/looseEqual.ts.', ctx('vue-15328')).score, 1, 'vue: file + function both cited');
  assert.equal(findsTheFix('getCompletions in completions.go mutates the args slice.', ctx('cobra-2356')).score, 1, 'cobra: file + function both cited');
  assert.equal(findsTheFix('findRoute in tree.go should dedupe.', ctx('chi-1029')).score, 1, 'chi: file + function both cited');

  // The threshold, pinned: pass means a file the fix changed was named. A
  // function name alone is partial credit on the score and not a pass - the
  // same symbol is reachable from more than one file.
  const funcOnly = findsTheFix('The bug is in findRoute - it should dedupe methods.', ctx('chi-1029'));
  assert.equal(funcOnly.pass, false, 'a function hit with no file hit does not pass');
  assert.equal(funcOnly.score, 0.5, 'a function hit with no file hit still scores its half');

  // findsTheFix - the "not a bug" controls: no diff proposed passes,
  // a proposed diff against the source fails even if well-formed.
  //
  // Run over EVERY control, not just requests-7006, and asserting score 1
  // rather than pass. echo-3052 shipped with a `fix` SHA (its PR touches only
  // group_test.go) and empty sourceFiles, which sent it down the recall branch
  // where the correct "no source change" answer scored 0 - in both arms, so the
  // row was dead weight that penalised the right answer. A control is shaped
  // `fix: null` or it is not a control; this pins that.
  assert.ok(CONTROLS.length, 'the suite has at least one not-a-bug control');
  for (const f of CONTROLS) {
    assert.equal(f.fix, null, `${f.name}: a not-a-bug control must carry "fix": null - a fix SHA with empty sourceFiles routes it to the recall branch, where it scores 0 forever`);
    const declined = findsTheFix('No change needed here - this is intended behaviour, not a defect in this codebase.', ctx(f.name));
    assert.equal(declined.score, 1, `${f.name}: the correct "no source change" answer must score 1, got ${declined.score} (${declined.reason})`);
    const phantom = findsTheFix('```diff\n--- a/router.go\n+++ b/router.go\n@@ -1,2 +1,2 @@\n-old\n+new\n```', ctx(f.name));
    assert.equal(phantom.pass, false, `${f.name}: a diff block against a non-bug fails`);
  }

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
  const declined = findsTheFix('Add a regression test in tests/test_app.py; no source change needed yet.', ctx('flask-6096'));
  assert.equal(declined.pass, false, 'test_app.py must not be credited as citing app.py');
  assert.equal(declined.score, 0, 'declining with only a same-stem test file scores 0');
  // Go's _test.go and Vue's .spec.ts must not collide with their subjects either.
  assert.equal(findsTheFix('See completions_test.go for coverage.', ctx('cobra-2356')).pass, false, 'completions_test.go must not be credited as citing completions.go');
  assert.equal(findsTheFix('See looseEqual.spec.ts for coverage.', ctx('vue-15328')).pass, false, 'looseEqual.spec.ts must not be credited as citing looseEqual.ts');
  // A real citation using the bare basename still has to work.
  assert.equal(findsTheFix('The bug is in completions.go.', ctx('cobra-2356')).pass, true, 'a genuine bare-basename citation still hits');

  // Regression: the cut precision term. Naming the file a regression test
  // belongs in, on top of the real fix, is the fix-bug skill doing its job -
  // it must not cost anything. Under recall x precision this exact answer
  // scored 2/4 = 0.5 on two stored flask-6096 rows that had named both real
  // files. Pinned as the equality it is, not as ">= 1" which recall satisfies
  // trivially.
  const bothFiles = 'The fix is in src/flask/app.py and src/flask/testing.py, in session_transaction.';
  const clean = findsTheFix(bothFiles, ctx('flask-6096'));
  const withTests = findsTheFix(`${bothFiles} Regression tests go in tests/test_testing.py and tests/test_basic.py.`, ctx('flask-6096'));
  assert.equal(clean.score, 1, 'naming both real files and the function is full recall');
  assert.equal(withTests.score, clean.score, `naming the test files too must not dock the score (${withTests.score} vs ${clean.score})`);
  // Same for real files read on the way in: context is not a defect.
  const withContext = findsTheFix(`${bothFiles} Reached it from src/flask/cli.py and src/flask/ctx.py.`, ctx('flask-6096'));
  assert.equal(withContext.score, clean.score, 'naming real files read as context must not dock the score');
  // Partial recall still ranks below full, and naming nothing real still fails.
  const partial = findsTheFix('Edit src/flask/app.py to use urlsplit.', ctx('flask-6096'));
  assert.ok(partial.score < clean.score, `one of three signals (${partial.score}) must rank below all three (${clean.score})`);
  assert.equal(findsTheFix('Nothing wrong here, ship it.', ctx('flask-6096')).score, 0, 'naming no real file or function scores 0');

  // Regression: empty/whitespace output must not score a control pass (defect #4).
  assert.deepEqual(findsTheFix('', ctx('requests-7006')), { pass: false, score: 0, reason: 'Empty or whitespace-only output - nothing to grade.' }, 'empty output fails findsTheFix even on the not-a-bug control');
  assert.deepEqual(noInventedFileRefs('', ctx('requests-7006')), { pass: false, score: 0, reason: 'Empty or whitespace-only output - nothing to grade.' }, 'empty output fails noInventedFileRefs even on the not-a-bug control');
  assert.equal(findsTheFix('   \n\t  ', ctx('requests-7006')).pass, false, 'whitespace-only output is treated as empty');
  assert.equal(noInventedFileRefs('   \n\t  ', ctx('flask-6096')).pass, false, 'whitespace-only output is treated as empty on a bug fixture too');
} catch (err) {
  if (/not materialised/.test(err.message)) {
    console.log('ok   fixbug assertions (skipped - fixtures not fetched; run lib/fetch-bugfix-fixtures.js .)');
    process.exit(0);
  }
  throw err;
}
console.log('ok   fixbug assertions (resolved against the materialised fixtures)');
