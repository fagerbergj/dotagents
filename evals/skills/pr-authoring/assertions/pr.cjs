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

// `remove/delete` and `read/written` are prose, not paths: a slash form only
// counts when some segment carries an extension, a dash, or an underscore.
const PROSE_SLASH = /^[a-z]+(?:\/[a-z]+)+$/;

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
function noFabricatedIdentifiers(output, context) {
  const vars = context?.vars || {};
  const allow = config(context).allow || [];
  const haystack = `${vars.diff || ''}\n${vars.note || ''}\n${allow.join('\n')}`;
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
    && !PROSE_SLASH.test(span)
    && (IDENTIFIER.test(span) || (backticked && PASCAL.test(span)));

  const invented = [
    ...[...coded].filter((span) => suspect(span, true)),
    ...[...bare].filter((span) => suspect(span, false)),
  ].filter((span) => !haystack.includes(span));

  return invented.length
    ? { pass: false, score: 0, reason: `Names not present in the diff or the author's note: ${[...new Set(invented)].slice(0, 6).join(', ')}.` }
    : { pass: true, score: 1, reason: 'Every file, path, and identifier named in the description appears in the diff.' };
}

module.exports = { noFabricatedIdentifiers, proportionateLength };
