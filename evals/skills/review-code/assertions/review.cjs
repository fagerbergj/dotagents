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

// ---------------------------------------------------------------------------
// Claim grounding. `noInventedCitations` above checks the POINTER; this puts the
// code in front of the judge so the CLAIM can be checked. A citation to a real
// line that says something false about that line passes the pointer check clean,
// and that is the largest documented not-useful class in the literature - Rigby
// & Bird, "Convergent Contemporary Software Peer Review Practices" (FSE 2013),
// on Lucent's inspection data: "At Lucent there is a median of 3 true defects
// found per review. An additional 4 defects per review were found to be false
// positives."
//
// A judge that never sees the repository cannot separate a true claim from a
// confident invention - the blind oracle evals/AGENTS.md bans. So this is a
// promptfoo assertion `transform`, not a grader: it appends the real code the
// review talks about, and the rubric grades the pair. Extraction and retrieval
// here are entirely deterministic; only the comparison is judged.
const MAX_ANCHORS = 8;      // ~8 x 7 lines of code is ~1k judge tokens
const CONTEXT = 3;          // lines either side
const CLAIM_CHARS = 300;

// A backticked token that looks like an identifier. Reviews of a Go or JS change
// name the thing they are talking about far more often than they cite a line:
// measured over the 96 stored rows of the last run, `path:line` citations appear
// in 0 of 48 baseline rows against 34 of 48 skill-arm rows, so anchoring on
// citations alone would grade one arm and hand the other a vacuous pass on every
// row. Adding symbol anchors takes coverage to 45/48 and 47/48. That widening is
// what makes this measure claim truth rather than citation habit.
const TICKED = /`([^`\n]{1,60})`/g;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*(?:\(\))?$/;
const DECLARES = /\b(func|type|class|def|const|var|let|function|struct|interface|fn|impl)\b/;

// Model output reaching the filesystem is a trust boundary: `../../../etc/passwd`
// is a citation shape, and a review is model output.
function inTree(dir, rel) {
  const full = path.resolve(dir, rel);
  const root = path.resolve(dir);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

// The review's own words around the anchor: the enclosing non-empty line, which
// in markdown is a whole bullet or paragraph. A sentence splitter over prose
// carrying code fences, abbreviations and version numbers is guesswork, and the
// judge is shown the full review anyway.
function claimAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end < 0) end = text.length;
  const line = text.slice(start, end).trim();
  return line.length > CLAIM_CHARS ? `${line.slice(0, CLAIM_CHARS)}...` : line;
}

// Deterministic order: every resolvable `path:line` citation in the order the
// review makes them, then symbol anchors in the order the review names them,
// truncated to MAX_ANCHORS. Citations first because they are the review's own
// explicit pointer; symbols only fill the slots left over.
function anchors(output, dir, touched) {
  const text = String(output);
  const byBasename = new Map();
  for (const f of touched) if (!byBasename.has(path.basename(f))) byBasename.set(path.basename(f), f);
  const found = [];
  const seen = new Set();
  const add = (a) => {
    const key = `${a.file}:${a.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(a);
  };

  for (const m of text.matchAll(CITATION)) {
    const cited = m[1];
    const file = inTree(dir, cited) ? cited : byBasename.get(path.basename(cited));
    if (!file || !inTree(dir, file)) continue;
    const n = lineCount(path.join(dir, file));
    // Past the end of the file there is no code to show. That citation is
    // `noInventedCitations`'s to fail, and this stays silent on it rather than
    // scoring one fault twice, once deterministically and once by judge.
    if (n === null || Number(m[2]) > n) continue;
    add({ kind: 'citation', cited: `${cited}:${m[2]}`, file, line: Number(m[2]), claim: claimAt(text, m.index) });
  }

  const source = new Map();
  const linesOf = (file) => {
    if (!source.has(file)) {
      const full = inTree(dir, file);
      let body = null;
      try {
        body = full && fs.statSync(full).size < 512 * 1024 ? fs.readFileSync(full, 'utf8').split(/\r?\n/) : null;
      } catch {
        body = null;
      }
      source.set(file, body);
    }
    return source.get(file);
  };

  for (const m of text.matchAll(TICKED)) {
    if (found.length >= MAX_ANCHORS) break;
    const raw = m[1].trim();
    if (!IDENTIFIER.test(raw)) continue;
    const token = raw.replace(/\(\)$/, '');
    if (token.length < 3) continue;
    const word = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (const file of touched) {
      const lines = linesOf(file);
      if (!lines) continue;
      // A claim about a symbol is usually a claim about its declaration; the
      // first mention is the fallback.
      // ponytail: a line-grep, not a parser. It anchors an overloaded or
      // re-declared name to the first touched file that matches. Reach for a
      // real symbol index (ctags, tree-sitter) only if the judge starts
      // reporting UNSETTLED because it was shown the wrong site.
      let i = lines.findIndex((l) => DECLARES.test(l) && word.test(l));
      if (i < 0) i = lines.findIndex((l) => word.test(l));
      if (i < 0) continue;
      add({ kind: 'symbol', cited: '`' + raw + '`', file, line: i + 1, claim: claimAt(text, m.index) });
      break;
    }
  }
  return found.slice(0, MAX_ANCHORS);
}

function render(dir, a) {
  const lines = fs.readFileSync(path.join(dir, a.file), 'utf8').split(/\r?\n/);
  const from = Math.max(1, a.line - CONTEXT);
  const to = Math.min(lines.length, a.line + CONTEXT);
  const body = [];
  for (let n = from; n <= to; n++) body.push(`${n === a.line ? '>>' : '  '} ${String(n).padStart(5)} | ${lines[n - 1]}`);
  return `${a.file}:${a.line}  (the review refers to it as ${a.cited})\n  the review says: ${a.claim}\n${body.join('\n')}`;
}

// promptfoo assertion transform: (output, context) -> the text the rubric grades.
// Runs after defaultTest's stripReasoning, which promptfoo applies to the provider
// response before any assertion sees it.
function citedCode(output, context) {
  const spec = BY_NAME.get(context?.vars?.fixture);
  if (!spec) return output;
  const { dir, diff } = load(spec);
  const touched = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim()).filter((f) => f !== '/dev/null');
  // Test files last. A symbol resolves to the first touched file that declares
  // it, and the diff lists paths alphabetically, so `Upstream` anchored to
  // `active_health_test.go`'s helper rather than to the type itself.
  const isTest = (f) => /(^|[/._-])(test|tests|spec)([/._-]|$)/.test(f.toLowerCase());
  touched.sort((a, b) => Number(isTest(a)) - Number(isTest(b)));
  const found = anchors(output, dir, touched);
  const header = '\n\n===== CODE FROM THE REPOSITORY (appended by the grader, not written by the reviewer) =====\n';
  if (!found.length) {
    return `${output}${header}NO-ANCHORS: this review names no line and no symbol that resolves to code in the files this change touches.\n`;
  }
  const blocks = found.map((a, i) => `[${i + 1}] ${render(dir, a)}`);
  return `${output}${header}${found.length} passage(s), read from the repository at the commit under review.\n\n${blocks.join('\n\n')}\n`;
}

module.exports = { noInventedCitations, diffLines, lineCount, citedCode, anchors };
