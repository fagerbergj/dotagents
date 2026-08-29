// Conventional Commits conformance, decided by the reference parser rather
// than a pattern. conventional-commits-parser is the engine commitlint runs on;
// it handles the things a hand-rolled regex got wrong - any noun type (spec
// §14), case-insensitive units (§15), the `!` marker (§11), and git-trailer
// footers including BREAKING CHANGE / BREAKING-CHANGE (§16).

const { fenceBlocks } = require('../../../lib/strip-reasoning.js');

// The conventionalcommits preset's own patterns, tightened only to require a
// non-empty type and description - the parser's default `\w*` accepts `: x`.
const PARSER_OPTIONS = {
  headerPattern: /^(\w+)(?:\(([^()\r\n]+)\))?!?: (.+)$/,
  breakingHeaderPattern: /^(\w+)(?:\(([^()\r\n]+)\))?!: (.+)$/,
  headerCorrespondence: ['type', 'scope', 'subject'],
};

// ESM-only package; cache the import so each row pays for it once.
let parserPromise;
function commitParser() {
  parserPromise ||= import('conventional-commits-parser').then((m) => new m.CommitParser(PARSER_OPTIONS));
  return parserPromise;
}

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

// Fenced blocks if the answer used them, else the whole text. Any info string
// opens one, because the info string is only a language tag when it is a bare
// word: models emit ```refactor: use the upstream helper with the header glued
// to the fence, and that content must reach the parser, not be eaten as a tag.
// fenceBlocks hands back the info alongside the body for exactly that, and
// tracks depth, so a message quoting a fence of its own is no longer cut there.
function blocks(output) {
  const fenced = [];
  for (const { info, body } of fenceBlocks(String(output), /^/)) {
    const text = /^[\w+#-]*$/.test(info) ? body.trim() : `${info}\n${body}`.trim();
    if (text) fenced.push(text);
  }
  return fenced.length ? fenced : [String(output).trim()];
}

// Spec §6: a body MUST begin one blank line after the description. The parser
// is lenient here - it will take line 2 as the body - so this is checked
// directly, which is what the old standalone blank_line_separator gate did.
function conformance(commit, message) {
  // `header` is whatever the first line was; only the correspondence fields
  // tell you whether headerPattern actually matched it.
  if (!commit.type || !commit.subject) {
    return `Header is not \`type(scope)!: description\`: ${JSON.stringify(message.split('\n')[0].slice(0, 80))}`;
  }
  const second = message.replace(/\r/g, '').split('\n')[1];
  if (second !== undefined && second.trim() !== '') {
    return `Body must begin one blank line after the description, not on line 2: ${JSON.stringify(second.slice(0, 60))}`;
  }
  return '';
}

// Passes if any block the answer produced is a conforming message; a two-commit
// answer to a mixed diff should not be failed for what its first block is.
async function conventionalHeader(output, context) {
  const candidates = blocks(output);
  // Cases carrying their own `ask` leave the number of commits undecided, so a
  // prose answer refusing to write one message is correct there. Requiring a
  // header would foreclose the behaviour splits_mixed_change grades. Any
  // message actually offered still has to conform.
  // blocks() falls back to the whole answer when there is no fence, so test
  // for the fence itself rather than for an empty candidate list.
  if (!/```/.test(String(output)) && context?.vars?.ask) {
    return result(true, 'No commit message offered, and this ask did not require one.');
  }
  const parser = await commitParser();
  let first = '';
  for (const message of candidates) {
    const problem = conformance(parser.parse(message), message);
    if (!problem) return result(true, `Conventional Commits v1.0.0: ${JSON.stringify(message.split('\n')[0].slice(0, 80))}`);
    first ||= problem;
  }
  return result(false, first);
}

module.exports = {
  conventionalHeader,
  // exported for the self-test
  blocks,
};
