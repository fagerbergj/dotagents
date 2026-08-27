const arms = require('../../../lib/arms.js')('comment-authoring', (vars) => `${vars.ask}

\`\`\`${vars.lang}
${vars.code}
\`\`\`

Give me back the whole file in one fenced ${vars.lang} block. Change nothing but the comments, and keep your reply to the code block.`);

// SKILL.md defers public-API doc conventions to `references/sources.md`
// rather than restating them, so the arm needs a way to read it.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
