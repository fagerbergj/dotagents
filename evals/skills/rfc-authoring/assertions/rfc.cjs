// Every judged metric here traces to the skill description's own claim: a
// proposal that names the change, its blast radius, and who decides - or,
// when the situation does not warrant one, a document that says so. Nothing
// here grades section headings or the authoring procedure.

const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

// dotagents#64/#65 pattern, mirroring skills/review-code/assertions/review.cjs
// and skills/adr-authoring/assertions/adr.cjs: ask the judge narrow numbered
// items, require a verbatim quote from <Output> (or NONE), verify the quote
// is a real substring before it counts, and score from the verified items by
// a rule this file supplies - never the judge's own arithmetic. Same JSON
// contract as those two; the tags in the user message are this suite's own
// (<Situation>/<Output>, not <MaintainerReview> or <SourceNote>).
const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <Situation> back,'
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
      content: `<Situation>${context.vars.task}</Situation>\n`
        + `<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Was `proposal_quality`'s three fixed points plus its per-case "additional
// requirement" clause, all in one llm-rubric. Item 4 is built from the case's
// own `rubric` var, so each case still grades a different concrete fact - the
// float-to-integer migration path, the 14 foreign-key tables, the batch jobs -
// never a generic "is this thorough" question that a fluent non-answer could
// pass.
function proposalQualityItems(rubric) {
  return `An engineer described a situation to a colleague, given in
<Situation>, and received the document in <Output>. Judge the document as
delivered. Do not reward or penalise its length, its headings, which
sections it contains, or whether it follows any authoring convention.

1. Proposal, not problem restated: the document commits to one change and
   states it precisely enough that a reader could disagree with the change
   itself rather than only with the problem. Quote the sentence that says
   what will be done, or answer NONE. A document that surveys the situation,
   lists considerations, or asks the reader to pick does not hold this item.
2. Blast radius: the document names a specific party outside the author's own
   service that this change acts on - another team, an existing caller,
   stored data, a published interface - and says what that party has to do.
   Quote the sentence that names one, or answer NONE. "Downstream consumers
   may be affected" is NONE.
3. Decision: a reader on another team can tell who has the authority to
   accept or reject this, and by when, in time for an objection to still
   matter. Quote the text, or answer NONE. A list of people to notify is not
   a decision owner. A schedule for the implementation work is not a decision
   date.
4. Case-specific requirement: ${rubric.trim()} Quote the sentence(s) that
   satisfy this requirement, or answer NONE.`;
}

function proposalQuality(output, context) {
  const items = proposalQualityItems(String(context?.vars?.rubric || ''));
  const { providerCfg, messages } = askItems(output, context, items);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 }), threshold: 0.7,
  });
}

// Was `honest_tradeoffs`'s two fixed points. Static across every proposal
// case - unlike proposal_quality, nothing here reads a case-specific var.
const HONEST_TRADEOFFS_ITEMS = `An engineer described a situation to a
colleague, given in <Situation>, and received the document in <Output>. Judge
the document only on whether it is honest with its reader. Do not reward or
penalise its length, its headings, or which sections it contains.

1. The case against: the document gives a reader a reason not to do this, or
   not to do it this way - a cost the author is accepting, a group of users
   it makes worse off, or a rejected alternative put strongly enough that its
   appeal is visible. Quote it, or answer NONE. A document in which every
   consideration resolves in favour of the proposal does not hold this item
   however well argued, and a drawback that is raised and immediately
   dismissed in the same breath is NONE.
