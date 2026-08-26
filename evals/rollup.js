#!/usr/bin/env node
// Merge one eval run into a suite's artifact.
//   rollup.js <results.json> <model-label>
// Markdown is a view, never a store: results/<suite>.data.json holds the numbers,
// results/<suite>.md is regenerated from it so merging never parses a table.
const fs = require('node:fs');
const path = require('node:path');
const file = process.argv[2], model = process.argv[3];
if (!file || (!model && !file.endsWith('.csv'))) {
  console.error('usage: rollup.js <results.json> <model-label>   # merge a run\n       rollup.js <suite.csv>                  # re-render the table from the store');
  process.exit(2);
}
const renderOnly = file.endsWith('.csv');
// The profile is a human choice; the model is a fact in the results file. Deriving
// it means a run can never be mislabelled with the wrong model.
function modelLabel(profile, rows) {
  const id = rows.find((r) => r.provider?.id)?.provider?.id || '';
  const name = id.replace(/^[a-z]+:(chat|completion):/, '').split('/').pop();
  return name ? `${profile}:${name}` : profile;
}
const dir = path.dirname(file);
const [suite, version = 'unversioned'] = path.basename(file).replace(/\.(json|csv)$/, '').split('@');
const rows = renderOnly ? [] : JSON.parse(fs.readFileSync(file, 'utf8')).results.results;
const mode = (label) => (label === 'no-skill' ? 'no-skill' : `skill@${version}`);
// An error and a genuine zero are different facts. promptfoo records both
// as score 0, which is how a JSON-parse bug spent hours looking like a skill
// regression. Anything matching this is excluded from the mean and counted separately.
// A row that returned nothing records `namedScores: {}` and silently shrinks that
// arm's denominator - one baseline averaged a skill arm over 10 rows against the
// baseline's 11 without saying so. Shout instead.
function warnDroppedRows(rows) {
  const dropped = rows.filter((r) => !Object.keys(r.namedScores || {}).length);
  if (!dropped.length) return;
  const byArm = {};
  for (const r of dropped) byArm[r.prompt?.label || '?'] = (byArm[r.prompt?.label || '?'] || 0) + 1;
  const detail = Object.entries(byArm).map(([a, n]) => `${a}=${n}`).join(' ');
  console.error(`\n!! ${dropped.length} row(s) produced no scores and are excluded, UNEVENLY: ${detail}`);
  console.error('!! Arm means below rest on different denominators. Fix before reading any delta.\n');
}

const IS_ERROR = /not in JSON format|Could not extract JSON|API error|401|402|Unauthorized|Payment Required|ECONNRESET|ETIMEDOUT|failed to start|could not run|crashed|Invalid select-best verdict|No output/i;
const erroredMetrics = (r) => new Set((r.gradingResult?.componentResults || [])
  .filter((c) => IS_ERROR.test(String(c.reason || '')))
  .map((c) => c.assertion?.metric).filter(Boolean));
const pick = (label, fn) => rows.filter((r) => r.prompt.label === label).map(fn).filter((v) => v !== undefined);
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const tests = new Set(rows.map((r) => r.testIdx)).size;
warnDroppedRows(rows);
const hasSB = rows.some((r) => (r.gradingResult?.componentResults || []).some((c) => c.assertion?.type === 'select-best'));
const measured = {};
for (const label of [...new Set(rows.map((r) => r.prompt.label))]) {
  const m = {};
  let errCount = 0; const perMetricErr = {};
  for (const k of [...new Set(rows.flatMap((r) => Object.keys(r.namedScores || {})))]) {
    const vals = rows.filter((r) => r.prompt.label === label)
      .filter((r) => { const bad = erroredMetrics(r).has(k); if (bad) { errCount += 1; perMetricErr[k] = (perMetricErr[k] || 0) + 1; } return !bad; })
      .map((r) => r.namedScores?.[k]).filter((v) => v !== undefined);
    const v = mean(vals);
    if (v !== null) m[k] = Number(v.toFixed(4));
  }
  for (const [k, n] of Object.entries(perMetricErr)) m[`${k}!errors`] = n;
  const lat = pick(label, (r) => (r.tokenUsage?.cached ? undefined : r.latencyMs));
  const tok = pick(label, (r) => r.tokenUsage?.total);
  if (lat.length) { m['latency p50 (s)'] = Number((median(lat) / 1000).toFixed(1)); m['latency max (s)'] = Number((Math.max(...lat) / 1000).toFixed(1)); }
  if (tok.length) { m['tokens p50'] = Math.round(median(tok)); m['tokens total'] = tok.reduce((a, b) => a + b, 0); }
  if (hasSB) m['select-best wins'] = `${rows.filter((r) => r.prompt.label === label && (r.gradingResult?.componentResults || []).some((c) => c.assertion?.type === 'select-best' && c.pass)).length}/${tests}`;
  measured[mode(label)] = m;
}
// Long-format CSV: one measurement per line, so a regression is a one-line diff
// and the file loads straight into a spreadsheet or pandas. Markdown stays a view.
const label = renderOnly ? null : modelLabel(model, rows);
const store = renderOnly ? file : path.join(dir, `${suite}.csv`);

