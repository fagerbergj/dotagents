const arms = require('../../../lib/arms.js')('pr-authoring', (vars) => `I'm opening a pull request for the change below.

${vars.note}

\`\`\`diff
${vars.diff}
\`\`\`

Write the title on the first line, then a blank line, then the description. Output only that.`);

// SKILL.md picks the repo's `.github/pull_request_template.md` first and
// `assets/default-pr-template.md` otherwise; both are file reads the arm could not make.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
