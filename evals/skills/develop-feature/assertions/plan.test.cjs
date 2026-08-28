// Offline checks on the pure parts, plus a tree-backed pass over citation
// resolution.
//
// review-code's fetch step (evals/lib/fetch-fixtures.js) is wired into
// run.sh and materialises its PR fixtures before this kind of self-test even
// runs. This suite has no tests/fixtures.json, so run.sh's fetch step no-ops
// for it and nothing else calls lib/fetch-repo.js - `grep -rn fetch-repo
// evals/` finds only the comment naming it. Without a hook into run.sh (out
// of scope for this suite to edit), the only place left to guarantee the
// tree exists before `npx promptfoo eval` runs is here: materialise it on
// first run instead of silently skipping the checks that need it. The
// tradeoff is that this one suite's "free" self-test does a real network
// fetch on a cold cache; every other suite's does not.
const assert = require('node:assert');
const { namesExistingSolution, noInventedCitations, lineCount } = require('./plan.cjs');
const { materialise } = require('../lib/repo.js');

// namesExistingSolution needs no fixture: it is a substring check on output
// against context.vars, so this is fully offline.
assert.deepEqual(
  namesExistingSolution('use the cenkalti/backoff package already in go.mod', { vars: { existingIdentifier: 'cenkalti/backoff' } }),
  { pass: true, score: 1, reason: 'Plan names the existing mechanism: "cenkalti/backoff".' },
);
assert.equal(namesExistingSolution('add a manual retry loop with time.Sleep', { vars: { existingIdentifier: 'cenkalti/backoff' } }).score, 0);
assert.equal(namesExistingSolution('anything', { vars: {} }).score, 1, 'no existingIdentifier on the case means nothing to check');

assert.equal(lineCount('/nonexistent/file.go'), null, 'a missing file reports null, never 0');

// Citation resolution needs the materialised tree. checks.go is 311 lines at
// the pinned commit.
function runTreeChecks() {
  const score = (t) => noInventedCitations(t).score;
  assert.equal(score('see pkg/cmd/pr/checks/checks.go:226 for the fixed sleep'), 1, 'a real line in the pinned tree is a real citation');
  assert.equal(score('see pkg/cmd/pr/checks/checks.go:99999 for the fixed sleep'), 0, 'a line past the end of the file is invented');
  assert.equal(score('see pkg/cmd/pr/checks/ghost.go:5 for the fixed sleep'), 0, 'a repo-relative path not in the tree is invented');
  assert.equal(score('config.yaml:3'), 1, 'a bare name matching nothing is prose, not a citation');
  assert.equal(score('add a new file pkg/cmd/release/list/web.go to handle this'), 1, 'a bare path mention with no line number is never flagged - it may be a proposed new file');
  assert.equal(score('no citations at all'), 1, 'citing nothing invents nothing');
}

try {
  runTreeChecks();
} catch (err) {
  if (!/not materialised/.test(err.message)) throw err;
  console.log('repo fixture not materialised - fetching cli/cli once (same as `node lib/fetch-repo.js`)...');
  materialise((m) => console.log(m)); // network; throws loudly if it fails, same as noInventedCitations now does
  runTreeChecks();
}
console.log('ok   plan assertions (citations resolved against the pinned tree)');
