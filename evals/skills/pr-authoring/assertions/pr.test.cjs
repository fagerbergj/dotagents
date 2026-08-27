const assert = require('node:assert/strict');
const checks = require('./pr.cjs');

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
// ...and so does a dash or an underscore in a segment with no extension.
assert.equal(checks.noFabricatedIdentifiers('t\n\nSee cmd/pi-acp/runner for the rest.', { vars, config: {} }).pass, false);

console.log('pr assertions: ok');
