// dotagents#64/#65 pattern applied to mermaid-authoring's two judged metrics
// (see review-code/assertions/review.cjs, the worked example, and
// fix-bug/assertions/rubrics.cjs, the same shape over a different domain):
// ask the judge narrow per-item questions, require a verbatim quote of
// <Output> or NONE, verify the quote is a real substring before it can earn
// its item's weight, and score from the verified items by a rule this file
// states - never from the judge's own arithmetic. Judge settings (model,
// temperature, reasoning) live once in promptfooconfig.yaml's
// defaultTest.options.provider, matching review-code's settled block per
// evals/AGENTS.md.
//
// <Output> here is the model's raw text: the fenced Mermaid source plus any
// surrounding prose. Whether it renders and which diagram type it picked are
// graded by the deterministic checks in assertions/mermaid.cjs and stay
// untouched - the SVG-error-role check in particular is the fix for
// mermaid-cli's exit-0-on-a-broken-diagram blind spot (evals/AGENTS.md), and
// nothing here should reintroduce a text-only substitute for it.
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

// weights: {1: 0.6, 2: 0.4, ...}. Only a verified quote whose "holds" is true
// earns its item's weight - a real quote the judge itself says does not
// satisfy the item earns nothing, same as an unquoted one.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// fields: [[tag, value], ...] - the ground-truth vars this metric needs
// (Request/Rubric differ per metric only in which of the two they carry).
function askItems(output, context, itemsPrompt, fields) {
  const providerCfg = judgeProvider(context);
  const tags = fields.map(([tag, val]) => `<${tag}>${val}</${tag}>`).join('\n');
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${tags}\n<Output>${output}</Output>\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was the llm-rubric `semantic_quality` (three items, judge-computed as
// count-satisfied / 3). Each item now asks for a quote that would exist
// whether the item holds or not - "the fact you are least confident is
// present", "the label you are least confident is self-explanatory" - rather
// than a bare "does it hold", so a clean diagram still grounds its own pass
// instead of defaulting to NONE and losing the item (fix-bug's
// PROPORTIONATE_FIX_ITEMS item 1 is the same move).
const ANSWERS_REQUEST_ITEMS = `<Output> is a diagram - Mermaid source, plus
whatever prose came with it - produced in answer to <Request>. Judge it as a
reader sees it rendered: node id names, indentation, comments, the direction
keyword, classDef, subgraphs, styling, and which Mermaid features were used
are never in scope - a node id is not something a reader of the picture sees.
Whether the diagram carries anything <Request> never stated is graded
elsewhere and must not move this score in either direction.

1. Does every fact stated in <Request> appear somewhere in the diagram? Quote
   the diagram label, connector text, or annotation that represents the fact
   you are LEAST confident is present - the one a skeptical reader would ask
   about first.
2. Does the diagram satisfy the criterion in <Rubric>? Quote the diagram text
   that most directly demonstrates whether it does.
3. Could a reader who has never seen <Request> say what each element and each
   connector represents from its own label alone? Quote the label you are
   LEAST confident is self-explanatory unaided.`;

function answersRequest(output, context) {
  const { providerCfg, messages } = askItems(output, context, ANSWERS_REQUEST_ITEMS, [
    ['Request', context.vars.task],
    ['Rubric', context.vars.rubric],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.34, 2: 0.33, 3: 0.33 }), threshold: 0.7,
  });
}

// Was the llm-rubric `no_invented_elements` (start at 1.00, subtract 0.25 per
// invented item and per contradiction, judge-computed arithmetic). Both items
// ask for the diagram's single most doubtful label rather than an open list -
// the judge always has something real to point at, which the enumeration
// style ("list every invented element... NONE if there are none") would not:
// a clean diagram answering NONE loses the item outright under verifyItems,
// same as fix-bug's proportionate_fix rationale.
const NO_INVENTED_ELEMENTS_ITEMS = `<Output> is a diagram - Mermaid source,
plus whatever prose came with it - produced in answer to <Request>. Judge it
as a reader sees it rendered: node id names, indentation, comments, the
direction keyword, classDef, subgraphs, styling, and which Mermaid features
were used are never in scope - a node id is not an element a reader sees. A
structural element the diagram type requires - a start or end marker, an
axis, a lane - is never invention. Whether the diagram answers <Request> is
graded elsewhere and must not move this score in either direction.

1. Is every figure, date, identifier, quantity, named system, actor, or step
   visible on the diagram something <Request> actually stated? Quote the
   diagram's most specific or most detailed label - the one a skeptical
   reader would most doubt traces back to <Request>.
2. Does nothing on the diagram contradict <Request>? Quote the diagram text
   closest to conflicting with <Request>, or, if nothing conflicts, the
   diagram text that most directly restates something <Request> said.`;

function noInventedElements(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_INVENTED_ELEMENTS_ITEMS, [
    ['Request', context.vars.task],
  ]);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 1,
  });
}

module.exports = {
  answersRequest, noInventedElements,
  judgeProvider, weighByItem, askItems,
};
