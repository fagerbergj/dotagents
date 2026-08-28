const { spawnSync } = require('node:child_process');
const { unwrapFence } = require('../../../lib/strip-reasoning.js');
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

module.exports = {
  docstringOnFunctions,
  codePreserved,
  scan,
  firstFence,
};
