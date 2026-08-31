// A draft wrapped in four backticks, not three: a couple of these drafts (a
// broken skill draft, a real shipped skill) contain their own fenced examples,
// and a three-backtick wrapper would close early on the first one it meets.
const arms = require('../../../../evals/lib/arms.js')('agent-skill-authoring', (vars) => `${vars.task.trim()}${vars.draft ? `\n\nHere's the draft we have so far:\n\n\`\`\`\`markdown\n${vars.draft.trim()}\n\`\`\`\`` : ''}

Return the finished skill as one or more files. For each file, write a line that says exactly "FILE: <path>" (the path relative to the skill's own root directory, e.g. "SKILL.md" or "references/topic.md"), immediately followed by a fenced code block containing that file's complete contents. Include SKILL.md and every references/, assets/, or scripts/ file the skill actually needs - do not describe a file without including it. Do not include any commentary outside these blocks.`);

// SKILL.md phase 4 names assets/skill-template.md as the pre-submission
// checklist to run before delivering, and references/spec-requirements.md as
// the file to load when a field constraint is in question - both unreachable
// unless the skill arm can actually fetch them mid-turn.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
