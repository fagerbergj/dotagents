// Shared machinery for measuring whether a repository's AGENTS.md changes what
// an agent DOES. Repo-agnostic: everything here reads the subject file and the
// case's own declarations, so a second repo supplies only tests/cases.yaml.
//
// The question, and the standing answer to beat, come from Gloaguen, Mündler,
// Müller, Raychev and Vechev (ETH Zurich), "Evaluating AGENTS.md: Are
// Repository-Level Context Files Helpful for Coding Agents?", arXiv:2602.11988:
//   "Surprisingly, we find that providing context files does not generally
//    improve task success rates, while increasing inference cost by over 20%
//    on average."
// Their redundancy ablation is the design's core: stripping the repo's other
// documentation moved the same file from -2% to +2.7%, and their conclusion is
// that a context file "should only contain specific additional instructions
// beyond what is already available in the codebase". That is why every case
// carries a `discoverable` tag and why the two populations are never averaged.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Files that ARE the treatment. The baseline arm must not be able to read them
// back off disk, or the arms stop differing by the file. CLAUDE.md is usually a
// symlink to AGENTS.md (it is in quack); .local is the untracked host-specific
// companion some repos reference.
const CONTEXT_FILES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.md.local', 'CLAUDE.local.md'];

// ---------------------------------------------------------------------------
// Repo preparation
// ---------------------------------------------------------------------------

// Materialise the tracked tree of `repo` at `ref` into `dest`, minus the context
// files. `git archive` is deliberate: it exports exactly what is committed, so
// an "on a fresh clone" task really starts from a fresh clone, and it never
// touches the source repository (no worktree, no checkout, no index write).
//
// Untracked-but-required build inputs (a vendored dependency tree, a module
// cache) are NOT restored here - they belong to the container image, because
// only the image can also carry the toolchain that consumes them. See
// `seed` for the escape hatch.
function prepareRepo(repo, ref, dest, { seed = [] } = {}) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync('bash', [
    '-c',
    `git -C ${JSON.stringify(repo)} archive ${JSON.stringify(ref)} | tar -x -C ${JSON.stringify(dest)}`,
  ]);
  for (const s of seed) {
    execFileSync('cp', ['-a', path.join(repo, s), path.join(dest, s)]);
  }
  const removed = [];
  for (const f of CONTEXT_FILES) {
    const p = path.join(dest, f);
    // lstat, not exists: CLAUDE.md is a dangling symlink once AGENTS.md is gone,
    // and existsSync follows the link and reports false while the entry is still
    // there for `ls` to show.
    let there = false;
    try { fs.lstatSync(p); there = true; } catch { /* absent */ }
    if (there) { fs.rmSync(p, { recursive: true, force: true }); removed.push(f); }
  }
  // Committed AFTER the removal, never before: an earlier commit would put
  // AGENTS.md in the history and `git show HEAD:AGENTS.md` would hand the
  // baseline arm the treatment.
  //
  // A `git archive` extract has no .git, so a case cannot verify itself with
  // `git diff`. One commit of the prepared tree gives every case a clean
  // baseline to diff against. It also withholds the real history from both
  // arms equally - a confound removed, at the cost of a capability a real
  // agent would have; say so rather than pretending the environment is whole.
  execFileSync('git', ['-C', dest, 'init', '-q']);
  execFileSync('git', ['-C', dest, 'add', '-A']);
  execFileSync('git', ['-C', dest, '-c', 'user.email=eval@local', '-c', 'user.name=eval',
    'commit', '-q', '-m', `prepared from ${ref}`]);
  return { dir: dest, removed };
}

// ---------------------------------------------------------------------------
// Reading the subject
// ---------------------------------------------------------------------------

// Every backticked span on a bullet, in order. Used for both the prefer/avoid
// split and the "did any stated command get run" fallback.
const ticked = (line) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

// A token is treated as a command when it starts with a word and contains a
// space or a known runner - "make test", "go test ./...", "npm --prefix ...".
// A bare `internal/schema/` or `agent-card.json` is a path, not a command, and
// scoring "did you run it" against a path is a category error.
const COMMANDISH = /^(?:[a-z][\w.-]*)(?:\s|$)/i;
const isCommand = (t) => COMMANDISH.test(t) && (/\s/.test(t) || /^(make|npm|go|git|quack|pytest|cargo|yarn|pnpm)$/i.test(t));

