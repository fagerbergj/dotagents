// One function measures the answer and the input, so what is scored is the
// change and a bias in the counter cancels. Python only: counting decision-point
// keywords stands in for a CC parser, which is why slop.test.cjs pins it against
// the suite's real cases instead of trusting it.

const { fenceBlocks } = require('../../../lib/strip-reasoning.js');

const DECISION = /\b(?:if|elif|for|while|except|and|or|assert)\b/g;
const CLONE_RUN = 6;

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

function complexity(fn) {
  return 1 + (fn.lines.join('\n').match(DECISION) || []).length;
}

function maxComplexity(src) {
  const fns = pythonFunctions(src).map((fn) => ({ name: fn.name, cc: complexity(fn) }));
  return fns.reduce((worst, fn) => (fn.cc > worst.cc ? fn : worst), { name: '(none)', cc: 0 });
}

// Normalising drops comments and whitespace, so a reindented copy still reads
// as a copy.
function cloneRatio(src) {
  const lines = stripNoise(src)
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (lines.length < CLONE_RUN * 2) return { ratio: 0, cloned: 0, total: lines.length };
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
  return { ratio: cloned.size / lines.length, cloned: cloned.size, total: lines.length };
}

// Only fenced blocks that declare a function, so a shell transcript beside the
// rewrite is not measured as code.
function answerCode(output) {
  const blocks = [];
  for (const { body } of fenceBlocks(String(output), /^/)) {
    if (/^\s*(?:async\s+)?def\s+\w+\s*\(/m.test(body)) blocks.push(body);
  }
  return blocks.join('\n');
}

function maxCcReduced(output, context) {
  const code = answerCode(output);
  if (!code.trim()) return result(false, 'No function definition in the answer to measure.');
  const before = maxComplexity(context.vars.source);
  const after = maxComplexity(code);
  return result(
    after.cc < before.cc,
    `max CC ${before.cc} (${before.name}) -> ${after.cc} (${after.name})`,
  );
}

// Scored on the verbosity case only. As a standing target this rewards golfing,
// which is the same defect in the other direction.
function codeLinesReduced(output, context) {
  const code = answerCode(output);
  if (!code.trim()) return result(false, 'No function definition in the answer to measure.');
  const count = (src) => stripNoise(src).split('\n').filter((l) => l.trim()).length;
  const before = count(context.vars.source);
  const after = count(code);
  return result(after < before, `code lines ${before} -> ${after}`);
}

function cloneRatioReduced(output, context) {
  const code = answerCode(output);
  if (!code.trim()) return result(false, 'No function definition in the answer to measure.');
  const before = cloneRatio(context.vars.source);
  const after = cloneRatio(code);
  return result(
    after.ratio < before.ratio,
    `clone ratio ${before.ratio.toFixed(2)} (${before.cloned}/${before.total} lines) -> ` +
      `${after.ratio.toFixed(2)} (${after.cloned}/${after.total})`,
  );
}

module.exports = { maxCcReduced, cloneRatioReduced, codeLinesReduced, maxComplexity, cloneRatio, pythonFunctions, answerCode };
