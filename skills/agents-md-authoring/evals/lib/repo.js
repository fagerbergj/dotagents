// Pinned, read-only checkouts of small real-world repos, served to both prompt
// arms via the shared skill-tools provider's `repoDir` (see prompts/arms.js).
// The repo is the subject matter this skill authors against, exactly as
// review-code serves its PR fixtures to both arms - not a skill affordance.
//
// Unlike lib/fixtures.js (which fetches a PR ref + diff and rebuilds them most
// runs), a checkout() call here is a single `git fetch` of one pinned commit
// that never changes, short-circuited by a local `rev-parse HEAD` check on
// every call after the first. That is cheap enough to call from a prompt
// function or an assertion on every row, unlike fixtures.js's `materialise()`,
// which the comment there insists must run before the eval starts, once.
//
// GET only: init, remote add, fetch, checkout. Never pushes, comments, or
// writes to GitHub.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '.cache', 'agentsmd-repos');

const REPOS = {
  // psf/requests, pinned 2026-08-24. Has both a Makefile and a tox.ini, a
  // requirements-dev.txt the tests actually need beyond `pip install -e .`,
  // pytest configured with `--doctest-modules`, and a real
  // `.github/AI_POLICY.md` - a genuine, non-obvious hazard (no unsupervised
  // agentic tools, no LLM co-author, a human must own every change) that an
  // agent working in this repo needs to know before it acts, not after.
  requests: { repo: 'psf/requests', sha: '5460f467b02e49471c0fd6cfc9ca0adab6351f98' },
  // sindresorhus/is-plain-obj, pinned at tag v4.1.0. Five files, ESM-only, a
  // single chained `npm test` script. Deliberately boring: everything worth
  // knowing is one glance at package.json, so it is the negative control for
  // inventing content to fill a file that does not need one.
  'is-plain-obj': { repo: 'sindresorhus/is-plain-obj', sha: '97f38e8836f86a642cce98fc6ab3058bc36df181' },
  // dtolnay/semver, pinned 2026-08-28 (HEAD of master). A tight single-purpose
  // Rust crate with three genuinely different subtree hazards: fuzz/ is its own
  // isolated cargo workspace needing a nightly toolchain and cargo-fuzz, not
  // cargo test at all; tests/ silently skips its Node.js differential test
  // against the real npm `semver` package unless RUSTFLAGS=--cfg
  // test_node_semver is set; and the MSRV pinned in Cargo.toml (1.68) is
  // check-only in CI - cargo test itself is never run at that toolchain
  // version.
  semver: { repo: 'dtolnay/semver', sha: '280ebcb6edac3aa4cdc545dbff8a26c5ac4861fe' },
  // jqlang/jq, pinned 2026-08-28 (HEAD of master). C/autotools ecosystem: a
  // fresh clone has an uninitialized `vendor/oniguruma` git submodule (this
  // checkout does not run submodule update - that is the authentic, real
  // condition an agent actually lands in), and `./configure` alone silently
  // link against a possibly-mismatched system oniguruma instead of failing;
  // docs/ is a wholly separate Python/pipenv toolchain whose absence
  // degrades the build with a warning instead of an error, silently
  // skipping the manpage tests.
  jq: { repo: 'jqlang/jq', sha: '41b8edfe5437fcd25a072081c05f9f770f9e9b85' },
  // rs/zerolog, pinned 2026-08-28 (HEAD of master). Go/go-test ecosystem: CI
  // requires two disjoint `go test` invocations (plain, and `-tags
  // binary_log`) because encoder_json.go/encoder_cbor.go are mutually
  // exclusive build-tagged files with no shared test coverage; go.mod pins
  // `go 1.23`, which actually rejects older local toolchains; journald/'s own
  // test file is Linux-only (`//go:build linux`) so `go test ./...` silently
  // runs zero tests for it elsewhere; and cmd/lint/ is a separate nested Go
  // module invisible to root `go build ./...`/`go vet ./...`.
  zerolog: { repo: 'rs/zerolog', sha: 'dfd11cca1143ba03ba0fc0ff14e5dbb4d61f6f0a' },
};

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function checkout(name) {
  const spec = REPOS[name];
  if (!spec) throw new Error(`unknown repo "${name}" - add it to lib/repo.js REPOS`);
  const dir = path.join(ROOT, name);
  if (fs.existsSync(dir)) {
    try {
      if (git(dir, ['rev-parse', 'HEAD']).trim() === spec.sha) return dir;
    } catch { /* corrupt or partial checkout - fall through to a clean re-clone */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', `https://github.com/${spec.repo}.git`]);
  git(dir, ['fetch', '-q', '--depth=1', 'origin', spec.sha]);
  git(dir, ['checkout', '-q', spec.sha]);
  const head = git(dir, ['rev-parse', 'HEAD']).trim();
  if (head !== spec.sha) throw new Error(`${name}: checkout landed on ${head}, expected ${spec.sha}`);
  return dir;
}

module.exports = { REPOS, checkout, ROOT };
