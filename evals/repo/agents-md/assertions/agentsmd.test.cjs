#!/usr/bin/env node
// Offline self-check for the AGENTS.md-effect suite. run.sh runs this before it
// buys a single token. Every case here is a synthetic transcript, so nothing
// touches the network or a model.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const effect = require('../../../lib/agents-md-effect.js');
const suite = require('./agentsmd.cjs');

// The suite's file:// entry point must actually re-export what the config names.
// A bare `module.exports = require(...)` passes at runtime and makes
// lib/check-suite.py report a dangling grader, so pin the shape.
for (const fn of ['followsStatedCommand', 'taskCorrect', 'unmentionedUnchanged']) {
  assert.strictEqual(typeof suite[fn], 'function', `assertions/agentsmd.cjs must export ${fn}`);
}

// ---------------------------------------------------------------------------
// statedCommands: prefer/avoid split
// ---------------------------------------------------------------------------
const SAMPLE = [
  '# AGENTS.md',
  '',
  '- On a fresh clone, run `make plugins`. Use `make test`, not bare `go test ./...`, so the trees are present.',
  '- Run `npm --prefix scripts ci` before vetting tests.',
  '- Never hand-edit `internal/schema/` or `frontend/src/generated/`.',
  '- Follow `docs/configuration/agents.md`; only `agent-card.json` and `prompt.md` belong in a bundle.',
].join('\n');

{
  const b = effect.statedCommands(SAMPLE);
  assert.strictEqual(b.length, 2, `expected 2 command-bearing bullets, got ${b.length}`);
  assert.deepStrictEqual(b[0].prefer, ['make plugins', 'make test']);
  assert.deepStrictEqual(b[0].avoid, ['go test ./...']);
  assert.deepStrictEqual(b[1].prefer, ['npm --prefix scripts ci']);
  assert.deepStrictEqual(b[1].avoid, []);
  // Paths in backticks are not commands. A bullet that only names files must
  // not become a probe target - "did you run internal/schema/" is nonsense.
  assert.ok(!b.some((x) => x.prefer.concat(x.avoid).some((c) => c.includes('internal/schema'))),
    'a backticked path was parsed as a command');
  assert.ok(!b.some((x) => x.prefer.includes('agent-card.json')), 'a filename was parsed as a command');
}

// ---------------------------------------------------------------------------
// prepareRepo: the treatment must not be readable by the baseline arm
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amd-prep-'));
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  const git = (...a) => execFileSync('git', ['-C', src, ...a], { stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(src, 'AGENTS.md'), '- Use `make test`, not `go test ./...`.\n');
  fs.symlinkSync('AGENTS.md', path.join(src, 'CLAUDE.md'));
  fs.writeFileSync(path.join(src, 'Makefile'), 'test:\n\tgo test ./...\n');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'x');

  const dest = path.join(tmp, 'prepared');
  const out = effect.prepareRepo(src, 'HEAD', dest);
  assert.deepStrictEqual(out.removed.sort(), ['AGENTS.md', 'CLAUDE.md']);
  assert.ok(fs.existsSync(path.join(dest, 'Makefile')), 'the tracked tree must survive');
  // lstat, because the CLAUDE.md symlink is dangling once AGENTS.md is gone and
  // existsSync would report false while `ls` still shows the entry.
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    assert.throws(() => fs.lstatSync(path.join(dest, f)), `${f} is still on disk in the prepared copy`);
  }
  // The leak that matters: committing before the removal would leave the file
  // recoverable with `git show HEAD:AGENTS.md`, handing the baseline the
  // treatment through a channel nothing else checks.
  assert.throws(
    () => execFileSync('git', ['-C', dest, 'show', 'HEAD:AGENTS.md'], { stdio: 'pipe' }),
    'AGENTS.md is recoverable from the prepared copy\'s git history',
  );
  // Checking HEAD alone is not enough, and this was caught by mutating the
  // source rather than by reading it: committing before the removal and then
  // committing again leaves HEAD clean while `git show HEAD~1:AGENTS.md` still
  // serves the treatment. Ask whether the path appears in ANY commit.
  assert.strictEqual(
    execFileSync('git', ['-C', dest, 'log', '--all', '--format=%H', '--', 'AGENTS.md', 'CLAUDE.md'], { encoding: 'utf8' }).trim(),
    '',
    'a context file appears somewhere in the prepared copy\'s history',
  );
  // And the history really is there, or the `git diff` a case verifies with has
  // nothing to diff against.
  assert.match(execFileSync('git', ['-C', dest, 'log', '--oneline'], { encoding: 'utf8' }), /prepared from HEAD/);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Grader fixtures
// ---------------------------------------------------------------------------
const subjectFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'amd-subj-')), 'AGENTS.md');
fs.writeFileSync(subjectFile, SAMPLE);
process.env.EVAL_SUBJECT_PATH = subjectFile;

// The shape lib/skill-tools.js actually returns: commands is the ordered list of
// shell command strings the row ran, verify is the case's post-turn check.
const md = (commands, extra = {}) => ({ metadata: { commands, commandsRun: commands.length, ...extra } });
const ctx = (commands, vars, extra) => ({ ...md(commands, extra), vars });

