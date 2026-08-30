// Real bug-fix commits as eval input, pinned by exact SHA.
//
// evals/lib/fixtures.js exists for PR *reviews*: it serves the tree AS
// PROPOSED (at `reviewed`), because a reviewer is judging a diff that is
// already there. fix-bug is the opposite claim - the model has to PRODUCE the
// fix, so it must never see it. This loader serves the tree at the fix
// commit's PARENT and nothing else. The grader's answer key is the
// `sourceFiles`/`functions` arrays in tests/bugfix-fixtures.json, not a diff:
// computing `git diff parent..fix` here would lazily fetch the fix-side blobs
// from github.com inside the --filter=blob:none clone, i.e. network from a
// per-row read path.
//
// It also fetches by plain commit SHA rather than a PR ref. fixtures.js needs
// `refs/pull/${pr}/head` because a *reviewed* commit is often force-pushed
// over and orphaned from history (see its comment on `reviewed`). A merged
// bug-fix commit doesn't have that problem: it sits on the default branch,
// which is exactly the case fixtures.js's own comment says GitHub serves a
// raw SHA for (`uploadpack.allowReachableSHA1InWant`), so a direct `git fetch
// origin <sha>` is enough for both the parent and the fix.
//
// Deliberately NOT named tests/fixtures.json: evals/lib/fetch-fixtures.js
// (shared, run by run.sh for every suite) reads that exact filename and calls
// evals/lib/fixtures.js's PR-shaped materialise() on whatever it finds there.
// This suite's fixtures have no `pr` field, so that call would fail loudly on
// every run. Naming this file differently makes the shared fetch step a
// no-op here instead; lib/fetch-bugfix-fixtures.js does the real work, and
// run.sh calls it by the `lib/fetch-*.js` name.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '.cache', 'fixtures');

const slug = (repo) => repo.replace('/', '-');
const paths = (f) => {
  const base = path.join(ROOT, slug(f.repo));
  return { git: path.join(base, 'git'), tree: path.join(base, `${f.name}-parent`) };
};

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Network. Called by lib/fetch-bugfix-fixtures.js before a run, never from a
// prompt function - those run per row and must not reach out.
function materialise(f, log = () => {}) {
  const p = paths(f);
  if (!fs.existsSync(p.git)) {
    fs.mkdirSync(p.git, { recursive: true });
    git(p.git, ['init', '-q']);
    git(p.git, ['remote', 'add', 'origin', `https://github.com/${f.repo}.git`]);
  }
  git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', f.parent]);
  // Absent for the "not a bug" controls: there is no accepted fix to withhold.
  // Nothing reads the fix commit; fetching it is the check that the pinned SHA
  // is still obtainable, which is what keeps sourceFiles re-derivable.
  if (f.fix) git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', f.fix]);
  fs.rmSync(p.tree, { recursive: true, force: true });
  fs.mkdirSync(p.tree, { recursive: true });
  execFileSync('bash', ['-c', `git -C ${JSON.stringify(p.git)} archive ${f.parent} | tar -x -C ${JSON.stringify(p.tree)}`]);
  log(`  ${f.name}: ${f.repo}@${f.parent.slice(0, 7)}${f.fix ? ` (fix ${f.fix.slice(0, 7)} withheld from the tree)` : ' (no fix - not-a-bug control)'}`);
}

// Read-only. Throws rather than fetching: a missing fixture at eval time means
// the prepare step did not run, and silently reviewing nothing would score.
function load(f) {
  const p = paths(f);
  if (!fs.existsSync(p.tree)) {
    throw new Error(`fixture ${f.name} not materialised - run lib/fetch-bugfix-fixtures.js first`);
  }
  return { ...f, dir: p.tree };
}

function specs(suiteDir) {
  const file = path.join(suiteDir, 'tests', 'bugfix-fixtures.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { materialise, load, specs, paths, ROOT };
