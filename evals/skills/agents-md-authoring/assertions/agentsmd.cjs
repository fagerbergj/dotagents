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
// the first opening marker to the LAST ``` in the text.
//
// That still fails when the model never closes the outer fence at all - an
// odd total marker count means whichever ``` is "last" is actually an INNER
// close, not the true end, and slicing to it silently drops everything
// after (reproduced live: a jq case's only real citation, `git submodule
// update --init`, sat in the discarded tail - 1620 raw chars in, 248 out).
// Falls back to "everything after the opening line" whenever the fence
// count can't pair up cleanly, including when there is no second marker at
// all (first === last, covered by the same odd-count check: one marker is
// always an odd count).
function content(output) {
  const text = stripReasoning(String(output));
  const first = text.indexOf('```');
  if (first === -1) return text.trim();
  const openLineEnd = text.indexOf('\n', first);
  if (openLineEnd === -1) return text.trim();
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) return text.slice(openLineEnd + 1).trim();
  const last = text.lastIndexOf('```');
  if (last <= openLineEnd) return text.slice(openLineEnd + 1).trim();
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
  if (!targets) {
    // Autotools (and similar) projects commit no Makefile at all - `configure`
    // generates one from Makefile.in/Makefile.am at build time. A `make
    // <target>` citing the project's own real, documented post-configure
    // workflow (e.g. jq's README: `./configure && make check`) is
    // unverifiable against a static pre-configure checkout, not fabricated -
    // proven live: every jq-case citation of `make check`/`make -j8` (copied
    // verbatim from README.md) false-flagged as invented before this guard.
    if (fs.existsSync(path.join(dir, 'configure.ac')) || fs.existsSync(path.join(dir, 'configure.in'))) return null;
    return { ok: false, note: `no Makefile at ${path.relative(repoDir, dir) || '.'}` };
  }
  const missing = wanted.filter((t) => !targets.has(t));
  return missing.length
    ? { ok: false, note: `Makefile at ${path.relative(repoDir, dir) || '.'} has no target(s) ${missing.join(', ')}` }
    : { ok: true };
}

// A real npm/yarn/pnpm subcommand (install, ci, audit, ...) needs no
// package.json script entry - `npm install <pkg>` installs from the
// registry, unverifiable against a static checkout like a network command.
// Proven live: semver's case correctly cites `npm install semver` (the real
// Node.js differential-test setup, .github/workflows/ci.yml's "Node" job)
// against a Rust crate with no package.json at all, and this false-flagged
// as invented before excluding builtins - it was reading "install" as a
// script name to look up rather than the subcommand it is. Deliberately
// excludes test/start: those really are npm/yarn's implicit-script
// shorthand, and catching a bad citation of one is this check's entire
// point (see the comment above checkPackageScript).
const NPM_BUILTIN_SUBCOMMANDS = new Set([
  'install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'un', 'link', 'ln', 'unlink',
  'outdated', 'audit', 'publish', 'pack', 'list', 'ls', 'view', 'v', 'init', 'dedupe',
  'prune', 'update', 'up', 'upgrade', 'exec', 'create', 'config', 'cache', 'doctor',
  'fund', 'login', 'logout', 'owner', 'ping', 'pkg', 'root', 'search', 'set', 'whoami',
]);

