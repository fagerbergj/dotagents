// Builds the three prompt arms for a skill's eval suite. The skill's own
// frontmatter is the version of record; nothing here hardcodes one, so bumping
// metadata.version in SKILL.md relabels the comparison.
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '../../skills');

// Both arms get this identical preamble so the only difference between them is
// the skill body. It is deliberately content-free: anything useful in here - "return
// only the artifact", "be concise" - would hand the baseline a fix that a skill is
// supposed to earn. Without it the baseline had no system prompt at all, and the
// deltas partly measured the presence of instructions rather than the skill.
const PREAMBLE = 'You are helping a colleague with the task below.';

function skillVersion(body) {
  return body.match(/^\s*version:\s*["']?([^"'\n]+)/m)?.[1]?.trim() || 'unversioned';
}

module.exports = function arms(skillName, taskTemplate) {
  const current = path.join(SKILLS, skillName, 'SKILL.md');
  const next = process.env.SKILL_NEXT || path.join(SKILLS, skillName, 'SKILL.next.md');
  const task = (vars) => taskTemplate(vars);

  const withSkill = (file, vars) => {
    const body = fs.readFileSync(file, 'utf8');
    return [
      { role: 'system', content: `${PREAMBLE}\n\nThe following skill (version ${skillVersion(body)}) is active. Follow it for the user task.\n\n${body}` },
      { role: 'user', content: task(vars) },
    ];
  };

  return {
    // The skill's own directory, for a provider that serves its bundled
    // references on demand. Only an arm that loads the skill may name it.
    skillDir: path.join(SKILLS, skillName),
    noSkill: ({ vars }) => [
      { role: 'system', content: PREAMBLE },
      { role: 'user', content: task(vars) },
    ],
    skillCurrent: ({ vars }) => withSkill(current, vars),
    // Falls back to the current skill until a SKILL.next.md exists, so the third
    // arm is a no-op rather than a crash before there is a revision to compare.
    skillNext: ({ vars }) => withSkill(fs.existsSync(next) ? next : current, vars),
  };
};
