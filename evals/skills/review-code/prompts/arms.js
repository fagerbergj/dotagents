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

// Experiment arm, not a shipped subject: the delivery check as nine lines of
// system prompt with no skill at all. It answers whether an always-on rule
// belongs in a skill (3k words, and both skill arms cost a quarter of
// `no_false_blocker`) or in the prompt. Remove once the question is settled.
const DELIVERY = `When you review a change:
- First list what it set out to deliver: each item its linked issue asks for and each thing its description says it does.
- For each item, find where the diff delivers it. Say which items are met, unmet, or deferred to a linked follow-up.
- An item that is neither delivered nor deferred holds the merge: say so plainly and ask for it before approval.
- If the change adds another instance of something the repository already has, open an existing one and compare part for part.
- A fix that leaves the same old bug in a sibling path holds the merge only when the issue or description covers the whole class; otherwise suggest a follow-up.
- Approve a change that delivers what it set out to, even when it is not perfect. Do not demand anything the task never asked for.`;
const promptOnly = ({ vars }) => {
  const [system, user] = arms.noSkill({ vars });
  return [{ role: 'system', content: `${system.content}\n\n${DELIVERY}` }, user];
};

module.exports = {
  promptOnly: withRepo(promptOnly),
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
};
