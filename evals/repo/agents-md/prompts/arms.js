// Two arms over one repository: no AGENTS.md, and with AGENTS.md. Same repo copy,
// same tasks, same shell, same caps. The file is the only difference.
//
// The repo copy served to BOTH arms has AGENTS.md/CLAUDE.md removed (see
// lib/agents-md-effect.js prepareRepo). Otherwise the baseline could `cat
// AGENTS.md` and the arms would stop differing by the treatment - the same trap
// as serving a skill's own directory to the no-skill arm.
// Both arms get a sandboxed `run_bash` over one prepared workspace: the wiring
// hands `workspaceDir` to every arm through arms.withConfigEveryArm, inside
// lib/agents-md-effect.js. Naming it here is not decoration - run.sh greps the
// suite directory for `workspaceDir` to decide whether to run the sandbox's own
// escape tests, and a suite that hands the model a shell must pay for that.
const { arms } = require('../../../lib/agents-md-effect.js');

// The deliverable is named in every task. A question that does not say what it
// wants measures format guessing, which produced a fake +0.89 on another suite.
module.exports = arms((vars) => vars.task);
