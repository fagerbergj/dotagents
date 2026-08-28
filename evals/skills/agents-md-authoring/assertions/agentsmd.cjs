// Deterministic graders for agents-md-authoring: does a produced AGENTS.md
// cite commands and paths that actually exist in the target repository, and
// does a nested file add subtree-specific content instead of repeating the
// root file it was handed. Both compute against real input - the repo
// checkout, or the case's own vars.existingRoot - never prose matching.
const fs = require('node:fs');
const path = require('node:path');
const { stripReasoning } = require('../../../lib/strip-reasoning.js');

function result(pass, score, reason) {
  return { pass, score, reason };
}

// The model is told to return one fenced block, but a directory tree or an
// example inside it is often itself a fenced block - the model's own file
// content routinely nests one. A non-greedy match on the first ``` close
// stops at that INNER fence and throws away everything after it (reproduced
// live: 2442 raw chars in, 231 out). Anchor on the outermost fence instead:
// the first opening marker to the LAST ``` in the text. Falls back to
// "everything after the opening line" when there is no second marker at all.
function content(output) {
  const text = stripReasoning(String(output));
  const first = text.indexOf('```');
  if (first === -1) return text.trim();
  const openLineEnd = text.indexOf('\n', first);
  if (openLineEnd === -1) return text.trim();
  const last = text.lastIndexOf('```');
  if (last === first || last <= openLineEnd) return text.slice(openLineEnd + 1).trim();
  return text.slice(openLineEnd + 1, last).trim();
}

// Every backtick span - inline `code` and the body of any further fenced
// block - as a citation candidate. checksForSpan() below decides which are
// checkable; anything else is silently ignored, which is what the
// llm-rubric graders are for, not this one.
function spans(text) {
  const found = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) found.add(m[1].trim());
  for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (t) found.add(t);
    }
  }
  return [...found].filter(Boolean);
}

function readMakeTargets(dir) {
  let text;
  try { text = fs.readFileSync(path.join(dir, 'Makefile'), 'utf8'); } catch { return null; }
  const targets = new Set();
  // A target line, not a variable assignment (`FOO := bar` / `FOO = bar`).
  for (const m of text.matchAll(/^([A-Za-z0-9_.\/-]+)\s*:(?!=)/gm)) {
    if (m[1] !== '.PHONY') targets.add(m[1]);
  }
  for (const m of text.matchAll(/^\.PHONY:\s*(.+)$/gm)) {
    for (const name of m[1].trim().split(/\s+/)) targets.add(name);
  }
  return targets;
}

function readNpmScripts(dir) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; }
  return new Set(Object.keys(pkg.scripts || {}));
}

function readToxText(dir) {
  try { return fs.readFileSync(path.join(dir, 'tox.ini'), 'utf8'); } catch { return null; }
}

// Narrow, regex-based read of one well-known TOML shape rather than a full
// TOML parser: just the extras group names under [project.optional-dependencies].
function readPyprojectExtras(dir) {
  let text;
  try { text = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8'); } catch { return null; }
  const section = text.match(/\[project\.optional-dependencies\]\s*\n([\s\S]*?)(?:\n\[|$)/);
  const extras = new Set();
  if (section) for (const m of section[1].matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)) extras.add(m[1]);
  return extras;
}

// `pip install ... .[extra1,extra2]` (the -e/quoting around it varies).
// Gated on the span actually mentioning "install" first: `.[...]` alone is
// also how a regex character class is written, and firing on any backtick
// span shaped like one flagged unrelated content as a pip citation.
function checkPipExtras(repoDir, span) {
  if (!/\binstall\b/i.test(span)) return null;
  const m = span.match(/\.\[([\w,\s-]+)\]/);
  if (!m) return null;
  const extras = readPyprojectExtras(repoDir);
  if (extras === null) return { ok: false, note: 'no pyproject.toml in the repo to declare extras' };
  const wanted = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  const missing = wanted.filter((e) => !extras.has(e));
  return missing.length
    ? { ok: false, note: `pyproject.toml declares no extra(s) named ${missing.join(', ')} (has: ${[...extras].join(', ') || 'none'})` }
    : { ok: true };
}

// `make [-C <dir>] <target> [<target> ...]`. -C redirects to a nested
// Makefile, which real multi-Makefile repos (e.g. requests' docs/) use.
// `cwdDir` (default: repoDir) is where a bare `make` with no -C reads from -
// a nested AGENTS.md correctly says "run `make html` from this directory",
// and checking that against the repo ROOT's Makefile made a true, accurate
// nested instruction look invented on a live row.
function checkMake(repoDir, tokens, cwdDir = repoDir) {
  let dir = cwdDir;
  const wanted = [];
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === '-C' && tokens[i + 1]) { dir = path.join(repoDir, tokens[i + 1]); i += 1; continue; }
    if (tokens[i].startsWith('-')) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) continue; // VAR=value override, not a target
    wanted.push(tokens[i]);
  }
  if (!wanted.length) return null; // bare `make`: nothing to verify
  const targets = readMakeTargets(dir);
  if (!targets) return { ok: false, note: `no Makefile at ${path.relative(repoDir, dir) || '.'}` };
  const missing = wanted.filter((t) => !targets.has(t));
  return missing.length
    ? { ok: false, note: `Makefile at ${path.relative(repoDir, dir) || '.'} has no target(s) ${missing.join(', ')}` }
    : { ok: true };
}

