// One function measures the answer and the input, so what is scored is the
// change and a bias in the counter cancels. Python only, and by regex rather
// than a parser, which is why slop.test.cjs pins every number against the
// suite's own cases instead of trusting it.
//
// Every number here falls when code is deleted, so each metric runs behind
// `measurable`: without it an answer that drops the work outscores one that
// leaves it alone, which is the opposite of what the suite is for.

const { fenceBlocks } = require('../../../lib/strip-reasoning.js');

const CLONE_RUN = 6;

// A data line carries a value and decides nothing. Control flow is what tells a
// repeated table apart from four repeated procedural blocks, which is the whole
// distinction `dataRegionLines` rests on.
const CONTROL = /\b(?:if|elif|else|for|while|try|except|finally|with|return|yield|raise|break|continue|def|class|lambda|match|import|assert|pass)\b/;
const LITERAL = /["']|\b\d|\b(?:None|True|False)\b/;
const BRACKETS_ONLY = /^[[\](){},:]+$/;

// Keywords are retained by any Python at all, so counting them would credit a
// deleted answer for the words it could not avoid.
const KEYWORDS = new Set(
  ('and as assert async await break class continue def del elif else except finally for from global if ' +
    'import in is lambda none nonlocal not or pass raise return true false try while with yield match case self')
    .split(' '),
);

// Below this share of the input's identifiers, too little of the work survives
// for a before/after comparison to mean anything. Set where a real rewrite of
// this suite's own cases clears it and a deletion or a cut-off file does not;
// both directions are pinned in slop.test.cjs.
const MIN_RETENTION = 0.5;

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

// Comments and string bodies hold English, which is full of "and", "or" and
// "if"; counting them would make a docstring look like branching.
function stripNoise(src) {
  return src
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/#[^\n]*/g, '');
}

// Each line belongs to the innermost `def` still open at its indent, so a
// nested helper's branches count against the helper, not its parent.
function pythonFunctions(src) {
  const lines = stripNoise(src).split('\n');
  const open = [];
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    while (open.length && indent <= open[open.length - 1].indent) out.push(open.pop());
    const def = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
    if (def) {
      open.push({ name: def[1], indent, lines: [] });
      continue;
    }
    if (open.length) open[open.length - 1].lines.push(line);
  }
  return out.concat(open.reverse());
}

function identifiers(src) {
  const found = new Set();
  for (const m of stripNoise(src).matchAll(/[A-Za-z_]\w*/g)) {
    const word = m[0].toLowerCase();
    if (!KEYWORDS.has(word)) found.add(word);
  }
  return found;
}

function retention(source, code) {
  const before = identifiers(source);
  if (!before.size) return 1;
  const after = identifiers(code);
  let kept = 0;
  for (const name of before) if (after.has(name)) kept++;
  return kept / before.size;
}

// A literal table: data lines, no control flow. Uniform entries are exact
// copies of each other once normalised, so counting them makes collapsing four
// repeated blocks into one table read as more duplicated than the blocks it
// replaced.
function dataRegionLines(lines) {
  const isData = lines.map((l) => !CONTROL.test(l) && (LITERAL.test(l) || BRACKETS_ONLY.test(l)));
  const region = new Set();
  let run = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i < lines.length && isData[i]) {
      run++;
      continue;
    }
    if (run >= CLONE_RUN) for (let k = i - run; k < i; k++) region.add(k);
    run = 0;
  }
  return region;
}

// Comments and whitespace only: blanking string literals the way the single-use
// counter does collapses a table of data into one repeated line. Literals kept
// means exact copies, which is what a clone line is.
function normalisedLines(src) {
  return src
    .replace(/#[^\n]*/g, '')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function cloneRatio(src) {
  const all = normalisedLines(src);
  const region = dataRegionLines(all);
  const lines = all.filter((_, i) => !region.has(i));
  const runs = new Map();
  for (let i = 0; i + CLONE_RUN <= lines.length; i++) {
    const key = lines.slice(i, i + CLONE_RUN).join('\n');
    (runs.get(key) || runs.set(key, []).get(key)).push(i);
  }
  const cloned = new Set();
  for (const starts of runs.values()) {
    if (starts.length < 2) continue;
    for (const start of starts) for (let k = 0; k < CLONE_RUN; k++) cloned.add(start + k);
  }
  return { ratio: lines.length ? cloned.size / lines.length : 0, cloned: cloned.size, total: lines.length };
}

// A name assigned once and read exactly once after: the padding Listing 2 is
// about. Counted per function, so a module constant is not one.
function singleUseVars(src) {
  let count = 0;
  for (const fn of pythonFunctions(src)) {
    const body = fn.lines.join('\n');
    const assigned = [...body.matchAll(/^\s*([A-Za-z_]\w*)\s*=(?!=)/gm)].map((m) => m[1]);
    for (const name of new Set(assigned)) {
      const assigns = assigned.filter((a) => a === name).length;
      const uses = (body.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
      if (assigns === 1 && uses === 2) count++;
    }
  }
  return count;
}

// Only fenced blocks that declare a function, so a shell transcript beside the
// rewrite is not measured as code - and one copy of each distinct block, last
// one wins. A model that emits its rewrite twice is repeating a fence, not
// proposing duplicated code, and concatenating both made the clone metric
// measure the presentation instead of the answer.
function answerCode(output) {
  const byContent = new Map();
  for (const { body } of fenceBlocks(String(output), /^/)) {
    if (!/^\s*(?:async\s+)?def\s+\w+\s*\(/m.test(body)) continue;
    byContent.set(normalisedLines(body).join('\n'), body);
  }
  return [...byContent.values()].join('\n');
}

// The floor every metric sits behind: an answer with no code, or one that kept
// too little of the file, is scored on that rather than on a delta it won by
// shrinking the denominator.
function measurable(output, context) {
  const code = answerCode(output);
  if (!code.trim()) return { fail: result(false, 'No function definition in the answer to measure.') };
  const kept = retention(context.vars.source, code);
  if (kept < MIN_RETENTION) {
    return {
      fail: result(
        false,
        `Answer keeps ${(kept * 100).toFixed(0)}% of the file's identifiers - too little survives to compare.`,
      ),
    };
  }
  return { code, kept };
}

// Both the share and the count have to fall. The share alone is bought by
// padding the answer with unique lines, which removes no duplication.
function cloneRatioReduced(output, context) {
  const { code, fail } = measurable(output, context);
  if (fail) return fail;
  const before = cloneRatio(context.vars.source);
  const after = cloneRatio(code);
  return result(
    after.ratio < before.ratio && after.cloned < before.cloned,
    `clone ratio ${before.ratio.toFixed(2)} (${before.cloned}/${before.total} lines) -> ` +
      `${after.ratio.toFixed(2)} (${after.cloned}/${after.total})`,
  );
}

// Counted rather than measured in lines: a line-count target pays for golfing,
// which is the same defect facing the other way.
function singleUseVarsReduced(output, context) {
  const { code, fail } = measurable(output, context);
  if (fail) return fail;
  const before = singleUseVars(context.vars.source);
  const after = singleUseVars(code);
  return result(after < before, `single-use variables ${before} -> ${after}`);
}

module.exports = {
  cloneRatioReduced,
  singleUseVarsReduced,
  cloneRatio,
  dataRegionLines,
  normalisedLines,
  singleUseVars,
  pythonFunctions,
  answerCode,
  retention,
  MIN_RETENTION,
};