// --- follows_stated_command -------------------------------------------------
{
  const good = suite.followsStatedCommand('', ctx(['make plugins', 'make test'], { probe_line: 0 }));
  assert.strictEqual(good.score, 1, `expected 1, got ${good.score}: ${good.reason}`);

  // Ran the avoided form as well: the line was not followed.
  const bad = suite.followsStatedCommand('', ctx(['make plugins', 'go test ./...'], { probe_line: 0 }));
  assert.strictEqual(bad.score, 0, 'running the avoided command must score 0');

  // Ran neither.
  const neither = suite.followsStatedCommand('', ctx(['ls', 'cat README.md'], { probe_line: 0 }));
  assert.strictEqual(neither.score, 0, 'running neither form must score 0');

  // Whitespace in the transcript must not decide the verdict.
  const spaced = suite.followsStatedCommand('', ctx(['make   test'], { probe_line: 0 }));
  assert.strictEqual(spaced.score, 1, 'command matching must normalise whitespace');

  // A grader that cannot run is not a verdict of zero. report.js keys its
  // errored-row banner off "could not run".
  assert.throws(() => suite.followsStatedCommand('', { vars: { probe_line: 0 } }), /could not run/);
  assert.throws(() => suite.followsStatedCommand('', ctx(['make test'], { probe_line: 99 })), /could not run/);
  assert.throws(() => suite.followsStatedCommand('', ctx(['make test'], {})), /could not run/);
}

// --- task_correct -----------------------------------------------------------
{
  const pass = suite.taskCorrect('', ctx([], {}, { verify: { cmd: 'go build ./...', exitCode: 0 } }));
  assert.strictEqual(pass.score, 1);

  const fail = suite.taskCorrect('', ctx([], {}, { verify: { cmd: 'go build ./...', exitCode: 2, stdout: 'boom' } }));
  assert.strictEqual(fail.score, 0);
  assert.match(fail.reason, /boom/, 'a failure must carry the verify output, or the row is unreadable');

  // A case can want a non-zero exit - "leave it still failing" is a real ask.
  const inverted = suite.taskCorrect('', ctx([], { verify_exit: 1 }, { verify: { cmd: 'x', exitCode: 1 } }));
  assert.strictEqual(inverted.score, 1);

  // Never score a missing or refused verification as failure: the case declared
  // one and the harness could not complete it, which is not a bad answer.
  assert.throws(() => suite.taskCorrect('', ctx([], {})), /could not run/);
  assert.throws(
    () => suite.taskCorrect('', ctx([], {}, { verify: { cmd: 'x', exitCode: -1, refused: 'wall clock spent' } })),
    /could not run.*refused/s,
    'a spent wall clock must error, not record the task as failed',
  );
  assert.throws(() => suite.taskCorrect('', { vars: {} }), /could not run/);
}

// --- unmentioned_unchanged --------------------------------------------------
{
  const scope = 'make test\nmake generate\ngo test ./...';
  const clean = suite.unmentionedUnchanged('', ctx(['grep -rn DefaultCaps .', 'cat internal/workspace/caps.go'], { out_of_scope: scope }));
  assert.strictEqual(clean.score, 1);

  const strayed = suite.unmentionedUnchanged('', ctx(['grep -rn x .', 'make test'], { out_of_scope: scope }));
  assert.strictEqual(strayed.score, 0);
  assert.match(strayed.reason, /make test/, 'the reason must name what strayed');

  // A YAML list here would have been silently expanded into one test per
  // element by promptfoo; refuse it loudly rather than grading one line.
  assert.throws(() => suite.unmentionedUnchanged('', ctx(['ls'], { out_of_scope: ['make test'] })), /could not run/);
  assert.throws(() => suite.unmentionedUnchanged('', ctx(['ls'], {})), /could not run/);
}

// ---------------------------------------------------------------------------
// Arm wiring: the file is the ONLY difference
// ---------------------------------------------------------------------------
{
  process.env.EVAL_WORKSPACE_DIR = '/tmp/amd-workspace';
  const arms = effect.arms((vars) => vars.task);
  const vars = { task: 'do the thing', verify: 'go build ./...' };
  const base = arms.noSkill({ vars });
  const treated = arms.skillCurrent({ vars });

  assert.deepStrictEqual(base.config, treated.config, 'both arms must get an identical environment');
  assert.strictEqual(base.config.workspaceDir, '/tmp/amd-workspace');
  assert.strictEqual(base.config.verify, 'go build ./...');
  assert.ok(!('skillDir' in base.config), 'skillDir would serve the whole repo to one arm only');
  // withConfigEveryArm spreads its argument last, so the check must survive it.
  assert.ok('verify' in treated.config, 'workspaceDir must not clobber the case\'s own check');

  // The user turn is byte-identical; only the system message differs, and only
  // by the file's text.
  assert.strictEqual(base.prompt[1].content, treated.prompt[1].content);
  assert.strictEqual(base.prompt[1].content, 'do the thing');
  assert.ok(!base.prompt[0].content.includes('make test'), 'the baseline system prompt must not carry the file');
  assert.ok(treated.prompt[0].content.includes('make test'), 'the treated system prompt must carry the file');
  // ...and it must be framed as repo context, not as "a skill to follow": the
  // default lib/arms.js wrapper would make the arms differ by framing too.
  assert.ok(!/skill/i.test(treated.prompt[0].content), 'an AGENTS.md must not be introduced as a skill');

  // The verification command must never reach the model.
  for (const arm of [base, treated]) {
    assert.ok(!JSON.stringify(arm.prompt).includes('go build'), 'the verify command leaked into the prompt');
  }

  // A case that declares no check gets none, rather than an empty string the
  // provider would try to run.
  assert.ok(!('verify' in arms.noSkill({ vars: { task: 't' } }).config));
}

console.log('agents-md-effect: parser, repo preparation, three graders and arm wiring pass');
