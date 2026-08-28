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
