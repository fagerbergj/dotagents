#!/usr/bin/env node
// Fail-closed diff-line Oxlint ratchet: checks only lines touched since <baseRef>.
'use strict';

const { execFileSync } = require('node:child_process');

const GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs'];
const OXLINT_PKG = 'oxlint@1.95.0';

function parseDiffLines(diffText) {
  const byFile = new Map();
  let current = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      const file = line.slice('+++ b/'.length);
      current = byFile.get(file) || new Set();
      byFile.set(file, current);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !current) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let i = 0; i < count; i++) current.add(start + i);
  }
  return byFile;
}

function runOxlintJson(files) {
  let stdout = '';
  try {
    stdout = execFileSync(
      'npx',
      ['--yes', OXLINT_PKG, '--config', '.oxlintrc.json', '--format', 'json', ...files],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (err) {
    const out = err && err.stdout ? String(err.stdout) : '';
    if (out.trim().startsWith('{')) stdout = out;
    else throw err;
  }
  const parsed = JSON.parse(stdout);
  return parsed.diagnostics || [];
}

function main(baseRef) {
  execFileSync('git', ['rev-parse', '--verify', '-q', baseRef], { stdio: 'ignore' });
  const diffText = execFileSync(
    'git',
    ['diff', '-U0', '--diff-filter=ACMR', `${baseRef}...HEAD`, '--', ...GLOBS],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const touched = parseDiffLines(diffText);
  const files = [...touched.entries()].filter(([, s]) => s.size > 0).map(([f]) => f);
  console.log(`linting ${files.length} JS/TS file(s) against ${baseRef}`);
  if (files.length === 0) return 0;

  const hits = runOxlintJson(files).filter((d) => {
    const lines = touched.get(String(d.filename || '').replace(/^\.\//, ''));
    const line = d.labels && d.labels[0] && d.labels[0].span && d.labels[0].span.line;
    return Boolean(lines && line !== undefined && lines.has(line));
  });
  for (const d of hits) {
    const span = d.labels && d.labels[0] && d.labels[0].span;
    const pos = span && span.line ? `:${span.line}:${span.column || 1}` : '';
    console.error(`${d.filename}${pos}: ${d.severity} [${d.code}] ${d.message}`);
  }
  return hits.length > 0 ? 1 : 0;
}

const base = process.argv[2];
if (!base) {
  console.error('usage: oxlint-diff.js <base-ref>');
  process.exit(2);
}
process.exit(main(base));
