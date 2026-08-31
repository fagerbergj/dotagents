// `ask` lets a case leave the number of commits undecided. The default asks for
// "the commit message" - singular - which forecloses the very choice the
// two MIXED cases grade, so those set their own.
module.exports = require('../../../../evals/lib/arms.js')('commit-authoring', (vars) => `${vars.context}

\`\`\`diff
${vars.diff}
\`\`\`

${vars.ask || 'Give me the commit message for it in a fenced code block.'}`);