// `npm|yarn|pnpm [run] <script>`, including npm/yarn's bare `test`/`start`.
function checkPackageScript(repoDir, tokens) {
  const runner = tokens[0];
  let rest = tokens.slice(1);
  if (rest[0] === 'run' || rest[0] === 'run-script') rest = rest.slice(1);
  const script = rest[0];
  if (!script || script.startsWith('-')) return null;
  const scripts = readNpmScripts(repoDir);
  if (!scripts) return { ok: false, note: `no package.json in the repo for "${runner} ${rest.join(' ')}"` };
  return scripts.has(script)
    ? { ok: true }
    : { ok: false, note: `package.json has no "${script}" script (has: ${[...scripts].join(', ') || 'none'})` };
}

// `tox` or `tox -e <env>[,<env>...]`.
function checkTox(repoDir, tokens) {
  const text = readToxText(repoDir);
  if (!text) return { ok: false, note: 'no tox.ini in the repo' };
  const eIdx = tokens.indexOf('-e');
  if (eIdx === -1 || !tokens[eIdx + 1]) return { ok: true }; // bare `tox`: tox.ini exists
  const envs = tokens[eIdx + 1].split(',');
  const missing = envs.filter((env) => !text.includes(env) && !text.includes(`[testenv:${env}]`));
  return missing.length ? { ok: false, note: `tox.ini names no environment matching ${missing.join(', ')}` } : { ok: true };
}

// Real git porcelain plus a few common plumbing commands. Narrower than
// git's full surface, wide enough to catch an invented subcommand without
// chasing every alias and extension.
const GIT_SUBCOMMANDS = new Set([
  'add', 'am', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'checkout',
  'cherry-pick', 'clean', 'clone', 'commit', 'config', 'describe', 'diff', 'fetch', 'gc',
  'grep', 'init', 'log', 'ls-files', 'ls-tree', 'merge', 'mv', 'notes', 'pull', 'push',
  'rebase', 'reflog', 'remote', 'reset', 'restore', 'rev-parse', 'revert', 'rm',
  'shortlog', 'show', 'stash', 'status', 'submodule', 'switch', 'symbolic-ref', 'tag', 'worktree',
]);

// `git <subcommand>` - a fixed, real external vocabulary, not a repo fact,
// but exactly as checkable: `git fake-subcommand` names nothing that exists.
function checkGit(tokens) {
  const sub = tokens.slice(1).find((t) => !t.startsWith('-'));
  if (!sub) return null;
  return GIT_SUBCOMMANDS.has(sub) ? { ok: true } : { ok: false, note: `git has no "${sub}" subcommand` };
}

const PYTHON_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'tox.ini'];

// A citation invoking python/pytest/pip only means anything if this is a
// Python project at all - catches `python -m pytest` cited against a repo
// with no Python project file anywhere at its root.
function checkPythonEcosystem(repoDir) {
  let entries = [];
  try { entries = fs.readdirSync(repoDir); } catch { /* unreadable: no marker found below */ }
  const hasMarker = PYTHON_MARKERS.some((f) => fs.existsSync(path.join(repoDir, f)))
    || entries.some((f) => /^requirements.*\.txt$/i.test(f));
  return hasMarker ? { ok: true } : { ok: false, note: 'no Python project markers (pyproject.toml, setup.py/cfg, tox.ini, requirements*.txt) in this repo' };
}

const BINARYISH = /\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|zip|gz|whl|pdf|ai)$/i;

// Bounded text search across the checkout for a literal substring. Used to
// ask whether a curl/wget target is mentioned anywhere in the repo's own
// files (CI config, docs, Makefile) - the only way a static checkout can
// corroborate a piece of infrastructure it does not run.
function repoContains(repoDir, needle, maxDepth = 6) {
  const stack = [{ dir: repoDir, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) stack.push({ dir: full, depth: depth + 1 }); continue; }
      if (BINARYISH.test(e.name)) continue;
      try {
        if (fs.statSync(full).size > 200000) continue;
        if (fs.readFileSync(full, 'utf8').includes(needle)) return true;
      } catch { /* unreadable or binary: not a match */ }
    }
  }
  return false;
}

