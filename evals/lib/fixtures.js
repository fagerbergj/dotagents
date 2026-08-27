// Real pull requests as eval input. A case names a fixture; this resolves it to
// the diff that PR made and a checkout of the tree AS PROPOSED, so a reviewer can
// open the surrounding code rather than judging from hunks alone - which is the
// whole claim review-code makes.
//
// The tree at the commit the review was actually written against - GitHub records
// it as `reviews[].commit_id`. Pinning the merged head instead is wrong twice
// over: later commits fix what the review asked for, so the defect the ground
// truth names is no longer in the diff, and files the change adds do not exist at
// the base, so citing a line it appends looks like a fabrication.
//
// Both SHAs are pinned, and the reviewed one is fetched by SHA rather than assumed
// reachable: a blocking review is usually followed by a force-push that orphans
// the commit it was written against. A fixture GitHub no longer serves fails
// loudly instead of quietly re-scoping what is under review.
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
  // GitHub serves a raw SHA only when it is reachable from an advertised ref
  // (uploadpack.allowReachableSHA1InWant), which is why the base fetch below
  // works - it sits on the default branch - while a PR commit does not, and has
  // to come in through the pull ref.
  git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', `refs/pull/${f.pr}/head:refs/fixtures/${f.pr}`]);
  // The reviewed commit must still be an ancestor of the PR ref. A force-push
  // makes it unreachable, and the fixture is then unusable rather than merely
  // stale - fail loudly instead of silently reviewing a different tree.
  // Fetch the reviewed commit explicitly rather than asking whether it is already
  // present. `cat-file -e` only inspects this clone's object database, so on a warm
  // cache an object left by an earlier fetch passes long after CI on a cold clone
  // would fail - the check has to exercise the network path it is standing in for.
  //
  // Ancestry would be the wrong test. A blocking review is normally followed by a
  // force-push, which orphans the reviewed commit: four of these sixteen fixtures
  // are no longer ancestors of their PR ref, and all four are CHANGES_REQUESTED,
  // which is the half the suite most needs. GitHub still serves those commits by
  // SHA, verified on a cold clone, so obtainability is the property that matters.
  try {
    git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', f.reviewed]);
  } catch {
    throw new Error(`fixture ${f.name}: reviewed commit ${f.reviewed.slice(0, 12)} cannot be fetched from ${f.repo} - GitHub has dropped it; re-pin or drop the fixture`);
  }
  git(p.git, ['fetch', '-q', '--filter=blob:none', 'origin', f.base]);
  // Three dots: the base branch moves on after a PR opens, so diffing against its
  // tip would fold in everyone else's commits. The merge base is what the
  // reviewer was looking at.
  const mergeBase = git(p.git, ['merge-base', f.base, f.reviewed]).trim();
  fs.writeFileSync(p.patch, git(p.git, ['diff', `${mergeBase}..${f.reviewed}`]));
  fs.rmSync(p.tree, { recursive: true, force: true });
  fs.mkdirSync(p.tree, { recursive: true });
  execFileSync('bash', ['-c', `git -C ${JSON.stringify(p.git)} archive ${f.reviewed} | tar -x -C ${JSON.stringify(p.tree)}`]);
  log(`  ${f.name}: ${f.repo}#${f.pr} ${mergeBase.slice(0, 7)}..${f.reviewed.slice(0, 7)} (as reviewed)`);
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
