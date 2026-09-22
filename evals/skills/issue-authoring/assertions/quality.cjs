// dotagents#64/#65 pattern (see skills/review-code/assertions/review.cjs): ask
// the judge narrow per-item yes/no questions, require a verbatim quote or NONE,
// verify the quote is really a substring of <Output> before it counts, and score
// from the verified items by a rule THIS file supplies - never from the judge's
// own arithmetic. The old llm-rubric prompts here asked the judge to both find
// the answer and compute a 0-to-1 score with subtractions in one completion,
// exactly the failure that produced dotagents#64 (one unchanged metric scored
// 0.00 then 0.75 across two runs on review-code).
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <Report> back,'
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

// weights: {"1": 0.6, "2": 0.4, ...}. Only a verified quote whose "holds" is
// true earns its item's weight.
function weighByItem(weights) {
  return (verified) => Object.keys(weights || {}).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// <Report> carries the raw report a case's items grade the write-up against -
// every item below is a claim about how <Output> treats facts already in it.
function askIssueItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    {
      role: 'user',
      content: `<Report>${context.vars.report}</Report>\n`
        + `<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Fixed across the ten positive cases - the description's own claims
// ("clear outcome, sufficient context, testable completion"), never the skill
// body's prescribed headings. Deliberately excludes the negative-control case:
// grading "is this a good ticket" is the wrong question where refusing to write
// one is correct, so cases.yaml omits *semantic there.
const SEMANTIC_QUALITY_ITEMS = `<Output> is a ticket written up from the raw
report in <Report>. Judge the ticket as delivered - do not reward or penalise
how it was built, which features it used, or whether it followed any
particular authoring convention.

1. Clear outcome: does <Output> contain a title and a sentence a reader could
   restate as what will be true when this is done? A title naming a category
   rather than an outcome, or a write-up that only restates the complaint,
   does not hold.
2. Sufficient context: does <Output> contain the facts an engineer who has
   never seen the report would need to start, drawn from what the report
   supplied? Judge only whether those facts are present and enough to start
   on; whether the write-up also adds anything the report did not is graded
   elsewhere and must not move this item.
3. Testable completion: does <Output> contain a completion condition someone
   could settle by observing the system - an event, a count, a state, a
   message - rather than one needing someone's opinion ("satisfied",
   "improved", "works properly")?`;

const SEMANTIC_QUALITY_WEIGHTS = { 1: 0.34, 2: 0.33, 3: 0.33 };

function semanticQuality(output, context) {
  const { providerCfg, messages } = askIssueItems(output, context, SEMANTIC_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem(SEMANTIC_QUALITY_WEIGHTS), threshold: 0.7,
  });
}

// Per-case: the case's own numbered items live in `vars.rubric`, the weights
// in `vars.weights` (tests/cases.yaml). Token-level invention (a version, a
// path, an error code the report never had) is graded separately and
// deterministically by `no_invented_facts`; these items grade only whether
// the write-up's PROSE stays faithful to what the report actually said.
function caseFidelity(output, context) {
  const itemsPrompt = context.vars.rubric;
  const { providerCfg, messages } = askIssueItems(output, context, itemsPrompt);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem(context.vars.weights), threshold: 0.7,
  });
}

module.exports = {
  judgeProvider, weighByItem, askIssueItems,
  semanticQuality, caseFidelity,
  SEMANTIC_QUALITY_ITEMS, SEMANTIC_QUALITY_WEIGHTS,
};
