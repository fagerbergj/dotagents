// Offline checks against a synthetic repo - no network, no lib/repo.js
// checkout. Runs before any tokens are bought.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkGit,
  checkPipExtras,
  citedFactsExistInRepoDir,
  content,
  nestedDoesNotRepeatRoot,
  checksForSpan,
} = require('./agentsmd.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-fixture-'));
fs.writeFileSync(path.join(dir, 'Makefile'), [
  '.PHONY: test lint',
  'test:',
  '\tpytest tests',
  'coverage: test',
  '\tpytest --cov',
].join('\n'));
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'mocha', lint: 'eslint .' } }));
fs.writeFileSync(path.join(dir, 'tox.ini'), '[tox]\nenvlist = py310\n\n[testenv:py310]\ncommands = pytest\n');
fs.writeFileSync(path.join(dir, 'requirements-dev.txt'), '-e .\npytest\n');
fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname = "x"\n\n[project.optional-dependencies]\nsocks = ["PySocks"]\nsecurity = []\n');
fs.mkdirSync(path.join(dir, 'docs'));
fs.writeFileSync(path.join(dir, 'docs', 'Makefile'), 'html:\n\tsphinx-build . _build\n');
fs.mkdirSync(path.join(dir, '.github'));
fs.writeFileSync(path.join(dir, '.github', 'AI_POLICY.md'), '# policy\n');
fs.writeFileSync(path.join(dir, '.github', 'ci.yml'), 'run: curl https://ci.example.com/status\n');
// Real files for the nested-fence content() test below - a directory-tree
// example naming them is then a true citation, not an artifact of the fixture.
fs.writeFileSync(path.join(dir, 'index.js'), '');
fs.writeFileSync(path.join(dir, 'test.js'), '');

const score = (text, opts) => citedFactsExistInRepoDir(text, dir, opts).score;
const pass = (text, opts) => citedFactsExistInRepoDir(text, dir, opts).pass;

// make: real vs invented target, including .PHONY-only targets and -C redirect.
assert.equal(score('run `make test`'), 1, 'a real Makefile target passes');
assert.equal(score('run `make lint`'), 1, 'a .PHONY-only target still counts as real');
assert.equal(pass('run `make deploy`'), false, 'an invented target fails');
assert.equal(pass('run `make -C docs html`'), true, '-C redirects into the nested Makefile');
assert.equal(pass('run `make -C docs lint`'), false, 'a target missing from the nested Makefile fails');

// cwd: a nested AGENTS.md's own instructions correctly say "run `make html`
// from this directory" with no -C - that has to resolve against the nested
// Makefile, not the root one, or a true instruction reads as invented.
assert.equal(pass('run `make html`'), false, 'without cwd, a bare target only in the nested Makefile fails against root');
assert.equal(pass('run `make html`', { cwd: 'docs' }), true, 'with cwd: docs, the same bare target resolves against docs/Makefile');
assert.equal(pass('run `make test`', { cwd: 'docs' }), false, 'cwd does not make root-only targets appear in the subtree');
assert.equal(pass('run `make -C docs html`', { cwd: 'docs' }), true, 'an explicit -C still overrides cwd, redundantly but correctly');

// a make VAR=value override on the command line is not a second target name -
// reproduced live: `make html SPHINXOPTS=-W` was scored as citing a
// non-existent "SPHINXOPTS=-W" target.
assert.equal(pass('run `make html SPHINXOPTS=-W`', { cwd: 'docs' }), true, 'a trailing VAR=value override is not treated as an invented target');

// npm: real vs missing script, missing package.json entirely.
assert.equal(pass('run `npm test`'), true, 'npm test resolves to the "test" script');
assert.equal(pass('run `npm run build`'), false, 'an unlisted script fails');
const noPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-nopkg-'));
assert.equal(citedFactsExistInRepoDir('run `npm test`', noPkg).pass, false, 'no package.json at all fails an npm citation');

