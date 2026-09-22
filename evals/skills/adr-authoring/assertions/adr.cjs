// Every check here traces to a claim in the skill's frontmatter description:
// a record that preserves ONE significant technical decision, its CONTEXT,
// STATUS, and CONSEQUENCES, as a LIGHTWEIGHT durable record. Nothing here
// grades section order, heading text, or the authoring procedure.
//
// Only the checks that need real computation live here. Status presence is a
// `regex` assertion in tests/cases.yaml and the length ceiling is a `not-regex`
// in promptfooconfig.yaml, because promptfoo does those natively.

const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

// Sentence-initial capitals and filler, dropped so `carriesTaskSpecifics`
// looks for the situation's own nouns and numbers rather than English.
const STOP = new Set('the we it if so but and not every nobody wanted whatever please also then four sometime worth this that they he she his her our their you a an of to in on at for with from is was are were be been have has had will would can could should there here what which who when where why how yes no ok okay quick short half both all one two three them its'.split(' '));

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

// Claim: the record preserves the decision's CONTEXT. Context is the forces
// that made the choice non-obvious, so this diffs the document against the
// task: a record carrying none of the situation's own names and numbers has
// preserved nothing a reader could not have guessed.
function carriesTaskSpecifics(output, context) {
  const minimum = Number(config(context).minimum || 3);
  const task = String(context?.vars?.task || '');
  const text = String(output).toLowerCase();
  const wanted = new Set();
  for (const token of task.match(/\b[\w][\w./-]*\b/g) || []) {
    const lower = token.toLowerCase();
    if (lower.length < 2 || STOP.has(lower)) continue;
    if (!/\d/.test(token) && !/^[A-Z]/.test(token)) continue;
    wanted.add(lower);
  }
  const carried = [...wanted].filter((token) => text.includes(token));
  return result(carried.length >= minimum, `Carried ${carried.length}/${wanted.size} specifics from the note (${carried.slice(0, 6).join(', ') || 'none'}); expected at least ${minimum}.`);
}

// dotagents#64/#65 pattern, mirroring skills/review-code/assertions/review.cjs:
// ask the judge narrow numbered items, require a verbatim quote from <Output>
// (or NONE), verify the quote is a real substring before it counts, and score
// from the verified items by a rule this file supplies - never the judge's own
// arithmetic. Same JSON contract as review-code's; the tags in the user message
// are this suite's own (SourceNote/MustCarry/Output, not MaintainerReview).
const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <SourceNote> back,'
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
// earns its item's weight.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

function askItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    {
      role: 'user',
      content: `<SourceNote>${context.vars.task}</SourceNote>\n`
        + `<MustCarry>${context.vars.must_carry || ''}</MustCarry>\n`
        + `<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Was the `semantic_quality` llm-rubric's ecADR checklist (adr.github.io/ad-practices).
// Judged only on the eight positive cases (id001): a correct decline has no
// status, no consequences and no document to hold these criteria, and that
// belongs to control_quality below, not here.
const SEMANTIC_QUALITY_ITEMS = `<Output> claims to be an architectural
decision record. The ecADR definition of done asks whether it is complete.
Judge only what the document says, never how it is laid out or which
headings it uses - a record that states these in flowing prose is exactly as
good as one that uses sections. <SourceNote> is what actually happened;
<MustCarry> names situation-specific facts a complete record must carry.

1. Evidence: does <Output> point at something that happened - a measurement,
   a load test, an incident, an operational track record, a prior attempt -
   rather than only asserting the choice is right? Evidence about the
   problem, or about a rejected option, counts.
2. Criteria: does <Output> say what made this option preferable, whether or
   not it names the alternatives?
3. Agreement: does <Output> state its own standing - a status word (Accepted,
   Proposed, Superseded, Deferred, Blocked) or a sentence saying the team
   agreed? A named approver is not required.
4. Outcome and rationale: does <Output> document the outcome AND why, not
   merely the outcome alone?
5. Realization or review plan: does <Output> say what happens next, or what
   would cause this to be revisited? Migration or follow-up work counts; a
   bare restatement of the decision does not.

A document does not earn an item for a section named after it while leaving
it empty - the quote must actually satisfy the item.`;

function semanticQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, SEMANTIC_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }), threshold: 0.7,
  });
}

// Was the `no_invented_specifics` llm-rubric. Open-ended rather than a fixed
// checklist - the document may assert any number of unsupported facts, so
// this asks the judge to enumerate them instead of answering a fixed set of
// yes/no questions. "holds": true means the quoted claim is INVENTED (not
// supported by <SourceNote>); each verified invented item costs 0.25, same as
// the arithmetic the old rubric was asked to do itself, now done by score()
// only after every quote is checked against the actual document text.
// Runs on both positive and negative-control cases (the &grounded alias in
// tests/cases.yaml) - fabrication is a fault regardless of whether a record
// was warranted at all.
const NO_INVENTED_SPECIFICS_ITEMS = `List every figure, identifier, date,
file path, status and named system that <Output> asserts as established
fact about the team's own systems, in the order they appear, numbered from
1. For each, quote it verbatim from <Output> and set "holds" to true if it is
NOT supported by <SourceNote> (invented), or false if it is in <SourceNote>.
A specific <Output> explicitly marks as an assumption, a placeholder, an open
question or a proposal is not invented, and neither is a published standard,
specification or process it cites as an authority - that is a citation, not a
claim about the team's own systems. If <Output> asserts nothing specific,
respond with {"items": []}.`;

function noInventedSpecifics(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_INVENTED_SPECIFICS_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: (verified) => Math.max(0, 1 - 0.25 * verified.filter((it) => it.holds).length),
    threshold: 1,
  });
}

// Was the `control_quality` llm-rubric, graded only on the negative-control
// cases (id002): the right answer is to push back rather than manufacture a
// decision. START's definition of ready (ozimmer.ch) is what makes the
// pushback correct, not a matter of the response's tone.
const CONTROL_QUALITY_ITEMS = `This situation is NOT ready for an
architectural decision record: <SourceNote> is missing at least one of
START's five readiness criteria (known stakeholders, the moment having come,
identified alternatives, analysed requirements, a chosen template).
<MustCarry> names what this particular situation is missing. Judge only what
<Output> says, never its length or layout - a two-sentence refusal is exactly
as good as a longer one.

1. Does <Output> refuse to record as settled anything <SourceNote> does not
   settle? A plain "there is nothing decided here yet" satisfies this; so does
   a record explicitly filed as Proposed - not Accepted - that names what is
   still open; so does a record of a part of the note that IS settled, filed
   as such, alongside the refusal for the rest. A record that presents an
   undecided matter as settled fails this however well written.
2. Does <Output> name, in substance, which readiness criterion is absent -
   unknown stakeholders, unmeasured alternatives, a moment that has not
   arrived, unanalysed requirements - however it words it?
3. Does <Output> say what belongs in the repository instead?`;

function controlQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, CONTROL_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 1 / 3, 2: 1 / 3, 3: 1 / 3 }), threshold: 0.7,
  });
}

module.exports = {
  carriesTaskSpecifics, semanticQuality, noInventedSpecifics, controlQuality,
  judgeProvider, weighByItem, askItems,
};
