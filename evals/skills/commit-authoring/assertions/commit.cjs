// Conventional Commits conformance, decided by the reference parser rather
// than a pattern. conventional-commits-parser is the engine commitlint runs on;
// it handles the things a hand-rolled regex got wrong - any noun type (spec
// §14), case-insensitive units (§15), the `!` marker (§11), and git-trailer
// footers including BREAKING CHANGE / BREAKING-CHANGE (§16).

const { fenceBlocks } = require('../../../lib/strip-reasoning.js');
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

// The conventionalcommits preset's own patterns, tightened only to require a
// non-empty type and description - the parser's default `\w*` accepts `: x`.
const PARSER_OPTIONS = {
  headerPattern: /^(\w+)(?:\(([^()\r\n]+)\))?!?: (.+)$/,
  breakingHeaderPattern: /^(\w+)(?:\(([^()\r\n]+)\))?!: (.+)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
};

// ESM-only package; cache the import so each row pays for it once.
let parserPromise;
function commitParser() {
  parserPromise ||= import('conventional-commits-parser').then((m) => new m.CommitParser(PARSER_OPTIONS));
  return parserPromise;
}

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

// Fenced blocks if the answer used them, else the whole text. Any info string
// opens one, because the info string is only a language tag when it is a bare
// word: models emit ```refactor: use the upstream helper with the header glued
// to the fence, and that content must reach the parser, not be eaten as a tag.
// fenceBlocks hands back the info alongside the body for exactly that, and
// tracks depth, so a message quoting a fence of its own is no longer cut there.
function blocks(output) {
  const fenced = [];
  for (const { info, body } of fenceBlocks(String(output), /^/)) {
    const text = /^[\w+#-]*$/.test(info) ? body.trim() : `${info}\n${body}`.trim();
    if (text) fenced.push(text);
  }
  return fenced.length ? fenced : [String(output).trim()];
}

// Spec §6: a body MUST begin one blank line after the description. The parser
// is lenient here - it will take line 2 as the body - so this is checked
// directly, which is what the old standalone blank_line_separator gate did.
function conformance(commit, message) {
  // `header` is whatever the first line was; only the correspondence fields
  // tell you whether headerPattern actually matched it.
  if (!commit.type || !commit.subject) {
    return `Header is not \`type(scope)!: description\`: ${JSON.stringify(message.split('\n')[0].slice(0, 80))}`;
  }
  const second = message.replace(/\r/g, '').split('\n')[1];
  if (second !== undefined && second.trim() !== '') {
    return `Body must begin one blank line after the description, not on line 2: ${JSON.stringify(second.slice(0, 60))}`;
  }
  return '';
}

// Passes if any block the answer produced is a conforming message; a two-commit
// answer to a mixed diff should not be failed for what its first block is.
async function conventionalHeader(output, context) {
  const candidates = blocks(output);
  // Cases carrying their own `ask` leave the number of commits undecided, so a
  // prose answer refusing to write one message is correct there. Requiring a
  // header would foreclose the behaviour splits_mixed_change grades. Any
  // message actually offered still has to conform.
  // blocks() falls back to the whole answer when there is no fence, so test
  // for the fence itself rather than for an empty candidate list.
  if (!/```/.test(String(output)) && context?.vars?.ask) {
    return result(true, 'No commit message offered, and this ask did not require one.');
  }
  const parser = await commitParser();
  let first = '';
  for (const message of candidates) {
    const problem = conformance(parser.parse(message), message);
    if (!problem) return result(true, `Conventional Commits v1.0.0: ${JSON.stringify(message.split('\n')[0].slice(0, 80))}`);
    first ||= problem;
  }
  return result(false, first);
}

// ---------------------------------------------------------------------------
// dotagents#64/#65: why_quality, no_invented_claims and splits_mixed_change
// moved off llm-rubric's own arithmetic, the same fix review-code's four
// metrics took. The judge still reasons in prose, but per item it must quote
// <Output> or say NONE; judgeQuotedItems verifies the quote is real before
// scoring, and the score functions below - not the judge - compute the
// number.
const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <DeveloperNote> or'
  + ' <Diff> back, paraphrasing, or summarising is not a quote and will be'
  + ' rejected before your "holds" verdict is even read. Keep each quote to'
  + ' one sentence or line, at most 300 characters, never a code block - long'
  + ' quotes break the JSON and lose the item. Respond with exactly one JSON'
  + ' object: {"items": [...]}, one entry per numbered item, nothing else.';

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.6, 2: 0.4, ...}. Only a verified quote whose "holds" is true
// earns its item's weight - a real quote that the judge itself says does not
// satisfy the item earns nothing, same as an unquoted one.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// context.vars.diff is included only when the item text needs it -
// why_quality and splits_mixed_change judge the message against the
// developer's own note alone, the same scope their llm-rubric predecessors
// had (evals/AGENTS.md: a rubric only sees what is interpolated into it).
function askItems(output, context, itemsPrompt, { includeDiff } = {}) {
  const providerCfg = judgeProvider(context);
  const tags = `<DeveloperNote>${context.vars.context}</DeveloperNote>\n`
    + (includeDiff ? `<Diff>${context.vars.diff}</Diff>\n` : '')
    + `<Output>${output}</Output>`;
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${tags}\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was why_quality's own three quoted items plus its own arithmetic
// ("Score ... 0.4 for item 1, 0.3 for item 2, 0.3 for item 3. State the
// arithmetic."). The items are unchanged; only the scoring moved off the
// judge's self-reported number, onto weighByItem below, per dotagents#64/#65.
const WHY_QUALITY_ITEMS = `Judge the commit message in <Output> as delivered.
Do not reward or penalise how it was built, which features it used, or
whether it followed any particular authoring convention. Do not reward or
penalise Conventional Commits formatting itself - the type, the scope, the
\`!\`, the colon spacing - a parser checks that separately.

Two things are graded elsewhere and must not move this score. Length: a short
message carrying the reason and a long one carrying it score the same, and
brevity is never a deduction. Truth: take the message's factual claims at
face value here - whether <DeveloperNote> and the diff support them is a
separate question with its own score. Judge only whether the reason is
present and concrete.

1. Does <Output> state something the diff does not already show: what
   prompted the change, the constraint that forced it, the incident behind
   it, the option rejected, or what breaks without it? Restating the diff in
   any wording does not hold.
2. Are the specifics - the system, rule, number, error, or person involved -
   named concretely enough that a reader could repeat the reason back? Hedged,
   unnamed, or degree-only phrasing ("a certain class of agent", "improves
   clarity", "to fix an issue") does not hold. If the quoted text would still
   read true pasted under a completely different diff, it does not hold.
3. Does the first line describe what this change does specifically, such
   that a reader could tell it from a generic or wrong one only by checking
   it against the diff?`;

function whyQuality(output, context) {
  const { providerCfg, messages } = askItems(output, context, WHY_QUALITY_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.4, 2: 0.3, 3: 0.3 }), threshold: 0.7,
  });
}

