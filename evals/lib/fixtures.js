// Real pull requests as eval input. A case names a fixture; this resolves it to
// the diff that PR actually made and a checkout of the tree it was opened
// against, so a reviewer can open the surrounding code rather than judging from
// hunks alone - which is the whole claim review-code makes.
//
// Both SHAs are pinned. `refs/pull/<n>/head` moves under a force-push, so the
// ref is how the objects are reached and the pinned head is what is verified
// against; a fixture that drifts fails loudly instead of quietly re-scoping.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '.cache', 'fixtures');

const slug = (repo) => repo.replace('/', '-');
const paths = (f) => {
  const base = path.join(ROOT, slug(f.repo));
  return { git: path.join(base, 'git'), tree: path.join(base, `pr-${f.pr}`), patch: path.join(base, `pr-${f.pr}.patch`) };
};

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Network. Called by lib/fetch-fixtures.js before a run, never from a prompt
// function - those run per row and must not reach out.
function materialise(f, log = () => {}) {
  const p = paths(f);
  if (!fs.existsSync(p.git)) {
    fs.mkdirSync(p.git, { recursive: true });
    git(p.git, ['init', '-q']);
    git(p.git, ['remote', 'add', 'origin', `https://github.com/${f.repo}.git`]);
  }
  // blob:none keeps the fetch small; `git archive` below hydrates what it needs.
  // A raw SHA cannot be fetched from GitHub, so the PR ref is the way in and the
  // base comes along with it as an ancestor of the head.
  git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', `refs/pull/${f.pr}/head:refs/fixtures/${f.pr}`]);
  const head = git(p.git, ['rev-parse', `refs/fixtures/${f.pr}`]).trim();
  if (head !== f.head) {
    throw new Error(`fixture ${f.name}: refs/pull/${f.pr}/head is ${head.slice(0, 12)}, pinned ${f.head.slice(0, 12)} - the PR was force-pushed; re-pin or drop it`);
  }
  git(p.git, ['cat-file', '-e', `${f.base}^{commit}`]);
  fs.writeFileSync(p.patch, git(p.git, ['diff', `${f.base}..${head}`]));
  fs.rmSync(p.tree, { recursive: true, force: true });
  fs.mkdirSync(p.tree, { recursive: true });
  execFileSync('bash', ['-c', `git -C ${JSON.stringify(p.git)} archive ${f.base} | tar -x -C ${JSON.stringify(p.tree)}`]);
  log(`  ${f.name}: ${f.repo}#${f.pr} ${f.base.slice(0, 7)}..${head.slice(0, 7)}`);
}

// Read-only. Throws rather than fetching: a missing fixture at eval time means
// the prepare step did not run, and silently reviewing nothing would score.
function load(f) {
  const p = paths(f);
  if (!fs.existsSync(p.patch) || !fs.existsSync(p.tree)) {
    throw new Error(`fixture ${f.name} not materialised - run lib/fetch-fixtures.js first (run.sh does)`);
  }
  return { ...f, diff: fs.readFileSync(p.patch, 'utf8'), dir: p.tree };
}

function specs(suiteDir) {
  const file = path.join(suiteDir, 'tests', 'fixtures.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { materialise, load, specs, paths, ROOT };
