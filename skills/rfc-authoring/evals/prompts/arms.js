const arms = require('../../../../evals/lib/arms.js')('rfc-authoring', (vars) => `An engineer on your team says:

${vars.task}

Write what you would put in front of the other people this touches. If putting a written document in front of them is the wrong response here, say that instead and say what to do. Return only the final Markdown, with no commentary outside it.`);

// SKILL.md step 4 falls back to `references/industry-examples.md` and the
// attributed `assets/example-rfc.md` whenever no house template exists - every case here.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  // Only runs when SKILL_CURRENT names a shipped copy to compare against;
  // otherwise arms.js falls back to the current skill and it never appears.
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
