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

// Whitespace-normalised substring match. A reflowed paragraph should not lose
// an otherwise-real quote; text the judge never points at never counts.
function quoteHolds(quote, text) {
  const q = normalize(quote);
  return Boolean(q) && normalize(text).includes(q);
}

// items: [{quote, ...}]. `texts` maps a name to a checkable text; an item with
// no `source` (or an unrecognised one) checks against texts.default.
function verifyItems(items, texts) {
  const verified = [];
  const rejected = [];
  for (const item of items || []) {
    const raw = item && item.quote;
    if (raw == null || /^\s*NONE\s*$/i.test(String(raw))) { rejected.push({ item, why: 'NONE' }); continue; }
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
  try {
    const parsed = JSON.parse(fenced ? fenced[1] : text);
    if (Array.isArray(parsed)) return { items: parsed };
    if (parsed && Array.isArray(parsed.items)) return parsed;
    return null;
  } catch {
    return null;
  }
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
  const { verified, rejected } = verifyItems(parsed.items, texts);
  const value = score(verified, parsed.items || []);
  const threshold = opts.threshold ?? 0.5;
  const detail = (parsed.items || []).map((it, i) => {
    const ok = verified.includes(it);
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
function callJudge(providerCfg, messages) {
  const key = providerCfg.apiKeyEnvar ? process.env[providerCfg.apiKeyEnvar] : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`no API key in ${providerCfg.apiKeyEnvar || 'OPENAI_API_KEY'}`);
  const url = new URL(`${(providerCfg.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`);
  const body = JSON.stringify({
    model: providerCfg.model,
    messages,
    max_tokens: providerCfg.max_tokens,
    response_format: providerCfg.response_format,
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
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`api error: ${JSON.stringify(json.error).slice(0, 300)}`));
          resolve(json.choices?.[0]?.message?.content ?? '');
        } catch {
          reject(new Error(`unparseable response: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// End-to-end assertion helper: ask, verify, score. `providerCfg` should be read
// straight off `context.test.options.provider` by the caller, so the judge
// model lives in exactly one place in the suite's YAML.
async function judgeQuotedItems({ providerCfg, messages, texts, score, threshold }) {
  const raw = await callJudge(providerCfg, messages);
  return scoreFromJudge(raw, texts, score, { threshold });
}

module.exports = { normalize, quoteHolds, verifyItems, parseJudge, scoreFromJudge, callJudge, judgeQuotedItems };
