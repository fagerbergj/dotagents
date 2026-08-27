// Offline checks on the citation grader's pure parts, plus a fixture-backed
// pass over the resolution rules. Runs before any tokens are bought.
const assert = require('node:assert');
const { diffLines, noInventedCitations, lineCount } = require('./review.cjs');

const diff = [
  'diff --git a/internal/dag/planner.go b/internal/dag/planner.go',
  '--- a/internal/dag/planner.go',
  '+++ b/internal/dag/planner.go',
  '@@ -430,6 +430,9 @@ func hint() {',
  ' ctx',
  '+added',
].join('\n');
const seen = diffLines(diff);
assert.deepEqual([...seen.keys()], ['internal/dag/planner.go']);
assert.ok(seen.get('internal/dag/planner.go').has(433));
assert.equal(lineCount('/nonexistent/file.go'), null, 'a missing file reports null, never 0');

// Resolution against the tree, not the hunks. An earlier version scored a
// citation outside the changed range as invented, which marked the skill arm
// down for opening the surrounding file - the behaviour the skill exists to
// produce. These pin the distinction that replaced it.
const ctx = { vars: { fixture: 'caddy-7916' } };
const score = (t) => noInventedCitations(t, ctx).score;

try {
  assert.equal(score('see modules/caddyhttp/reverseproxy/healthchecks.go:40'), 1, 'a real line outside every hunk is a real citation');
  assert.equal(score('see healthchecks.go:40'), 1, 'reviews cite bare basenames too');
  assert.equal(score('see modules/caddyhttp/reverseproxy/healthchecks.go:999999'), 0, 'a line past the end of the file is invented');
  assert.equal(score('see modules/caddyhttp/reverseproxy/ghost.go:5'), 0, 'a repo-relative path not in the tree is invented');
  assert.equal(score('config.yaml:3'), 1, 'a bare name matching nothing is prose, not a citation');
  assert.equal(score('no citations at all'), 1, 'citing nothing invents nothing');
} catch (err) {
  if (/not materialised/.test(err.message)) {
    console.log('ok   review assertions (pure parts; fixture checks skipped - not fetched)');
    process.exit(0);
  }
  throw err;
}
console.log('ok   review assertions (citations resolved against the tree)');
