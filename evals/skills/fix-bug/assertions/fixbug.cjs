const { load, specs } = require('../lib/bugfix-fixtures.js');
const fs = require('node:fs');
const path = require('node:path');
const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));

// Any string that looks like a repo-relative path with an extension -
// "src/flask/app.py", "packages/shared/src/looseEqual.ts". Requires a slash
// so ordinary prose ("fix the run() method") doesn't get treated as a
// citation - that's what the function-name check below is for instead.
const PATHLIKE = /\b((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z]{1,6})\b/g;

// A bare filename with no directory - "app.py", "tree.go". The character
// class already includes the dot, so a greedy match swallows a whole
// underscore-joined token like "test_app.py" in one go rather than stopping
// at "app.py" - `\b` only fires where \w meets non-\w, and "_" is \w, so
// there is no boundary between "test_" and "app.py" to split on.
const FILENAME = /\b[\w.-]+\.[A-Za-z]{1,6}\b/g;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole path/filename tokens mentioned in prose, matched as complete tokens -
// never substring containment, which is what let "test_app.py" satisfy a
// check meant for "app.py" purely because one string's characters contain
// the other's.
function fileTokens(text) {
  const toks = new Set();
  for (const [t] of text.matchAll(PATHLIKE)) toks.add(t);
  for (const [t] of text.matchAll(FILENAME)) toks.add(t);
  return toks;
}

// True when some whole token in `text` names `sf` - either the exact
// repo-relative path, or a basename match (bare filename, or a differently
// -rooted path ending in the same basename). Never a substring check.
function citesFile(tokens, sf) {
  const base = path.basename(sf);
  for (const tok of tokens) {
    if (tok === sf || tok === base || path.basename(tok) === base) return true;
  }
  return false;
}

// Distinct tokens in `text` that resolve to a real file inside the fixture's
// tree - the model's actual file citations, as opposed to noise (a version
// string, a URL fragment) that happens to look filename-shaped. Used as the
// denominator for precision: how much of what got named was real.
function citedRealFiles(text, dir) {
  const real = new Set();
  for (const tok of fileTokens(text)) {
    if (fs.existsSync(path.join(dir, tok))) real.add(tok);
  }
  return real;
}

// A truncated stub and a correctly-argued decline both compute out to
// "invented nothing" / "proposed no diff" against the graders below - so an
// empty (or whitespace-only) answer has to be rejected before either grader
// runs, or the not-a-bug control can't tell them apart. Not a length
// threshold standing in for quality (see evals/AGENTS.md on magic numbers) -
// a bright line on literal absence of content, nothing more.
function hasSubstance(output) {
  return String(output).trim().length > 0;
}
const NO_SUBSTANCE = { pass: false, score: 0, reason: 'Empty or whitespace-only output - nothing to grade.' };

// Claim: a theory grounded in the real code cites real files. A path that
// does not exist in the tree the model was actually given is either
// fabricated from training-data memory of a *different* version of the
// project, or copied from elsewhere in the prompt (a traceback frame through
// a dependency, e.g.) rather than the repo under investigation - the latter
// is legitimate, so anything that appears verbatim in the issue text the
// model was given is exempted rather than flagged.
function noInventedFileRefs(output, context) {
  if (!hasSubstance(output)) return NO_SUBSTANCE;
  const spec = BY_NAME.get(context?.vars?.fixture);
  if (!spec) return { pass: true, score: 1, reason: 'No fixture: nothing to resolve file references against.' };
  const { dir } = load(spec);
  const issueBody = String(context?.vars?.issueBody || '');
  const bad = [];
  let checked = 0;
  for (const [, p] of String(output).matchAll(PATHLIKE)) {
    checked += 1;
    if (fs.existsSync(path.join(dir, p))) continue;
    if (issueBody.includes(p)) continue; // quoted from the report, not claimed as this repo's code
    bad.push(p);
  }
  if (!bad.length) {
    return {
      pass: true,
      score: 1,
      reason: checked ? `All ${checked} file reference(s) resolve to the tree or the report.` : 'No file path cited.',
    };
  }
  return { pass: false, score: 0, reason: `References to files not in the tree and not in the report: ${[...new Set(bad)].slice(0, 4).join(', ')}.` };
}

// Claim: did the proposed fix land where the real fix landed? Computed
// against the withheld diff, never against wording in the model's output -
// see the shared fixtures.js sibling for the same principle applied to a
// review's citations. For the "not a bug" control there is no real fix to
// match against; the question inverts to whether the model invented one.
function touchesRealFix(output, context) {
  if (!hasSubstance(output)) return NO_SUBSTANCE;
  const spec = BY_NAME.get(context?.vars?.fixture);
  if (!spec) return { pass: true, score: 1, reason: 'No fixture: nothing to resolve against.' };
  const f = load(spec);
  const text = String(output);

  if (!f.fix) {
    // A fenced diff/patch block, or raw unified-diff hunk markers, proposing
    // an edit. Detecting the syntax, not the prose around it.
    const proposesEdit = /```(?:diff|patch)\b[\s\S]*?```/i.test(text) || /^--- [ab]\//m.test(text) || /^@@ -\d+/m.test(text);
    if (!proposesEdit) {
      return { pass: true, score: 1, reason: 'No diff/patch proposed against the source - correctly treated as not a defect in this codebase.' };
    }
    return { pass: false, score: 0, reason: 'Output includes a diff/patch changing the source tree for a report that has no real fix.' };
  }

  const tokens = fileTokens(text);
  const fileHits = f.sourceFiles.filter((sf) => citesFile(tokens, sf));
  const funcHits = (f.functions || []).filter((fn) => new RegExp(`\\b${escapeRegExp(fn)}\\b`).test(text));
  const total = f.sourceFiles.length + (f.functions || []).length;
  const hits = fileHits.length + funcHits.length;
  const recall = total ? hits / total : fileHits.length ? 1 : 0;
  const pass = fileHits.length > 0;

  // Precision: naming ten real files to catch the one real fix is not the
  // same as naming just the one - of the real, in-tree files actually named,
  // how many were the fix. Only meaningful once at least one is; with no
  // file hit, precision has nothing to divide (pass is already false, and
  // recall alone - which may still carry function credit - is the score).
  const namedFiles = pass ? citedRealFiles(text, f.dir) : null;
  const precision = pass ? fileHits.length / namedFiles.size : 1;
  const score = recall * precision;

  const reason = pass
    ? `Named ${fileHits.length}/${f.sourceFiles.length} real file(s)${funcHits.length ? ` and ${funcHits.length}/${(f.functions || []).length} real function(s)` : ''}; ${fileHits.length}/${namedFiles.size} of the real files named were actually the fix.`
    : `Did not name any of the real fix's file(s): ${f.sourceFiles.join(', ')}.`;
  return { pass, score, reason };
}

module.exports = { noInventedFileRefs, touchesRealFix, PATHLIKE, FILENAME, fileTokens, citesFile, citedRealFiles, hasSubstance };
