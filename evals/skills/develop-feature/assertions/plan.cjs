const fs = require('node:fs');
const path = require('node:path');
const { dir: repoDir } = require('../lib/repo.js');

// Claim: "reuse or extend before you add" is checkable against the repo the
// plan is written for - a plan that names the exact existing mechanism a case
// was picked because it already covers most of the ask is doing the reuse
// step; one that never names it, however well-argued otherwise, did not do
// the lookup this skill exists to force. `existingIdentifier` is a real
// symbol/package/file confirmed present in the pinned tree (see tests/cases.yaml
// comments for how each was found), not a synonym list - so this checks
// whether the plan actually looked, not whether it used approved words.
function namesExistingSolution(output, context) {
  const id = context?.vars?.existingIdentifier;
  if (!id) return { pass: true, score: 1, reason: 'No existingIdentifier on this case: nothing to check.' };
  const found = String(output).includes(id);
  return found
    ? { pass: true, score: 1, reason: `Plan names the existing mechanism: "${id}".` }
    : { pass: false, score: 0, reason: `Plan never names "${id}", the existing mechanism this case was picked around.` };
}

// Claim: a citation of the form path:line is a claim about code that already
// exists - you cite a specific line only for something with content to point
// at, never for a file the plan proposes creating. That asymmetry is what
// makes this checkable without having to parse "extend X" from "create X" in
// prose: a bare path mention ("add pkg/cmd/release/list/web.go") is never
// flagged, only a path:line citation that does not resolve in the pinned tree.
// Same shape as review-code's noInventedCitations (assertions/review.cjs),
// resolved against a full checkout instead of a diff's touched files, since a
// plan has no diff to restrict citations to.
//
// Sits at ceiling (sd 0.000) in both arms on every run so far - the
// AGENTS.md "dead metric" red flag, but this one earns keeping the check
// rather than cutting it: it is a deterministic, near-zero-cost structural
// check (a tree lookup, no judge call, no added latency to speak of), not a
// subjective metric burning a row for no signal. review-code's identically-
// shaped grader has caught real fabricated path:line citations before -
// exactly the failure mode an LLM asked to cite evidence is prone to under
// pressure to sound grounded - so ceiling here reads as "no plan has invented
// one yet on THIS suite's cases," not "this can't fail." A rubric item can be
// gamed by a fluent judge; a line count either exists in the tree or it
// doesn't. Cut it if it is ever the reason a run costs materially more, not
// because it hasn't fired yet.
const CITATION = /\b([\w./-]+\.[A-Za-z]{1,5}):(\d+)\b/g;

function lineCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
  } catch {
    return null;
  }
}

function noInventedCitations(output) {
  // repoDir() throws if the tree was never materialised. That must propagate,
  // not become a pass: a fabricated 1.00 here is indistinguishable from "no
  // invented citations" when the truth is "nothing was checked at all". Let
  // promptfoo record an error row instead - see lib/repo.js's dir() comment.
  const dir = repoDir();
  const bad = [];
  let checked = 0;
  for (const [, cited, num] of String(output).matchAll(CITATION)) {
    let file = null;
    if (fs.existsSync(path.join(dir, cited))) {
      file = cited; // repo-relative, real
    } else if (cited.includes('/')) {
      // Looks repo-relative and is not in the tree: invented outright.
      bad.push(`${cited}:${num} (no such file)`);
      checked += 1;
      continue;
    } else {
      continue; // a bare name matching nothing - prose, not a citation
    }
    checked += 1;
    const n = lineCount(path.join(dir, file));
    if (n === null) {
      bad.push(`${cited}:${num} (not in the tree)`);
      continue;
    }
    if (Number(num) > n) bad.push(`${cited}:${num} (file has ${n} lines)`);
  }
  if (!bad.length) {
    return {
      pass: true,
      score: 1,
      reason: checked ? `All ${checked} citation(s) resolve to a real line in the tree.` : 'No path:line citation to resolve.',
    };
  }
  return { pass: false, score: 0, reason: `Citations that do not exist: ${[...new Set(bad)].slice(0, 4).join(', ')}.` };
}

module.exports = { namesExistingSolution, noInventedCitations, lineCount };
