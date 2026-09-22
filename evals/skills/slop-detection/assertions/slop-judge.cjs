// dotagents#64/#65: the two subjective metrics here used to be llm-rubric with
// {{source}} interpolated straight into the rubric prompt and the judge doing
// its own arithmetic in prose. Moved onto judgeQuotedItems, same as
// review-code/assertions/review.cjs: the judge answers narrow numbered items
// with a verbatim quote or NONE, code verifies each quote before it counts,
// and a WEIGHT table below - not the judge - computes the score.
const { judgeQuotedItems } = require('../../../lib/quoted-items.js');

const JSON_CONTRACT = 'You are grading output against a small numbered list of'
  + ' yes/no questions. For EVERY numbered item, answer with one object:'
  + ' {"n": <item number>, "quote": <verbatim text copied from inside <Output>'
  + ' that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. A quote must be text'
  + ' that actually appears inside <Output> - copying <SourceFile> back,'
  + ' paraphrasing, or summarising is not a quote and will be rejected before'
  + ' your "holds" verdict is even read. Keep each quote to one sentence or'
  + ' line, at most 300 characters, never a code block - long quotes break the'
  + ' JSON and lose the item. Respond with exactly one JSON object:'
  + ' {"items": [...]}, one entry per numbered item, nothing else.';

// Model comes off test.options.provider, the exact object llm-rubric already
// used - no second copy of it in this file.
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

// The file the colleague sent goes in its own tag, built from the case var in
// JS rather than through promptfoo's rubricPrompt templating - the earlier
// llm-rubric form of both these metrics interpolated {{source}} straight into
// the assertion value, which is exactly the trap evals/AGENTS.md warns about
// (rubricPrompt is a string field; a case var used there is silently inert
// unless wrapped in its own tag by hand).
function askItems(output, context, itemsPrompt) {
  const providerCfg = judgeProvider(context);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    {
      role: 'user',
      content: `<SourceFile>${context.vars.source}</SourceFile>\n`
        + `<Output>${output}</Output>\n\n${itemsPrompt}`,
    },
  ];
  return { providerCfg, messages };
}

// Was the single `names_defect` llm-rubric's two 0.5-weighted items, restated
// as yes/no. Restricted to the three defect cases (matcher.py, search.py,
// cli.py), where the ask is "send back the version you'd rather maintain".
const NAMES_DEFECT_ITEMS = `<Output> is a reply to a colleague who sent
<SourceFile>, asking either to be sent back the version the reader would
rather maintain or to have it cleaned up. Judge the answer as delivered:
ignore its length, its tone, whether it followed any particular method, and
whether its rewritten code would compile.

1. Does <Output> name a specific construct in <SourceFile> - a function, a
   branch, a block, a variable - identified specifically enough that a reader
   could find it in <SourceFile>? A problem attributed to the file as a whole,
   or phrased so it would read true of any Python file, does not hold.
2. Does <Output> propose something concrete enough to act on without asking a
   follow-up question? "Simplify this", "consider refactoring", "make it more
   readable" and "split it up" with no boundary named do not hold. A
   rewritten file with no accompanying prose answers neither item - code that
   silently restructures the file tells the reader nothing about what was
   wrong or why this replaces it.`;

function namesDefect(output, context) {
  const { providerCfg, messages } = askItems(output, context, NAMES_DEFECT_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.5,
  });
}

// Was the single `restraint` llm-rubric, all-or-nothing (0 or 1, no partial
// credit) - kept that way here: one item, weight 1. Runs only on the two
// control cases (lexer.py, dialcodes.py), whose structure is already correct,
// so the right answer is to say nothing structural.
const RESTRAINT_ITEMS = `<Output> is a reply to a colleague showing
<SourceFile> for a quick look before committing. <SourceFile>'s structure
suits the problem as it stands - this is a control case, checking that the
answer does not manufacture a structural complaint where none belongs.

1. Does <Output> NOT ask for <SourceFile>'s structure to be changed - does it
   not say the function should be split, broken up, decomposed, flattened, or
   restructured; that repetition should be removed, extracted, parameterised,
   factored out, or generated; or that the file is too complex, too long, or
   too repetitive as it stands? A rewritten version that does any of those
   things holds this item false, whether or not the prose asks for it. Naming
   a bug, a correctness or edge-case concern, a question about behaviour, a
   rename, a comment or docstring point, a concern raised and then explicitly
   set aside as fine here, or an observation that the structure suits the
   problem, all leave this item holding true.`;

function restraint(output, context) {
  const { providerCfg, messages } = askItems(output, context, RESTRAINT_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 1.0 }), threshold: 1,
  });
}

module.exports = { namesDefect, restraint, judgeProvider, weighByItem, askItems };
