const arms = require('../../../lib/arms.js')('mermaid-authoring', (vars) => `Produce a Mermaid diagram for this request:

${vars.task}

Return only the final Markdown containing the diagram. Do not include commentary outside the Markdown.`);

// SKILL.md step 3 says to read `references/<diagramId>/README.md` before writing.
// Inlining SKILL.md alone made that unfollowable, so the skill arm hands the
// provider the skill's directory and gets a `load_resource` tool over it. The
// baseline has no skill and no resources, so it names nothing and is called
// exactly as before - the arms still differ by the skill and nothing else.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