// `curl`/`wget` naming a URL. Unverifiable against a static checkout unless
// the repo's own files mention the same host somewhere - so that is the bar.
function checkNetworkCommand(repoDir, span) {
  const m = span.match(/https?:\/\/([^\s'"]+)/);
  if (!m) return null;
  const host = m[1].split(/[/?#]/)[0];
  return repoContains(repoDir, host)
    ? { ok: true }
    : { ok: false, note: `no file in the repo mentions "${host}" - this URL is not verifiable against the checkout` };
}

const KNOWN_EXTENSIONS = new Set(['md', 'txt', 'ini', 'toml', 'cfg', 'json', 'yaml', 'yml', 'py', 'js', 'ts', 'sh', 'mk', 'lock', 'rst', 'in', 'cjs', 'mjs']);
// Canonical casing only - looksLikePath() and existsCaseInsensitive() below
// both compare case-insensitively, so "makefile" resolves the same as
// "Makefile" without needing every casing spelled out here.
const KNOWN_FILENAMES = new Set([
  'Makefile', 'package.json', 'pyproject.toml', 'tox.ini', 'setup.py', 'setup.cfg',
  '.pre-commit-config.yaml', '.git-blame-ignore-revs', '.coveragerc', '.gitignore', '.readthedocs.yaml',
]);

// Rules out prose that merely contains a dot ("e.g.", "3.10", "v4.1.0"): a
// bare word needs both a dot and a recognised file extension, or a slash, or
// an exact filename this suite already knows is a real convention.
function looksLikePath(token) {
  if ([...KNOWN_FILENAMES].some((f) => f.toLowerCase() === token.toLowerCase())) return true;
  if (token.includes('/')) return /^[\w.-]+(\/[\w.-]+)+$/.test(token);
  if (!token.includes('.') || !/^[\w.-]+$/.test(token)) return false;
  return KNOWN_EXTENSIONS.has(token.split('.').pop().toLowerCase());
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.tox', '__pycache__', 'dist', 'build', '.cache', '.venv']);

// Bounded, skip-list search for a bare filename cited without its directory -
// "AI_POLICY.md" for ".github/AI_POLICY.md" is imprecise but not invented.
// An exact repo-relative path is still checked directly first.
function findByBasename(repoDir, name, maxDepth = 4) {
  const stack = [{ dir: repoDir, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name === name) return true;
      if (e.isDirectory() && depth < maxDepth) stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
    }
  }
  return false;
}

// Case-insensitive existence check at an exact relative path. Real checkouts
// are case-sensitive, but "makefile" for "Makefile" is a harmless miscasing,
// not a fabrication - resolve it level by level before failing the citation.
function existsCaseInsensitive(root, relPath) {
  let dir = root;
  for (const part of relPath.split('/')) {
    if (!part) continue;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return false; }
    const hit = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!hit) return false;
    dir = path.join(dir, hit);
  }
  return true;
}

function checkPath(repoDir, token) {
  const clean = token.replace(/^\.\/+/, '').replace(/[.,;:)]+$/, '');
  if (!clean || /^https?:\/\//.test(clean) || clean.includes(' ')) return null;
  if (!looksLikePath(clean)) return null;
  if (fs.existsSync(path.join(repoDir, clean))) return { ok: true };
  if (existsCaseInsensitive(repoDir, clean)) return { ok: true };
  if (!clean.includes('/') && findByBasename(repoDir, clean)) return { ok: true };
  return { ok: false, note: `"${clean}" does not exist in the repo` };
}

// Every check that applies to this span, not just the first match: a span
// can be both a known runner AND carry a fabricated path argument
// (`pytest tests/test_totally_made_up.py`), and only checking the runner
// half let the fabricated half through.
function checksForSpan(repoDir, span, opts = {}) {
  const tokens = span.split(/\s+/).filter(Boolean);
  const head = tokens[0];
  const found = [];
  const add = (kind, r) => { if (r) found.push({ kind, ...r }); };
  // Where a bare (no -C/no explicit path) structured-file command reads
  // from. A case whose task is a nested AGENTS.md sets opts.cwd to that
  // subtree, since its instructions are correctly written to run from there.
  const cwdDir = opts.cwd ? path.join(repoDir, opts.cwd) : repoDir;

  if (head === 'make') add('make', checkMake(repoDir, tokens, cwdDir));
  else if (['npm', 'yarn', 'pnpm'].includes(head)) add(head, checkPackageScript(cwdDir, tokens));
  else if (head === 'tox') add('tox', checkTox(cwdDir, tokens));
  else if (head === 'git') add('git', checkGit(tokens));

  add('pip-extra', checkPipExtras(cwdDir, span));
  if (tokens.some((t) => /^(python3?|pytest|pip3?)$/i.test(t))) add('python-ecosystem', checkPythonEcosystem(cwdDir));
  if (head === 'curl' || head === 'wget') add('network', checkNetworkCommand(repoDir, span));

  // Any token shaped like a real path, regardless of which command is in
  // front of it - the generic net that catches a fabricated file argument to
  // a runner this suite has no specific handler for. Root-relative: a bare
  // filename inside a nested answer still resolves via findByBasename below.
  for (const t of tokens) add('path', checkPath(repoDir, t));

  return found;
}

// Pure core: no network, testable against any local directory. citedFactsExistInRepo
// below is the promptfoo-facing wrapper that resolves config.repo to a checkout.
//
// opts.requireCitation (default true): when the answer cites nothing
// checkable at all, that is either an honest, verifiably-clean answer (the
// is-plain-obj negative control - pass `requireCitation: false` there) or a
// wordy answer whose false claims happen to be shaped in a way this grader
// does not recognise, which used to score an identical, undeserved 1.0.
// Default to requiring at least one real, checkable fact; only a case whose
// correct answer is legitimately near-empty opts out.
function citedFactsExistInRepoDir(output, repoDir, opts = {}) {
  const requireCitation = opts.requireCitation !== false;
  const checks = [];
  for (const span of spans(content(output))) {
    for (const c of checksForSpan(repoDir, span, opts)) if (typeof c.ok === 'boolean') checks.push({ span, ...c });
  }
  if (!checks.length) {
    return requireCitation
      ? result(false, 0, 'No checkable command or path was cited, so nothing here can be confirmed against the repo, and this case expects at least one concrete fact.')
      : result(true, 1, 'No checkable command or path was cited, and none is required for this repo.');
  }
  const bad = checks.filter((c) => !c.ok);
  return result(!bad.length, (checks.length - bad.length) / checks.length,
    bad.length
      ? `${bad.length}/${checks.length} cited fact(s) do not exist in the repo: ${bad.slice(0, 5).map((c) => `"${c.span}" (${c.note})`).join('; ')}.`
      : `All ${checks.length} cited command(s)/path(s) exist in the repo.`);
}

function citedFactsExistInRepo(output, context) {
  const repoName = context?.config?.repo;
  if (!repoName) throw new Error('citedFactsExistInRepo needs config.repo naming a repo from lib/repo.js REPOS.');
  const { checkout } = require('../lib/repo.js');
  return citedFactsExistInRepoDir(output, checkout(repoName), {
    requireCitation: context?.config?.requireCitation,
    cwd: context?.config?.cwd,
  });
}

// --- nested-instructions grader ---------------------------------------------

function normalizeLine(line) {
  return line.toLowerCase().replace(/[`*_#>-]/g, '').replace(/\s+/g, ' ').trim();
}

// Short lines (headings, single words) are excluded: a nested file sharing a
// heading like "## Testing" with the root is not repetition, restating a
// sentence is.
function substantiveLines(text) {
  return text.split('\n').map(normalizeLine).filter((l) => l.length >= 20);
}

// Claim: "adding nested instructions" - a nested file narrows or adds to the
// root, it does not restate it. Computed against the case's own vars.existingRoot,
// the root file the model was actually given, not a description of one.
function nestedDoesNotRepeatRoot(output, context) {
  const root = context?.vars?.existingRoot;
  if (!root) throw new Error('nestedDoesNotRepeatRoot needs vars.existingRoot - the root file this case handed the model.');
  const rootLines = substantiveLines(root);
  const nestedLines = substantiveLines(content(output));
  if (!nestedLines.length) return result(false, 0, 'Nested file has no substantive content to check.');
  const overlaps = (line) => rootLines.some((r) => r === line || r.includes(line) || line.includes(r));
  const repeated = nestedLines.filter(overlaps);
  const ratio = repeated.length / nestedLines.length;
  return result(ratio <= 0.34, 1 - ratio,
    repeated.length
      ? `${repeated.length}/${nestedLines.length} substantive line(s) restate the root file instead of narrowing it: ${repeated.slice(0, 3).join(' | ')}`
      : 'No substantive line restates the root file.');
}

module.exports = {
  checkGit,
  checkMake,
  checkNetworkCommand,
  checkPackageScript,
  checkPath,
  checkPipExtras,
  checkPythonEcosystem,
  checkTox,
  checksForSpan,
  citedFactsExistInRepo,
  citedFactsExistInRepoDir,
  content,
  existsCaseInsensitive,
  findByBasename,
  nestedDoesNotRepeatRoot,
  readMakeTargets,
  repoContains,
  spans,
};
