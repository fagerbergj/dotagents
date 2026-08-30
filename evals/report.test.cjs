#!/usr/bin/env node
// report.js must refuse a result set that is not a measurement. It once printed a
// clean empty table and exited 0 for a run that died before its first API call,
// which reads as "no differences found". Drives the real CLI: the exit code and
// the CAUTION line on stderr are the contract eval-publish.yml's gate depends on.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
const row = (arm, i, scores = { quality: 1 }) => ({
  prompt: { label: arm },
  testIdx: i,
  testCase: { description: `case ${i}` },
  vars: { case: i },
  latencyMs: 1000,
  tokenUsage: { total: 100, cached: 0 },
  namedScores: scores,
  gradingResult: { componentResults: [{ pass: true, assertion: { type: 'llm-rubric', metric: 'quality' } }] },
});
const write = (name, rows, stats) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify({ results: { results: rows, stats: stats ?? { tokenUsage: { numRequests: rows.length } } } }));
  return p;
};
const build = (counts, rowFn = row) =>
  Object.entries(counts).flatMap(([arm, n]) => Array.from({ length: n }, (_, i) => rowFn(arm, i)));

const run = (file) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'report.js'), file], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

// Fails: nothing to report, and nothing printed that could be read as a result.
for (const [name, file] of [
  ['empty', write('empty.json', [], { tokenUsage: { numRequests: 0 } })],
  ['one arm empty', write('one-arm.json', build({ 'no-skill': 8 }))],
  // 12 vs 20 is 40% skew - well past the 5% where the missing rows alone could
  // account for a delta at the smallest reliability floor.
  ['badly uneven', write('uneven-bad.json', build({ 'no-skill': 20, 'skill-current': 12 }))],
]) {
  const r = run(file);
  assert.strictEqual(r.code, 1, `${name}: expected exit 1, got ${r.code}`);
  assert.match(r.err, /CAUTION: /, `${name}: gate greps stderr for "CAUTION: "`);
  assert.doesNotMatch(r.out, /cases, run/, `${name}: must not print a table`);
}

// Warns: the report still prints, loudly caveated, and the exit stays 0 so a
// legitimate run with one lost row does not start failing.
for (const [name, file] of [
  ['58 vs 59', write('uneven-ok.json', build({ 'no-skill': 59, 'skill-current': 58 }))],
  ['zero usage', write('no-tokens.json',
    build({ 'no-skill': 8, 'skill-current': 8 }).map((r) => ({ ...r, tokenUsage: { total: 0, cached: 0 } })),
    { tokenUsage: { numRequests: 0 } })],
]) {
  const r = run(file);
  assert.strictEqual(r.code, 0, `${name}: expected exit 0, got ${r.code}`);
  assert.match(r.err, /CAUTION: /, `${name}: expected a CAUTION on stderr`);
  assert.match(r.out, /cases, run 2 ways/, `${name}: expected the table`);
}

// Healthy: no banner at all, or the gate would drop every good run.
const ok = run(write('healthy.json', build({ 'no-skill': 8, 'skill-current': 8 })));
assert.strictEqual(ok.code, 0);
assert.strictEqual(ok.err, '', `healthy run printed to stderr: ${ok.err}`);

// Process columns appear only when a provider records them, and a capped row is
// counted rather than averaged away. Cost is the largest measured effect of a
// context file, so it has to be visible; an existing suite must gain no empty row.
{
  const plain = run(write('no-meta.json', build({ 'no-skill': 8, 'skill-current': 8 })));
  assert.doesNotMatch(plain.out, /commands \(avg\)/, 'a provider recording nothing must not gain an empty row');

  const withMeta = build({ 'no-skill': 8, 'skill-current': 8 }).map((r, i) => ({
    ...r,
    metadata: {
      bashRounds: 5,
      outputBytes: 2048,
      commands: [{ cmd: 'ls' }, { cmd: 'make test' }],
      ...(i === 0 ? { capHit: 'rounds' } : {}),
    },
  }));
  const m = run(write('meta.json', withMeta));
  assert.strictEqual(m.code, 0);
  assert.match(m.out, /commands \(avg\) *2\.0/, 'commands per row must reach the report');
  assert.match(m.out, /tool rounds \(avg\) *5\.0/, 'steps must reach the report');
  assert.match(m.out, /output bytes \(avg\) *2048\.0/);
  assert.match(m.out, /rows at a cap/, 'a censored row must be counted, not silently averaged');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('report.js degenerate-result checks pass');
