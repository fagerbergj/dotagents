// Claim: "reuse or extend before you add" is checkable against the repo the
// plan is written for - a plan that names the exact existing mechanism a case
// was picked because it already covers most of the ask is doing the reuse
// step; one that never names it, however well-argued otherwise, did not do
// the lookup this skill exists to force. `existingIdentifier` is a real
// symbol/package/file confirmed present in the pinned tree (see tests/cases.yaml
// comments for how each was found), not a synonym list - so this checks
// whether the plan actually looked, not whether it used approved words.
//
// Flat across two full runs (0.73/0.79, then 0.70/0.70), so it is not a
// comparison axis - it is kept because it is the ground truth for the
// plan_quality rubric's item 1, which asks for the same literal identifier and
// carries half that metric's weight. On the second run the judge awarded item 1
// on ~12% of positive rows with the identifier appearing ZERO times in the
// output, once writing its own justification as "the literal name appears in
// <ExistingMechanism>" - it was quoting the prompt variable back as if it were
// the plan. This check is what made that visible; the rubric now says in words
// that <ExistingMechanism> is not part of <Output>, and this is how we will
// know whether that stuck. Deterministic, no judge call, no added latency.
//
// A sibling `noInventedCitations` lived here and was cut. As written it matched
// only `path.ext:NN` and reported "No path:line citation to resolve" on 66 of
// 66 rows while those rows made 289 file references in bare-path form - it
// inspected none of them, so its 1.00/1.00 was a blind oracle, not a ceiling.
// Widened to bare paths (fix-bug's noInventedFileRefs shape) it did fire, but
// 6 of its 9 flags were files the plan proposed to CREATE in a real package -
// `pkg/cmdutil/csv_exporter.go`, `internal/clipboard/clipboard.go` - which made
// it a penalty on the specificity a good plan has. fix-bug's version works
// because a bug theory's paths are all claims about existing code; a feature
// plan's are mostly proposals, and nothing deterministic separates "I read X"
// from "I would add X" without prose-matching, which evals/AGENTS.md forbids.
function namesExistingSolution(output, context) {
  const id = context?.vars?.existingIdentifier;
  if (!id) return { pass: true, score: 1, reason: 'No existingIdentifier on this case: nothing to check.' };
  const found = String(output).includes(id);
  return found
    ? { pass: true, score: 1, reason: `Plan names the existing mechanism: "${id}".` }
    : { pass: false, score: 0, reason: `Plan never names "${id}", the existing mechanism this case was picked around.` };
}

module.exports = { namesExistingSolution };
