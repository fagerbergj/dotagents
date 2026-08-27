// Offline self-test: the parser-backed grader, plus the one `regex` assertion
// left in tests/cases.yaml, run against real messages. A silently broken gate
// is the failure this is here to catch, so the fixtures are checked in both
// directions - what must pass and what must not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checks = require('./commit.cjs');

// agent-researcher 628a67f, the human-authored message for the case 1 diff.
// It is the reference for "correct": every gate here must accept it.
const real = `\`\`\`
fix(acp): suggest cp, not git clone, in the read-only disclosure

#926 told every read-only agent to \`git clone --local\` the tree into a
writable path, but opencodeEnv denies git clone for every ACP agent without
acp.allow_clone - which is all of them except the explorer. The reviewer,
the agent most likely to need a writable checkout, gets the clone refused by
its own permissions. \`cp -a\` is allowed everywhere and carries go.mod just
the same, so internal/ imports still resolve.
\`\`\``;

const runOn = `\`\`\`
fix(acp): suggest cp, not git clone
Cloning is denied unless acp.allow_clone is set.
\`\`\``;

// The real no-skill answer that the old regex scored 0 on: the header is glued
// to the opening fence, so "refactor" looked like a language tag.
const gluedToFence = `\`\`\`refactor: use public toolutils.PackTool instead of local copy

ADK v2.1.0 made toolutils.PackTool public, allowing us to replace the
inlined implementation previously required when it was internal.
No functional change.\`\`\``;

async function main() {
  const pass = async (output, message) => assert.equal((await checks.conventionalHeader(output)).pass, true, message);
  const fail = async (output, message) => assert.equal((await checks.conventionalHeader(output)).pass, false, message);

  // --- what the spec requires ------------------------------------------------
  await pass(real, 'the real commit message must pass the grammar gate');
  await pass(gluedToFence, 'a header glued to the opening fence is still a header');
  await pass('```\nchore: bump the postgres driver\n```', 'a subject-only message is complete');
  await pass('```\nfeat(api)!: drop the v1 endpoint\n```', 'the `!` marker is part of the grammar');
  // §14: types other than feat and fix MAY be used - the type is any noun.
  await pass('```\nacp: disclose the read-only filesystem\n```', 'an arbitrary noun type conforms');
  // §15: units MUST NOT be treated as case-sensitive.
  await pass('```\nFix(acp): suggest cp, not git clone\n```', 'a capitalised type conforms');
  // The spec caps neither length nor punctuation.
  await pass('```\nfix(acp): ' + 'x'.repeat(90) + '\n```', 'length is not a spec rule');
  await pass('```\nfix(acp): do the thing.\n```', 'a trailing period is not a spec rule');

  // --- what it rejects -------------------------------------------------------
  await fail('```\nFix the thing\n```', 'a message with no type must fail');
  await fail('```\nfix(acp):\n```', 'an empty description must fail');
  await fail('```\nFix misleading advice in the block: replace clone with cp\n```', 'a sentence with a colon in it is not a header');
  await fail('```\nRevert "merge: extension dispatch persistence"\n```', 'a git-style revert subject is not a header');
  await fail('```\nnot a commit message\n```');
  // §6: the body MUST begin one blank line after the description.
  await fail(runOn, 'a body on the line after the subject must fail');

  // --- the regex assertion lifted straight out of tests/cases.yaml -----------
  const suite = path.resolve(__dirname, '..');
  const lines = fs.readFileSync(path.join(suite, 'tests/cases.yaml'), 'utf8').split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (!/^\s*(?:-\s*)?type:\s*regex\s*$/.test(line)) return;
    const value = lines[index + 1].match(/^\s*value:\s*'(.*)'\s*$/);
    const metric = lines[index + 2].match(/^\s*metric:\s*(\S+)\s*$/);
    assert.ok(value, `regex assertion near line ${index + 1} of cases.yaml has no single-quoted value`);
    assert.ok(metric, `regex assertion near line ${index + 1} of cases.yaml has no metric`);
    found.push({ pattern: new RegExp(value[1].replace(/''/g, "'")), metric: metric[1] });
  });
  assert.equal(found.length, 1, 'marks_breaking is the only regex assertion left in the suite - the four breaking cases share it by anchor');

  const breaking = found[0];
  assert.equal(breaking.metric, 'marks_breaking');
  assert.equal(breaking.pattern.test('```\nfix(config)!: reject unknown keys at startup\n```'), true);
  // §15 again: the type is case-insensitive, the BREAKING CHANGE footer is not.
  assert.equal(breaking.pattern.test('```\nFix(config)!: reject unknown keys at startup\n```'), true);
  assert.equal(breaking.pattern.test('```\nfix(config): reject unknown keys\n\nBREAKING CHANGE: configs with stray keys now fail to load.\n```'), true);
  assert.equal(breaking.pattern.test('```\nfix(config): reject unknown keys\n\nBREAKING-CHANGE: configs with stray keys now fail to load.\n```'), true);
  assert.equal(breaking.pattern.test('```\nfix(config): reject unknown keys\n\nbreaking change: configs now fail to load.\n```'), false, 'the footer MUST be uppercase');
  assert.equal(breaking.pattern.test(real), false);

  console.log('commit assertions: ok');
}

main();
