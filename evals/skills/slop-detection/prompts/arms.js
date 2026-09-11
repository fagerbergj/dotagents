// The file goes in as a file, not as a diff: the source material's own examples
// are snapshots of a codebase mid-trajectory, and a diff would tell the model
// which lines to look at. `ask` is per case - cases 1-3 request the rewritten
// file so the deterministic graders have code to measure, the controls do not.
const arms = require('../../../lib/arms.js')('slop-detection', (vars) => `${vars.context}

\`${vars.filename}\`:

\`\`\`python
${vars.source}\`\`\`

${vars.ask}`);

// SKILL.md tells the reader to open references/metrics.md before quoting a
// number and references/patterns.md before naming what to cut. Without the
// resource tool both instructions are inert and two thirds of the bundle goes
// untested. The baseline names no skillDir, so it sends no `tools` key.
module.exports = {
  noSkill: arms.noSkill,
  skillCurrent: (ctx) => ({ prompt: arms.skillCurrent(ctx), config: { skillDir: arms.skillDir } }),
  skillNext: (ctx) => ({ prompt: arms.skillNext(ctx), config: { skillDir: arms.skillDir } }),
};
