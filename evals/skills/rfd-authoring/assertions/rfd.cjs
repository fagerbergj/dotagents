// dotagents#64/#65 quote-verified pattern (evals/skills/review-code/assertions/review.cjs,
// evals/skills/adr-authoring/assertions/adr.cjs): the judge answers narrow
// numbered items with a verbatim quote from <Output> or NONE; code verifies
// the quote is a real substring before it counts; the score is computed here
// by a rule this file states, never taken from the judge's own arithmetic.

const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <Note> or <Tells> back,'
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

// Every case carries `task` (the colleague's note); `rubric` (situation-
// specific requirement) and `tells` (the review cases' per-draft list) are
// present only where the metric that reads them applies.
function askItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const v = context.vars || {};
  const parts = [`<Note>${v.task || ''}</Note>`];
  if (v.rubric) parts.push(`<Requirement>${v.rubric}</Requirement>`);
  if (v.tells) parts.push(`<Tells>${v.tells}</Tells>`);
  parts.push(`<Output>${output}</Output>`);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${parts.join('\n')}\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was the exploratory-case `framing_quality` llm-rubric. Judged only on the
// seven exploratory cases: what an initial RFD should address (Joyent/MNX RFD
// process) and RFC 3's "explicit questions without any attempted answers are
// all acceptable" floor.
const FRAMING_QUALITY_ITEMS = `<Output> is a document written in response to
a colleague's note. Judge only what the document says, never how it is laid
out or which headings it uses - a document that does these things in flowing
prose scores exactly as well as one with sections. Do not credit a section
named after an item that it leaves empty; the quote must actually satisfy
the item.

1. Is the problem stated so that it is not, in Joyent's words, "described in
   terms of the solution" - can a reader restate what is wrong without
   naming a fix?
2. Does <Output> state the principles and constraints that bound any
   solution - what must stay true whichever direction is taken?
3. Does <Output> say who is affected and how they would notice: operators,
   users, developers, or whoever is currently absorbing the problem?
4. Are at least two directions still live at the end, or is there an
   explicit statement that the direction is unknown? A direction disposed of
   in a single clause does not count as live.
5. Is there at least one explicit question whose answer would change what
   happens next, specific enough that a named person could answer it?`;

function framingQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, FRAMING_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }), threshold: 0.7,
  });
}

// Was `stays_open`. Subtractive like no_invented_specifics below: each tell
// present costs 0.2, so "holds": true here means the FAULT is present, the
// opposite polarity from framing_quality's items. Oxide RFD 1: the discussion
// state "shouldn't be used for ideas that have been committed to,
// organizationally or otherwise; by the time an idea represents the consensus
// or direction, it should be in the published state."
const STAYS_OPEN_ITEMS = `The colleague's note describes a situation where no
direction has been settled. Apply Oxide Computer's RFD 1 to <Output>: does it
read as still open, or has it quietly committed?

Ignore hedging vocabulary entirely. "We might", "one option is", "leaning
towards", "nothing is decided yet" and "thoughts?" are not evidence that a
document is open; the arrangement of the material is. For each tell below,
set "holds" to true only if <Output> actually shows it, and quote the text
that shows it (or NONE if it does not).

1. Asymmetric evidence: one direction arrives with a benchmark, a spike, a
   prototype, a cost or a track record, and the others arrive with none.
2. Asymmetric weight: one direction gets sustained treatment and the rest
   get a clause each.
3. Disposal rather than assessment: a direction is ruled out by assertion,
   with no test, measurement or missing fact named that would settle it.
4. The next step is implementation work on one direction, rather than work
   that would tell the reader which direction to take.
5. The questions ask for assent rather than for information that could
   change the outcome.

A document may legitimately name a direction if the colleague's note gives
it grounds to. Judge whether the material is arranged to foreclose
discussion, not whether a direction appears.`;

function staysOpen(output, context) {
  const { providerCfg, messages } = askItems(output, context, STAYS_OPEN_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: (verified) => {
      const present = [1, 2, 3, 4, 5].filter((n) => verified.some((it) => String(it.n) === String(n) && it.holds));
      return Math.max(0, 1 - 0.2 * present.length);
    },
    threshold: 0.6,
  });
}

// Was `no_invented_specifics`, the same fabrication check on its own axis
// across every case where the reply is judged against a source (the seven
// exploratory documents and the six reviews). Open-ended, not a fixed
// checklist, so this asks the judge to enumerate rather than answer a fixed
// set of yes/no questions; each verified invented item costs 0.25.
const NO_INVENTED_SPECIFICS_ITEMS = `List every figure, identifier, system
name, team name, date or measurement that <Output> asserts as established
fact that appears nowhere in <Note>, in the order they appear, numbered from
1. For each, quote it verbatim from <Output> and set "holds" to true if it is
NOT supported by <Note> (invented), or false if it is in <Note>. A specific
<Output> explicitly marks as an assumption, an example, an open question or a
target still to be agreed is not on the list, and neither is a published
standard, specification or process it cites as an authority - that is a
citation, not a claim about the colleague's own systems. If <Output> asserts
nothing specific, respond with {"items": []}.`;

