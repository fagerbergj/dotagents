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

// ---------------------------------------------------------------------------
// dotagents#64/#65: the three llm-rubric metrics below moved off the judge's
// own arithmetic onto lib/quoted-items.js's quote-verified pattern, following
// review-code/assertions/review.cjs (the worked example evals/AGENTS.md
// points at). Each rubric's numbered criteria became numbered yes/no items;
// the judge must quote <Output> or say NONE per item, code verifies the quote
// is a real substring before the item counts, and WEIGHTS - not the judge -
// compute the score. Same failure this replaces: an unchanged metric scored
// 0.00 then 0.75 across two runs of the old prose-arithmetic prompt.
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <FeatureRequest> or'
  + ' <ExistingMechanism> back, paraphrasing, or summarising is not a quote'
  + ' and will be rejected before your "holds" verdict is even read. Keep each'
  + ' quote to one sentence or line, at most 300 characters, never a code'
  + ' block - long quotes break the JSON and lose the item. Respond with'
  + ' exactly one JSON object: {"items": [...]}, one entry per numbered item,'
  + ' nothing else.';

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.6, 2: 0.4, ...}. Only a verified quote whose "holds" is true
// earns its item's weight.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// Builds the judge's user turn. `includeExisting` mirrors which tags the
// original rubricPrompt interpolated per metric: plan_quality and
// recognizes_existing carried <ExistingMechanism>, tests_as_gate did not.
function askItems(output, context, itemsPrompt, { includeExisting } = {}) {
  const providerCfg = judgeProvider(context);
  const tags = [`<FeatureRequest>${context.vars.request}</FeatureRequest>`];
  if (includeExisting) tags.push(`<ExistingMechanism>${context.vars.existingIdentifier}</ExistingMechanism>`);
  tags.push(`<Output>${output}</Output>`);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${tags.join('\n')}\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was the `plan_quality` llm-rubric (0.5/0.25/0.25), restricted to the eight
// cases where <ExistingMechanism> is the mechanism a good plan builds on.
const PLAN_QUALITY_REUSE_ITEMS = `<Output> is an implementation PLAN, not
code, written against the cli/cli (GitHub CLI) codebase in response to
<FeatureRequest>. <ExistingMechanism> is real, present in that codebase right
now, and confirmed to already cover most of what the request needs.

Do not reward structure, headings or length - only substance.
<FeatureRequest> and <ExistingMechanism> are not part of <Output>: quoting
either of them back is not evidence about the plan, and an item whose only
support is that the identifier appears in <ExistingMechanism> does not hold.

1. The plan is built around <ExistingMechanism> as the mechanism it extends or
   wires into, not named once and then set aside for a separate, parallel
   implementation that duplicates what it already does. Eric S. Raymond, "The
   Cathedral and the Bazaar" (1998, lesson 2): "Good programmers know what to
   write. Great ones know what to rewrite (and reuse)." A plan that lists
   <ExistingMechanism> as one option among others it then argues against does
   not hold this, even though it named it. The quote for this item must
   contain <ExistingMechanism>'s own literal name or import path - describing
   the same general shape of fix in the plan's own words ("add an exponential
   backoff between polls", "back off gradually") without ever writing the
   literal identifier does NOT hold this item, however similar the strategy
   sounds.
2. It identifies at least one concrete edge case or failure mode specific to
   this change - not a generic call for "error handling" or "tests" - and
   states how it should be handled. Joel Spolsky, on functional specs:
   "Somebody has to decide what the policy is going to be for a forgotten
   password. If you don't decide, you can't write the code." A plan that
   leaves the equivalent decision open for this change does not hold this.
3. It scopes the work to what the request needs, without adding speculative
   extra surface - new config, new flags, new layers of abstraction - the
   request never asked for. Martin Fowler on YAGNI: "some capability we
   presume our software needs in the future should not be built now because
   'you aren't gonna need it'."`;

function planQualityReuse(output, context) {
  const { providerCfg, messages } = askItems(output, context, PLAN_QUALITY_REUSE_ITEMS, { includeExisting: true });
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.25, 3: 0.25 }), threshold: 0.5,
  });
}

// Was the `tests_as_gate` llm-rubric (0.6/0.4). "gate on functional tests" is
// a claim the skill's frontmatter description makes; positive cases only.
const TESTS_AS_GATE_ITEMS = `<Output> is an implementation PLAN, not code,
written against the cli/cli (GitHub CLI, Go) codebase in response to
<FeatureRequest>. Judge only how the plan proposes to establish that the
change works.

Do not reward structure, headings or length - only substance.

1. It names the specific tests that would show this change works - what each
   one exercises and what it asserts - rather than a generic line item such as
   "add tests", "update the test suite" or "add unit and integration tests".
   Martin Fowler, "Self Testing Code" (martinfowler.com/bliki/SelfTestingCode.html):
   "No programming episode is complete without working code and the tests to
   keep it working." A list of test names with no statement of what any of
   them checks does not hold this.
2. Those tests are tied to the codebase's own test setup - the existing test
   file they go in, or the existing test they extend or replace - not
   described free-floating. House position: this suite treats a test placed
   in the repo's existing test setup as evidence the plan actually looked at
   that setup, the same claim it makes about source files elsewhere; Fowler
   takes no position on this.`;

function testsAsGate(output, context) {
  const { providerCfg, messages } = askItems(output, context, TESTS_AS_GATE_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 0.5,
  });
}

// Was the `recognizes_existing` llm-rubric (0.5/0.5), on the negative-control
// cases where <ExistingMechanism> already does everything the request asks
// for and the correct plan is "there is nothing to build".
const RECOGNIZES_EXISTING_ITEMS = `<Output> is an implementation PLAN, not
code, written against the cli/cli (GitHub CLI) codebase in response to
<FeatureRequest>. <ExistingMechanism> is real, present in that codebase right
now, and already does everything the request is asking for - the correct
answer here is that little or nothing needs to be built.

1. It says plainly that this already exists and names <ExistingMechanism>, or
   points at the same place in the code, as where. A plan that goes straight
   into design steps without first checking whether the feature is already
   there does not hold this even if it stumbles onto the right file along the
   way. Eric S. Raymond, "The Cathedral and the Bazaar": "Good programmers
   know what to write. Great ones know what to rewrite (and reuse)" - the
   reuse starts with noticing there is nothing to write.
2. It does not propose new code, new abstractions, or a redesign to
   accomplish what <ExistingMechanism> already does. At most a trivial,
   explicitly-scoped next step (a doc note, a one-line follow-up) is
   acceptable. Martin Fowler on YAGNI: "some capability we presume our
   software needs in the future should not be built now because 'you aren't
   gonna need it'" - here it is not even presumed, it is already there.`;

function recognizesExisting(output, context) {
  const { providerCfg, messages } = askItems(output, context, RECOGNIZES_EXISTING_ITEMS, { includeExisting: true });
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.5,
  });
}

module.exports = {
  namesExistingSolution, planQualityReuse, testsAsGate, recognizesExisting,
  judgeProvider, weighByItem, askItems,
};
