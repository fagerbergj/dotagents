const arms = require('../../../lib/arms.js')('issue-authoring', (vars) => `${vars.source} We track work in ${vars.tracker}. Write this up as a ticket.

${vars.report}

Return only the finished ticket. Do not include commentary outside it.`);

// SKILL.md step 2 says to load the reference matching the work type before
// drafting, and neither reference was reachable from an inlined SKILL.md.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
};
