const arms = require('../../../lib/arms.js')('adr-authoring', (vars) => `A teammate sent this note about something that happened on our project:

${vars.task}

Write what should go in the repository for this, so the team does not lose it. If a written record of this kind is not the right thing here, say so instead and explain what belongs there.

Return only that document, or only that explanation. No commentary around it.`);

// SKILL.md step 4 falls back to `references/industry-examples.md` and the
// attributed `assets/example-adr.md` whenever no house template exists - every case here.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
};