// Splits one bullet into what it tells you to run and what it tells you not to.
// Mechanical and repo-agnostic: the negation marker splits the bullet, ticked
// commands before it are preferred, ticked commands after it are avoided.
// "Use `make test`, not bare `go test ./...`" -> prefer make test, avoid go test.
const NEGATION = /\b(?:not|never|rather than|instead of|over|don't|do not)\b/i;

function statedCommands(agentsMd) {
  const out = [];
  for (const raw of agentsMd.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('-') && !line.startsWith('*')) continue;
    const cmds = ticked(line).filter(isCommand);
    if (!cmds.length) continue;
    const neg = line.search(NEGATION);
    const prefer = [];
    const avoid = [];
    for (const c of cmds) {
      const at = line.indexOf('`' + c + '`');
      // "Prefer `quack` over raw REST calls" negates a thing that is not
      // backticked, so a marker with no command after it leaves avoid empty
      // rather than mis-filing the preferred command as avoided.
      (neg > -1 && at > neg ? avoid : prefer).push(c);
    }
    out.push({ line, prefer, avoid });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transcript contract
// ---------------------------------------------------------------------------
//
// The bash provider returns, per row:
//   metadata.commands       the shell commands the model actually ran, in order
//   metadata.verify         { cmd, exitCode, stdout, refused } - the case's own
//                           post-turn check, run in the SAME container after the
//                           model's last turn. Absent when the case declares none.
//   metadata.commandsRun, commandsTimedOut, commandsTruncated, toolRounds
//
// A grader that cannot see this did not run and must say so: report.js treats
// "could not run" as an errored row, not as a score of zero.
function transcript(context, metric) {
  const md = context && context.metadata;
  if (!md || !Array.isArray(md.commands)) {
    throw new Error(`${metric} could not run: the provider returned no command transcript (metadata.commands). Wire the sandboxed bash provider before reading this metric.`);
  }
  return md;
}

const ran = (md) => md.commands.map(String);

// Substring match on the command line, normalised for whitespace. Deliberately
// not a regex over the case's text: a case author writing `go test ./...` must
// not have to escape it, and a looser match would let `make test` satisfy a
// probe for `go test`.
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const usedCommand = (md, cmd) => ran(md).some((c) => norm(c).includes(norm(cmd)));

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

// SANITY CHECK, NOT EVIDENCE. This measures only that the file was read and
// obeyed, which ETH already measured as high: a tool mentioned in the context
// file was used 1.6 times per instance against under 0.01 when unmentioned. It
// cannot show the file HELPS, and with a sandboxed shell the outcome is
// directly observable anyway, so this is the weakest metric in the suite.
// Attach it to line-probe cases only, and never quote it as evidence.
function followsStatedCommand(output, context) {
  const md = transcript(context, 'follows_stated_command');
  const subject = process.env.EVAL_SUBJECT_PATH;
  if (!subject || !fs.existsSync(subject)) {
    throw new Error('follows_stated_command could not run: EVAL_SUBJECT_PATH is unset or missing. run.sh sets it from EVAL_SUBJECT.');
  }
  const idx = Number(context.vars && context.vars.probe_line);
  const bullets = statedCommands(fs.readFileSync(subject, 'utf8'));
  const bullet = bullets[idx];
  if (!Number.isInteger(idx) || !bullet) {
    throw new Error(`follows_stated_command could not run: vars.probe_line=${context.vars && context.vars.probe_line} does not name one of the ${bullets.length} command-bearing bullets in ${path.basename(subject)}.`);
  }
  const usedPrefer = bullet.prefer.filter((c) => usedCommand(md, c));
  const usedAvoid = bullet.avoid.filter((c) => usedCommand(md, c));
  const pass = usedPrefer.length > 0 && usedAvoid.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `ran ${JSON.stringify(usedPrefer)}${bullet.avoid.length ? ` and none of ${JSON.stringify(bullet.avoid)}` : ''}`
      : `expected one of ${JSON.stringify(bullet.prefer)} and none of ${JSON.stringify(bullet.avoid)}; ran ${JSON.stringify(ran(md).slice(0, 12))}`,
  };
}

// THE OUTCOME MEASURE, and the one ETH found null on. Deterministic: the case
// declares a verification command, the harness runs it in the same container
// after the model stops, and this reads its exit code. Not "did the answer name
// the right command" - that is instruction-following, which is already high.
function taskCorrect(output, context) {
  const md = transcript(context, 'task_correct');
  const want = Number(context.vars && context.vars.verify_exit);
  const expect = Number.isInteger(want) ? want : 0;
  if (!md.verify || typeof md.verify.exitCode !== 'number') {
    throw new Error('task_correct could not run: no metadata.verify. The case declares `verify:` and the provider must run it post-turn in the same container.');
  }
  // A refused check is a spent wall clock, not a wrong answer. Scoring it 0
  // would file a harness limit as a task the model got wrong, and the two look
  // identical in the results.
  if (md.verify.refused) {
    throw new Error(`task_correct could not run: the verification was refused (${md.verify.refused}).`);
  }
  const pass = md.verify.exitCode === expect;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: `${md.verify.cmd} exited ${md.verify.exitCode}, wanted ${expect}`
      + (pass ? '' : `: ${String(md.verify.stdout || '').replace(/\s+/g, ' ').slice(0, 240)}`),
  };
}

