// Offline checks against a synthetic repo - no network, no lib/repo.js
// checkout. Runs before any tokens are bought.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkCargo,
  checkGit,
  checkGo,
  checkPipExtras,
  citedFactsExistInRepoDir,
  content,
  lengthProportionateToEvidence,
  looksLikeGithubSlug,
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

// Reproduces a second, live failure: the model opens an outer fence, nests
// an inner one, closes ONLY the inner one, and never closes the outer -
// three total ``` markers, an odd count. The real citation
// (`git submodule update --init`) sat after the inner close, in the
// silently-discarded tail (1620 raw chars in, 248 out on a live row).
const unclosedOuterFence = [
  '```markdown',
  '# AGENTS.md',
  '',
  'Build steps:',
  '',
  '```sh',
  'git submodule update --init',
  'make check',
  '```',
  '',
  'If that fails, see `docs/windows.md`.',
].join('\n');
const extractedUnclosed = content(unclosedOuterFence);
assert.ok(extractedUnclosed.includes('git submodule update --init'), 'content() must not truncate when the outer fence is never closed');
assert.ok(extractedUnclosed.includes('docs/windows.md'), 'text after the inner close is kept, not discarded as if the inner close were the real end');
assert.deepEqual(
  require('./agentsmd.cjs').checksForSpan(dir, 'git submodule update --init'),
  [{ kind: 'git', ok: true }],
  'sanity: the citation this bug used to drop is itself real and checkable',
);

console.log('ok   content() (outermost-fence anchoring, unclosed outer fence)');

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

// --- GitHub-slug path misclassification -------------------------------------
// Live bug: a backticked "dtolnay/semver" matches the same two-segment slash
// shape as a real repo-relative path and was scored as a nonexistent file.

assert.equal(looksLikeGithubSlug(dir, 'dtolnay/semver'), true, 'an owner/repo slug is recognised as a GitHub reference, not a path');
assert.deepEqual(checksForSpan(dir, 'dtolnay/semver'), [], 'a slug produces no path check at all - unverifiable, not fabrication, not silently excluded');
assert.equal(pass('see `dtolnay/semver` on GitHub and run `make test`'), true, 'a slug alongside a real citation does not drag a true answer down as if the slug were a fabricated path');

// Real repo-relative paths must keep resolving, including a slug-shaped
// two-segment one whose first segment is a real top-level directory of the
// checkout, and a deeper one carrying a known extension.
assert.equal(looksLikeGithubSlug(dir, 'docs/Makefile'), false, 'a real two-segment repo path is not misread as a slug - its first segment is a real top-level dir');
assert.equal(pass('see `.github/AI_POLICY.md`'), true, 'a real nested path with a known extension still resolves (regression: src/requests/__init__.py shape)');
assert.equal(pass('see `nonexistent-owner/nonexistent-file.md`'), false, 'a slug-shaped span WITH a known extension is still checked as a path and fails when invented');

console.log('ok   looksLikeGithubSlug (GitHub slug vs. repo-relative path)');

// --- cargo/Rust checker ------------------------------------------------------

const cargoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-cargo-'));
fs.writeFileSync(path.join(cargoDir, 'Cargo.toml'), [
  '[package]', 'name = "mycrate"', 'version = "0.1.0"', '',
  '[features]', 'default = []', 'serde = []', '',
  '[[bench]]', 'name = "parse"', 'harness = false', '',
  '[[example]]', 'name = "demo"', '',
  '[workspace]', 'members = ["crates/sub"]', '',
].join('\n'));
fs.mkdirSync(path.join(cargoDir, 'fuzz'));
fs.writeFileSync(path.join(cargoDir, 'fuzz', 'Cargo.toml'), [
  '[package]', 'name = "mycrate-fuzz"', 'version = "0.0.0"', '',
  '[workspace]', '',
  '[[bin]]', 'name = "parse_version"', 'path = "parse_version.rs"', '',
  '[[bin]]', 'name = "sort_version"', 'path = "sort_version.rs"', '',
].join('\n'));

const cargoPass = (text, opts) => citedFactsExistInRepoDir(text, cargoDir, opts).pass;
const noCargoFuzz = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-cargo-nofuzz-'));
fs.writeFileSync(path.join(noCargoFuzz, 'Cargo.toml'), '[package]\nname = "nofuzz"\n');