// Was no_invented_claims's own open-ended "list every invention, then score 1
// if the list is empty" rubric. One item, answered once per invention found
// (or once with NONE); a verified, holding answer to item 1 is an invention,
// so the score inverts weighByItem's usual sense - any real invention fails
// the whole message, matching the old rubric's "no partial credit".
const NO_INVENTED_CLAIMS_ITEMS = `<Output> is a commit message (or messages)
describing the change in <Diff>. <DeveloperNote> and <Diff> are ground truth
for what actually happened; judge only whether <Output> asserts something
beyond them - never its length, its formatting, or how well it explains the
change, all of which are scored separately.

Two exemptions, both narrow, both about the message as a template rather
than a claim about the code.

First, an UNFILLED placeholder slot asserts nothing: \`Refs #<issue>\`,
\`#TBD\`, \`#NNN\`, \`#???\`, \`Co-authored-by: [Your Name]\`. It is a slot for
a value the author fills in against the tracker, however obviously <Diff>
carries no ticket number. A CONCRETE value in that slot is judged normally -
\`Refs #4471\` where neither <Diff> nor <DeveloperNote> names 4471 is an
invention.

Second, a recommendation about HOW TO COMMIT the change is not a claim about
the code, and neither is anything the recommendation is made of: saying the
tree holds unrelated work, proposing a boundary between commits, writing out
the subject and body of each proposed commit, and the standing reasons for
splitting (a reviewable diff, a bisect that lands on one change, an
independent revert, each commit building on its own). Read a proposed
commit's own body for inventions the same way you read a single message's -
a fabricated cause inside it still counts - but never flag the proposal, its
boundary, or its rationale itself.

1. Quote a cause, actor, number, identifier, issue or ticket reference,
   version, date, or consequence that <Output> states which neither <Diff>
   nor <DeveloperNote> supports, excluding both exemptions above. If there
   are several, answer this item once per invention, each with its own
   quote and holds true. If <Output> asserts nothing beyond <Diff> and
   <DeveloperNote>, answer once with quote NONE and holds false.`;

function noInventedClaimsScore(verified) {
  const invented = verified.filter((it) => String(it.n) === '1' && it.holds);
  return invented.length ? 0 : 1;
}

function noInventedClaims(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_INVENTED_CLAIMS_ITEMS, { includeDiff: true });
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: noInventedClaimsScore, threshold: 1,
  });
}

// Was splits_mixed_change's own single-question rubric ("gives two separate
// ... or says plainly ... A single message ... scores zero"). One item,
// unweighted at 1.0 - it was already binary, never partial credit.
const SPLITS_MIXED_CHANGE_ITEMS = `The working tree described in
<DeveloperNote> holds two unrelated pieces of work. Judge <Output> as
delivered; do not reward or penalise how it was built, which features it
used, or whether it followed any particular authoring convention.

1. Does <Output> either (a) write out two separate, well-formed commit
   messages, one per unrelated change, or (b) plainly state that these
   changes should not be committed together - without also offering a
   single-commit combination as an acceptable choice? A single message that
   covers both, a reply that offers a single-commit option alongside a
   two-commit one, a reply that says one commit is fine if the changes are
   related, or a reply that only mentions in passing that two commits would
   work without writing both messages out, does not hold.`;

function splitsMixedChange(output, context) {
  const { providerCfg, messages } = askItems(output, context, SPLITS_MIXED_CHANGE_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 1.0 }), threshold: 0.7,
  });
}

module.exports = {
  conventionalHeader,
  whyQuality, noInventedClaims, splitsMixedChange,
  judgeProvider, weighByItem, askItems, noInventedClaimsScore,
  // exported for the self-test
  blocks, WHY_QUALITY_ITEMS, NO_INVENTED_CLAIMS_ITEMS, SPLITS_MIXED_CHANGE_ITEMS,
};
