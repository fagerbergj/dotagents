const path = require('node:path');
const { load, specs } = require('../lib/bugfix-fixtures.js');

const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));
const fixture = (vars) => {
  const spec = BY_NAME.get(vars.fixture);
  if (!spec) throw new Error(`unknown fixture "${vars.fixture}" - add it to tests/bugfix-fixtures.json`);
  return load(spec);
};

// The final line targets a measured failure mode, not a hypothetical one: in
// the pre-fix baseline run, ~40% of rows (skill arm worse than baseline, ~7/17
// vs ~4/17) ended with a short "OK, I'm confident, let me deliver the
// solution."-shaped message and NO tool call - the loop in skill-tools.js
// treats the absence of a tool call as the final answer, so that stub got
// graded as the whole response and scored 0 on every judged metric. This
// wasn't a token-budget cutoff (completion tokens were nowhere near
// max_tokens); the model just spent 15-27 rounds narrating a plan and then
// emitted the "I'm about to answer" beat as its own turn instead of the
// answer. Applying to both arms identically keeps the comparison intact while
// removing a large, symmetric source of run-to-run cell variance (see
// skills/fix-bug/evals' report for the row-level evidence).
const arms = require('../../../../evals/lib/arms.js')('fix-bug', (vars) => {
  const f = fixture(vars);
  return `Got a bug report against ${f.repo}.

${vars.title}

${vars.issueBody}

Can you figure out what's actually going on and fix it? When you're ready to answer, write out the complete answer in that same message - don't send a short message just announcing that you're about to answer and stop there.`;
});

// repoDir goes to EVERY arm, same principle as review-code: the codebase
// under investigation is the subject matter, not a skill affordance, and
// gating it on the skill would make the delta measure file access rather
// than the skill. skillDir stays skill-only. The tree served is the PARENT
// of the fix - see lib/bugfix-fixtures.js for why that has to be the tree
// and not the fixed one.
const withRepo = (fn, extra = {}) => (ctx) => ({
  prompt: fn(ctx),
  config: { repoDir: fixture(ctx.vars).dir, ...extra },
});

module.exports = {
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
};
