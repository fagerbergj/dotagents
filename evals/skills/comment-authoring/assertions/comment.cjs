const { spawnSync } = require('node:child_process');
const { unwrapFence } = require('../../../lib/strip-reasoning.js');
const { judgeQuotedItems, JSON_CONTRACT } = require('../../../lib/quoted-items.js');
'use strict';

// Two graders that genuinely compute, against the case's own input var:
//   codePreserved     - strip comments from input and output, compare the code.
//   docstringOnFunctions - ask Python's own parser where the docstrings landed.
// Whether a comment says anything is a meaning question, not a token question:
// a judge owns it. See the note at the bottom of this file.

function result(pass, reason, score) {
  return { pass, score: score === undefined ? (pass ? 1 : 0) : score, reason };
}

function config(context) {
  return (context && context.config) || {};
}

function testVars(context) {
  return (context && context.vars) || {};
}

// Depth-tracking, not a non-greedy regex: an answer whose code block contains a
// fence of its own was cut at the inner fence and only the fragment was graded.
function firstFence(output) {
  const block = unwrapFence(String(output || ''), /^[A-Za-z0-9_+#.-]*$/);
  return block === null ? '' : block;
}

// ---------------------------------------------------------------------------
// Comment scanners. Each returns the source with comment bodies removed (line
// numbering preserved) plus the comments it found.
// ---------------------------------------------------------------------------

function consumeQuoted(src, index, quote) {
  let cursor = index + 1;
  while (cursor < src.length) {
    if (src[cursor] === '\\') { cursor += 2; continue; }
    if (src[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

// A Go raw string has no escape sequences at all, so `C:\` is a complete
// literal. Applying the backslash rule here swallowed the rest of the file.
function consumeRawString(src, index) {
  const close = src.indexOf('`', index + 1);
  return close < 0 ? src.length : close + 1;
}

// A JS template literal nests: the `}` that closes a ${} may be followed by
// more template text, and that text may open another template. Pairing
// backticks positionally misreads the middle segment as code.
function consumeTemplate(src, index) {
  let cursor = index + 1;
  while (cursor < src.length) {
    const ch = src[cursor];
    if (ch === '\\') { cursor += 2; continue; }
    if (ch === '`') return cursor + 1;
    if (ch === '$' && src[cursor + 1] === '{') { cursor = consumeInterpolation(src, cursor + 1); continue; }
    cursor += 1;
  }
  return cursor;
}

function consumeInterpolation(src, index) {
  let depth = 0;
  let cursor = index;
  while (cursor < src.length) {
    const ch = src[cursor];
    if (ch === '{') { depth += 1; cursor += 1; continue; }
    if (ch === '}') { depth -= 1; cursor += 1; if (depth <= 0) return cursor; continue; }
    if (ch === '"' || ch === "'") { cursor = consumeQuoted(src, cursor, ch); continue; }
    if (ch === '`') { cursor = consumeTemplate(src, cursor); continue; }
    cursor += 1;
  }
  return cursor;
}

// A '/' starts a regex literal only where a value may begin; otherwise it is
// division and must not swallow the rest of the line.
function regexCanStart(codeSoFar) {
  return /(^|[(,=:[!&|?{};+\-*%~^]|\breturn|\bcase|\btypeof|\bin|\bof)\s*$/.test(codeSoFar.slice(-12));
}

function consumeRegex(src, index) {
  let cursor = index + 1;
  let inClass = false;
  while (cursor < src.length) {
    const ch = src[cursor];
    if (ch === '\\') { cursor += 2; continue; }
    if (ch === '\n') return index + 1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function newlines(text) {
  return (text.match(/\n/g) || []).length;
}

function stripStars(body) {
  return body.split(/\r?\n/).map((line) => line.replace(/^\s*\*+/, '')).join('\n');
}

function scanCLike(src, scripted) {
  const comments = [];
  let code = '';
  let index = 0;
  let line = 1;
  const atLineStart = () => !/\S/.test(code.slice(code.lastIndexOf('\n') + 1));
  const keep = (end) => {
    const chunk = src.slice(index, end);
    code += chunk;
    line += newlines(chunk);
    index = end;
  };
  while (index < src.length) {
    const ch = src[index];
    const next = src[index + 1];
    if (ch === '/' && next === '/') {
      let end = src.indexOf('\n', index);
      if (end < 0) end = src.length;
      comments.push({ text: src.slice(index + 2, end), startLine: line, endLine: line, trailing: !atLineStart(), lineComment: true });
      index = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = src.indexOf('*/', index + 2);
      const body = src.slice(index + 2, close < 0 ? src.length : close);
      const span = newlines(body);
      comments.push({ text: stripStars(body), startLine: line, endLine: line + span, trailing: !atLineStart(), lineComment: false });
      code += '\n'.repeat(span);
      line += span;
      index = close < 0 ? src.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'") { keep(consumeQuoted(src, index, ch)); continue; }
    if (ch === '`') { keep(scripted ? consumeTemplate(src, index) : consumeRawString(src, index)); continue; }
    if (scripted && ch === '/' && regexCanStart(code)) { keep(consumeRegex(src, index)); continue; }
    if (ch === '\n') line += 1;
    code += ch;
    index += 1;
  }
  return { code, comments };
}

function scanPython(src) {
  const comments = [];
  let code = '';
  let index = 0;
  let line = 1;
  const atLineStart = () => !/\S/.test(code.slice(code.lastIndexOf('\n') + 1));
  while (index < src.length) {
    const ch = src[index];
    if (ch === '#') {
      let end = src.indexOf('\n', index);
      if (end < 0) end = src.length;
      comments.push({ text: src.slice(index + 1, end), startLine: line, endLine: line, trailing: !atLineStart(), lineComment: true });
      index = end;
      continue;
    }
    const triple = src.startsWith('"""', index) ? '"""' : src.startsWith("'''", index) ? "'''" : null;
    if (triple) {
      const close = src.indexOf(triple, index + 3);
      const body = src.slice(index + 3, close < 0 ? src.length : close);
      const span = newlines(body);
      const end = close < 0 ? src.length : close + 3;
      if (atLineStart()) {
        // A triple-quoted string standing alone as a statement is a docstring.
        comments.push({ text: body, startLine: line, endLine: line + span, trailing: false, lineComment: false });
        code += '\n'.repeat(span);
      } else {
        code += src.slice(index, end);
      }
      line += span;
      index = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = consumeQuoted(src, index, ch);
      const chunk = src.slice(index, end);
      code += chunk;
      line += newlines(chunk);
      index = end;
      continue;
    }
    if (ch === '\n') line += 1;
    code += ch;
    index += 1;
  }
  return { code, comments };
}

// Consecutive line comments are one comment: a godoc or a multi-line `//`
// block is a single statement, not one comment per line.
function mergeRuns(comments) {
  const merged = [];
  for (const comment of comments) {
    const last = merged[merged.length - 1];
    if (last && last.lineComment && comment.lineComment && !last.trailing && !comment.trailing && comment.startLine === last.endLine + 1) {
      last.text += `\n${comment.text}`;
      last.endLine = comment.endLine;
      continue;
    }
    merged.push({ ...comment });
  }
  return merged;
}

function scan(src, lang) {
  const name = String(lang || '').toLowerCase();
  const scanned = name === 'python' || name === 'py'
    ? scanPython(String(src || ''))
    : scanCLike(String(src || ''), /^(ts|tsx|js|jsx|typescript|javascript)$/.test(name));
  return { code: scanned.code, comments: mergeRuns(scanned.comments) };
}

function normalizeCode(code) {
  return code
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 1. Code preservation. A commenting task must not rewrite the code.
// ---------------------------------------------------------------------------

function codePreserved(output, context) {
  const { code, lang } = testVars(context);
  const block = firstFence(output);
  if (!block.trim()) return result(false, 'No fenced code block in the output, so the code could not be compared.');
  const before = normalizeCode(scan(code, lang).code).split('\n');
  const after = normalizeCode(scan(block, lang).code).split('\n');
  for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
    if (before[i] === after[i]) continue;
    return result(false, `Code changed at code-line ${i + 1}: expected ${JSON.stringify(before[i] || '(nothing)')}, got ${JSON.stringify(after[i] || '(nothing)')}.`);
  }
  return result(true, `Code is unchanged: ${before.length} code lines identical after removing comments and whitespace.`);
}

// A comment-counting grader (commentBudget, plus the addedComments helper it
// used) lived here. It was merged into the restraint rubric: a ceiling on how
// many comments were added and a judge asking whether they earned their place
// are the same question from two directions, and both rode the same two cases.
// One metric on five cases beats two on two.

// A word-overlap narration detector lived here and was removed: it scored a
// comment against the identifiers beside it, so it passed narration written in
// synonyms ("bumps the request tally" over `c.hits++`) and failed real
// invariants that have only one vocabulary ("retry only if GET, HEAD, or
// idempotent"). Its verb list was a keyword list standing in for a stance.

// Python docstring placement, decided by Python's own parser. A regex cannot do
// this: `def search(` here spans seven lines, so any `def name\([^\n]*` form can
// never reach the closing quotes and fails whatever the model wrote.
function docstringOnFunctions(output, context) {
  const names = (context && context.config && context.config.functions) || [];
  const code = firstFence(String(output)) || String(output);
  const probe = `
import ast, json, sys
src = sys.stdin.read()
try:
    tree = ast.parse(src)
except SyntaxError as e:
    print(json.dumps({"error": f"python could not parse the answer: {e}"})); raise SystemExit(0)
found = {}
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        found[node.name] = ast.get_docstring(node) is not None
print(json.dumps({"found": found}))
`;
  const run = spawnSync('python3', ['-c', probe], { input: code, encoding: 'utf8', timeout: 30000 });
  if (run.error) throw new Error(`python3 could not run: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`docstring probe failed: ${String(run.stderr).slice(0, 200)}`);
  let parsed;
  try { parsed = JSON.parse(run.stdout); } catch { throw new Error(`docstring probe emitted non-JSON: ${run.stdout.slice(0, 200)}`); }
  if (parsed.error) return result(false, parsed.error);
  const missing = names.filter((n) => !parsed.found[n]);
  const absent = names.filter((n) => !(n in parsed.found));
  if (absent.length) return result(false, `Function(s) not found in the answer: ${absent.join(', ')}.`);
  return missing.length
    ? result(false, `No docstring on: ${missing.join(', ')} (only the first statement becomes __doc__).`)
    : result(true, `Docstring present on ${names.join(', ')}.`);
}

// ---------------------------------------------------------------------------
// dotagents#64/#65 (evals/AGENTS.md): four llm-rubric metrics moved off their
// own enumerate-and-divide arithmetic (K/N, 1-(U/D)) here - a judge writing
// "K=3, N=5" in prose is not code checking anything, and this suite's own
// three-band predecessor showed a 0.568 per-cell spread over five identical
// runs. Each metric below asks a small numbered list of yes/no items and
// requires a verbatim quote or NONE; judgeQuotedItems verifies the quote is
// real before scoring, and weighByItem - not the judge - computes the number.
// review-code/assertions/review.cjs is the worked example this follows.

function judgeProvider(context) {
  const p = (context && context.test && context.test.options && context.test.options.provider) || {};
  const model = String(p.id || '').replace(/^openai:chat:/, '') || (p.config && p.config.model);
  return { model, ...(p.config || {}) };
}

// weights: {1: 0.6, 2: 0.4, ...}. Only a verified quote whose "holds" is true
// earns its item's weight. Multiple answers sharing a number - one per added
// comment - earn that weight once, and only when every one of them holds.
function weighByItem(weights) {
  return (verified) => Object.keys(weights).reduce((sum, n) => {
    const answers = verified.filter((it) => String(it.n) === n);
    return sum + (answers.length && answers.every((it) => it.holds) ? weights[n] : 0);
  }, 0);
}

// extraXml goes before <Output> - the case's own request and/or pre-comment
// source, for the metrics that need context the delivered file alone does not
// carry (restraint, fact_transfer).
function askItems(output, context, itemsPrompt, extraXml = '') {
  const providerCfg = judgeProvider(context);
  const messages = [
    { role: 'system', content: JSON_CONTRACT },
    { role: 'user', content: `${extraXml}<Output>${output}</Output>\n\n${itemsPrompt}` },
  ];
  return { providerCfg, messages };
}

// Was the K/N half of `not_narration`: "List every comment... K be the number
// answered with a quoted constraint... Score K/N." Recast as two holistic
// items rather than a per-comment tally, matching review-code's item design -
// presence (is there at least one substantive comment) plus a majority
// judgement over the reply as a whole.
const NOT_NARRATION_ITEMS = `<Output> is a reply to a request to add comments
to a file; judge only the comments it added, never their placement, length,
syntax or punctuation. Google's C++ style guide, under "Don'ts": "Do not
state the obvious. In particular, don't literally describe what code does,
unless the behavior is nonobvious to a reader who understands [the language]
well." A comment a competent reader could already infer from the identifiers
and statements it sits beside is narration; a comment that states a
constraint, cause, contract, or consequence is not.

1. Does <Output> add at least one comment that states such a constraint,
   cause, contract, or consequence - quoted verbatim?
2. Judging the comments <Output> added as a whole, do more of them state a
   constraint, cause, contract, or consequence than merely restate what the
   code already shows?`;

function notNarration(output, context) {
  const { providerCfg, messages } = askItems(output, context, NOT_NARRATION_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.6, 2: 0.4 }), threshold: 0.5, votes: 3,
  });
}

// Was the F half of `not_narration`, split out (dotagents#64 note in
// tests/cases.yaml): a false comment and an obvious one are different
// defects, so they are reported separately rather than netted into one
// number. Single item, no partial credit - one wrong statement is the
// failure, same as the original "1 if F is 0, else 0".
const NO_FALSE_COMMENTS_ITEMS = `<Output> is a reply to a request to add
comments to a file; judge only the comments it added.

1. Is every comment <Output> added true of the code it sits beside - none of
   them names a function, field, parameter, error, or branch that is not
   there, states a condition the code does not test, describes behaviour the
   code does not have, or attributes the code to a cause or standard that
   does not apply to it? A claim you cannot check against the code shown, and
   a judgement call you would argue with, both hold this item; only a claim
   the code shown contradicts fails it.`;

function noFalseComments(output, context) {
  const { providerCfg, messages } = askItems(output, context, NO_FALSE_COMMENTS_ITEMS);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 1 }), threshold: 1, absence: [1], votes: 3,
  });
}

// Was `restraint`'s D-declarations / U-wasted arithmetic. Needs the pre-
// comment source and the request, which the delivered file alone does not
// carry - extraXml puts them ahead of <Output>. Two items instead of a
// count: no off-topic comment (a reply to the requester, a task note, text
// copied from the request), and every comment added - if any - earns its
// place. "Adding no comments at all" still satisfies item 2 exactly as the
// original scored that case 1.
const RESTRAINT_ITEMS = `<SourceFile> is this file before any comments;
<Request> is what the requester asked for; every comment in <Output> is one
the reply added. Google's style guide: "Do not state the obvious... Self-
describing code doesn't need a comment." Judge only what a comment says,
never its placement, length, syntax or punctuation.

1. Does <Output> avoid adding any comment that is off-topic - a reply to the
   requester, a note about the task, or text copied from <Request> - rather
   than about the code it sits beside?
2. Does every comment <Output> added, if any, carry an assumption,
   constraint, or consequence a competent reader could not already infer
   from the code beside it, rather than merely restate what the code already
   shows? Adding no comments at all also satisfies this item.`;

function restraint(output, context) {
  const { code, ask } = (context && context.vars) || {};
  const extraXml = `<Request>${ask}</Request>\n<SourceFile>${code}</SourceFile>\n`;
  const { providerCfg, messages } = askItems(output, context, RESTRAINT_ITEMS, extraXml);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.5, 2: 0.5 }), threshold: 0.5, absence: [1, 2],
  });
}

// Was `fact_transfer`'s "award 0.25 per fact carried, 0.125 per half"
// (judge-computed arithmetic over prose facts it wrote itself). The half-
// credit case dropped: each fact is now one yes/no item, full credit or
// none, same as every other metric here. The facts themselves stay
// case-specific - `context.vars.facts`, a block of "Do the comments state
// that ...?" questions written in tests/cases.yaml - because unlike the
// other three metrics here, what counts as fact_transfer's evidence differs
// per case. Threshold 0.6 keeps the same practical bar as the original: at
// 0.25 per item, three of four facts (0.75) passes and two (0.50) does not,
// matching the "majority of the facts, not just some" the 0.6 threshold on
// the old proportion scale meant.
function factTransfer(output, context) {
  const { ask, facts } = (context && context.vars) || {};
  const itemsPrompt = `<Output> is a reply to a request to add comments to a
file; <Request> is what the requester asked for. Judge only whether the
comments <Output> added state each fact below - match on meaning, not
wording: a paraphrase that carries the same claim counts in full. A block of
comment text that reproduces <Request> as a passage, rather than saying
something about the declaration it sits on, does not carry a fact.

${facts}`;
  const { providerCfg, messages } = askItems(output, context, itemsPrompt, `<Request>${ask}</Request>\n`);
  return judgeQuotedItems({
    providerCfg, messages, texts: { default: output },
    score: weighByItem({ 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 }), threshold: 0.6, votes: 5,
  });
}

module.exports = {
  docstringOnFunctions,
  codePreserved,
  scan,
  firstFence,
  judgeProvider,
  weighByItem,
  askItems,
  notNarration,
  noFalseComments,
  restraint,
  factTransfer,
};
