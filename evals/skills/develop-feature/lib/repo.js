// One real repository, pinned to one tagged release commit, checked out once
// and served to BOTH arms via evals/lib/skill-tools.js's `repoDir` (same
// mechanism review-code uses - reading the code under a plan is not a skill
// affordance, so gating it on the skill would measure file access, not the
// skill). Unlike review-code's evals/lib/fixtures.js, this suite has no diff
// to materialise per case: every case plans against the same tree, so one
// fetch covers the whole suite instead of one per fixture.
//
// v2.86.0 is a tagged release, and its tip is a real merge commit by a human
// maintainer (Kynan Ware, verified via `git log -1 --format='%an <%ae>'`) -
// not a bot commit - so the tree these graders check identifiers against is
// the project's own, not a synthetic snapshot.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = 'cli/cli';
const TAG = 'v2.86.0';
const SHA = '49f72234acd346666a4646a0f5a427fb3543debc';

// Shares evals/.cache/, the same root evals/lib/fixtures.js uses for PR
// fixtures, so the existing `evals/.cache/` gitignore entry covers this too
// without a suite-local one.
const ROOT = path.resolve(__dirname, '..', '..', '..', '.cache', 'repo-develop-feature');
const GIT_DIR = path.join(ROOT, 'git');
const TREE_DIR = path.join(ROOT, 'tree');

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Network. Run this once via `node lib/fetch-repo.js` before an eval - never
// from a prompt function, which runs per row and must not reach out. Every
// case shares one tree, so one call here covers the whole suite.
function materialise(log = () => {}) {
  if (!fs.existsSync(GIT_DIR)) {
    fs.mkdirSync(GIT_DIR, { recursive: true });
    git(GIT_DIR, ['init', '-q']);
    git(GIT_DIR, ['remote', 'add', 'origin', `https://github.com/${REPO}.git`]);
  }
  try {
    git(GIT_DIR, ['fetch', '-q', '--filter=blob:none', 'origin', SHA]);
  } catch (err) {
    // A dropped SHA and a dead network fail identically here, so the git error
    // rides along as `cause` rather than being replaced by a guess at which.
    throw new Error(`repo fixture: ${SHA.slice(0, 12)} cannot be fetched from ${REPO} - GitHub has dropped it, or the fetch could not reach GitHub at all; see cause. Re-pin if the commit is gone.`, { cause: err });
  }
  fs.rmSync(TREE_DIR, { recursive: true, force: true });
  fs.mkdirSync(TREE_DIR, { recursive: true });
  execFileSync('bash', ['-c', `git -C ${JSON.stringify(GIT_DIR)} archive ${SHA} | tar -x -C ${JSON.stringify(TREE_DIR)}`]);
  log(`  ${REPO}@${SHA.slice(0, 7)} (${TAG}) -> ${TREE_DIR}`);
}

// Read-only. Throws rather than fetching: a missing tree at eval time means
// the prepare step did not run, and silently planning against nothing would
// score instead of failing loudly.
function dir() {
  if (!fs.existsSync(TREE_DIR) || fs.readdirSync(TREE_DIR).length === 0) {
    throw new Error('repo fixture not materialised - run `node lib/fetch-repo.js` first');
  }
  return TREE_DIR;
}

module.exports = { REPO, TAG, SHA, materialise, dir };