function noInventedSpecifics(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_INVENTED_SPECIFICS_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: (verified) => Math.max(0, 1 - 0.25 * verified.filter((it) => it.holds).length),
    threshold: 1,
  });
}

// Was `control_quality`, graded only on the five negative-control cases: the
// right answer is to push back or write almost nothing rather than
// manufacture an exploratory document. <Requirement> carries what this
// particular note calls for instead.
const CONTROL_QUALITY_ITEMS = `This situation is NOT one that calls for an
open-ended exploratory document. What you are grading is what the author
would send to the people involved, which need not be a message addressed
back to the colleague - a document written for those people IS the reply
being graded, never raw material for a reply that is missing.

Oxide Computer's RFD 1 reserves the discussion state for ideas not yet
settled: "by the time an idea represents the consensus or direction, it
should be in the published state." The Go proposal process gates on a brief
issue before any design document: "There is no need for a design document at
this point." Neither source says nothing should be written; what is judged
is whether the open-ended exploratory framing was declined.

Brevity is correct here and must not be penalised. RFC 3, the charter both
Joyent and Oxide adopt, sets the floor at one sentence.

1. Is <Output> the compact thing the situation calls for - a record, a
   decision request, a plan, an explanation - or does it say plainly that an
   open-ended exploratory write-up is not needed here?
2. Does <Output> avoid manufacturing uncertainty - not reopening a settled
   choice, not inventing open questions the note did not contain, not asking
   anyone to reconsider what the author has already worked out?
3. Does <Output> meet the case-specific requirement in <Requirement>?`;

function controlQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, CONTROL_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.34, 2: 0.33, 3: 0.33 }), threshold: 0.7,
  });
}

// Was `finds_the_decision`. Each review case carries a different number of
// tells in <Tells> (2 to 5), so the item count - and each item's weight - is
// derived from that var rather than fixed, unlike the other metrics here.
function countTells(context) {
  const tells = String((context && context.vars && context.vars.tells) || '');
  const matches = tells.match(/^\s*\d+\./gm);
  return matches ? matches.length : 0;
}

const FINDS_THE_DECISION_ITEMS = `A colleague sent <Output> as a review of a
draft. The draft declares itself open but has already chosen. Oxide Computer's
RFD 1 rules that the discussion state "shouldn't be used for ideas that have
been committed to, organizationally or otherwise; by the time an idea
represents the consensus or direction, it should be in the published state."
What is wrong is that the draft's declared openness does not match its
actual commitment.

House reading, not Oxide's: a draft naming a direction is not itself the
fault, because the difference between an RFD and an RFC is which state the
document is in, not which artifact it is.

A review that says only that the draft "reads as decided", or that suggests
softer wording, has found nothing: hedging the language would not fix any of
the tells. Identifying a tell means naming the specific text in <Output>
that shows it, not restating the tell in the abstract.

The tells this particular draft carries, and no others, are listed in
<Tells>. For each tell, in order starting from 1, does <Output> identify it?
Quote <Output>'s own words identifying the tell, or answer NONE.`;

function findsTheDecision(output, context) {
  const n = countTells(context);
  const { providerCfg, messages } = askItems(output, context, FINDS_THE_DECISION_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: (verified) => {
      if (!n) return 0;
      let hit = 0;
      for (let i = 1; i <= n; i++) {
        const answers = verified.filter((it) => String(it.n) === String(i));
        if (answers.length && answers.every((it) => it.holds)) hit++;
      }
      return hit / n;
    },
    threshold: 0.6,
  });
}

// Was `review_framing`, on the single "honestly open" draft: the opposite
// failure from finds_the_decision, a review that invents a hidden decision or
// pushes the author to commit prematurely. RFC 3: "explicit questions without
// any attempted answers are all acceptable."
const REVIEW_FRAMING_ITEMS = `<Output> reviews a draft that is genuinely
undecided; under RFC 3 - the charter both Joyent and Oxide adopt for RFDs -
that is legitimate. A review that pushes the author to pick a premature
answer, or that claims to detect a decision the draft has not made, is
wrong. <Requirement> names an additional requirement for this case.

1. Does <Output> avoid asserting that the draft has secretly chosen a
   direction?
2. Does <Output> avoid telling the author to commit to a rule, number or
   policy that the draft has no basis to pick?
3. Does <Output> identify at least one concrete gap? Joyent's RFD content
   list asks for "the principles and constraints on the design of the
   solution" and for how users and operators would interact with and verify
   the change.
4. Is the feedback specific to this draft's own text rather than advice that
   would apply to any document?`;

function reviewFraming(output, context) {
  const { providerCfg, messages } = askItems(output, context, REVIEW_FRAMING_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 }), threshold: 0.7,
  });
}

module.exports = {
  framingQuality, staysOpen, noInventedSpecifics, controlQuality, findsTheDecision, reviewFraming,
  judgeProvider, weighByItem, askItems, countTells,
};
