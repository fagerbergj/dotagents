// Offline check on materialise(). A real local repository stands in for GitHub -
// file:// is a remote as far as git is concerned - so the fetch, the diff range
// and the archived tree are all exercised without network or credentials.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { materialise, paths, ROOT } = require('./fixtures.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixtures-test-'));
const upstream = path.join(tmp, 'upstream');
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });

fs.mkdirSync(upstream);
git(upstream, 'init', '-q', '-b', 'main');
git(upstream, 'config', 'user.email', 't@t');
git(upstream, 'config', 'user.name', 't');
fs.writeFileSync(path.join(upstream, 'a.txt'), 'one\ntwo\n');
git(upstream, 'add', '-A'); git(upstream, 'commit', '-qm', 'base');
const base = git(upstream, 'rev-parse', 'HEAD').trim();

// The commit a reviewer saw, then a later one - the diff must cover only the first.
fs.writeFileSync(path.join(upstream, 'a.txt'), 'one\ntwo\nreviewed\n');
fs.writeFileSync(path.join(upstream, 'added.txt'), 'new file\n');
git(upstream, 'add', '-A'); git(upstream, 'commit', '-qm', 'reviewed');
const reviewed = git(upstream, 'rev-parse', 'HEAD').trim();
fs.writeFileSync(path.join(upstream, 'a.txt'), 'one\ntwo\nreviewed\nlater\n');
git(upstream, 'add', '-A'); git(upstream, 'commit', '-qm', 'after the review');
git(upstream, 'update-ref', 'refs/pull/1/head', 'HEAD');

const f = { name: 'local-1', repo: `x/${path.basename(upstream)}`, pr: 1, base, reviewed };
// materialise() builds the clone URL from `repo`; point the remote at the local
// repository instead, which is the one thing this test has to stub.
const p = paths(f);
fs.mkdirSync(p.git, { recursive: true });
git(p.git, 'init', '-q');
git(p.git, 'remote', 'add', 'origin', upstream);

materialise(f);

const patch = fs.readFileSync(p.patch, 'utf8');
assert.match(patch, /\+reviewed/, 'the diff must contain the reviewed commit');
assert.ok(!/\+later/.test(patch), 'the diff must stop at the reviewed commit, not the PR tip');
assert.match(patch, /added\.txt/, 'a file the change adds belongs in the diff');

assert.equal(fs.readFileSync(path.join(p.tree, 'a.txt'), 'utf8'), 'one\ntwo\nreviewed\n',
  'the tree is archived at the reviewed commit, not the tip');
assert.ok(fs.existsSync(path.join(p.tree, 'added.txt')),
  'files the change adds exist in the tree - citing a line in one is not a fabrication');

// A commit the remote does not have must fail loudly rather than silently
// reviewing a different tree.
// Same repo, so paths() hands back the same git dir - no second remote to add.
const bogus = { ...f, name: 'local-2', reviewed: '0'.repeat(40) };
assert.throws(() => materialise(bogus), /cannot be fetched|not a valid|fatal/i,
  'an unobtainable reviewed commit throws');

fs.rmSync(path.join(ROOT, 'x-' + path.basename(upstream)), { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   fixtures (diff range, archived tree, unobtainable commit)');