// subcommand vocabulary: real vs invented, third-party subcommands accepted.
assert.equal(cargoPass('run `cargo test`'), true, 'cargo test is real');
assert.equal(cargoPass('run `cargo frobnicate`'), false, 'an invented cargo subcommand fails');
assert.equal(cargoPass('run `cargo clippy --tests --benches -- -Dclippy::all -Dclippy::pedantic`'), true, 'clippy with lint flags is real');
assert.equal(cargoPass('run `cargo miri test`'), true, 'miri is a recognised third-party subcommand');

// `cargo install <crate>` installs from the registry - not a repo fact, same
// carve-out as npm's builtin subcommands.
assert.deepEqual(checksForSpan(cargoDir, 'cargo install cargo-fuzz'), [{ kind: 'cargo', ok: true }], 'cargo install <crate> is checked only as a real subcommand, not against repo state');

// feature flags: real vs invented, checked against [features].
assert.equal(cargoPass('run `cargo check --features serde`'), true, 'a real feature passes');
assert.equal(cargoPass('run `cargo check --features bogus`'), false, 'an invented feature fails');
assert.equal(cargoPass('run `cargo check --no-default-features --features serde`'), true, '--no-default-features alongside a real --features value passes');

// bench/example/bin targets: real vs invented, checked against [[bench]]/[[example]].
assert.equal(cargoPass('run `cargo bench parse`'), true, 'a real [[bench]] target passes');
assert.equal(cargoPass('run `cargo bench nope`'), false, 'an invented bench target fails');
assert.equal(cargoPass('run `cargo run --example demo`'), true, 'a real [[example]] target passes');
assert.equal(cargoPass('run `cargo run --example nope`'), false, 'an invented example target fails');

// workspace members / package name via -p/--package.
assert.equal(cargoPass('run `cargo test -p sub`'), true, 'a workspace member (by its path tail) resolves');
assert.equal(cargoPass('run `cargo test -p mycrate`'), true, 'the crate\'s own package name resolves via -p');
assert.equal(cargoPass('run `cargo test -p nope`'), false, 'an invented package name fails');

// toolchain override: `cargo +nightly fuzz ...` must not misread "+nightly" as the fuzz subcommand.
assert.equal(cargoPass('run `cargo +nightly fuzz check`'), true, 'a toolchain-qualified cargo fuzz citation is parsed correctly');
assert.equal(cargoPass('run `cargo +nightly fuzz run parse_version`'), true, 'toolchain override plus a real fuzz target both resolve');

// cargo-fuzz: real vs invented target, resolved against fuzz/Cargo.toml's own
// [[bin]] entries (semver's actual layout - not the fuzz_targets/ convention).
assert.equal(cargoPass('run `cargo fuzz run parse_version`'), true, 'a real fuzz [[bin]] target passes');
assert.equal(cargoPass('run `cargo fuzz run made_up_target`'), false, 'an invented fuzz target fails');
assert.equal(cargoPass('run `cargo fuzz build`'), true, 'a bare cargo fuzz build with no target only checks the subcommand');
assert.equal(cargoPass('run `cargo fuzz nonsense`'), false, 'an invented cargo-fuzz subcommand fails');
// `add`/`init` CREATE the target, so the name they cite is not in the checkout
// yet and must not be checked against fuzz/ - without the exemption this is a
// false flag on a correct citation.
assert.equal(cargoPass('run `cargo fuzz add new_target` to start a new one'), true, 'cargo fuzz add names a target it creates, not one that must already exist');
assert.equal(cargoPass('run `cargo fuzz init`'), true, 'cargo fuzz init scaffolds fuzz/ rather than naming an existing target');
assert.equal(citedFactsExistInRepoDir('run `cargo fuzz add new_target`', noCargoFuzz).pass, true, 'cargo fuzz add passes even where the repo has no fuzz/ at all yet');
assert.deepEqual(checkCargo(cargoDir, cargoDir, ['cargo', 'fuzz', 'run', 'parse_version']), { ok: true }, 'checkCargo takes (repoDir, cwdDir, tokens) directly and resolves a real fuzz target');

