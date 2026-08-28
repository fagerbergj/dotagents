// Offline self-test: no network, no promptfoo. `node assertions/comment.test.cjs`.
const assert = require('node:assert/strict');
const checks = require('./comment.cjs');

const fence = (lang, body) => `\`\`\`${lang}\n${body}\n\`\`\``;
const ctx = (code, lang, config) => ({ vars: { code, lang }, config });

// --- code preservation -----------------------------------------------------

const goSource = `package counter

func Tick(c *Counter) int {
	c.hits++
	return c.hits
}`;

const goCommented = `package counter

// Tick runs on the request path and deliberately skips the mutex:
// callers own one Counter per goroutine and merge at the end of a run.
func Tick(c *Counter) int {
	c.hits++
	return c.hits
}`;

assert.equal(checks.codePreserved(fence('go', goCommented), ctx(goSource, 'go')).pass, true);
assert.equal(checks.codePreserved(fence('go', goCommented.replace('c.hits++', 'c.hits += 2')), ctx(goSource, 'go')).pass, false);
assert.equal(checks.codePreserved(fence('go', goCommented.replace('\treturn c.hits\n', '')), ctx(goSource, 'go')).pass, false);
assert.equal(checks.codePreserved('no code block here', ctx(goSource, 'go')).pass, false);
// Reindenting is not a code change.
assert.equal(checks.codePreserved(fence('go', goCommented.replace(/\t/g, '    ')), ctx(goSource, 'go')).pass, true);

// --- scanner regressions ---------------------------------------------------
// Each of these desynced the scanner, and a desynced scanner means codePreserved
// stops seeing part of the file - a silent false pass on the grader whose whole
// job is catching rewrites.

// A Go raw string has no escapes, so a trailing backslash does not escape the
// closing backtick. Previously this swallowed the rest of the file.
const goRaw = 'package main\n\nconst root = `C:\\`\n\nfunc main() { println(root) } // windows only\n';
const goRawScan = checks.scan(goRaw, 'go');
assert.equal(goRawScan.comments.length, 1, 'go raw string swallowed the trailing comment');
assert.equal(goRawScan.comments[0].text.trim(), 'windows only');
assert.ok(goRawScan.code.includes('C:\\'));

// A nested template literal: the inner backticks must not pair with the outer
// ones, or the middle segment reads as code and the // in https:// as a comment.
const tsNested = 'const url = `${base}/v1/${encodeURIComponent(`${a}/${b}`)}?to=https://x.test` // gateway\n';
const tsNestedScan = checks.scan(tsNested, 'ts');
assert.equal(tsNestedScan.comments.length, 1, 'nested template literal desynced the scanner');
assert.equal(tsNestedScan.comments[0].text.trim(), 'gateway');
assert.ok(tsNestedScan.code.includes('https://x.test'), 'template literal body was dropped from the code');

// ...and the rewrite inside that string is caught rather than silently passed.
assert.equal(
  checks.codePreserved(fence('ts', tsNested.replace('x.test', 'evil.test')), ctx(tsNested, 'ts')).pass,
  false,
  'a rewritten template literal must not pass code preservation',
);

// A // inside a plain string literal is not a comment.
const urlScan = checks.scan('const base = "https://example.com/v1" // gateway\n', 'ts');
assert.equal(urlScan.comments.length, 1);
assert.ok(urlScan.code.includes('https://example.com/v1'));

// A regex literal containing slashes is not a comment.
const tsRegex = `export function route(p: string) {
  return /^\\/memory(\\/|$)/.test(p) ? 'memory' : 'chat' // default view
}`;
const tsScan = checks.scan(tsRegex, 'ts');
assert.equal(tsScan.comments.length, 1);
assert.equal(tsScan.comments[0].text.trim(), 'default view');
assert.ok(tsScan.code.includes("'chat'"));

// A Python docstring is a comment; a returned string literal is not.
const py = `def label(status):
    """Human-readable status, for the CLI table only."""
    return "queued" if status == 0 else "running"  # nothing else reads this`;
const pyScan = checks.scan(py, 'python');
assert.equal(pyScan.comments.length, 2);
assert.ok(pyScan.code.includes('"queued"'));

// Consecutive line comments are one comment, not one per line.
assert.equal(checks.scan(goCommented, 'go').comments.length, 1);

// --- fence extraction ------------------------------------------------------
// The answer's own fenced block used to end the extraction: a non-greedy regex
// stops at the first closing fence, so anything after a nested one was dropped
// and codePreserved compared the input against a fragment.

const tsDoc = `/**
 * Retries only idempotent verbs:
 * \`\`\`ts
 * retry(() => fetch(url, { method: 'GET' }))
 * \`\`\`
 */
export function retry(fn: () => Promise<Response>) {
  return fn()
}`;
const tsPlain = `export function retry(fn: () => Promise<Response>) {
  return fn()
}`;
assert.equal(
  checks.codePreserved(fence('ts', tsDoc), ctx(tsPlain, 'ts')).pass,
  true,
  'a fence inside a doc comment truncated the extracted block',
);
// The truncated fragment ends before the function, so the bug read as a rewrite.
assert.equal(checks.scan(checks.firstFence(fence('ts', tsDoc)), 'ts').code.includes('return fn()'), true);

// A four-backtick wrapper around a fenced answer, and an unterminated one.
assert.equal(checks.firstFence('````\n```go\nx := 1\n```\n````').trim(), '```go\nx := 1\n```');
assert.equal(checks.firstFence('```go\nx := 1').trim(), 'x := 1', 'an unterminated fence returned nothing');
assert.equal(checks.firstFence('no fence at all'), '');

console.log('comment assertions: ok');