2. Reversibility: the document distinguishes what cannot be undone once this
   ships from what can, and says what the recovery is when it goes wrong.
   Quote it, or answer NONE. An unqualified assurance that the change is safe
   does not hold this item, and neither does a rollback plan that would not
   actually recover the part the document itself called irreversible.`;

function honestTradeoffs(output, context) {
  const { providerCfg, messages } = askItems(output, context, HONEST_TRADEOFFS_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.7,
  });
}

// Was `no_invented_specifics`. Open-ended rather than a fixed checklist - the
// document may assert any number of unsupported facts, so this asks the judge
// to enumerate them instead of answering a fixed set of yes/no questions.
// "holds": true means the quoted claim is INVENTED (not supported by
// <Situation>). The count is capped at 2 before scoring, same as the old
// rubric's own arithmetic - uncapped it saturates into a length penalty: a
// design proposal proposes specifics, and a longer one proposes more.
const NO_INVENTED_SPECIFICS_ITEMS = `List every figure or identifier <Output>
asserts as an EXISTING FACT about the engineer's own systems, teams, people,
vendors, incidents or history, where <Situation> supports no such fact.
Number them from 1, quote each verbatim from <Output>, and set "holds" to
true if it is NOT supported by <Situation> (invented) or false if it is
supported.

None of the following is an invented specific, and none of them goes on your
list, however many of them <Output> contains:

- Ordinary technical vocabulary, and the names of widely known protocols,
  formats, services, tools and libraries - TLS, OIDC, IAM, VPC, CloudWatch,
  Kafka, JSON. Naming a technology is not a claim that the engineer runs it;
  only asserting that they already do is.
- Anything <Output> is itself PROPOSING rather than reporting: a field name
  in a schema it defines, a phase or step in a plan it sets out, a threshold,
  an acceptance criterion, a target date, a version to ship, a deadline to
  agree, a label it introduces for something the engineer described unnamed.
- <Output>'s own section headings and structural labels.
- A published standard, specification or process cited as an authority.
- A specific <Output> explicitly marks as an assumption, an estimate, a
  placeholder, an example, or an open question.

If <Output> asserts nothing specific, respond with {"items": []}.`;

function noInventedSpecifics(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_INVENTED_SPECIFICS_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: (verified) => 1 - 0.25 * Math.min(2, verified.filter((it) => it.holds).length),
    threshold: 1,
  });
}

// Was `control_quality`, graded only on the five negative-control cases: the
// right answer is to decline the process rather than manufacture a proposal.
// Item 5's "invents nothing" replaces the old rubric's separate note that a
// reply reading as the document is already NONE on item 1 by definition - no
// separate cap is needed since weighByItem already requires every numbered
// item to hold before its own weight is earned.
function controlQualityItems(rubric) {
  return `This situation does not warrant a formal written proposal, given
in <Situation>. The Go proposal process gates on a brief issue before any
design document: "The proposal author creates a brief issue describing the
proposal. Note: There is no need for a design document at this point."
Brevity is the correct answer here and must not be penalised - an answer
that is short because the situation calls for little is not thereby a worse
answer. What the situation actually calls for instead, specific to this
case: ${rubric.trim()}

Answer each of the five below about <Output>, quoting its own words or
answering NONE:

1. It says plainly that a formal written proposal is not warranted here.
   Quote the sentence, or answer NONE. A reply that hedges both ways -
   offering to write one as an equally good option - is NONE.
2. It gives the reason, drawn from the specifics of this situation rather
   than stated as a general rule about process. Quote it, or answer NONE.
3. It names the lighter thing to do instead, concretely enough to act on.
   Quote it, or answer NONE. "Keep it informal" or "use your judgement" is
   NONE.
4. It is the answer itself rather than a prospective proposal document.
   Quote its opening sentence. A reply built out of summary / motivation /
   alternatives / rollout / decision sections is the document, and is NONE
   for this point however well each section reads. Section headings on
   their own decide nothing: a two-line answer under a heading is still the
   answer.
5. It invents nothing - no system, team, risk, figure, deadline or
   constraint the engineer did not mention in <Situation>. Quote the
   sentence that stays within what <Situation> said, or answer NONE if it
   adds anything <Situation> did not.`;
}

function controlQuality(output, context) {
  const items = controlQualityItems(String(context?.vars?.rubric || ''));
  const { providerCfg, messages } = askItems(output, context, items);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }), threshold: 0.7,
  });
}

module.exports = {
  proposalQuality, honestTradeoffs, noInventedSpecifics, controlQuality,
  judgeProvider, weighByItem, askItems,
};
