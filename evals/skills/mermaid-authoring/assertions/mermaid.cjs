const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { fenceBlocks } = require('../../../lib/strip-reasoning.js');

// Pinned so the oracle cannot drift under the suite; the package has no
// --version flag, so this is the published version verified against fixtures.
const LINT_VERSION = '0.53.1';
// One render per unique diagram, shared by the render check and the vision judge.
const renderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-mermaid-render-'));
const renders = new Map();
const lints = new Map();

// Our environment failing, not the model's diagram. Matched against the whole
// of stderr, so these must be phrases mermaid-cli only emits when the browser
// itself is the problem - never a bare word. `/puppeteer/i` was here and hit the
// puppeteer-core path inside an ordinary stack frame, which filed every invalid
// diagram as a crash and threw the row away instead of scoring it 0.
const CRASH_SIGNATURE = /Could not find Chrome|Failed to launch|No usable sandbox|Protocol error|Target closed|Navigation failed|spawn ENOMEM|PuppeteerNode\.launch/i;
// mermaid's own verdict on the diagram, which outranks the above: a parse error
// arrives with a full stack trace and would otherwise look like a crash.
const DIAGRAM_ERROR = /UnknownDiagramError|Parse error|Syntax error|No diagram type detected/i;

// mermaid-cli reaches Chromium through puppeteer-core, which bundles no browser,
// so on a runner it aborts inside launch() with nothing installed. Point it at
// the image's Chrome when one exists, else let puppeteer resolve its own.
// The flags are a separate need: ubuntu runners restrict unprivileged user
// namespaces, so Chromium aborts with "No usable sandbox!" without them.
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN,
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  .find((c) => c && fs.existsSync(c));
const PUPPETEER_CONFIG = path.join(renderDir, 'puppeteer.json');
fs.writeFileSync(PUPPETEER_CONFIG, JSON.stringify({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  ...(CHROME ? { executablePath: CHROME } : {}),
}));

function renderOnce(input, output) {
  const run = spawnSync('npx', ['-y', '@mermaid-js/mermaid-cli@11.16.0', '-i', input, '-o', output, '-p', PUPPETEER_CONFIG], { encoding: 'utf8', timeout: 180000 });
  if (run.error) return { ok: false, error: `validator failed to start: ${run.error.message}` };
  if (run.status !== 0 || !fs.existsSync(output)) {
    const stderr = `${run.stderr || run.stdout || ''}`;
    if (!DIAGRAM_ERROR.test(stderr) && CRASH_SIGNATURE.test(stderr)) return { ok: false, crash: stderr.trim().slice(0, 400) };
    // mermaid states its verdict on one line and then unwinds through hundreds
    // of frames, so report that line when there is one rather than any slice.
    const verdict = stderr.split('\n').find((l) => DIAGRAM_ERROR.test(l));
    return { ok: false, error: (verdict || stderr).trim().slice(0, 600) };
  }
  return { ok: true, file: output };
}

function render(source, ext) {
  const key = crypto.createHash('sha1').update(source).digest('hex') + '.' + ext;
  if (renders.has(key)) return renders.get(key);
  const input = path.join(renderDir, `${key}.mmd`);
  const output = path.join(renderDir, key);
  fs.writeFileSync(input, source);
  // A browser crash is our environment failing, not the model's diagram, so it
  // is retried once and then thrown rather than cached: scoring it 0 reads as a
  // broken diagram, and a lost row leaves the two arms on uneven denominators.
  let outcome = renderOnce(input, output);
  if (outcome.crash) outcome = renderOnce(input, output);
  if (outcome.crash) throw new Error(`renderer crashed twice: ${outcome.crash}`);
  renders.set(key, outcome);
  return outcome;
}

// The primary syntax oracle. mermaid-cli is not it: it renders a bare `"` inside
// a bracket label completely clean, and that is the failure SKILL.md documents as
// breaking GitHub "even when validators pass". mermaid-lint's parser rejects it
// with a line and column. Takes the whole model output because the tool reads
// markdown and finds the ```mermaid fences itself - which is our output shape.
function lintChecked(output) {
  const key = crypto.createHash('sha1').update(output).digest('hex');
  if (lints.has(key)) return lints.get(key);
  const file = path.join(renderDir, `${key}.md`);
  fs.writeFileSync(file, output);
  const run = spawnSync('npx', ['-y', `@mermaid-lint/cli@${LINT_VERSION}`, '--quiet', file], { encoding: 'utf8', timeout: 180000 });
  let outcome;
  if (run.error) {
    outcome = { ok: false, error: `linter failed to start: ${run.error.message}` };
  } else if (run.status !== 0) {
    const findings = lintFindings(`${run.stdout || ''}\n${run.stderr || ''}`);
    // The linter's grammar does not cover every type mermaid renders - zenuml is
    // external to mermaid's registry and comes back "unknown diagram type".
    // Unknown means inconclusive, not invalid; the render gate below still applies.
    const real = findings.filter((line) => !/unknown diagram type/i.test(line));
    outcome = findings.length && !real.length
      ? { ok: true }
      : { ok: false, error: trimLintPath(real[0] || findings[0] || run.stdout || run.stderr || '') };
  } else {
    outcome = { ok: true };
  }
  lints.set(key, outcome);
  return outcome;
}

