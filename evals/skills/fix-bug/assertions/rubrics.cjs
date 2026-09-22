// dotagents#64/#65 pattern applied to fix-bug's three judged metrics (see
// review-code/assertions/review.cjs, the worked example): ask the judge
// narrow per-item questions, require a verbatim quote of <Output> or NONE,
// verify the quote is a real substring before it can earn its item's weight,
// and score from the verified items by a rule this file states - never from
// the judge's own arithmetic. Judge settings (model, temperature, reasoning)
// live once in promptfooconfig.yaml's defaultTest.options.provider, matching
// review-code's settled block per evals/AGENTS.md.
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying another tag back,'
  + ' paraphrasing, or summarising is not a quote and will be rejected before'
  + ' your "holds" verdict is even read. Keep each quote to one sentence or'
  + ' line, at most 300 characters, never a code block - long quotes break the'
  + ' JSON and lose the item. Respond with exactly one JSON object:'
  + ' {"items": [...]}, one entry per numbered item, nothing else.';

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.4, 2: 0.3, ...}. Only a verified quote whose "holds" is true
// earns its item's weight - a real quote the judge itself says does not
// satisfy the item earns nothing, same as an unquoted one.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// fields: [[tag, value], ...] - the ground-truth vars this metric needs
// (BugReport/ActualRootCause/ActualFixScope/Verdict differ per metric).
function askItems(output, context, itemsPrompt, fields) {
  const providerCfg = judgeProvider(context);
  const tags = fields.map(([tag, val]) => `<${tag}>${val}</${tag}>`).join('\n');
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${tags}\n<Output>${output}</Output>\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was the llm-rubric `root_cause_depth` (0.4/0.3/0.3, judge-computed). Item 3
// dropped its "no quote needed" carve-out: every item now asks for a quote,
// the uniform shape verifyItems checks - a conclusion with nothing to quote
// for its own verdict-match is exactly the ungrounded case NONE exists for.
const ROOT_CAUSE_DEPTH_ITEMS = `<Output> is a response to the real bug report
in <BugReport>. <ActualRootCause> is what actually turned out to be true, in
the reporter's or fixer's own words - ground truth for the underlying
mechanism, not for how an answer should read. <Verdict> is "bug" when a real
defect lives in this codebase, or "not-a-bug" when it does not.

If <Output> is empty, whitespace-only, or a truncated stub with no content
addressing the bug report, every item below is NONE.

Root cause analysis exists because investigators keep stopping too early.
Wikipedia's summary of the Five Whys technique names the failure mode
directly: a "tendency for investigators to stop at symptoms rather than
going on to lower-level root causes." Judge whether <Output> made that
mistake.

1. Does <Output> name the actual mechanism in <ActualRootCause> - or, for a
   "not-a-bug" <Verdict>, correctly locate the cause outside this codebase -
   rather than restating the reported symptom? "the value comes out wrong" or
   "add more validation" is a symptom description, not a mechanism.
2. Does <Output> reason about something the bug report itself does not show -
   a call site, a related code path, an existing test, an invariant elsewhere
   in the codebase - rather than only restating what the report already
   said?
3. Does <Output>'s conclusion about whether a code change belongs in this
   codebase match <Verdict>? Quote the sentence that states that conclusion.
   Prescribing a confident code fix for a "not-a-bug" report is exactly as
   wrong as missing a real defect.`;

function rootCauseDepth(output, context) {
  const { providerCfg, messages } = askItems(output, context, ROOT_CAUSE_DEPTH_ITEMS, [
    ['BugReport', context.vars.issueBody],
    ['ActualRootCause', context.vars.rootCause],
    ['Verdict', context.vars.verdict],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.4, 2: 0.3, 3: 0.3 }), threshold: 0.5,
  });
}

// Was the llm-rubric `regression_proof` (0.6/0.4, judge-computed).
const REGRESSION_PROOF_ITEMS = `<Output> is addressed to a colleague who will
act on it, about the real bug report in <BugReport>. <ActualRootCause> is the
true mechanism (or, when <Verdict> is "not-a-bug", why there is none here) -
ground truth, not a style guide.

If <Output> is empty, whitespace-only, or a truncated stub with no content
addressing the bug report, every item below is NONE.

Martin Fowler's "Self-Testing Code" states the standard this is judged
against: "The usual reaction of a team using self-testing code is to first
write a test that exposes the bug, and only then to try to fix it... it's
also essential to ensure that once the bug is fixed it stays fixed." Judge
whether <Output> follows that discipline - proof the theory is right before
or alongside the fix - not whether it uses the word "test" anywhere.

1. For a "bug" <Verdict>: does <Output> describe or include a concrete test
   or reproduction step that would fail against the CURRENT code specifically
   because of the mechanism in <ActualRootCause> - not a generic "add tests"
   aside? For a "not-a-bug" <Verdict>: does it explain what a reader could go
   check to confirm there is nothing to reproduce here?
2. Are that test/reproduction step and the proposed fix (or explanation)
   about the same mechanism - not two disconnected paragraphs that happen to
   sit next to each other?`;

function regressionProof(output, context) {
  const { providerCfg, messages } = askItems(output, context, REGRESSION_PROOF_ITEMS, [
    ['BugReport', context.vars.issueBody],
    ['ActualRootCause', context.vars.rootCause],
    ['Verdict', context.vars.verdict],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 0.5,
  });
}

// Was the llm-rubric `proportionate_fix` (three-valued 0/0.5/1,
// judge-computed). Split into two independent yes/no axes, each its own
// weight of 0.5, so the old middle value ("somewhat over- or under-built")
// falls out of the arithmetic instead of being asked for directly: one axis
// failing lands exactly on the old 0.5, both failing on 0, neither on 1.
const PROPORTIONATE_FIX_ITEMS = `<Output> proposes a fix for a real bug (or,
for a "not-a-bug" <Verdict>, explains why none is needed here).
<ActualFixScope> describes how large the real, accepted change actually was -
ground truth for how much this defect warrants, not for exact wording or
style.

If <Output> is empty, whitespace-only, or a truncated stub with no content
addressing the bug report, every item below is NONE.

Google's engineering practices for code review state the standard: "The CL
makes a minimal change that addresses just one thing... In general it's
better to err on the side of writing CLs that are too small vs. CLs that are
too large." Judge <Output>'s proposed scope against that, given what
<ActualFixScope> shows was actually needed - in both directions.

1. Does <Output>'s proposed scope avoid adding machinery <ActualFixScope>
   did not need - unrelated files, new abstractions, config, or refactoring
   beyond the mechanism itself? Quote the part of <Output> that states or
   implies the shape of the change.
2. Does <Output>'s proposed scope actually address <ActualRootCause> rather
   than falling short of what the mechanism requires?`;

function proportionateFix(output, context) {
  const { providerCfg, messages } = askItems(output, context, PROPORTIONATE_FIX_ITEMS, [
    ['ActualRootCause', context.vars.rootCause],
    ['ActualFixScope', context.vars.fixScope],
    ['Verdict', context.vars.verdict],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.5,
  });
}

module.exports = {
  rootCauseDepth, regressionProof, proportionateFix,
  judgeProvider, weighByItem, askItems,
};
