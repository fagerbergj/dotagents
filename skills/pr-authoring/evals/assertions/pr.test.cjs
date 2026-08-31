const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checks = require('./pr.cjs');

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

// Tripwires on the two judged rubrics, which no unit test can otherwise reach:
// one criterion, one property, and no two criteria scoring one behaviour with
// opposite signs. A text scan rather than a parse - the suite ships no YAML
// parser and this is not worth a dependency; it fails if either fix is reverted.
const cases = fs.readFileSync(path.join(__dirname, '..', 'tests', 'cases.yaml'), 'utf8');
// `coverage` must not read length: `proportionality` owns it, against a stated
// per-case ceiling rather than the author's own word count.
assert.equal(/SHORTER, COMPARABLE, or LONGER|\* 0\.85/.test(cases), false, 'coverage is scoring length again');
// Both judges must see the author's description, or the points `coverage` pays
// for are unsupported inventions to `restraint`.
assert.equal((cases.match(/{{author_description}}/g) || []).length, 2, 'restraint cannot see what coverage rewards');
// Only `proportionality` carries a word ceiling.
assert.equal((cases.match(/maxWords/g) || []).length, 10, 'a word ceiling moved off proportionality');

const vars = {
  diff: 'diff --git a/internal/dag/control.go b/internal/dag/control.go\n-\tif !m.Delivered {\n+\tif m.Status == MsgQueued {\n',
  note: 'making it an enum',
};

const short = 'fix(dag): use a status enum\n\nThe bool meant two things.';
const long = `fix(dag): use a status enum\n\n${'word '.repeat(400)}`;

assert.equal(checks.proportionateLength(short, { config: { maxWords: 50 } }).pass, true);
// Ceiling only - a short answer is never penalised for being short.
assert.equal(checks.proportionateLength(short, { config: { maxWords: 300 } }).pass, true);
assert.equal(checks.proportionateLength(long, { config: { maxWords: 50 } }).pass, false);
// Penalty degrades with the ratio rather than snapping to zero.
assert.ok(checks.proportionateLength(long, { config: { maxWords: 50 } }).score < 0.2);
assert.throws(() => checks.proportionateLength(short, { config: {} }));

const honest = 'fix(dag): use a status enum\n\nSwaps `m.Delivered` for `m.Status` in `internal/dag/control.go`. Verified with go test ./...';
const invented = 'fix(dag): use a status enum\n\nAlso updates `internal/dag/scheduler.go` and the `retryBackoff` helper.';
assert.equal(checks.noFabricatedIdentifiers(honest, { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers(invented, { vars, config: {} }).pass, false);
// An allowlisted name the author legitimately knew is not a fabrication.
assert.equal(checks.noFabricatedIdentifiers(invented, { vars, config: { allow: ['internal/dag/scheduler.go', 'retryBackoff'] } }).pass, true);

// A backticked PascalCase type the diff never mentions is a fabrication...
assert.equal(checks.noFabricatedIdentifiers('t\n\nAdds `MsgDrained`.', { vars, config: {} }).pass, false);
assert.equal(checks.noFabricatedIdentifiers('t\n\nAdds `MsgQueued`.', { vars, config: {} }).pass, true);
// ...but ordinary prose and toolchain commands are not.
assert.equal(checks.noFabricatedIdentifiers('t\n\nRan `go test ./...` on GitHub Actions; verified in Docker.', { vars, config: {} }).pass, true);

// Empty parens are prose convention, not a different symbol.
assert.equal(checks.noFabricatedIdentifiers('t\n\nReworks `MsgQueued()` handling.', { vars, config: {} }).pass, true);
// A link out is not a claim about this repository.
assert.equal(checks.noFabricatedIdentifiers('t\n\nChangelog: https://github.com/highlightjs/highlight.js/blob/main/CHANGES.md', { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers('t\n\nSee [CHANGES.md](https://github.com/highlightjs/highlight.js/blob/main/CHANGES.md).', { vars, config: {} }).pass, true);
// An unbackticked hallucinated function is still a fabrication.
assert.equal(checks.noFabricatedIdentifiers('t\n\nThe handleRollback path now short-circuits.', { vars, config: {} }).pass, false);
// package.json is not exempt when the diff never touches it.
assert.equal(checks.noFabricatedIdentifiers('t\n\nAlso bumps package.json.', { vars, config: {} }).pass, false);

// Prose with a slash is prose. Both of these were live false positives.
assert.equal(checks.noFabricatedIdentifiers('t\n\nThe remove/delete path is unchanged.', { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers('t\n\nSame for values read/written by the store.', { vars, config: {} }).pass, true);
// A real path still is one - the extension keeps it a candidate.
assert.equal(checks.noFabricatedIdentifiers('t\n\nTouches internal/dag/scheduler.go too.', { vars, config: {} }).pass, false);
// ...and so does an underscore in a segment with no extension.
assert.equal(checks.noFabricatedIdentifiers('t\n\nSee cmd/pi_acp/runner for the rest.', { vars, config: {} }).pass, false);

// Prose does not stop being prose for carrying a capital or a hyphen. Each of
// these was a live zero on the stored run.
assert.equal(checks.noFabricatedIdentifiers('t\n\nBinds up/down/page/clear/to-bottom.', { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers('t\n\nSwitches between `Normal/Locked` and `PageScrollUp/Down`.', { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers('t\n\nA rule like `/haystack` misses `/absolute/path/to/haystack`.', { vars, config: {} }).pass, true);
assert.equal(checks.noFabricatedIdentifiers('t\n\nAbsolute paths like `/Users/user/project/foo`.', { vars, config: {} }).pass, true);
// The exemption is bounded: an extension, a digit, or an underscore anywhere in
// the span still makes it a path claim.
assert.equal(checks.noFabricatedIdentifiers('t\n\nSee `internal/dag/state_machine`.', { vars, config: {} }).pass, false);
assert.equal(checks.noFabricatedIdentifiers('t\n\nSee `docs/v2/setup.md`.', { vars, config: {} }).pass, false);

// A file that exists in the tree both arms could read is not invented. Needs the
// fixture cache; run.sh materialises it before every eval.
const treeCase = { vars: { ...vars, fixture: 'caddy-7872' }, config: {} };
if (checks.fixtureTree('caddy-7872')) {
  assert.equal(checks.noFabricatedIdentifiers('t\n\nTests in `celmatcher_test.go` stay green.', treeCase).pass, true);
  // Still only the tree's paths, not its contents: a symbol it never names fails.
  assert.equal(checks.noFabricatedIdentifiers('t\n\nAdds `AttachToClientWithPaneId`.', treeCase).pass, false);
} else {
  console.log('pr assertions: tree haystack unchecked - run lib/fetch-fixtures.js');
}

console.log('pr assertions: ok');
