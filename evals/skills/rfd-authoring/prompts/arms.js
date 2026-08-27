const arms = require('../../../lib/arms.js')('rfd-authoring', (vars) => `A colleague sends you this note:

${vars.task}

Write what you would send back to the people involved. Return only that text, with no commentary about how you wrote it.`);

// SKILL.md step 4 falls back to `references/industry-examples.md` and the
// attributed `assets/example-rfd.md` whenever no house template exists - every case here.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
};
