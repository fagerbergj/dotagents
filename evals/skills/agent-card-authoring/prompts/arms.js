const arms = require('../../../lib/arms.js')('agent-card-authoring', (vars) => `${vars.brief.trim()}${vars.card ? `\n\nHere's the relevant part of the file as it stands today:\n\n\`\`\`json\n${vars.card.trim()}\n\`\`\`` : ''}`);

// SKILL.md's Phase 2 template and field-quality rules are inline in the body,
// so unlike rest-api-authoring this skill does not require reading a
// references/ file to answer correctly - but it does bundle a worked example
// pair (assets/) and a lifecycle doc, so the skill arm still gets the
// load_resource tool in case a careful answer wants to check them.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
