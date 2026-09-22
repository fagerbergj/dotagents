const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

// dotagents#64/#65: `coverage` and `restraint` moved off llm-rubric's own
// arithmetic (list points, count, divide) onto quote-verified items - the same
// fix skills/review-code/assertions/review.cjs made for its four judged
// metrics. The judge still reasons in prose, but per item it must quote
// <Output> or say NONE and say whether that item holds; judgeQuotedItems
// verifies the quote is real before scoring, and WEIGHTS below - not the
// judge - compute the number.
const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying another tag\'s content'
  + ' back, paraphrasing, or summarising is not a quote and will be rejected'
  + ' before your "holds" verdict is even read. Keep each quote to one'
  + ' sentence or line, at most 300 characters, never a code block - long'
  + ' quotes break the JSON and lose the item. Respond with exactly one JSON'
  + ' object: {"items": [...]}, one entry per numbered item, nothing else.';

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.6, 2: 0.4, ...}. Only a verified quote whose "holds" is true
// earns its item's weight - a real quote the judge itself says does not
// satisfy the item earns nothing, same as an unquoted one.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// tags: [[tagName, varsKey], ...] - the ground-truth block each metric needs,
// rendered before <Output> in the order given. Every metric here quotes
// <Output> alone (texts.default), never the ground truth - the point is
// whether OUTPUT is grounded in it, not whether the ground truth exists.
function askItems(output, context, itemsPrompt, tags) {
  const vars = (context && context.vars) || {};
  const ctxBlock = tags.map(([tag, key]) => `<${tag}>${vars[key] ?? ''}</${tag}>`).join('\n');
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${ctxBlock}\n<Output>${output}</Output>\n\n${itemsPrompt}` },
  ];
  return { providerCfg: judgeProvider(context), messages };
}

// Was the old `coverage` llm-rubric's list-P/mark-C/divide arithmetic - the
// exact shape dotagents#64 documents flipping pass/fail on an unchanged arm
// about half the time. Two items stand in for "cover every point": the gist,
// and the specific detail behind it, rather than enumerating a per-case point
// count the judge would still have to invent arithmetic over.
const COVERAGE_ITEMS = `<AuthorDescription> is this pull request's own
author's real description, withheld from whoever wrote <Output> - the one
record of WHY the change was made that exists nowhere in the diff, since only
the author had it. Google's eng-practices guide on CL descriptions asks
exactly this of a description: "Why are these changes being made? What
contexts did you have as an author when making this change?"
(https://google.github.io/eng-practices/review/developer/cl-descriptions.html).

<AuthorDescription> is evidence of what a competent author thought worth
saying about THIS change, not a template to imitate. Do not reward <Output>
for matching its tone, structure, length, or wording, and do not penalise it
for saying something true that <AuthorDescription> happened to omit. Length is
not scored here - that is a separate check against a stated word ceiling.

1. Does <Output> convey the primary substance of <AuthorDescription> - the
   main reason this change was made or the main thing it does?
2. Does <Output> also convey the specific detail behind that point - what
   exactly changed, what it affects, or a decision/caveat <AuthorDescription>
   notes - rather than only a vaguer restatement of item 1?`;

function coverage(output, context) {
  const { providerCfg, messages } = askItems(output, context, COVERAGE_ITEMS, [['AuthorDescription', 'author_description']]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 0.5,
  });
}

// Was the old `restraint` llm-rubric's list-claims/mark-NEITHER/fixed-cost
// arithmetic. Splits the claim into two failure modes the source material
// treats as distinct: an invented cause or rationale, and an invented
// measurement. Kernel submitting-patches: "If you claim improvements in
// performance, memory consumption, stack footprint, or binary size, include
// numbers that back them up."
// (https://www.kernel.org/doc/html/latest/process/submitting-patches.html)
const RESTRAINT_ITEMS = `The developer's own note is in <AuthorNote>, the
change itself is in <Diff>, and the description this change's real author
wrote is in <AuthorDescription>. Judge <Output> as delivered: do not reward or
penalise how it was built. A checkable fact is one a reader could confirm or
refute against the code or the world - what the change does, what it affects,
a named file/symbol/flag, or a measurement. Framing, restatement, and a
reading of the diff the diff itself bears out are not claims. The
issue-reference slot in a title line ("(closes #<n>)", "Fixes #NNN") is a
template slot, not an assertion, and does not count against either item.

1. Does <Output> avoid asserting, as a fact about this change, any effect,
   cause, scope, or rationale that none of <Diff>, <AuthorNote>, or
   <AuthorDescription> supports? An invented risk or design rationale this
   change does not have, or a file/symbol absent from all three, fails this
   item; a claim any one of the three backs holds it.
2. Does <Output> avoid stating a specific measurement, benchmark number, test
   command, or test result as though it were run or observed, when none of
   <Diff>, <AuthorNote>, or <AuthorDescription> show it was?`;

function restraint(output, context) {
  const { providerCfg, messages } = askItems(output, context, RESTRAINT_ITEMS, [
    ['AuthorNote', 'note'], ['Diff', 'diff'], ['AuthorDescription', 'author_description'],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 0.5,
  });
}

module.exports = { coverage, restraint, judgeProvider, weighByItem, askItems, JSON_CONTRACT };