// `npm|yarn|pnpm [run] <script>`, including npm/yarn's bare `test`/`start`.
function checkPackageScript(repoDir, tokens) {
  const runner = tokens[0];
  const afterRunner = tokens.slice(1);
  const explicitRun = afterRunner[0] === 'run' || afterRunner[0] === 'run-script';
  const rest = explicitRun ? afterRunner.slice(1) : afterRunner;
  const script = rest[0];
  if (!script || script.startsWith('-')) return null;
  if (!explicitRun && NPM_BUILTIN_SUBCOMMANDS.has(script)) return null;
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

// A fixed, real external vocabulary, same shape as GIT_SUBCOMMANDS - cargo's
// own built-ins plus the handful of third-party subcommands (fuzz, miri,
// nextest, ...) an agent-authored AGENTS.md legitimately cites for a Rust repo.
const CARGO_SUBCOMMANDS = new Set([
  'add', 'bench', 'build', 'b', 'check', 'c', 'clean', 'clippy', 'doc', 'd', 'fetch', 'fix', 'fmt',
  'generate-lockfile', 'init', 'install', 'locate-project', 'login', 'logout', 'metadata',
  'new', 'owner', 'package', 'pkgid', 'publish', 'remove', 'report', 'run', 'r', 'rustc', 'rustdoc',
  'search', 'test', 't', 'tree', 'uninstall', 'update', 'vendor', 'verify-project', 'version', 'yank',
  'fuzz', 'miri', 'nextest', 'audit', 'deny', 'udeps', 'watch', 'expand', 'outdated', 'edit',
]);

function readCargoToml(dir) {
  try { return fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8'); } catch { return null; }
}

// Narrow, regex-based read of these Cargo.toml shapes, same trade-off as
// readPyprojectExtras: not a real TOML parser, just the handful of tables
// this suite needs to check citations against.
function readCargoFeatures(text) {
  const section = text.match(/\[features\]\s*\n([\s\S]*?)(?:\n\[|$)/);
  const features = new Set(['default']);
  if (section) for (const m of section[1].matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)) features.add(m[1]);
  return features;
}

// `[[bin]]`/`[[bench]]`/`[[example]]`/`[[test]]` array-of-tables, each with a
// `name = "..."` key - the target names `cargo bench <name>`, `cargo run
// --example <name>` etc. select between.
function readCargoTargets(text, kind) {
  const names = new Set();
  const re = new RegExp(`\\[\\[${kind}\\]\\]([\\s\\S]*?)(?=\\n\\[|$)`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const nameMatch = m[1].match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) names.add(nameMatch[1]);
  }
  return names;
}

function readCargoWorkspaceMembers(text) {
  const section = text.match(/\[workspace\]\s*\n([\s\S]*?)(?:\n\[|$)/);
  if (!section) return null;
  const listMatch = section[1].match(/members\s*=\s*\[([\s\S]*?)\]/);
  const members = new Set();
  if (listMatch) for (const m of listMatch[1].matchAll(/"([^"]+)"/g)) members.add(m[1]);
  return members;
}

function readCargoPackageName(text) {
  const section = text.match(/\[package\]\s*\n([\s\S]*?)(?:\n\[|$)/);
  return section ? section[1].match(/name\s*=\s*"([^"]+)"/)?.[1] : undefined;
}

// `cargo fuzz <subcommand> [<target>]`. fuzz/ is conventionally its own
// isolated cargo workspace (semver: fuzz/Cargo.toml declares `[workspace]`
// and points `[[bin]]` targets straight at files in fuzz/, not the
// cargo-fuzz-generated fuzz/fuzz_targets/ layout other crates use) - so
// target names are read from whichever of those two shapes the repo actually
// has, at the fuzz directory, not the crate root.
const CARGO_FUZZ_SUBCOMMANDS = new Set(['init', 'add', 'list', 'run', 'build', 'check', 'tmin', 'cmin', 'cov', 'fmt']);

function readFuzzTargets(fuzzDir) {
  const names = new Set();
  const toml = readCargoToml(fuzzDir);
  if (toml) for (const n of readCargoTargets(toml, 'bin')) names.add(n);
  try {
    for (const f of fs.readdirSync(path.join(fuzzDir, 'fuzz_targets'))) {
      if (f.endsWith('.rs')) names.add(f.slice(0, -3));
    }
  } catch { /* no fuzz_targets/ dir - the flat-file convention may still apply */ }
  return { names, hasFuzzDir: toml !== null || fs.existsSync(path.join(fuzzDir, 'fuzz_targets')) };
}

// `rest` is already stripped of `cargo` and any leading `+toolchain` - so
// rest[0] === 'fuzz' and rest[1] is the fuzz subcommand, regardless of
// whether the original span was `cargo fuzz run x` or `cargo +nightly fuzz
// run x`. Passing the raw, unstripped tokens here previously misread
// `+nightly` as the subcommand slot on any toolchain-qualified citation.
function checkCargoFuzz(repoDir, cwdDir, rest) {
  const fuzzDir = path.basename(cwdDir) === 'fuzz' ? cwdDir : path.join(repoDir, 'fuzz');
  const sub = rest[1];
  if (!sub) return null; // bare `cargo fuzz`: nothing to verify
  if (!CARGO_FUZZ_SUBCOMMANDS.has(sub)) return { ok: false, note: `cargo fuzz has no "${sub}" subcommand` };
  // `add` and `init` CREATE the target, so a name they cite is not supposed to
  // exist in the checkout yet; checking it against fuzz/ would fail a correct
  // citation.
  if (sub === 'add' || sub === 'init') return { ok: true };
  const target = rest.slice(2).find((t) => !t.startsWith('-'));
  if (!target) return { ok: true }; // no target named: only the subcommand itself was checkable
  const { names, hasFuzzDir } = readFuzzTargets(fuzzDir);
  if (!hasFuzzDir) return { ok: false, note: `no fuzz/Cargo.toml or fuzz/fuzz_targets/ in the repo to name a "${target}" target` };
  if (!names.size) return null; // fuzz/ exists but declares no named bin targets - unverifiable, not fabricated
  return names.has(target) ? { ok: true } : { ok: false, note: `fuzz/ has no target named "${target}" (has: ${[...names].join(', ') || 'none'})` };
}

// `cargo [+toolchain] <subcommand> [args...]`. Checks the subcommand against
// real cargo vocabulary, then - only for the subcommands where it means
// something - the specific `--features`/`--no-default-features`,
// `--example`/`--bin`, bare bench-target, and `-p`/`--package` arguments
// against what Cargo.toml actually declares. Deliberately does not validate
// the argument to `install`/`add`/`remove`: those name an arbitrary registry
// crate, not a repo fact (same reasoning as npm's builtin-subcommand carve-out).
function checkCargo(repoDir, cwdDir, tokens) {
  let rest = tokens.slice(1);
  if (rest[0]?.startsWith('+')) rest = rest.slice(1); // `+nightly` toolchain override
  const sub = rest[0];
  if (!sub) return null;
  if (sub === 'fuzz') return checkCargoFuzz(repoDir, cwdDir, rest);
  if (!CARGO_SUBCOMMANDS.has(sub)) return { ok: false, note: `cargo has no "${sub}" subcommand` };

  const toml = readCargoToml(cwdDir);
  if (!toml) return { ok: true }; // no Cargo.toml to check args against - the subcommand itself is real

  const featureFlagged = ['test', 't', 'check', 'c', 'build', 'b', 'run', 'r', 'bench'].includes(sub);
  if (featureFlagged) {
    const idx = rest.indexOf('--features');
    if (idx !== -1 && rest[idx + 1] && !rest[idx + 1].startsWith('-')) {
      const wanted = rest[idx + 1].split(/[,\s]+/).filter(Boolean);
      const known = readCargoFeatures(toml);
      const missing = wanted.filter((f) => !known.has(f));
      if (missing.length) return { ok: false, note: `Cargo.toml declares no feature(s) ${missing.join(', ')} (has: ${[...known].join(', ') || 'none'})` };
    }
  }

  if (sub === 'bench') {
    const name = rest.slice(1).find((t) => !t.startsWith('-') && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
    if (name) {
      const known = readCargoTargets(toml, 'bench');
      if (known.size && !known.has(name)) return { ok: false, note: `Cargo.toml declares no [[bench]] named "${name}" (has: ${[...known].join(', ')})` };
    }
  }

  if ((sub === 'run' || sub === 'r')) {
    for (const flag of ['--example', '--bin']) {
      const idx = rest.indexOf(flag);
      if (idx !== -1 && rest[idx + 1]) {
        const known = readCargoTargets(toml, flag === '--example' ? 'example' : 'bin');
        if (known.size && !known.has(rest[idx + 1])) {
          return { ok: false, note: `Cargo.toml declares no [[${flag.slice(2)}]] named "${rest[idx + 1]}" (has: ${[...known].join(', ')})` };
        }
      }
    }
  }

  const pIdx = rest.findIndex((t) => t === '-p' || t === '--package');
  if (pIdx !== -1 && rest[pIdx + 1]) {
    const wanted = rest[pIdx + 1];
    const members = readCargoWorkspaceMembers(toml);
    const ownName = readCargoPackageName(toml);
    if (members) {
      if (![...members].some((m) => m === wanted || m.endsWith(`/${wanted}`)) && wanted !== ownName) {
        return { ok: false, note: `Cargo.toml's [workspace] has no member "${wanted}" (has: ${[...members].join(', ') || 'none'})` };
      }
    } else if (ownName && wanted !== ownName) {
      return { ok: false, note: `this is not a workspace and its package is "${ownName}", not "${wanted}"` };
    }
  }

  return { ok: true };
}

// Same fixed-vocabulary shape as GIT_SUBCOMMANDS/CARGO_SUBCOMMANDS - real vs
// invented is the only thing worth checking cheaply; this suite's zerolog
// cases already cite `go test`/`go vet`/`go build` for real, and without
// this those spans produced no check at all, the same dead-metric-zero
// pattern the missing cargo checker caused (assertions/agentsmd.test.cjs has
// the fixture for it).
const GO_SUBCOMMANDS = new Set([
  'bug', 'build', 'clean', 'doc', 'env', 'fix', 'fmt', 'generate', 'get',
  'install', 'list', 'mod', 'run', 'test', 'tool', 'version', 'vet', 'work',
]);

// `go <subcommand> [args...]`. Also checks a build-tag argument - separated
// (`-tags foo`) or joined (`-tags=foo`), single or double dash, since the go
// tool accepts all four - against the repo's own `//go:build <name>` /
// `// +build <name>` comments via repoContains, the only way a static checkout
// can corroborate a build tag it does not compile. Module-boundary claims
// ("cmd/lint is its own module") are left to states_critical_fact; a
// static per-directory check can't tell a nested go.mod is authoritative
// without walking the module graph, which is more machinery than this
// grader's other checks take on for any other ecosystem either.
function checkGo(repoDir, tokens) {
  const sub = tokens[1];
  if (!sub) return null; // bare `go`: nothing to verify
  if (!GO_SUBCOMMANDS.has(sub)) return { ok: false, note: `go has no "${sub}" subcommand` };
  const idx = tokens.findIndex((t) => /^--?tags(=|$)/.test(t));
  const value = idx === -1 ? undefined : (tokens[idx].includes('=') ? tokens[idx].slice(tokens[idx].indexOf('=') + 1) : tokens[idx + 1]);
  if (value) {
    const tags = value.replace(/["']/g, '').split(/[,\s]+/).filter(Boolean);
    const missing = tags.filter((t) => !repoContains(repoDir, `build ${t}`));
    if (missing.length) return { ok: false, note: `no //go:build or // +build comment in the repo names tag(s) ${missing.join(', ')}` };
  }
  return { ok: true };
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

const KNOWN_EXTENSIONS = new Set(['md', 'txt', 'ini', 'toml', 'cfg', 'json', 'yaml', 'yml', 'py', 'js', 'ts', 'sh', 'mk', 'lock', 'rst', 'in', 'cjs', 'mjs', 'rs', 'go']);
// Canonical casing only - looksLikePath() and existsCaseInsensitive() below
// both compare case-insensitively, so "makefile" resolves the same as
// "Makefile" without needing every casing spelled out here.
const KNOWN_FILENAMES = new Set([
  'Makefile', 'package.json', 'pyproject.toml', 'tox.ini', 'setup.py', 'setup.cfg',
  '.pre-commit-config.yaml', '.git-blame-ignore-revs', '.coveragerc', '.gitignore', '.readthedocs.yaml',
  'go.mod', 'go.sum',
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

// `owner/repo` (e.g. a backticked "dtolnay/semver") matches the same
// two-segment slash shape as a real repo-relative path, but it names a
// GitHub repository, not a file - checking it against the checkout and
// failing it as "does not exist" was a live false positive. A genuine
// repo-relative path's first segment is almost always one of the repo's own
// top-level entries (fuzz/, tests/, docs/, .github/); an external slug's
// first segment (a GitHub username) essentially never is. Gated on no known
// extension in the second segment so a real two-segment path like
// ".github/AI_POLICY.md" is never in scope - that one already resolves by
// existence before this is even consulted.
function looksLikeGithubSlug(repoDir, clean) {
  const parts = clean.split('/');
  if (parts.length !== 2) return false;
  const [owner, name] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return false;
  if (!/^[\w.-]+$/.test(name)) return false;
  if (name.includes('.') && KNOWN_EXTENSIONS.has(name.split('.').pop().toLowerCase())) return false;
  let entries = [];
  try { entries = fs.readdirSync(repoDir); } catch { /* unreadable: treat as not a repo-owned dir */ }
  return !entries.some((e) => e.toLowerCase() === owner.toLowerCase());
}

function checkPath(repoDir, token) {
  const clean = token.replace(/^\.\/+/, '').replace(/[.,;:)]+$/, '');
  if (!clean || /^https?:\/\//.test(clean) || clean.includes(' ')) return null;
  if (!looksLikePath(clean)) return null;
  if (fs.existsSync(path.join(repoDir, clean))) return { ok: true };
  if (existsCaseInsensitive(repoDir, clean)) return { ok: true };
  if (!clean.includes('/') && findByBasename(repoDir, clean)) return { ok: true };
  if (looksLikeGithubSlug(repoDir, clean)) return null;
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
  else if (head === 'cargo') add('cargo', checkCargo(repoDir, cwdDir, tokens));
  else if (head === 'go') add('go', checkGo(repoDir, tokens));

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

// --- proportionality guard --------------------------------------------------

// Deterministic backstop for says_nothing_else's padding item (proportionality),
// which a judge scored 1.0 on an output padded with a directory tree and an
// invented "Release checklist", reasoning "length is proportionate to the
// real signal" - false against the text it was judging. Holistic
// proportionality is exactly the kind of claim an LLM judge is unreliable on;
// this computes against the case's own vars.evidence text instead of a fixed
// word count. RATIO_CAP is deliberately generous (evidence is often terse
// bullets while a real answer needs connecting prose) - this is a guard
// against gross padding, not a substitute for the rubric's finer judgment.
const RATIO_CAP = 3;
function lengthProportionateToEvidence(output, context) {
  const evidence = context?.vars?.evidence;
  if (!evidence) throw new Error('lengthProportionateToEvidence needs vars.evidence - the case\'s own ground truth about the repo.');
  const evLen = evidence.trim().length;
  const outLen = content(output).length;
  const ratio = outLen / evLen;
  if (ratio <= RATIO_CAP) {
    return result(true, 1, `Output is ${outLen} chars, ${ratio.toFixed(1)}x the ${evLen}-char evidence - within the ${RATIO_CAP}x proportionality guard.`);
  }
  return result(false, Math.max(0, RATIO_CAP / ratio),
    `Output is ${outLen} chars, ${ratio.toFixed(1)}x the ${evLen}-char evidence - over the ${RATIO_CAP}x proportionality guard, likely padding rather than signal.`);
}

module.exports = {
  checkCargo,
  checkGit,
  checkGo,
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
  lengthProportionateToEvidence,
  looksLikeGithubSlug,
  nestedDoesNotRepeatRoot,
  readMakeTargets,
  repoContains,
  spans,
};
