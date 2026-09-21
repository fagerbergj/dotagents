// Offline checks on the quote-verification and scoring rule. Never calls a
// judge - callJudge is exercised only by the suites that run for real tokens.
const assert = require('node:assert');
const { quoteHolds, verifyItems, parseJudge, scoreFromJudge } = require('./quoted-items.js');

// --- quoteHolds --------------------------------------------------------
assert.ok(quoteHolds('the guard is wrong', 'Reviewer: the guard is wrong here.'), 'a real substring holds');
assert.ok(quoteHolds('the   guard\nis wrong', 'the guard is wrong'), 'whitespace is normalised both sides');
assert.ok(!quoteHolds('the guard is fine', 'the guard is wrong'), 'a paraphrase does not hold');
assert.ok(quoteHolds('hostKeySuffix() fingerprints the struct', '**`hostKeySuffix()`** fingerprints the `struct`'), 'markdown marks do not break a real quote');
assert.ok(quoteHolds('has this fallback: ... if u.hostKey == ""', 'it has this fallback:\n```go\nfunc f() {\n if u.hostKey == "" {'), 'elided segments match in order');
assert.ok(!quoteHolds('second part ... first part', 'first part then second part'), 'elided segments out of order do not hold');
assert.ok(!quoteHolds('', 'anything'), 'an empty quote never holds');
assert.ok(!quoteHolds('x', ''), 'no text to check against never holds');

// --- verifyItems ---------------------------------------------------------
const texts = { default: 'Line A is fine. `foo` shadows the outer variable.' };
{
  const { verified, rejected } = verifyItems([
    { n: 1, quote: '`foo` shadows the outer variable', holds: true },
    { n: 2, quote: 'NONE', holds: false },
    { n: 3, quote: 'this text is not in the output', holds: true },
  ], texts);
  assert.equal(verified.length, 1, 'only the real, non-NONE quote verifies');
  assert.equal(verified[0].n, 1);
  assert.equal(rejected.length, 2);
  assert.equal(rejected.find((r) => r.item.n === 2).why, 'NONE');
  assert.match(rejected.find((r) => r.item.n === 3).why, /does not appear verbatim/);
}

// A per-item `source` picks which text a quote is checked against - e.g. a
// review's own words vs. the code appended beneath it.
{
  const multi = { default: 'the review text', code: 'func Foo() {}' };
  const { verified } = verifyItems([{ quote: 'func Foo', source: 'code' }], multi);
  assert.equal(verified.length, 1, 'source picks the right text to verify against');
}

// --- parseJudge ------------------------------------------------------------
assert.deepEqual(parseJudge('{"items":[{"n":1}]}'), { items: [{ n: 1 }] });
assert.deepEqual(parseJudge('```json\n{"items":[{"n":1}]}\n```'), { items: [{ n: 1 }] });
assert.deepEqual(parseJudge('[{"n":1}]'), { items: [{ n: 1 }] }, 'a bare array is accepted too');
assert.equal(parseJudge('I cannot answer in JSON.'), null, 'prose parses to null');
assert.equal(parseJudge(''), null, 'empty output parses to null');
assert.equal(parseJudge('{"reason": "x"}'), null, 'valid JSON with no items array still fails to parse as items');

// --- scoreFromJudge: the error/zero distinction -----------------------
{
  const err = scoreFromJudge('not json at all', texts, () => 1);
  assert.equal(err.score, 0);
  assert.equal(err.pass, false);
  assert.match(err.reason, /^did not parse:/, 'report.js\'s IS_ERROR pattern matches this exact prefix');
  assert.equal(err.metadata.graderError, true, 'a parse failure is flagged, distinct from a real zero');
}
{
  // The judge parsed fine and genuinely found nothing: a real zero, no
  // graderError flag.
  const zero = scoreFromJudge('{"items":[{"n":1,"quote":"NONE","holds":false}]}', texts, (v) => v.length ? 1 : 0);
  assert.equal(zero.score, 0);
  assert.equal(zero.metadata, undefined, 'a genuine zero carries no graderError');
}

// --- scoreFromJudge: caller-supplied scoring rule ---------------------
{
  const weighted = (verified) => {
    const w = { 1: 0.6, 2: 0.4 };
    return verified.filter((it) => it.holds).reduce((s, it) => s + (w[it.n] || 0), 0);
  };
  const raw = JSON.stringify({ items: [
    { n: 1, quote: '`foo` shadows the outer variable', holds: true },
    { n: 2, quote: 'NONE', holds: false },
  ] });
  const r = scoreFromJudge(raw, texts, weighted, { threshold: 0.5 });
  assert.equal(r.score, 0.6);
  assert.equal(r.pass, true);
  assert.match(r.reason, /1\/2 item\(s\) verified/);
  assert.match(r.reason, /verified.*holds=true/);
}
{
  // A quote that is real but a `holds: false` verdict never earns weight -
  // code verifies the quote is genuine, the judge still calls the substance.
  const weighted = (verified) => verified.filter((it) => it.holds).length ? 1 : 0;
  const raw = JSON.stringify({ items: [{ n: 1, quote: '`foo` shadows the outer variable', holds: false }] });
  const r = scoreFromJudge(raw, texts, weighted);
  assert.equal(r.score, 0, 'a verified-but-not-holding item scores nothing');
}

console.log('ok   quoted-items (quote verification, parsing, error/zero distinction, caller scoring rule)');
