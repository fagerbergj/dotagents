// Offline checks on the citation grader's pure parts, plus a fixture-backed
// pass over the resolution rules. Runs before any tokens are bought.
const assert = require('node:assert');
const { diffLines, noInventedCitations, lineCount, citedCode, judgeProvider, weighByItem, askItems } = require('./review.cjs');

// --- the four quote-verified metrics' pure parts (no network) --------------
{
  // Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
  // exact object llm-rubric already used - no second copy of it in this file.
  const ctx = { test: { options: { provider: { id: 'openai:chat:deepseek/deepseek-v4-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'deepseek/deepseek-v4-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(w([{ n: 1, holds: true }, { n: 1, holds: true }, { n: 1, holds: false }]), 0, 'one item per finding: the question fails if any finding fails');
  assert.equal(w([{ n: 2, holds: true }, { n: 2, holds: true }]), 0.4, 'repeated items earn the weight once, never more than 1 in total');

  const built = askItems('the review text', { vars: { expected: 'maintainer said X', verdict: 'CHANGES_REQUESTED' } }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the review text'), '<Output> carries the real review');
  assert.ok(built.messages[1].content.includes('maintainer said X'), '<MaintainerReview> carries the case var');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');
}

// A latency assertion stays UNNAMED. Named, it becomes a graded column beside
// the quality metrics - and a row slow enough to trip it is a row the
// completion cap truncated, which those metrics already fine. fix-bug paid that
// double charge on 22 of 120 rows; see its promptfooconfig.yaml. The guard
// itself stays: it costs no call, and report.js prints the timing regardless.
// PyYAML rather than a regex - the config is structured and carries anchors.
const yamlLoadCfg = (f) => JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  require('node:path').join(__dirname, '..', f)], { encoding: 'utf8' }));
for (const a of [...(yamlLoadCfg('promptfooconfig.yaml').defaultTest.assert || []),
  ...yamlLoadCfg('tests/cases.yaml').flatMap((c) => c.assert || [])]) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

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

  // --- citedCode: the deterministic half of `no_false_claims` -----------------
  // The judge is only as good as what it is shown, so these pin what it is shown.
  // healthchecks.go:40 in the caddy-7916 tree is the HealthChecks doc comment.
  const cc = (t) => citedCode(t, ctx);
  const TRUTH = '// HealthChecks configures active and passive health checks.';

  const cited = cc('The guard at modules/caddyhttp/reverseproxy/healthchecks.go:40 is wrong.');
  assert.ok(cited.startsWith('The guard at'), 'the review itself is kept, not replaced');
  assert.match(cited, /CODE FROM THE REPOSITORY/, 'the appendix is labelled as the grader\'s');
  assert.ok(cited.includes(TRUTH), 'the appended passage is the real line 40, read from the tree');
  assert.match(cited, />>\s+40 \|/, 'the cited line is the one marked');
  assert.match(cited, /^\s+37 \| /m, 'surrounding context is shown');

  // TEETH. A review that asserts something false about a real line passes
  // `no_invented_citations` clean - the pointer resolves. This is the whole
  // reason `no_false_claims` exists, so the code that refutes it must reach the
  // judge. Revert citedCode to the identity transform, or let it echo the
  // review's own words back instead of reading the file, and this line fails.
  const lie = cc('modules/caddyhttp/reverseproxy/healthchecks.go:40 declares `var healthy int`, which shadows the package-level counter.');
  assert.ok(lie.includes(TRUTH), 'the code that refutes a false claim is what gets appended');
  assert.ok(!lie.includes('shadows the package-level counter\n     37'), 'the appendix is code, not the claim restated');
  assert.match(lie, /the review says: .*shadows the package-level counter/, 'the claim is carried beside the code that settles it');

  // Symbol anchors. Without these the metric would only ever grade the arm that
  // writes `path:line`: 0 of 48 baseline rows in the last run cited one.
  const sym = cc('I think `fillHost` resets the key it was given.');
  assert.match(sym, /hosts\.go:\d+ /, '`fillHost` resolves to the file that declares it');
  assert.match(sym, /func \(u \*Upstream\) fillHost\(\)/, 'the declaration itself is served');
  assert.ok(!/_test\.go:/.test(cc('The `Upstream` type carries the key.')), 'a symbol anchors to the implementation, not to a test helper that mentions it');

  // Nothing to show is not something to invent.
  assert.match(cc('see modules/caddyhttp/reverseproxy/healthchecks.go:999999'), /NO-ANCHORS/, 'a line past the end of the file yields no passage');
  assert.match(cc('see modules/caddyhttp/reverseproxy/ghost.go:5'), /NO-ANCHORS/, 'an invented path yields no passage');
  // A real file that really sits outside the tree, reached by a citation the
  // regex really matches. `../pr-7916.patch:1` does NOT work as a probe: the
  // leading `..` falls outside `\b`, so the pattern captures a bare basename and
  // never reaches the guard. This one leaks the whole patch file if the guard
  // goes, which is the thing worth pinning.
  assert.match(cc('see a/../../pr-7916.patch:1'), /NO-ANCHORS/, 'a citation cannot read outside the tree');
  assert.match(cc('Looks good to me, ship it.'), /NO-ANCHORS/, 'a review that names no code says so explicitly');
  // A truncated row must not read as a review that asserted nothing false.
  assert.match(cc(''), /NO-REVIEW/, 'an empty output is a dead row, not a clean review');
  assert.ok(!/NO-ANCHORS/.test(cc('   \n  ')), 'whitespace-only output is dead too, not merely unanchored');

  // Cost and reproducibility: the appendix is capped, and the same review twice
  // produces the same bytes - a judged metric over a moving input is not a
  // measurement.
  const many = cc(Array.from({ length: 30 }, (_, i) => `line ${i}: \`fillHost\` \`hostKey\` \`Upstream\` \`provisionUpstream\` \`HealthChecks\` \`Provision\` \`hostKeySuffix\` \`Cleanup\` \`String\` \`Dial\``).join('\n'));
  assert.ok((many.match(/^\[\d+\] /gm) || []).length <= 8, 'at most eight passages are appended');
  assert.equal(cc('`fillHost` and healthchecks.go:40'), cc('`fillHost` and healthchecks.go:40'), 'extraction is deterministic');
  // Citations before symbols: the review's own explicit pointer leads.
  assert.match(cc('`fillHost` and modules/caddyhttp/reverseproxy/healthchecks.go:40'), /\[1\] modules\/caddyhttp\/reverseproxy\/healthchecks\.go:40[\s\S]*\[2\] modules\/caddyhttp\/reverseproxy\/hosts\.go/, 'citations are anchored before symbols');
} catch (err) {
  if (/not materialised/.test(err.message)) {
    console.log('ok   review assertions (pure parts; fixture checks skipped - not fetched)');
    process.exit(0);
  }
  throw err;
}
console.log('ok   review assertions (citations resolved against the tree; cited code read from it)');
