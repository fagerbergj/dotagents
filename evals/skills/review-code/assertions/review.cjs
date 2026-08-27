// Which lines the reviewer could actually have seen: every path in the diff,
// with the line numbers its hunks cover on the new side.
function diffLines(diff) {
  const seen = new Map();
  let file = null;
  for (const line of String(diff).split(/\r?\n/)) {
    const plus = line.match(/^\+\+\+ b\/(.+)$/);
    if (plus) { file = plus[1].trim(); if (!seen.has(file)) seen.set(file, new Set()); continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let i = start; i < start + count; i++) seen.get(file).add(i);
    }
  }
  return seen;
}

// Claim: findings are cited by `path:line` so the author can jump to them. A
// citation naming a line the diff does not contain sends the reader nowhere,
// and is the review equivalent of the invented identifier pr-authoring measures.
// Needs code: it cross-references the output against the input.
const CITATION = /\b([\w./-]+\.[A-Za-z]{1,5}):(\d+)\b/g;

const { load, specs } = require('../../../lib/fixtures.js');
const path = require('node:path');
const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));

function noInventedCitations(output, context) {
  // The case names a fixture; the diff is whatever git produced for that PR, so
  // there is no second copy of it to drift out of step with the prompt.
  const spec = BY_NAME.get(context?.vars?.fixture);
  const diff = spec ? load(spec).diff : (context?.vars?.diff || '');
  const seen = diffLines(diff);
  const bad = [];
  for (const [, file, num] of String(output).matchAll(CITATION)) {
    const lines = seen.get(file);
    if (!lines) { bad.push(`${file}:${num} (no such file in the diff)`); continue; }
    if (!lines.has(Number(num))) bad.push(`${file}:${num} (outside the diff's hunks)`);
  }
  if (!bad.length) {
    return { pass: true, score: 1, reason: seen.size
      ? 'Every path:line cited appears in the diff.'
      : 'No diff supplied and nothing cited.' };
  }
  return { pass: false, score: 0, reason: `Citations not in the diff: ${[...new Set(bad)].slice(0, 4).join(', ')}.` };
}

module.exports = { noInventedCitations, diffLines };
