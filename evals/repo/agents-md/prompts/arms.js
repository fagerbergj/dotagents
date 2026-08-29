// Two arms over one repository: no AGENTS.md, and with AGENTS.md. Same repo copy,
// same tasks, same shell, same caps. The file is the only difference.
//
// The repo copy served to BOTH arms has AGENTS.md/CLAUDE.md removed (see
// lib/agents-md-effect.js prepareRepo). Otherwise the baseline could `cat
// AGENTS.md` and the arms would stop differing by the treatment - the same trap
// as serving a skill's own directory to the no-skill arm.
const { arms } = require('../../../lib/agents-md-effect.js');

// The deliverable is named in every task. A question that does not say what it
// wants measures format guessing, which produced a fake +0.89 on another suite.
module.exports = arms((vars) => vars.task);