// Carried into the store so a published table can say how much each number is
// worth. Measured: a judge metric on 2 cases swung +0.50 to -0.50 across five
// identical runs; a computed one on 11 cases moved 0.000.
function shapeOf(metric) {
  const cell = new Map();
  for (const r of rows) {
    if (r.namedScores?.[metric] === undefined) continue;
    const c = (r.testCase?.description ?? JSON.stringify(r.vars ?? {})).slice(0, 120);
    const k = r.prompt.label + '\u0000' + c;
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(r.namedScores[metric]);
  }
  const cases = new Set([...cell.keys()].map((k) => k.split('\u0000')[1]));
  const depth = Math.max(...[...cell.values()].map((a) => a.length), 0);
  let sd = '';
  if (depth > 1) {
    const deltas = [];
    for (let i = 0; i < depth; i++) {
      const mean = (arm) => {
        const v = [...cell.entries()].filter(([k, a]) => k.startsWith(arm + '\u0000') && a[i] !== undefined).map(([, a]) => a[i]);
        return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
      };
      const b = mean('no-skill'), t = mean('skill-current');
      if (b !== null && t !== null) deltas.push(t - b);
    }
    if (deltas.length > 1) {
      const m = deltas.reduce((x, y) => x + y, 0) / deltas.length;
      sd = Math.sqrt(deltas.reduce((a, d) => a + (d - m) ** 2, 0) / (deltas.length - 1)).toFixed(3);
    }
  }
  return { n: cases.size, sd };
}

const key = (r) => `${r.model}\u0000${r.mode}\u0000${r.metric}`;
const rowsCsv = new Map();
if (fs.existsSync(store)) {
  for (const line of fs.readFileSync(store, 'utf8').trim().split('\n').slice(1)) {
    if (!line) continue;
    const [m, mo, met, val, n = '', sd = ''] = line.split(',').map((c) => c.replace(/^"|"$/g, ''));
    rowsCsv.set(key({ model: m, mode: mo, metric: met }), { model: m, mode: mo, metric: met, value: val, n, sd });
  }
}
if (!renderOnly) for (const [mo, mets] of Object.entries(measured))
  for (const [met, val] of Object.entries(mets))
    rowsCsv.set(key({ model: label, mode: mo, metric: met }), { model: label, mode: mo, metric: met, value: String(val), ...shapeOf(met) });
const sorted = [...rowsCsv.values()].sort((a, b) =>
  a.model.localeCompare(b.model) || a.metric.localeCompare(b.metric) || a.mode.localeCompare(b.mode));
const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
fs.writeFileSync(store, 'model,mode,metric,value,n,sd\n' + sorted.map((r) => [r.model, r.mode, r.metric, r.value, r.n ?? '', r.sd ?? ''].map((v) => q(String(v))).join(',')).join('\n') + '\n');
const data = {};
for (const r of sorted) ((data[r.model] ??= {})[r.mode] ??= {})[r.metric] = /^-?[\d.]+$/.test(r.value) ? Number(r.value) : r.value;
// ---- render ----
const NO_DELTA = new Set();  // counts and percentiles have meaningful deltas too
const models = Object.keys(data).sort();
const modes = ['no-skill', ...[...new Set(models.flatMap((m) => Object.keys(data[m])))].filter((x) => x !== 'no-skill').sort()];
const metrics = [...new Set(models.flatMap((m) => Object.values(data[m]).flatMap(Object.keys)))].filter((k) => !k.endsWith('!errors'))
  .sort((a, b) => (NO_DELTA.has(a) - NO_DELTA.has(b)) || a.localeCompare(b));
const head = ['model', 'metric', ...modes, 'Δ'];
const out = [`# ${suite}`, '',
  'Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.', '',
  `| ${head.join(' | ')} |`, `| ${head.map((_, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
for (const mdl of models) for (const met of metrics) {
  const isCount = met.includes('token') || met.includes('wins');
  const cells = modes.map((mo) => {
    const v = data[mdl][mo]?.[met];
    if (v === undefined) return '–';            // not run - never means zero
    return typeof v === 'number' ? (isCount ? String(v) : v.toFixed(2)) : v;
  });
  let d = '';
  if (!NO_DELTA.has(met)) {
    const aErr = data[mdl]['no-skill']?.[`${met}!errors`];
    const bErr = data[mdl][modes[modes.length - 1]]?.[`${met}!errors`];
    const a = aErr ? undefined : data[mdl]['no-skill']?.[met];
    const b = bErr ? undefined : data[mdl][modes[modes.length - 1]]?.[met];
    if (typeof a === 'number' && typeof b === 'number')
      d = (b - a >= 0 ? '+' : '−') + (isCount ? String(Math.round(Math.abs(b - a)))
            : met.startsWith('latency') ? Math.abs(b - a).toFixed(1)
            : Math.abs(b - a).toFixed(2));
  }
  out.push(`| ${mdl} | ${met} | ${cells.join(' | ')} | ${d} |`);
}
fs.writeFileSync(path.join(dir, `${suite}.md`), out.join('\n') + '\n');
const errs = Object.entries(measured).flatMap(([mo, m]) =>
  Object.entries(m).filter(([k]) => k.endsWith('!errors')).map(([k, n]) => `${mo}/${k.replace('!errors','')}: ${n}`));
if (errs.length) {
  console.error(`\n!! ${suite}: rows ERRORED and were excluded from the mean - fix and re-run before reading these numbers`);
  for (const e of errs) console.error(`   ${e}`);
  console.error('');
}
console.log(renderOnly ? `${suite}: re-rendered from ${path.basename(store)}` : `${suite}: merged ${label} (${Object.keys(measured).join(', ')})`);