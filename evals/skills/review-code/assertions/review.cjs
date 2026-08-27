const { load, specs } = require('../../../lib/fixtures.js');
const fs = require('node:fs');
const path = require('node:path');
const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));

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
// citation to a file or line that does not exist sends the reader nowhere.
//
// Resolved against the proposed TREE, not against the diff's hunks. An earlier version
// checked hunks and scored the skill arm 0.44 against a baseline 1.00 - but a
// reviewer who opens the surrounding file and cites a line outside the changed
// range is doing what this skill is for, and the human reviewer on these very
// PRs did it ("anchored here because GitHub does not allow an inline comment on
// line 630"). That check punished reading the code. Fabrication is a path that
// is not in the tree, or a line past the end of the file.
//
// The tree is the head one. Against the base, three rows failed for citing files
// the PR itself adds - the reviewer was right and the grader was looking at the
// wrong snapshot.
const CITATION = /\b([\w./-]+\.[A-Za-z]{1,5}):(\d+)\b/g;

function lineCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
  } catch {
    return null;
  }
}

function noInventedCitations(output, context) {
  const spec = BY_NAME.get(context?.vars?.fixture);
  if (!spec) return { pass: true, score: 1, reason: 'No fixture: nothing to resolve citations against.' };
  const { dir, diff } = load(spec);
  // Only files this change touches are citable - a review of this PR pointing at
  // an unrelated file is a different failure, and not one this grader claims.
  const touched = new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim()));
  const byBasename = new Map();
  for (const f of touched) byBasename.set(path.basename(f), f);

  const bad = [];
  let checked = 0;
  for (const [, cited, num] of String(output).matchAll(CITATION)) {
    // Reviews cite both "internal/dag/planner.go:433" and bare "planner.go:433".
    let file = null;
    if (fs.existsSync(path.join(dir, cited))) file = cited;          // repo-relative, real
    else if (touched.has(cited)) file = cited;
    else if (byBasename.has(path.basename(cited))) file = byBasename.get(path.basename(cited));
    else if (cited.includes('/')) {
      // Looks repo-relative and is not in the tree: invented outright.
      bad.push(`${cited}:${num} (no such file)`);
      checked += 1;
      continue;
    } else {
      continue;   // a bare name matching nothing - prose, not a citation
    }
    checked += 1;
    const n = lineCount(path.join(dir, file));
    if (n === null) { bad.push(`${cited}:${num} (not in the tree)`); continue; }
    if (Number(num) > n) bad.push(`${cited}:${num} (file has ${n} lines)`);
  }
  if (!bad.length) {
    return { pass: true, score: 1, reason: checked
      ? `All ${checked} citation(s) resolve to a real line in the tree.`
      : 'No citation into a changed file to resolve.' };
  }
  return { pass: false, score: 0, reason: `Citations that do not exist: ${[...new Set(bad)].slice(0, 4).join(', ')}.` };
}

module.exports = { noInventedCitations, diffLines, lineCount };
