const arms = require('../../../lib/arms.js')('rest-api-authoring', (vars) => `${vars.task.trim()}${vars.contract ? `\n\nThis is the file we ship today:\n\n\`\`\`yaml\n${vars.contract.trim()}\n\`\`\`` : ''}

Return only the final Markdown containing the file in a single fenced code block. Do not include commentary outside the Markdown.`);

// SKILL.md steps 2-6 each name a `references/*.md` to read before deciding;
// inlining SKILL.md alone left all 44 KB of that unreachable.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