// npm builtin subcommands: `npm install <pkg>` installs from the registry,
// it is not a package.json script named "install" - reproduces the live bug
// where semver's real `npm install semver` (a Rust crate with no
// package.json, installing the differential-test comparison package) was
// false-flagged as invented. An explicit `npm run install` (unusual, but
// legal if a script is actually named "install") still checks the script.
assert.deepEqual(checksForSpan(noPkg, 'npm install semver'), [], 'npm install <pkg> produces no check at all - unverifiable, not fabrication');
assert.deepEqual(checksForSpan(dir, 'npm ci'), [], 'npm ci is a builtin subcommand, not a script lookup');
assert.equal(pass('run `npm run build`'), false, 'an explicit `run` still checks real scripts and still fails on an unlisted one');
assert.equal(pass('run `npm test`'), true, 'bare test/start remain script-name checks, not builtins skipped');

// make against an autotools project: no Makefile exists pre-configure (it is
// generated from Makefile.in/Makefile.am), so a real, documented post-configure
// command like the README's own `make check` must not false-flag as invented.
const autotools = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-autotools-'));
fs.writeFileSync(path.join(autotools, 'configure.ac'), 'AC_INIT([x], [1.0])\n');
assert.deepEqual(checksForSpan(autotools, 'make check'), [], 'make targets against an autotools project with no generated Makefile yet are unverifiable, not invented');
const noAutotools = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-noconfigure-'));
assert.equal(citedFactsExistInRepoDir('run `make check`', noAutotools).pass, false, 'a repo with no Makefile AND no configure.ac still fails a make citation');

// tox: named env vs invented env, bare tox.
assert.equal(pass('run `tox -e py310`'), true, 'a real testenv passes');
assert.equal(pass('run `tox -e py311`'), false, 'an unlisted env fails');
assert.equal(pass('run `tox`'), true, 'bare tox only needs tox.ini to exist');

// paths: exact, basename fallback, case-insensitive, and invented.
assert.equal(pass('see `requirements-dev.txt`'), true, 'a real root file passes');
assert.equal(pass('see `requirements-prod.txt`'), false, 'an invented file fails');
assert.equal(pass('see `.github/AI_POLICY.md`'), true, 'a real nested path passes');
assert.equal(pass('see `AI_POLICY.md`'), true, 'a bare basename resolves by search when the full path is real');
assert.equal(pass('see `SECURITY.md`'), false, 'a basename matching nothing anywhere fails');
assert.equal(pass('run `make` per `makefile`'), true, 'lowercase "makefile" resolves case-insensitively to the real Makefile');

// pip extras: real vs invented extras group, gated on "install" so a bare
// regex-shaped span is not treated as a pip citation, no pyproject.toml at all.
assert.equal(pass('run `pip install -e ".[socks]"`'), true, 'a real extras group passes');
assert.equal(pass('run `pip install -e ".[test]"`'), false, 'an invented extras group fails - the real bug this check exists for');
assert.equal(citedFactsExistInRepoDir('run `pip install -e ".[socks]"`', noPkg).pass, false, 'no pyproject.toml at all fails a pip-extras citation');
assert.equal(checkPipExtras(dir, 'foo.[bar-baz]'), null, 'a regex-shaped span with no "install" is not a pip citation');

// git: real vs invented subcommand.
assert.deepEqual(checkGit(['git', 'status']), { ok: true });
assert.equal(checkGit(['git', 'fake-subcommand']).ok, false, 'an invented git subcommand fails');
assert.equal(checkGit(['git']), null, 'bare git names no subcommand to check');

// python ecosystem: citing python/pytest/pip against a repo with no Python
// markers at all is invented, even with no specific path or extras to check.
assert.equal(pass('run `python -m pytest`'), true, 'python/pytest citations pass when the repo has Python project markers');
assert.equal(citedFactsExistInRepoDir('run `python -m pytest`', noPkg).pass, false, 'python/pytest citations fail against a repo with no Python markers at all');

