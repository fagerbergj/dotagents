const { checkout } = require('../lib/repo.js');

// Whether a nested file should repeat, narrow, or add to the root is exactly
// what nested_not_redundant (assertions/agentsmd.cjs) grades and what the
// skill's own "Place narrowly" step decides - telling the model not to
// repeat it here would foreclose that metric by construction, identically
// for both arms (evals/AGENTS.md: "never let the case do the skill's job").
// So this hands over the root file for reference only, the way a person
// asking would actually say it ("we've already got a root one, it's below
// for reference" - see tests/cases.yaml's task text), with no steer either way.
const arms = require('../../../../evals/lib/arms.js')('agents-md-authoring', (vars) => `${vars.task.trim()}${vars.existingRoot ? `\n\nThis is the root AGENTS.md we already have, for reference:\n\n\`\`\`\n${vars.existingRoot.trim()}\n\`\`\`` : ''}

Return only the file content in a single fenced code block, nothing else.`);

// The repository is the subject matter, not a skill affordance: read_source
// goes to BOTH arms via repoDir, exactly as review-code serves its PR
// fixtures. Only load_resource, over the skill's own directory, is gated on
// the skill arm.
const withRepo = (fn, extra = {}) => (ctx) => ({
  prompt: fn(ctx),
  config: { repoDir: checkout(ctx.vars.repo), ...extra },
});

module.exports = {
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  // Falls back to the current skill until SKILL.next.md exists.
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
};
