const { checkout } = require('../lib/repo.js');

const arms = require('../../../lib/arms.js')('agents-md-authoring', (vars) => `${vars.task.trim()}${vars.existingRoot ? `\n\nThis is the root AGENTS.md we already have - do not repeat it, only add what is specific to this subtree:\n\n\`\`\`\n${vars.existingRoot.trim()}\n\`\`\`` : ''}

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
