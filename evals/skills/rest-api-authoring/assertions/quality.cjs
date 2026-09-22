// dotagents#65-class conversion: `design_quality` and the four `control_quality`
// rubrics were llm-rubric assertions that asked the judge to both find the
// answer AND do the arithmetic in one completion - the failure mode
// evals/AGENTS.md documents (an unchanged arm scoring 0.00 then 0.75 on one
// metric, dotagents#64). Each is now a numbered yes/no item list: the judge
// must quote the output or answer NONE per item, code verifies the quote is a
// real substring, and WEIGHTS - not the judge - compute the score.
// review-code's assertions/review.cjs is the worked example this follows.
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <Task> or <Attached>'
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
// earns its item's weight.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

function askItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const contract = context.vars.contract
    ? `\n<Attached>${context.vars.contract}</Attached>` : '';
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    {
      role: 'user',
      content: `<Task>${context.vars.task}</Task>${contract}\n`
        + `<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Was the shared `design_quality` llm-rubric (anchored across nine contract
// cases). The five questions are unchanged; only the scoring moved off the
// judge's own arithmetic. Question 5 carries the per-case requirement via the
// `rubric` case var, same as before.
const DESIGN_QUALITY_ITEMS = `<Output> is an HTTP API contract written in
response to <Task>. Answer the five questions below from the contract alone.
A question counts as answered only if you can quote the part of the document
that answers it. Naming a convention, a header, an RFC, or a design principle
is not an answer; only a mechanism a client could act on is.

1. Take the operation that changes the most state. A client sends it, times
   out, and sends the identical request again. What does the contract say the
   second call does? Quote it, or answer NONE.
2. Take one failure a real client will hit on that operation. Can the client
   tell it apart from the other failures the same operation declares, and
   behave differently? Quote the two responses that differ, or answer NONE.
3. Find a concept that appears in more than one place. Does the document say
   it is one thing, so that changing it changes every place at once? Quote
   it, or answer NONE.
4. Take the operation with the largest request body. Could a client build a
   valid request from this document alone, without guessing a field name, a
   format, or whether a field is optional? Quote what makes it unambiguous,
   or answer NONE.
5. Coverage: does the contract express everything this request needs, with
   nothing contradicting it? Specifically: __RUBRIC__ - quote what expresses
   it, or answer NONE.`;

function designQuality(output, context) {
  const items = DESIGN_QUALITY_ITEMS.replace('__RUBRIC__', String(context.vars.rubric || '').trim());
  const { providerCfg, messages } = askItems(output, context, items);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }), threshold: 0.7,
  });
}

// The four negative controls below each carried a bespoke penalty rubric
// ("start at 1, subtract 0.25 per addition"). Recast as positively-framed
// items whose weights sum to 1.0: a correction/identification item that
// carries most of the weight, plus a scope-discipline item asking whether the
// reply stayed within what was asked - so an unrequested addition costs the
// item's weight once rather than an unbounded per-addition subtraction.

const DOC_FIX_ITEMS = `<Output> is a reply to <Task>, about the attached
OpenAPI file. The correct answer corrects one wrong claim and changes nothing
else.

1. Does the `+ '`code`' + ` path parameter description on GET /coupons/{code} in
   <Output> say the code is NOT case sensitive (case-insensitive lookup, or
   upper-cased on the way in), rather than repeating the old case-sensitive
   claim? Quote the corrected description, or answer NONE.
2. Is that corrected description the only change from <Attached> - no new
   operation, schema, parameter, response code, security requirement, or
   version bump appears anywhere else in <Output>? Quote the corrected
   description again as the one change if this holds; if it does not hold,
   quote whatever was added instead.`;

function docFixQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, DOC_FIX_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.7,
  });
}

const ALREADY_COVERED_ITEMS = `<Output> is a reply to <Task>, about the
attached OpenAPI file. GET /invoices already declares a ` + '`status`' + ` query
parameter whose enum includes ` + '`unpaid`' + `, so the request is already served
by GET /invoices?status=unpaid. The correct answer says so and proposes no
contract change.

1. Does <Output> identify that the existing GET /invoices operation, via its
   status/filter parameter, already returns what was asked for, naming that
   parameter or call? Quote it, or answer NONE.
2. Does <Output> propose no new path, operation, parameter, schema, or
   response code beyond what <Attached> already declares? Quote the sentence
   confirming no change is needed if this holds; if it does not hold, quote
   what was added instead.`;

function alreadyCoveredQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, ALREADY_COVERED_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.7, 2: 0.3 }), threshold: 0.7,
  });
}

const NO_CHANGE_ITEMS = `<Output> is a reply to <Task>, about the attached
OpenAPI file. Everything described - an index, an instance size, a latency
number - is implementation, and the request and response are unchanged. The
correct answer says the contract needs no change.

1. Does <Output> say the contract file does not need to change? Quote it, or
   answer NONE.
2. Does <Output> avoid proposing any edit to the file - no path, operation,
   parameter, schema, response code, description, version bump, or
   extension? Quote the sentence confirming no edit is needed if this holds;
   if it does not hold, quote the edit it proposes instead.`;

function noChangeQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_CHANGE_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.7, 2: 0.3 }), threshold: 0.7,
  });
}

const CONTRADICTION_204_ITEMS = `<Output> is a reply to <Task>, about the
attached OpenAPI file. A 204 response cannot carry a body (RFC 9110 s15.3.5),
so returning the invoice in the body while keeping 204 cannot both hold. The
correct answer names that conflict before writing anything; quietly picking
one side without saying so is wrong even if the pick itself is reasonable.

1. Does <Output> say the two requirements conflict, because a 204 cannot
   carry a response body? Quote it, or answer NONE.
2. Does <Output> avoid declaring any content, schema, or body on a 204
   response for this operation? Quote the sentence keeping 204 empty if this
   holds; if it does not hold, quote the body/content/schema attached to the
   204 instead.
3. Does <Output> say explicitly which requirement it is keeping and which it
   is dropping or deferring, rather than silently doing one without
   mentioning the other? Quote that explanation, or answer NONE.`;

function contradiction204Quality(output, context) {
  const { providerCfg, messages } = askItems(output, context, CONTRADICTION_204_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.3, 3: 0.2 }), threshold: 0.7,
  });
}

const CONTRADICTION_REQUIRED_ITEMS = `<Output> is a reply to <Task>, about the
attached OpenAPI file. Making the field required on the operation today's
clients already post to would reject those clients, and they cannot start
failing before the client that sends it ships. The correct answer names that
conflict before writing anything; quietly picking one side without saying so
is wrong even if the pick itself is reasonable.

1. Does <Output> say that making the field required now would break the
   clients already in the field, so the two requirements cannot both hold as
   asked? Quote it, or answer NONE.
2. Does <Output> avoid adding the field to the ` + '`required`' + ` list of the
   request body schema that today's clients post to? Quote the sentence
   keeping it optional there if this holds; if it does not hold, quote the
   change that made it required there instead.
3. Does <Output> say explicitly which requirement it is keeping and which it
   is dropping or deferring, rather than silently doing one without
   mentioning the other? Quote that explanation, or answer NONE.`;

function contradictionRequiredQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, CONTRADICTION_REQUIRED_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.3, 3: 0.2 }), threshold: 0.7,
  });
}

module.exports = {
  judgeProvider, weighByItem, askItems,
  designQuality, docFixQuality, alreadyCoveredQuality, noChangeQuality,
  contradiction204Quality, contradictionRequiredQuality,
};
