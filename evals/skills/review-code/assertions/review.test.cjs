// Offline check on the citation grader. Fixtures are not touched: a synthetic
// diff is enough to prove the cross-reference, and the test must run without
// network before a single token is bought.
const assert = require('node:assert');
const { diffLines, noInventedCitations } = require('./review.cjs');

const diff = [
  'diff --git a/internal/dag/planner.go b/internal/dag/planner.go',
  '--- a/internal/dag/planner.go',
  '+++ b/internal/dag/planner.go',
  '@@ -430,6 +430,9 @@ func hint() {',
  ' ctx',
  '+added',
  '@@ -10,2 +12,2 @@',
  ' two',
].join('\n');

const seen = diffLines(diff);
assert.deepEqual([...seen.keys()], ['internal/dag/planner.go']);
assert.ok(seen.get('internal/dag/planner.go').has(433), 'a line inside a hunk is citable');
assert.ok(!seen.get('internal/dag/planner.go').has(500), 'a line outside every hunk is not');

const ctx = { vars: { diff } };
assert.equal(noInventedCitations('See internal/dag/planner.go:433 for the gate.', ctx).score, 1);
assert.equal(noInventedCitations('No citations at all here.', ctx).score, 1, 'citing nothing invents nothing');

const wrongLine = noInventedCitations('Problem at internal/dag/planner.go:900.', ctx);
assert.equal(wrongLine.score, 0);
assert.match(wrongLine.reason, /outside the diff/);

const wrongFile = noInventedCitations('Problem at internal/dag/nope.go:12.', ctx);
assert.equal(wrongFile.score, 0);
assert.match(wrongFile.reason, /no such file/);

// A review that never cites anything must not be rewarded over one that cites
// correctly, so this grader is a floor on honesty, not a proxy for thoroughness.
console.log('ok   review assertions (citation cross-reference against the diff)');
