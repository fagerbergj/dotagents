const fs = require('node:fs');
const path = require('node:path');
const { specs, paths } = require('../../../lib/fixtures.js');

// Two graders that need real computation. Everything else a promptfoo native
// assertion already does (llm-rubric for judgement, latency for the overhead of
// loading the skill at all).

// A word is anything with a letter or digit in it, so `--race` and `#1042`
// count once and markdown punctuation does not inflate the length.
function words(text) {
  return String(text).split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token)).length;
}

function config(context) {
  return context?.config || {};
}

// Ceiling only: a template dumped on a one-line diff is an observed failure, so
// the upper bound earns its place. There is no floor - no published standard
// endorses a minimum length (Google's CL-descriptions asks small CLs for "a
// little attention to detail", the kernel asks a one-liner to describe its
// problem), and brevity that is correct is the judges' call, not arithmetic.
// The ceiling is house-calibrated, not derived from anything external.
function proportionateLength(output, context) {
  const { maxWords } = config(context);
  if (!maxWords) throw new Error('proportionateLength needs config.maxWords');
  const count = words(output);
  if (count > maxWords) {
    return { pass: false, score: maxWords / count, reason: `${count} words against a ceiling of ${maxWords} - overwritten for its size.` };
  }
  return { pass: true, score: 1, reason: `${count} words, at or under the ${maxWords} ceiling for this size.` };
}

// Anything shaped like a path or a code identifier: a slash, a dot-extension,
// snake_case, camelCase, or a call. Bare prose words are deliberately not
// candidates, and neither is anything without a letter (`./...`, `11.12.0`).
const IDENTIFIER = /^(?:[\w.@-]*\/[\w./@-]+|[\w-]+\.(?:go|ts|tsx|js|mjs|cjs|json|ya?ml|md|sh|py|kt|sql|toml)|\w+_\w+|[a-z]+[A-Z]\w*)$/;

// Backticking something is a claim that it is code, so a backticked span also
// counts as an identifier when it is PascalCase - `MsgForwarded`, `ChatTurn`.
// Unbackticked prose is not held to that, or every "GitHub" would be a finding.
const PASCAL = /^[A-Z][a-z0-9]+[A-Z]\w*$/;

// node_modules is the one name that satisfies IDENTIFIER (via snake_case) while
// naming the toolchain rather than the change. package.json needs no exemption:
// a diff that touches it puts it in the haystack, and a diff that does not has
// no business being described as touching it.
const TOOLCHAIN = new Set(['node_modules']);

// `remove/delete`, `Normal/Locked`, `PageScrollUp/Down`, `up/down/to-bottom`,
// `/absolute/path/to/haystack`: a slash form joining plain words is prose or an
// illustrative placeholder, whatever its capitalisation and however many
// hyphens it carries. It only counts as a path when some segment carries an
// extension, a digit, an underscore, or a dot. Six of the seven zeros this
// grader scored on the stored run were this: one capital or one hyphen turned
// an ordinary English list into a "fabricated path".
//
// The ceiling that buys: a hyphenated extensionless real path (`cmd/pi-acp/run`)
// invented out of thin air now reads as prose. Prose lists are common in these
// descriptions and that shape is not; penalising accurate specificity is the
// defect that got develop-feature's noInventedCitations cut.
const proseSlash = (span) => span.includes('/')
  && span.replace(/^\//, '').split('/').every((seg) => /^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(seg));

// A file that exists in the tree BOTH arms were handed over `read_source` is
// not invented - the author read it. `celmatcher_test.go`, a real neighbouring
// test file, scored a zero on the stored run for being outside the diff.
// Paths only, never file contents: a description names files, and putting a
// whole repository's identifiers in the haystack would pass any symbol at all.
// Memoised per process because the walk repeats across every row of a fixture;
// the listing is derived from a read-only checkout, so it cannot leak between
// arms. Missing cache (a test run before fetch-fixtures) degrades to the diff.
const TREES = new Map();
function treeNames(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), next);
      else out.push(next);
    }
  };
  try { walk(dir, ''); } catch { return ''; }
  return out.join('\n');
}

function fixtureTree(name) {
  if (!TREES.has(name)) {
    const spec = specs(path.resolve(__dirname, '..')).find((f) => f.name === name);
    TREES.set(name, spec ? treeNames(paths(spec).tree) : '');
  }
  return TREES.get(name);
}

// Fabrication is this skill's real failure mode: a description that invents a
// file, function, or flag the diff never touched reads fluently and sends the
// reviewer hunting for something that does not exist. The haystack is the diff
// plus the developer's own note - facts the author legitimately had - plus any
// per-case `allow` list.
//
// Scope, deliberately: this sees invented NAMES only. A fabricated causal claim
// carrying no identifier ("also fixes a memory leak in the connection pool") is
// structurally invisible here and is left to the judges. Links are stripped
// before extraction rather than checked - a changelog URL is an invitation to
// go read it, not an assertion about this repository - so a bogus link passes.
//
// It stays all-or-nothing. Naming a file, symbol, or flag that is in neither
// the change nor the tree is one defect with one consequence - a reviewer sent
// hunting for something that does not exist - and grading it by count would say
// two fabrications are only twice as bad as one. What made 0-or-1 dangerous was
// the extractor firing on prose; that is what the two rules above fix.
function noFabricatedIdentifiers(output, context) {
  const vars = context?.vars || {};
  const allow = config(context).allow || [];
  const haystack = `${vars.diff || ''}\n${vars.note || ''}\n${allow.join('\n')}\n${fixtureTree(vars.fixture)}`;
  const text = String(output).replace(/\[[^\]\n]*\]\([^)\s]*\)/g, ' ').replace(/\bhttps?:\/\/\S+/g, ' ');

  // `signalURL()` and signalURL are the same claim; the diff only ever shows
  // the latter, so the empty parens come off before the lookup.
  const trim = (span) => span.replace(/^[`'"(\[]+|[`'".,;:)\]]+$/g, '').replace(/\(\)$/, '');
  const coded = new Set([...text.matchAll(/`([^`\n]+)`/g)].map((m) => trim(m[1].trim())));
  // Prose gets the same extraction, so an unbackticked hallucinated
  // `handleRollback` is caught, not just path-shaped ones.
  const bare = new Set([...text.replace(/`[^`\n]*`/g, ' ').matchAll(/[\w.@/()-]+/g)].map((m) => trim(m[0])));

  const suspect = (span, backticked) => /[A-Za-z]/.test(span)
    && !TOOLCHAIN.has(span)
    && !proseSlash(span)
    && (IDENTIFIER.test(span) || (backticked && PASCAL.test(span)));

  const invented = [
    ...[...coded].filter((span) => suspect(span, true)),
    ...[...bare].filter((span) => suspect(span, false)),
  ].filter((span) => !haystack.includes(span));

  return invented.length
    ? { pass: false, score: 0, reason: `Names present in neither the diff, the author's note, nor the tree: ${[...new Set(invented)].slice(0, 6).join(', ')}.` }
    : { pass: true, score: 1, reason: 'Every file, path, and identifier named in the description appears in the change or the tree it lands in.' };
}

module.exports = { noFabricatedIdentifiers, proportionateLength, fixtureTree };
