const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

// dotagents#64/#65: the same fix review.cjs made, applied to this suite's one
// judged metric. The old llm-rubric asked the judge to quote four items AND
// average them to a 0-1 score in one completion; that arithmetic is what
// flip-flopped an unchanged arm between runs. Quotes are still required, but
// the WEIGHTS below - not the judge - turn them into a number, and every quote
// is verified as a real substring of <Output> before it can count.
const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <Original> back,'
  + ' paraphrasing, or summarising is not a quote and will be rejected before'
  + ' your "holds" verdict is even read. Keep each quote to one sentence or'
  + ' line, at most 300 characters, never a code block - long quotes break the'
  + ' JSON and lose the item. Respond with exactly one JSON object:'
  + ' {"items": [...]}, one entry per numbered item, nothing else.';

// Content preservation is `preserved`'s job (evals/skills/format-markdown/
// assertions/format.cjs); this only grades what a reader sees. <Original> is
// reference for comparison, never a quote source - texts.default is <Output>
// alone, so a quote copied from <Original> fails verification.
const READABILITY_ITEMS = `<Original> is the document a reader handed over.
<Output> is what they got back. Judge <Output> as delivered: do not reward or
penalise how it was built, which bullet character or emphasis delimiter it
uses, or how its blank lines fall - that is graded elsewhere and is not your
concern.

1. Does <Output> read as more scannable than <Original> - either a long run of
   unbroken prose has been broken up, or content that was prose in <Original>
   now sits in a heading, list, or table in <Output>? Quote the part of
   <Output> that shows this. If <Original> already read that way and <Output>
   reasonably left it alone, quote any line of <Output> and answer true.
2. Does every heading in <Output> name what sits under it, so a reader
   deciding where to jump does not have to read the section first to find
   out? Quote the heading in <Output> that names its content least well - or,
   if <Output> has one heading or none, quote it (or its first line) and
   answer true.
3. Is there nothing in <Output> that would render broken - a fence, table,
   link definition, or inline HTML a renderer would mishandle? If something
   is broken, quote it and answer false. Otherwise quote any fence, table,
   link, HTML element, or (failing all of those) the first line of <Output>
   as evidence, and answer true.`;

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.4, 2: 0.3, 3: 0.3}. Only a verified quote whose "holds" is
// true earns its item's weight - a real quote the judge itself says does not
// satisfy the item earns nothing, same as an unquoted one.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

function askItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const original = (context && context.vars && context.vars.document) || '';
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    {
      role: 'user',
      content: `<Original>${original}</Original>\n<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Weight: item 1 (scannability) is the property the skill's description leads
// with ("clean visual rendering... scannability"); items 2-3 split the rest.
// No zero-gate for "no document delivered": an empty or advice-only <Output>
// has no real text to quote, so every item fails verification on its own and
// the score is already 0 without a special case.
function readability(output, context) {
  const { providerCfg, messages } = askItems(output, context, READABILITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.4, 2: 0.3, 3: 0.3 }), threshold: 0.7,
  });
}

module.exports = { readability, judgeProvider, weighByItem, askItems };