// NEGATIVE CONTROLS ONLY, never averaged with the others. Grounded in ETH's
// measured spillover: with a context file present, agents "run more tests...
// search more files (grep), read more files, and write more files" on tasks the
// file never mentions. A control case names, as a newline-separated block
// scalar, the commands that are outside its scope; running any of them is the
// spillover signature.
//
// Not framed as over-caution: nobody has measured that. This asks only whether
// behaviour on an unmentioned task changed.
function unmentionedUnchanged(output, context) {
  const md = transcript(context, 'unmentioned_unchanged');
  const raw = context.vars && context.vars.out_of_scope;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('unmentioned_unchanged could not run: vars.out_of_scope must be a non-empty block scalar (a YAML list is silently expanded into one test per element).');
  }
  const patterns = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  const strayed = patterns.filter((p) => usedCommand(md, p));
  return {
    pass: strayed.length === 0,
    score: strayed.length === 0 ? 1 : 0,
    reason: strayed.length === 0
      ? `stayed in scope across ${md.commands.length} command(s)`
      : `ran out-of-scope: ${JSON.stringify(strayed)}`,
  };
}

// ---------------------------------------------------------------------------
// Arm wiring
// ---------------------------------------------------------------------------

// Both arms get the identical repo copy and the identical shell. The AGENTS.md
// is the ONLY difference: the treated arm receives its text as ambient repo
// context in the system message, exactly as an agent harness would inject it,
// while the copy on disk has it removed for both arms.
const INJECT = (body) => `The repository you are working in ships this AGENTS.md at its root. It is repository guidance, already loaded into your context.\n\n---\n${body}\n---`;

function arms(taskTemplate, { workspaceDir: repoDir } = {}) {
  const base = require('./arms.js')('agents-md', taskTemplate, { inject: INJECT });
  // Resolved per call, not at module load: `promptfoo validate config` imports
  // every prompt module, so an eager throw here makes the free config gate
  // unrunnable. The failure still lands before a single token is bought,
  // because the first row cannot build a prompt without it.
  const resolveDir = () => {
    const d = repoDir || process.env.EVAL_WORKSPACE_DIR;
    if (!d) throw new Error('agents-md-effect: set EVAL_WORKSPACE_DIR to the prepared workspace (see prepareRepo).');
    return d;
  };
  // No skillDir: the subject sits at a repo root, so handing its directory to
  // load_resource would serve the whole repo to one arm only - lib/arms.js says
  // exactly this. The workspace reaches both arms instead.
  //
  // `vars.verify` rides to the provider as config rather than into the prompt:
  // the model must never see the command its work is graded by, and the prompt
  // function is the only place a case var can reach provider config. It is set
  // on the arm's OWN config so that withConfigEveryArm, which spreads its
  // argument last, still wins on workspaceDir without clobbering the check.
  const withVerify = (fn) => (ctx) => {
    const vars = (ctx && ctx.vars) || {};
    return { prompt: fn(ctx), config: vars.verify ? { verify: vars.verify } : {} };
  };
  // One workspace for every case and every arm. Attached through the shared
  // helper rather than hand-rolled: executing the build is the case's
  // environment, and an arm that got it alone would make every exit code a
  // measure of tool access. read_source is deliberately NOT offered - the
  // shell already reads the tree, and two ways to read one repo would split
  // the behaviour the cost columns are trying to measure.
  return require('./arms.js').withConfigEveryArm(
    // A getter, not a value: withConfigEveryArm spreads its argument on every
    // call, so this resolves per row. Resolving it here instead would throw at
    // module load and make `promptfoo validate config` - the free gate -
    // unrunnable without the workspace already built.
    { get workspaceDir() { return resolveDir(); } },
    {
      noSkill: withVerify(base.noSkill),
      skillCurrent: withVerify(base.skillCurrent),
      skillNext: withVerify(base.skillNext),
    },
  );
}

module.exports = {
  CONTEXT_FILES,
  prepareRepo,
  statedCommands,
  followsStatedCommand,
  taskCorrect,
  unmentionedUnchanged,
  arms,
  INJECT,
};
