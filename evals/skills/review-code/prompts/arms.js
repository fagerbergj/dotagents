const path = require('node:path');
const { load, specs } = require('../../../lib/fixtures.js');

const BY_NAME = new Map(specs(path.resolve(__dirname, '..')).map((f) => [f.name, f]));
const fixture = (vars) => {
  const spec = BY_NAME.get(vars.fixture);
  if (!spec) throw new Error(`unknown fixture "${vars.fixture}" - add it to tests/fixtures.json`);
  return load(spec);
};

const arms = require('../../../lib/arms.js')('review-code', (vars) => {
  const f = fixture(vars);
  return `Review this pull request against ${f.repo}.

${vars.title}

${vars.note || ''}

\`\`\`diff
${f.diff}
\`\`\`

Return only the review you would leave.`;
});

// repoDir goes to EVERY arm. The code under review is the subject matter, not
// something the skill grants access to - gate it on the skill and the baseline
// reviews hunks while the skill arm reads the tree, and the delta measures file
// access instead of the skill. skillDir stays skill-only, as everywhere else.
const withRepo = (fn, extra = {}) => (ctx) => ({
  prompt: fn(ctx),
  config: { repoDir: fixture(ctx.vars).dir, ...extra },
});

module.exports = {
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
};
