// Offline self-test: no network, no promptfoo. `node assertions/comment.test.cjs`.
const assert = require('node:assert/strict');
const checks = require('./comment.cjs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// A latency assertion stays UNNAMED. Named, it becomes a graded column beside
// the quality metrics - and a row slow enough to trip it is a row the
// completion cap truncated, which those metrics already fine. fix-bug paid that
// double charge on 22 of 120 rows; see its promptfooconfig.yaml. The guard
// itself stays: it costs no call, and report.js prints the timing regardless.
// PyYAML rather than a regex - the config is structured and carries anchors.
const yamlLoadCfg = (f) => JSON.parse(execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  path.join(__dirname, '..', f)], { encoding: 'utf8' }));
for (const a of [...(yamlLoadCfg('promptfooconfig.yaml').defaultTest.assert || []),
  ...yamlLoadCfg('tests/cases.yaml').flatMap((c) => c.assert || [])]) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

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

// --- the judged rubrics ----------------------------------------------------
// Parsed, not regexed: cases.yaml is a structured file, and PyYAML is already a
// dependency of the python gates next door.
const cases = JSON.parse(
  execFileSync('python3', ['-c', 'import json,sys,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', path.resolve(__dirname, '..', 'tests/cases.yaml')], { encoding: 'utf8' }),
);
const rubric = (name) => {
  const found = cases.flatMap((c) => c.assert || []).filter((a) => a.metric === name);
  assert.ok(found.length, `no case carries ${name}`);
  return found[0];
};
const carries = (name) => cases.filter((c) => (c.assert || []).some((a) => a.metric === name)).length;

// A comment that states the obvious and a comment that is false about the code
// are different defects; one metric cannot report both. The F term is out of
// not_narration's numerator and is its own score.
assert.equal(carries('not_narration'), 9, 'not_narration runs on the nine cases that hide something');
assert.equal(carries('no_false_comments'), 9, 'the accuracy half runs on exactly the same cases - it is one judgement split, not a new population');
assert.equal(carries('restraint'), 5, 'the negative controls carry neither: a reply that correctly adds nothing scores 0 on both, and restraint owns that behaviour');

// Line breaks in a block scalar are not part of the criterion.
const flat = (v) => v.replace(/\s+/g, ' ');
const nn = flat(rubric('not_narration').value);
assert.ok(!/\bFALSE\b/.test(nn), 'not_narration must not classify a comment as FALSE - accuracy is no_false_comments');
assert.ok(!/K - F|\(K-F\)/.test(nn), 'not_narration must not subtract F from its numerator');
assert.ok(/K \/ N/.test(nn), 'not_narration scores the share of added comments that say something');
// Without this, a false-but-substantive comment is rewarded by one metric and
// fined by the other - the same behaviour with two signs.
assert.ok(/at face value/.test(nn), 'not_narration must judge substance at face value and leave truth to the other metric');

const nf = flat(rubric('no_false_comments').value);
assert.ok(/no partial credit/.test(nf), 'one wrong statement about the code is the failure; a fraction would call a file with a lie in it mostly accurate');
assert.equal(rubric('no_false_comments').threshold, 1, 'a binary metric passes only at 1');
assert.ok(/If N is 0, score 0/.test(nf) && /If N is 0, score 0/.test(nn), 'both halves score an empty reply 0, so they never point opposite ways on one');
assert.ok(/worth writing/.test(nf), 'no_false_comments must not re-score whether the comment was worth writing');

console.log('comment assertions: ok');
