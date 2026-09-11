// The file goes in as a file, not as a diff: the source material's own examples
// are snapshots of a codebase mid-trajectory, and a diff would tell the model
// which lines to look at. `ask` is per case - cases 1-3 request the rewritten
// file so the deterministic graders have code to measure, the controls do not.
module.exports = require('../../../lib/arms.js')('slop-detection', (vars) => `${vars.context}

\`${vars.filename}\`:

\`\`\`python
${vars.source}\`\`\`

${vars.ask}`);
