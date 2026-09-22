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

// --- the judged rubrics ------------------------------------------------
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
assert.equal(carries('fact_transfer'), 9, 'fact_transfer runs on the same nine cases, one per case with its own facts');
assert.equal(carries('restraint'), 5, 'the negative controls carry neither: a reply that correctly adds nothing scores full credit on restraint alone');
assert.equal(carries('doc_placement_floor'), 3, 'the placement floor is unrelated to this conversion and stays on its three original cases (the TS case carries two assertions)');

for (const name of ['not_narration', 'no_false_comments', 'restraint', 'fact_transfer']) {
  const a = rubric(name);
  assert.equal(a.type, 'javascript', `${name} is quote-verified now, not llm-rubric/g-eval`);
  assert.ok(!('value' in a) || !/Score from 0 to 1/.test(String(a.value || '')), `${name} carries no judge-arithmetic prose`);
}

// Every case carrying fact_transfer supplies its own facts var - the items a
// per-case metric, unlike the other three which share fixed JS constants.
for (const c of cases) {
  if ((c.assert || []).some((a) => a.metric === 'fact_transfer')) {
    assert.ok(c.vars && typeof c.vars.facts === 'string' && /^\s*1\./.test(c.vars.facts.trim()), `${c.description} is missing a numbered facts var`);
    assert.equal((c.vars.facts.match(/^\s*\d+\./gm) || []).length, 4, `${c.description} must carry exactly four fact items, one per 0.25 weight`);
  }
}

// --- the quote-verified metrics' pure parts (no network) -------------------
{
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = checks.judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(checks.judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = checks.weighByItem({ 1: 0.6, 2: 0.4 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.6, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');

  const built = checks.askItems('the output text', { vars: {} }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the output text'), '<Output> carries the real reply');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');
  const withExtra = checks.askItems('out', { vars: {} }, 'ITEMS', '<Request>ask me</Request>\n');
  assert.ok(withExtra.messages[1].content.startsWith('<Request>ask me</Request>'), 'extraXml precedes <Output>');
}

console.log('comment assertions: ok');
