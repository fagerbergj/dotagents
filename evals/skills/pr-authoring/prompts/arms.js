const path = require('node:path');
const { load, specs } = require('../../../lib/fixtures.js');

const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));

// Only the tree (repoDir) comes from the fixture at prompt-build time. The
// diff is pasted directly into the case's own `diff` var (tests/cases.yaml)
// instead of loaded here, because two things downstream need it as plain
// text and neither can call into this file: assertions/pr.cjs's
// noFabricatedIdentifiers reads context.vars.diff directly (a pure function,
// deliberately unchanged - see promptfooconfig.yaml), and the restraint
// judge needs it as a rubricPrompt {{diff}}, which can only interpolate a
// case var. Loading it dynamically here and never surfacing it as a var
// would leave both without it.
const repoDir = (vars) => {
  const spec = BY_NAME.get(vars.fixture);
  if (!spec) throw new Error(`unknown fixture "${vars.fixture}" - add it to tests/fixtures.json`);
  return load(spec).dir;
};

// The author's own PR description is withheld from every arm - it is this
// suite's ground truth, read only by the coverage/restraint judges via the
// case's own `author_description` var. Showing it to the model would let it
// imitate the answer instead of writing one from the diff.
const arms = require('../../../lib/arms.js')('pr-authoring', (vars) => `I'm opening a pull request for the change below.

${vars.note}

\`\`\`diff
${vars.diff}
\`\`\`

Write the title on the first line, then a blank line, then the description. Output only that.`);

// repoDir goes to EVERY arm, same rule review-code follows for read_source: the
// tree a change was opened against is the subject matter, not a skill
// affordance. Gating it on the skill would make the delta measure file access
// instead of the skill. skillDir stays skill-only.
const withRepo = (fn, extra = {}) => (ctx) => ({
  prompt: fn(ctx),
  config: { repoDir: repoDir(ctx.vars), ...extra },
});

module.exports = {
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
};
