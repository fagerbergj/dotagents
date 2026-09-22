// Shared rule for every judged metric moving onto it (dotagents#64): ask the
// judge narrow per-item questions, require a verbatim quote or NONE, verify
// each quote is really a substring of the text it claims to quote, and score
// from the verified items by a rule the CALLER supplies - never from the
// judge's own number. Two runs of the old llm-rubric arithmetic scored one
// unchanged metric 0.00 then 0.75, and flipped pass/fail on the same case
// about half the time - a judge writing "0.6 for item 1" in prose is not code
// checking anything.

const https = require('node:https');
const { URL } = require('node:url');

function normalize(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// Judges drop markdown marks and elide with "..."; match on the words, with
// every elided segment present in order. A paraphrase still fails.
function loose(s) {
  return normalize(String(s ?? '').replace(/\\n/g, '\n').replace(/[`*_~"'\u201c\u201d\u2018\u2019]/g, '').replace(/[\u2013\u2014]/g, '-')).toLowerCase();
}

function quoteHolds(quote, text) {
  const segs = loose(quote).split(/\.\.\.|\u2026/).map((x) => x.trim()).filter(Boolean);
  const t = loose(text);
  let at = 0;
  for (const seg of segs) {
    const i = t.indexOf(seg, at);
    if (i < 0) return false;
    at = i + seg.length;
  }
  return segs.length > 0;
}

// items: [{quote, ...}]. `texts` maps a name to a checkable text; an item with
// no `source` (or an unrecognised one) checks against texts.default.
// opts.absence: item numbers whose compliant answer is "nothing to quote". For those, NONE
// verifies as held (holds=true); a real quote is the violation and verifies as given.
// Without this, a clean answer scores 0 and the metric sits at the floor for both arms.
function verifyItems(items, texts, opts = {}) {
  const absence = new Set((opts.absence || []).map(String));
  const verified = [];
  const rejected = [];
  for (const item of items || []) {
    const raw = item && item.quote;
    if (raw == null || /^\s*NONE\s*$/i.test(String(raw))) {
      if (item && absence.has(String(item.n))) verified.push({ ...item, holds: item.holds !== false });
      else rejected.push({ item, why: 'NONE' });
      continue;
    }
    const text = (item && texts[item.source]) ?? texts.default;
    if (quoteHolds(raw, text)) verified.push(item);
    else rejected.push({ item, why: 'quote does not appear verbatim in the text' });
  }
  return { verified, rejected };
}

// Tolerates a fenced code block - json_object response_format is not
// universal across the judge models this harness has run.
function parseJudge(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  // A stray brace before the object ("{ {\"items\"...") has shown up with
  // reasoning on; the object itself starts at the brace right before "items".
  const at = body.indexOf('"items"');
  const inner = at > 0 ? body.slice(body.lastIndexOf('{', at), body.lastIndexOf('}') + 1) : body;
  for (const candidate of [body, inner]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { items: parsed };
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch { /* try the next shape */ }
  }
  return null;
}

// Verify + score an already-fetched judge answer. `score(verified, allItems)`
// is the caller's rule; it only ever sees items whose quote was real.
//
// A judge answer that will not parse is a harness failure, not a quality
// finding: it comes back with metadata.graderError and a reason starting
// "did not parse:" - report.js's own IS_ERROR pattern already matches that
// string - rather than a bare score of 0, which would be indistinguishable
// from "the judge checked every item and found nothing".
function scoreFromJudge(raw, texts, score, opts = {}) {
  const parsed = parseJudge(raw);
  if (!parsed) {
    return {
      pass: false,
      score: 0,
      reason: `did not parse: judge answer was not {"items":[...]} JSON. Raw: ${normalize(raw).slice(0, 300)}`,
      metadata: { graderError: true },
    };
  }
  const { verified, rejected } = verifyItems(parsed.items, texts, { absence: opts.absence });
  const value = score(verified, parsed.items || []);
  const threshold = opts.threshold ?? 0.5;
  const detail = (parsed.items || []).map((it, i) => {
    const ok = verified.some((v) => v === it || (v.n === it.n && v.quote === it.quote));
    const why = ok ? 'verified' : (rejected.find((r) => r.item === it) || {}).why || '?';
    return `${i + 1}. [${why}] ${JSON.stringify(String((it && it.quote) || '').slice(0, 140))}`
      + (it && typeof it.holds === 'boolean' ? ` holds=${it.holds}` : '');
  });
  return {
    pass: value >= threshold,
    score: value,
    reason: `${value.toFixed(2)}: ${verified.length}/${(parsed.items || []).length} item(s) verified.\n${detail.join('\n')}`,
  };
}

// One JSON POST, shaped like lib/skill-tools.js's own chat(): apiKeyEnvar
// names the key, never a literal; model/apiBaseUrl come from the provider
// config the suite already declares once, so a grader carries no copy of them.
// Constrained decoding: the provider enforces the shape, so a long quote or a
// stray brace cannot break the answer. maxLength keeps quotes checkable.
const ITEMS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'judged_items',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['n', 'quote', 'holds'],
            properties: {
              n: { type: 'integer' },
              quote: { type: 'string', maxLength: 300 },
              holds: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
};

function callJudge(providerCfg, messages) {
  const key = providerCfg.apiKeyEnvar ? process.env[providerCfg.apiKeyEnvar] : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`no API key in ${providerCfg.apiKeyEnvar || 'OPENAI_API_KEY'}`);
  const url = new URL(`${(providerCfg.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`);
  const body = JSON.stringify({
    model: providerCfg.model,
    messages,
    max_tokens: providerCfg.max_tokens,
    response_format: ITEMS_SCHEMA,
    ...(providerCfg.passthrough || {}),
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { return reject(new Error(`http ${res.statusCode}: ${data.slice(0, 200)}`)); }
        if (json.error) return reject(new Error(`api error: ${JSON.stringify(json.error).slice(0, 300)}`));
        const choice = json.choices?.[0] || {};
        const content = choice.message?.content ?? '';
        if (!content) return reject(new Error(`empty answer (finish_reason=${choice.finish_reason})`));
        resolve(choice.finish_reason === 'length' ? `${content}\n[truncated: finish_reason=length]` : content);
      });
    });
    req.setTimeout(180000, () => req.destroy(new Error('timeout after 180s')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Provider errors, empty answers and unparseable JSON are all transport noise
// from the eval's point of view: retry with backoff, then mark the row dead.
async function judgeWithRetry(providerCfg, messages, attempts = 3) {
  const errors = [];
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(1000 * 2 ** i);
    try {
      const raw = await callJudge(providerCfg, messages);
      if (parseJudge(raw)) return { raw };
      errors.push(`unparseable: ${normalize(raw).slice(0, 120)}`);
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { raw: '', errors };
}

// The system message every caller sends; says how absence items are answered.
const JSON_CONTRACT = 'You are grading output against a small numbered list of yes/no questions.'
  + ' For EVERY numbered item, answer with one object {"n": <item number>, "quote": <verbatim text'
  + ' copied from inside <Output> that decides this item, or the literal string "NONE" if nothing in'
  + ' <Output> decides it>, "holds": <true or false>}. Keep each quote to one sentence or line, at most'
  + ' 300 characters, never a code block. For an item phrased "does <Output> avoid ...": if <Output>'
  + ' contains an offending passage, quote it and answer holds=false; if it contains none, quote "NONE"'
  + ' and answer holds=true. A quote must be text that actually appears inside <Output> - copying other'
  + ' tags back, paraphrasing, or summarising is not a quote and is rejected before your "holds" verdict'
  + ' is read. Respond with exactly one JSON object: {"items": [...]}, one entry per numbered item, nothing else.';

// votes > 1 asks the judge k times and keeps the median-scoring answer: a
// borderline item that flips on one call is outvoted (Rating Roulette, 2025).
async function judgeQuotedItems({ providerCfg, messages, texts, score, threshold, absence, votes = 1 }) {
  const answers = await Promise.all(Array.from({ length: votes }, () => judgeWithRetry(providerCfg, messages)));
  const graded = answers.filter((a) => !a.errors).map((a) => scoreFromJudge(a.raw, texts, score, { threshold, absence }));
  if (!graded.length) {
    const errors = answers.flatMap((a) => a.errors || []);
    return { pass: false, score: 0, reason: `did not parse: judge failed ${errors.length} attempts: ${errors.join(' / ')}`, metadata: { graderError: true } };
  }
  graded.sort((a, b) => a.score - b.score);
  const pick = graded[Math.floor((graded.length - 1) / 2)];
  if (graded.length > 1) pick.reason = `votes=${graded.map((g) => g.score.toFixed(2)).join(',')} median kept.\n${pick.reason}`;
  return pick;
}

module.exports = { ITEMS_SCHEMA, JSON_CONTRACT, judgeWithRetry, normalize, quoteHolds, verifyItems, parseJudge, scoreFromJudge, callJudge, judgeQuotedItems };
