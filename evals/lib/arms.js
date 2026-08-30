// Builds the three prompt arms for a skill's eval suite. The skill's own
// frontmatter is the version of record; nothing here hardcodes one, so bumping
// metadata.version in SKILL.md relabels the comparison.
const fs = require('node:fs');
const path = require('node:path');

// Default layout: one skill per suite at <repo>/skills/<name>/SKILL.md. A repo
// testing something else - a single shared AGENTS.md, a prompt file - sets
// EVAL_SUBJECT_PATH (run.sh does this from EVAL_SUBJECT) and the name is then
// only a label.
const SKILLS = path.resolve(__dirname, '../../skills');
const SUBJECT = process.env.EVAL_SUBJECT_PATH || null;

// Both arms get this identical preamble so the only difference between them is
// the skill body. It is deliberately content-free: anything useful in here - "return
// only the artifact", "be concise" - would hand the baseline a fix that a skill is
// supposed to earn. Without it the baseline had no system prompt at all, and the
// deltas partly measured the presence of instructions rather than the skill.
const PREAMBLE = 'You are helping a colleague with the task below.';

function skillVersion(body) {
  return body.match(/^\s*version:\s*["']?([^"'\n]+)/m)?.[1]?.trim() || 'unversioned';
}

// `opts.inject(body)` overrides how the subject file is wrapped into the system
// message. The default names it a skill, which is right for skills/<name>/SKILL.md
// and wrong for a repository AGENTS.md - a real agent is handed that as ambient
// repo context, not as "a skill to follow", and telling the model it is a skill
// would make the arm differ by framing as well as by the file.
module.exports = function arms(skillName, taskTemplate, opts = {}) {
  // On a PR that edits the skill, the checkout IS the new version, so comparing
  // it against the shipped one needs that shipped copy extracted somewhere and
  // named here. Unset (the normal case) both fall through to the checkout.
  const current = process.env.SKILL_CURRENT || SUBJECT || path.join(SKILLS, skillName, 'SKILL.md');
  const next = process.env.SKILL_NEXT || path.join(SKILLS, skillName, 'SKILL.next.md');
  const task = (vars) => taskTemplate(vars);

  const inject = opts.inject
    || ((body) => `The following skill (version ${skillVersion(body)}) is active. Follow it for the user task.\n\n${body}`);

  const withSkill = (file, vars) => {
    const body = fs.readFileSync(file, 'utf8');
    return [
      { role: 'system', content: `${PREAMBLE}\n\n${inject(body)}` },
      { role: 'user', content: task(vars) },
    ];
  };

  return {
    // The directory a `load_resource` tool would serve. It is the subject's own
    // folder, which for a bundled skill is exactly its references/ and assets/.
    // A subject sitting at a repo root would make this the whole repo, so a
    // suite in that shape should simply not hand skillDir to the provider.
    skillDir: SUBJECT ? path.dirname(SUBJECT) : path.join(SKILLS, skillName),
    noSkill: ({ vars }) => [
      { role: 'system', content: PREAMBLE },
      { role: 'user', content: task(vars) },
    ],
    skillCurrent: ({ vars }) => withSkill(current, vars),
    // Falls back to the current skill until a SKILL.next.md exists, so the third
    // arm is a no-op rather than a crash before there is a revision to compare.
    skillNext: ({ vars }) => withSkill(fs.existsSync(next) ? next : current, vars),
  };
};

// Attaches a persona to every arm in a suite's exported map at once, so a
// suite opts into ask_user for all arms or none - hand-rolling `userPersona`
// onto one arm's config, the way skillDir already varies per arm, becomes a
// bypass of this helper rather than a one-line edit. skillDir is deliberately
// skill-only (it IS the thing under test); repoDir and a persona are the case's
// environment, same as each other, and both must reach every arm or the delta
// measures access, not the skill - do not "fix" this to gate on the skill.
// Works over any arm shape a suite already returns (a bare message array, as
// from lib/arms.js directly, or a {prompt, config} object, as after a suite's
// own skillDir/repoDir wiring), so it composes as the last step regardless of
// what came before it.
module.exports.withPersonaEveryArm = function withPersonaEveryArm(persona, exportedArms) {
  return withConfigEveryArm({ userPersona: persona }, exportedArms);
};

// The general form: merge `config` into every arm at once. `workspaceDir` (the
// run_bash sandbox) belongs here for the same reason a persona does - executing
// the build is the case's environment, not something an arm earns, and a suite
// that hand-rolls it onto one arm is measuring tool access. Anything a single
// arm must have alone - skillDir, which IS the thing under test - stays out.
function withConfigEveryArm(config, exportedArms) {
  const attach = (fn) => (ctx) => {
    const result = fn(ctx);
    const { prompt, config: own } = Array.isArray(result) ? { prompt: result, config: {} } : result;
    return { prompt, config: { ...own, ...config } };
  };
  return Object.fromEntries(Object.entries(exportedArms).map(([name, fn]) => [name, attach(fn)]));
}

module.exports.withConfigEveryArm = withConfigEveryArm;