// network: a curl/wget target only checkable if the repo mentions the same host.
assert.equal(pass('run `curl https://ci.example.com/status`'), true, 'a host the repo itself references passes');
assert.equal(pass('run `curl -X POST http://internal-ci.example/deploy`'), false, 'a host the repo never mentions is unverifiable and fails');

// the fallback path-token scan: a fabricated argument to a runner this suite
// has no specific handler for is still caught, because every token in the
// span is checked for looking like a real path.
assert.equal(pass('run `pytest tests/test_totally_made_up.py`'), false, 'a fabricated test path fails even though pytest itself is not a specific runner check');
assert.equal(pass('run `pip install -r requirements-test.txt`'), false, 'a fabricated requirements file fails');

// requireCitation: the default now requires at least one real, checkable
// citation - vague-but-unfalsifiable prose no longer scores a free 1.0.
// requireCitation: false (the negative-control opt-out) keeps the old pass.
assert.equal(pass('this file has no backticked commands or paths at all'), false, 'by default, citing nothing checkable fails rather than passing for free');
assert.equal(pass('this file has no backticked commands or paths at all', { requireCitation: false }), true, 'requireCitation: false is the explicit opt-out for a legitimately near-empty answer');

// prose false-positive guard: ordinary words containing a dot are not paths.
assert.equal(score('install deps, e.g. via pip, then run `make test`'), 1, '"e.g." is not treated as a citation');
assert.equal(score('works on Python 3.10 and 3.11 - run `make test`'), 1, 'version numbers are not treated as citations');

// mixed: score is the fraction resolved, not all-or-nothing.
const mixed = citedFactsExistInRepoDir('`make test` then `make deploy`', dir);
assert.equal(mixed.score, 0.5, 'one real and one invented citation scores 0.5');
assert.equal(mixed.pass, false);

// checksForSpan() ignores things that are not any recognised family.
assert.deepEqual(checksForSpan(dir, 'a plain sentence with no backtick shape'), []);

console.log('ok   citedFactsExistInRepoDir (synthetic fixture)');

// --- content(): outermost-fence anchoring -----------------------------------

// Reproduces the live failure: the model nests a directory-tree fence inside
// the outer answer fence, and a non-greedy match on the first ``` close used
// to stop there, discarding everything after - including the only citation.
const nestedFence = [
  'Here is the file:',
  '```markdown',
  '# AGENTS.md',
  '',
  'Structure:',
  '```',
  'index.js',
  'test.js',
  '```',
  '',
  'Run `npm test` before committing.',
  '```',
].join('\n');
const extracted = content(nestedFence);
assert.ok(extracted.includes('npm test'), 'content() must not truncate at a nested fence');
assert.ok(!extracted.startsWith('```'), 'the outer fence marker itself is stripped');
assert.equal(citedFactsExistInRepoDir(nestedFence, dir).pass, true, 'the citation after the nested fence is actually graded, not silently dropped');

console.log('ok   content() (outermost-fence anchoring, nested fence)');

// --- nested-instructions grader ---------------------------------------------

const root = [
  'Install dev deps before testing: `pip install -r requirements-dev.txt`.',
  'Run the suite with `make test`.',
].join('\n');

const repeated = nestedDoesNotRepeatRoot('```\nInstall dev deps before testing: `pip install -r requirements-dev.txt`.\nRun the suite with `make test`.\n```', { vars: { existingRoot: root } });
assert.equal(repeated.pass, false, 'restating the root file fails');

const narrowed = nestedDoesNotRepeatRoot('```\nBuild the docs with `make -C docs html` after `pip install -r docs/requirements.txt`.\n```', { vars: { existingRoot: root } });
assert.equal(narrowed.pass, true, 'subtree-specific content that never appears in the root passes');

assert.throws(() => nestedDoesNotRepeatRoot('anything', { vars: {} }), /existingRoot/, 'missing existingRoot throws rather than scoring');

console.log('ok   nestedDoesNotRepeatRoot (synthetic fixture)');