// the fuzz_targets/ convention (other crates' layout) also resolves, from cwd: fuzz.
const fuzzTargetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-cargo-fuzztargets-'));
fs.mkdirSync(path.join(fuzzTargetsDir, 'fuzz', 'fuzz_targets'), { recursive: true });
fs.writeFileSync(path.join(fuzzTargetsDir, 'fuzz', 'fuzz_targets', 'roundtrip.rs'), '');
assert.equal(citedFactsExistInRepoDir('run `cargo fuzz run roundtrip`', fuzzTargetsDir, { cwd: 'fuzz' }).pass, true, 'the fuzz_targets/*.rs convention resolves target names too');
assert.equal(citedFactsExistInRepoDir('run `cargo fuzz run nope`', fuzzTargetsDir, { cwd: 'fuzz' }).pass, false, 'an invented target still fails under the fuzz_targets/ convention');

// no Cargo.toml at all: the subcommand itself still checks real vs invented,
// but no repo state exists to check args against.
const noCargo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-nocargo-'));
assert.equal(citedFactsExistInRepoDir('run `cargo test`', noCargo).pass, true, 'cargo test is a real subcommand even with no Cargo.toml to check args against');
assert.equal(citedFactsExistInRepoDir('run `cargo bogus`', noCargo).pass, false, 'an invented subcommand still fails with no Cargo.toml at all');

console.log('ok   checkCargo / checksForSpan cargo (synthetic Rust fixture)');

// --- length-proportionality guard -------------------------------------------

const shortEvidence = 'a'.repeat(100);
assert.equal(lengthProportionateToEvidence('x'.repeat(250), { vars: { evidence: shortEvidence } }).pass, true, 'within the ratio cap passes');
const overCap = lengthProportionateToEvidence('x'.repeat(500), { vars: { evidence: shortEvidence } });
assert.equal(overCap.pass, false, 'output many times longer than the evidence fails the proportionality guard');
assert.ok(overCap.score < 1 && overCap.score > 0, 'over-cap score decays smoothly rather than jumping straight to 0');
assert.throws(() => lengthProportionateToEvidence('x', { vars: {} }), /vars\.evidence/, 'missing vars.evidence throws rather than scoring');

console.log('ok   lengthProportionateToEvidence (synthetic fixture)');

// --- go checker --------------------------------------------------------------
// Live dead-metric-zero pattern: zerolog rows citing real `go test`/`go
// vet`/`-tags binary_log` produced NO check at all (checksForSpan had no `go`
// handler), the same root cause as the missing cargo checker, just for Go.

const goDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-go-'));
fs.mkdirSync(path.join(goDir, 'encoder'));
fs.writeFileSync(path.join(goDir, 'encoder', 'encoder_cbor.go'), '//go:build binary_log\n\npackage encoder\n');
fs.writeFileSync(path.join(goDir, 'encoder', 'encoder_json.go'), '//go:build !binary_log\n\npackage encoder\n');

const goPass = (text, opts) => citedFactsExistInRepoDir(text, goDir, opts).pass;

assert.equal(goPass('run `go test -race -bench . -benchmem ./...`'), true, 'a real go subcommand with flags passes');
assert.equal(goPass('run `go vet ./cmd/lint/...`'), true, 'go vet is real');
assert.equal(goPass('run `go frobnicate`'), false, 'an invented go subcommand fails');
assert.deepEqual(checkGo(goDir, ['go']), null, 'bare go names no subcommand to check');

// -tags: a real build tag the repo's own //go:build comments name passes; an
// invented one fails.
assert.equal(goPass('run `go test -tags binary_log -race ./...`'), true, 'a real build tag passes');
assert.equal(goPass('run `go test -tags made_up_tag ./...`'), false, 'an invented build tag fails');
// The joined form is what `go help build` documents; reading only the
// separated one skipped verification silently, so `-tags=bogus_tag` passed.
assert.equal(goPass('run `go test -tags=binary_log ./...`'), true, 'the joined -tags=<name> form is verified too');
assert.equal(goPass('run `go test -tags=made_up_tag ./...`'), false, 'an invented tag in the joined form fails rather than being skipped');
assert.equal(goPass('run `go test --tags=made_up_tag ./...`'), false, 'the double-dash joined form is verified too');
assert.equal(goPass('run `go build -tags=binary_log,made_up_tag ./...`'), false, 'a comma list in the joined form checks every tag');

console.log('ok   checkGo / checksForSpan go (synthetic Go fixture)');
