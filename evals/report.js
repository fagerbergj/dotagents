#!/usr/bin/env node
// Per-metric, per-arm table from a promptfoo results file. The aggregate pass
// rate is meaningless here: select-best fails every non-winning arm by design.
const fs = require('node:fs');

const file = process.argv[2];
const mdFlag = process.argv.indexOf('--md');
const mdPath = mdFlag > -1 ? process.argv[mdFlag + 1] : null;
if (!file) { console.error('usage: report.js <results.json> [--md <out.md>]'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(file, 'utf8')).results.results;

// Deterministic order: baseline first, then the arm under test. The delta is
// meaningless if the arms come back in whatever order the results happen to hold.
const ORDER = ['no-skill', 'skill-current', 'skill-next'];
const arms = [...new Set(rows.map((r) => r.prompt.label))]
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const metrics = [...new Set(rows.flatMap((r) => Object.keys(r.namedScores || {})))];
const cell = (arm, metric) => {
  const scores = rows.filter((r) => r.prompt.label === arm)
    .map((r) => r.namedScores?.[metric]).filter((v) => v !== undefined);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
};

// A grader that could not run is not a verdict, but promptfoo records a thrown
// assertion and a genuine 0 identically. These patterns are the graders' own
// throw messages plus the judge-extraction failures seen in real runs. Bare
// status words ("401", "Unauthorized") are deliberately absent: a rubric
// reasoning about an HTTP contract writes them in prose and flags clean rows.
const IS_ERROR = /^Error:|could not run|crashed twice|probe failed|emitted non-JSON|returned no JSON array|did not parse:|vision judge HTTP|no parsable score|Could not extract JSON|not in JSON format|^No output|API error|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed/i;
const errors = rows.flatMap((r) => (r.gradingResult?.componentResults ?? [])
  .filter((c) => IS_ERROR.test(String(c.reason || '')))
  .map((c) => ({
    arm: r.prompt.label,
    metric: c.assertion?.metric || c.assertion?.type || '?',
    reason: String(c.reason).replace(/\s+/g, ' ').slice(0, 140),
  })));

// A row that returned nothing records `namedScores: {}` and silently shrinks that
// arm's denominator - one baseline averaged a skill arm over 10 rows against the
// baseline's 11 without saying so. rollup.js runs this check when it stores a
// run; this is the same check for the live table.
const dropped = {};
for (const r of rows) if (!Object.keys(r.namedScores || {}).length) dropped[r.prompt.label] = (dropped[r.prompt.label] || 0) + 1;
const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
const droppedUneven = new Set(arms.map((a) => dropped[a] || 0)).size > 1;

const banners = [];
if (droppedTotal) banners.push({
  level: droppedUneven ? 'CAUTION' : 'WARNING',
  text: `${droppedTotal} row(s) produced no scores and are excluded${droppedUneven ? ', UNEVENLY' : ''}: `
    + arms.map((a) => `${a}=${dropped[a] || 0}`).join(' ')
    + (droppedUneven ? '. Arm means rest on different denominators - fix that before reading any delta.' : '.'),
});
if (errors.length) {
  const byMetric = {};
  for (const e of errors) ((byMetric[e.metric] ??= {})[e.arm] = (byMetric[e.metric][e.arm] || 0) + 1);
  banners.push({
    level: 'CAUTION',
    text: `${errors.length} grader row(s) ERRORED and are still averaged into the table: `
      + Object.entries(byMetric).map(([m, byArm]) => `${m} (${Object.entries(byArm).map(([a, n]) => `${a}=${n}`).join(' ')})`).join(', ')
      + '. A grader that could not run is not a verdict - re-run before reading those metrics.',
  });
}

// One row of the table, computed once so the console and the markdown cannot
// disagree about which deltas are real.
function metricRow(m) {
  const vals = arms.map((a) => cell(a, m));
  const base = vals[arms.indexOf('no-skill')] ?? vals[0];
  const test = vals[arms.indexOf('skill-current')] ?? vals[vals.length - 1];
  const rel = reliability(metricShape(m));
  // Shape, not delta, decides diagnostic: a metric only one arm scored is the
  // least trustworthy row in the table and must not sit among the solid ones.
  const diagnostic = rel.floor === Infinity;
  let delta = '', note = rel.note;
  if (base !== null && test !== null) {
    const d = test - base;
    delta = (d >= 0 ? '+' : '') + d.toFixed(2);
    if (diagnostic) { delta = `(${delta})`; }
    else if (Math.abs(d) < rel.floor) { note += ', no real change'; }
    if (base === test && (base === 1 || base === 0)) note = base === 1 ? 'ceiling both arms' : 'floor both arms';
  }
  const rep = repeatStats(m);
  if (rep) {
    // Measured noise beats any estimate from case count, so it replaces the band.
    note = `x${rep.depth} sd=${rep.sd.toFixed(3)} cell=${rep.cellSpread.toFixed(3)}`;
    if (Math.abs(test - base) < 2 * rep.sd) note += ' - WITHIN NOISE';
  }
  return { m, vals, delta, note, diagnostic, rep };
}


// How many distinct cases carry a metric, and whether a real computation or a
// judge produced it. Measured on comment-authoring with --repeat 5: a computed
// grader moved 0.000 across five identical runs; a judge on 9-11 cases moved
// sd 0.04-0.10; a judge on 2-3 cases moved sd 0.37 and swung +0.50 to -0.50.
// Delta noise falls as ~sqrt(2)*sd_cell/sqrt(n), so case count is the whole story.
const JUDGE = new Set(['llm-rubric', 'g-eval', 'select-best', 'model-graded-closedqa']);
const caseKey = (r) => (r.testCase?.description ?? JSON.stringify(r.vars ?? {})).slice(0, 120);

function metricShape(metric) {
  const cases = new Set(); let judged = false, computed = false;
  for (const r of rows) {
    if (r.namedScores?.[metric] === undefined) continue;
    cases.add(caseKey(r));
    for (const c of r.gradingResult?.componentResults ?? []) {
      if (c.assertion?.metric !== metric) continue;
      if (JUDGE.has(c.assertion?.type)) judged = true; else computed = true;
    }
  }
  return { n: cases.size, judged, computed };
}


// When a run carries repeats (--repeat N), the same (arm, case) appears more than
// once. That is the only way to see how much a delta moves on its own: measured on
// comment-authoring, a judge metric on 2 cases swung +0.50 to -0.50 across five
// identical runs while a computed one on 11 cases moved 0.000.
function repeatStats(metric) {
  const cell = new Map();
  for (const r of rows) {
    const v = r.namedScores?.[metric];
    if (v === undefined) continue;
    const k = r.prompt.label + '\u0000' + caseKey(r);
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(v);
  }
  const depth = Math.max(...[...cell.values()].map((a) => a.length), 0);
  if (depth < 2) return null;
  const spreads = [...cell.values()].filter((a) => a.length > 1).map((a) => Math.max(...a) - Math.min(...a));
  // Rebuild each repeat's arm means to get the delta that run would have reported.
  const deltas = [];
  for (let i = 0; i < depth; i++) {
    const armMean = (arm) => {
      const vals = [...cell.entries()]
        .filter(([k, a]) => k.startsWith(arm + '\u0000') && a[i] !== undefined)
        .map(([, a]) => a[i]);
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    };
    const b = armMean('no-skill'), t = armMean('skill-current');
    if (b !== null && t !== null) deltas.push(t - b);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = deltas.length > 1
    ? Math.sqrt(mean(deltas.map((d) => (d - mean(deltas)) ** 2)) * deltas.length / (deltas.length - 1))
    : 0;
  return {
    depth,
    cellSpread: spreads.length ? mean(spreads) : 0,
    deltas,
    sd,
  };
}

// The band a delta has to clear before it means anything.
function reliability({ n, judged }) {
  // Case count dominates, whichever kind of grader it is. A deterministic grader
  // is not a stable metric: `docstring_placement` is a regex and still swung a
  // full 1.00 across five identical runs, because the model attaches the
  // docstring on some runs and not others. Generation variance is the floor.
  // Spelled out rather than coded: a reader should not need a legend to know
  // that `n` is a case count, or what `computed` meant.
  const kind = judged ? 'llm-judge' : 'deterministic';
  if (n < 5) return { note: `only ${n} cases`, floor: Infinity };
  if (judged) return n >= 8 ? { note: `${n} cases, llm-judge`, floor: 0.10 }
                            : { note: `${n} cases, llm-judge, few`, floor: 0.20 };
  return { note: `${n} cases, ${kind}`, floor: 0.05 };
}

const caseCount = () => new Set(rows.map(caseKey)).size;
const pad = (s, n) => String(s).padEnd(n);
const w = Math.max(18, ...metrics.map((m) => m.length + 1));
console.log(`\n${caseCount()} cases, run ${arms.length} ways\n`);
for (const b of banners) console.error(`!! ${b.level}: ${b.text}\n`);
console.log(pad('metric', w) + arms.map((a) => pad(a, 16)).join('') + pad('change', 10) + 'detail');
console.log('-'.repeat(w + arms.length * 16 + 10 + 22));
const diagnostic = [];
for (const m of metrics) {
  const { vals, delta, note, rep, diagnostic: isDiag } = metricRow(m);
  if (isDiag && delta) diagnostic.push(m);
  console.log(pad(m, w) + vals.map((v) => pad(v === null ? '-' : v.toFixed(2), 16)).join('') + pad(delta, 10) + note);
  if (rep) console.log(pad('', w) + '  each run would have reported: ' + rep.deltas.map((d) => (d >= 0 ? '+' : '') + d.toFixed(2)).join('  '));
}
if (diagnostic.length) {
  console.log(`\nToo few cases to make a reliable determination: ${diagnostic.join(', ')}.`);
  console.log('Go and read the rows; do not read the number.');
}

// A cached row reports near-zero latency. Averaging it in would quietly wipe out
// the context-overhead signal, which is usually the clearest difference here.
const isCached = (r) => (r.tokenUsage?.cached || 0) > 0;
const cachedCount = (arm) => rows.filter((r) => r.prompt.label === arm && isCached(r)).length;
// select-best marks exactly one arm per test row as the winner and never writes
// a namedScore, so the comparative result is invisible unless counted directly.
const wins = (arm) => rows.filter((r) => r.prompt.label === arm
  && (r.gradingResult?.componentResults || []).some((c) => c.assertion?.type === 'select-best' && c.pass)).length;
const anySelectBest = rows.some((r) => (r.gradingResult?.componentResults || [])
  .some((c) => c.assertion?.type === 'select-best'));

const lat = (arm) => {
  const v = rows.filter((r) => r.prompt.label === arm && !isCached(r)).map((r) => r.latencyMs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length / 1000 : null;
};
const tok = (arm) => {
  const v = rows.filter((r) => r.prompt.label === arm).map((r) => r.tokenUsage?.total || 0);
  return v.reduce((a, b) => a + b, 0) / v.length;
};
if (anySelectBest) {
  const tests = new Set(rows.map((r) => r.testIdx)).size;
  console.log('\n' + pad('select-best wins', w) + arms.map((a) => pad(`${wins(a)}/${tests}`, 16)).join(''));
}
console.log(pad('latency (s avg)', w) + arms.map((a) => pad(lat(a) === null ? 'all cached' : lat(a).toFixed(1), 16)).join(''));
console.log(pad('cached rows', w) + arms.map((a) => pad(`${cachedCount(a)}/${rows.filter((r) => r.prompt.label === a).length}`, 16)).join(''));
console.log(pad('tokens (avg)', w) + arms.map((a) => pad(Math.round(tok(a)), 16)).join(''));

const worst = rows.filter((r) => (r.gradingResult?.componentResults || [])
  .some((c) => !c.pass && c.assertion?.type !== 'select-best'));
console.log(`\n${worst.length} of ${rows.length} rows scored below a check's bar. First few:`);
for (const r of worst.slice(0, 5)) {
  const f = r.gradingResult.componentResults.filter((c) => !c.pass && c.assertion?.type !== 'select-best');
  console.log(`  [${r.prompt.label}] ${r.testCase.description}\n    ${f.map((c) => `${c.assertion.type}: ${String(c.reason).slice(0, 110)}`).join('\n    ')}`);
}


// The raw results JSON is too big to keep in git; this distilled table is the
// durable baseline artifact, so "the skill got worse" stays a checkable claim.
if (mdPath) {
  const suite = require('node:path').basename(file).replace(/\.json$/, '');
  const md = [`# ${suite}`, '', `${caseCount()} cases, run ${arms.length} ways.`, ''];
  // Banners first, as GitHub alerts: a dropped-row or errored-grader warning
  // printed under the table is a warning nobody reads.
  for (const b of banners) md.push(`> [!${b.level}]`, `> ${b.text}`, '');
  // Reliable metrics in the table, diagnostic ones folded away. A DIAGNOSTIC
  // +0.50 shown beside a solid +0.20 is worse than no table at all.
  const head = [`| metric | ${arms.join(' | ')} | change | detail |`,
    `| --- | ${arms.map(() => '---').join(' | ')} | ---: | --- |`];
  const line = (r) => `| \`${r.m}\` | ${r.vals.map((v) => (v === null ? '-' : v.toFixed(2))).join(' | ')} | ${r.delta} | ${r.note} |`;
  const table = metrics.map(metricRow);
  const diag = table.filter((r) => r.diagnostic);
  md.push(...head, ...table.filter((r) => !r.diagnostic).map(line));
  if (anySelectBest) {
    const tests = new Set(rows.map((r) => r.testIdx)).size;
    md.push(`| **select-best wins** | ${arms.map((a) => `${wins(a)}/${tests}`).join(' | ')} | | |`);
  }
  md.push(`| latency (s avg) | ${arms.map((a) => (lat(a) === null ? 'all cached' : lat(a).toFixed(1))).join(' | ')} | | |`);
  md.push(`| tokens (avg) | ${arms.map((a) => Math.round(tok(a))).join(' | ')} | | |`);
  if (diag.length) {
    md.push('', `<details><summary>${diag.length} metric${diag.length === 1 ? ' has' : 's have'} too few cases to make a reliable determination</summary>`, '',
      ...head, ...diag.map(line), '',
      'Five identical runs of a metric this size produced changes from +0.50 to -0.50. Go and read the rows; do not read the number.',
      '</details>');
  }
  if (errors.length) {
    md.push('', `<details><summary>${errors.length} errored grader row(s)</summary>`, '');
    for (const e of errors.slice(0, 10)) md.push(`- **${e.arm}** / \`${e.metric}\`: ${e.reason}`);
    md.push('</details>');
  }
  // One row per failing check, skill arms first: a baseline row scoring badly is
  // the effect itself, so leading with those reads as breakage when it is signal.
  const plain = (label) => (label === 'no-skill' ? 'without skill' : label.startsWith('skill') ? 'with skill' : label);
  const failRows = [];
  for (const r of worst) {
    for (const c of r.gradingResult.componentResults.filter((x) => !x.pass)) {
      failRows.push({
        variant: plain(r.prompt.label),
        base: r.prompt.label === 'no-skill',
        desc: String(r.testCase.description || '').slice(0, 44),
        metric: c.assertion?.metric || c.assertion?.type,
        why: String(c.reason).replace(/\n/g, ' ').replace(/\|/g, '\\|').slice(0, 90),
      });
    }
  }
  failRows.sort((a, b) => Number(a.base) - Number(b.base));
  const withSkill = failRows.filter((f) => !f.base).length;
  const without = failRows.length - withSkill;
  if (failRows.length) {
    md.push('', `<details><summary>${withSkill} row(s) scored below par with the skill, ${without} without it</summary>`, '');
    md.push('Rows scoring below a check\'s bar. Rows without the skill are the effect rather than a problem, which is what a positive change looks like case by case.', '');
    md.push('| variant | case | check | why |', '| --- | --- | --- | --- |');
    for (const f of failRows.slice(0, 20)) md.push(`| ${f.variant} | ${f.desc} | \`${f.metric}\` | ${f.why} |`);
    if (failRows.length > 20) md.push('', `_${failRows.length - 20} more in the run artifacts._`);
    md.push('</details>');
  }
  fs.writeFileSync(mdPath, md.join('\n') + '\n');
  console.log(`wrote ${mdPath}`);
}