// The tool prints one `<file>:<line>:<col>: <message>` line per failure, wrapped
// in progress chatter and npx deprecation warnings.
function lintFindings(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\S+:\d+:\d+:/.test(line));
}

// Drop the temp-file path; the line:col and message are the useful part.
function trimLintPath(finding) {
  return (finding.match(/\d+:\d+:.*$/)?.[0] || finding.trim() || 'mermaid-lint reported a failure').slice(0, 400);
}

// Only aria-roledescription is safe: it comes from the diagram type and there is
// no `error` type. A `classDef error-icon` in a valid diagram emits class="error-icon".
function isErrorSvg(body) {
  return /aria-roledescription="error"/.test(body);
}

// mermaid-cli exits 0 and draws its own error graphic for an invalid diagram, so
// the exit code is not an oracle - the SVG has to be inspected for the error role.
function renderChecked(source) {
  const svg = render(source, 'svg');
  if (!svg.ok) return svg;
  const body = fs.readFileSync(svg.file, 'utf8');
  if (isErrorSvg(body)) {
    const detail = body.match(/Syntax error in text[^<]*/)?.[0] || 'mermaid drew its syntax-error graphic';
    return { ok: false, error: detail.trim() };
  }
  return svg;
}

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

// Every ```mermaid block, because usesDiagramType below quantifies over all of
// them. Shared with every other suite's extractor, which also puts this in step
// with mermaid-lint: both now require the opener at the start of a line (a
// backtick run glued to the end of a prose sentence is inline code, not a
// fence), and both read an unclosed fence as running to the end of the answer
// rather than as no diagram at all.
function blocks(output) {
  return fenceBlocks(String(output), /^mermaid$/i).map((block) => block.body.trim());
}

// The type is the first line that is not YAML front matter, an `%%{init}%%`
// directive, or a `%%` comment - all three are valid mermaid that renders, and
// all three used to be read as the diagram type, so a correct diagram scored 0
// on diagram_choice while mermaid_renders scored 1. A trailing colon is the
// documented spelling of `gitGraph:`, so it is not part of the name.
function diagramType(block) {
  const lines = String(block).split(/\r?\n/).map((line) => line.trim());
  let index = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    index = close === -1 ? lines.length : close + 1;
  }
  for (; index < lines.length; index += 1) {
    if (!lines[index] || lines[index].startsWith('%%')) continue;
    return lines[index].split(/\s+/)[0].replace(/:$/, '');
  }
  return '';
}

function config(context) {
  return context?.config || {};
}

// Two gates, because neither tool subsumes the other: lint proves the syntax
// parses strictly enough for GitHub, the render proves mermaid actually draws it.
function rendersWithMermaid(output) {
  const diagrams = blocks(output);
  if (!diagrams.length) return result(false, 'No Mermaid block to render.');
  const linted = lintChecked(output);
  if (!linted.ok) return result(false, `mermaid-lint ${LINT_VERSION} rejected the syntax: ${linted.error}`);
  for (let index = 0; index < diagrams.length; index += 1) {
    const rendered = renderChecked(diagrams[index]);
    if (!rendered.ok) return result(false, `Mermaid block ${index + 1} did not render: ${rendered.error}`);
  }
  return result(true, `Parsed by mermaid-lint ${LINT_VERSION}; rendered ${diagrams.length} block(s) with mermaid-cli 11.16.0.`);
}

// Kept in JS rather than expressed as a per-case `regex`, because the guard is
// over *every* fenced block, not the first one: an answer that opens with the
// right diagram and then appends a second block (an `info` version probe, an
// alternative rendering) is off-task, and a regex that matches anywhere in the
// output passes it. Set membership is incidental; the quantifier is the point.
function usesDiagramType(output, context) {
  const allowed = config(context).allowed || [];
  const found = blocks(output).map(diagramType);
  const invalid = found.filter((type) => !allowed.includes(type));
  return result(!invalid.length && found.length > 0, invalid.length ? `Unexpected diagram type(s): ${invalid.join(', ')}.` : `Diagram type is ${found.join(', ')}.`);
}

const FIELDS = 'LABELS|CLIPPED|OVERLAP|ARTIFACTS|SCORE';
const FIELD_RE = new RegExp(`^[ \\t*#>\`-]*(${FIELDS})[ \\t*\`]*:[ \\t*\`]*([\\s\\S]*?)(?=^[ \\t*#>\`-]*(?:${FIELDS})[ \\t*\`]*:|$(?![\\s\\S]))`, 'gim');

module.exports = {
  lintFindings,
  trimLintPath,
  isErrorSvg,
  rendersWithMermaid,
  usesDiagramType,
};
