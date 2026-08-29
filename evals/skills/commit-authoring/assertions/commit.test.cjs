// Offline self-test: the parser-backed grader, plus the one `regex` assertion
// left in tests/cases.yaml, run against real messages. A silently broken gate
// is the failure this is here to catch, so the fixtures are checked in both
// directions - what must pass and what must not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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

  // --- the judged rubrics ----------------------------------------------------
  // Parsed, not regexed: a config is a structured file, and PyYAML is already
  // a dependency of the python gates next door.
  const load = (f) => JSON.parse(execFileSync('python3', ['-c', 'import json,sys,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', path.join(suite, f)], { encoding: 'utf8' }));
  const cfg = load('promptfooconfig.yaml');
  const cases = load('tests/cases.yaml');
  const defaultMetricNames = new Set(cfg.defaultTest.assert.map((a) => a.metric).filter(Boolean));
  const rubrics = cfg.defaultTest.assert.filter((a) => a.type === 'llm-rubric');
  const byMetric = Object.fromEntries(rubrics.map((a) => [a.metric, a]));
  assert.deepEqual(
    rubrics.map((a) => a.metric),
    ['why_quality', 'no_invented_claims'],
    'the two judged properties of a message - is the reason there, and is it true - are two metrics',
  );

  // A rubric only sees what is interpolated into it (evals/AGENTS.md): a clause
  // about "the diff" in a rubric that is never given the diff is inert, and the
  // judge guesses rather than complaining. Every var every rubric names has to
  // exist on every case.
  for (const a of rubrics) {
    for (const [, v] of a.value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      if (v === 'output' || v === 'rubric') continue;
      for (const c of cases) {
        assert.ok(c.vars && c.vars[v] !== undefined, `${a.metric} interpolates {{${v}}}, which "${c.description}" does not define - the clause would be inert`);
      }
    }
  }

  // why_quality grades one property: whether the reason is there and concrete.
  // Three items, no free ones, no subtraction.
  const whyItems = [...byMetric.why_quality.value.matchAll(/^(\d)\. /gm)].map((m) => m[1]);
  assert.deepEqual(whyItems, ['1', '2', '3'], 'why_quality grades exactly items 1-3; body length (a second property, pointing against 1 and 2) and flagging a mixed diff (splits_mixed_change owns it) are cut');
  // An item a judge may mark N/A and still be paid for is not a measurement -
  // it is a free point whose size depends on which sub-population the case is
  // in. 64 of 90 stored rows took that point.
  assert.ok(!/N\/A/i.test(byMetric.why_quality.value), 'no item in why_quality may be satisfied as N/A');
  assert.ok(!/unrelated pieces of work|recommending a split/i.test(byMetric.why_quality.value), 'flagging a mixed diff belongs to splits_mixed_change, which runs only on the cases where it applies');
  assert.ok(!/subtract/i.test(byMetric.why_quality.value), 'why_quality must not subtract - fabrication is scored by no_invented_claims');

  // no_invented_claims is yes/no, and it is the metric that needs the diff.
  assert.ok(byMetric.no_invented_claims.value.includes('{{diff}}'), 'no_invented_claims judges claims against the diff, so it has to be given the diff');
  assert.ok(/no partial credit/i.test(byMetric.no_invented_claims.value), 'invention is a yes/no property');
  assert.equal(byMetric.no_invented_claims.threshold, 1, 'a binary metric passes only at 1');

  // The skill's own prescribed footer slot is not a fabrication. Nine skill-arm
  // zeros on the stored run quoted `#<issue>` / `#<TBD>` / `#<ticket-number>`
  // back as "an invented reference"; the baseline, which emits no footer, took
  // none. A slot asserts nothing, so the metric was reading the template rather
  // than the message.
  const invented = byMetric.no_invented_claims.value;
  assert.match(invented, /unfilled placeholder slot asserts nothing/i,
    'no_invented_claims fines the skill for the `Refs #<issue>` slot SKILL.md prescribes unless the slot is exempt');
  // pr-authoring's restraint stops the same exemption at a real number, and so
  // must this one, or `Refs #4471` invented out of nothing becomes free.
  assert.match(invented, /A CONCRETE value in\s+that slot is judged normally/,
    'the placeholder exemption must not cover a specific fabricated issue number');

  // Two metrics, one behaviour, opposite signs is the thing this suite's own
  // config forbids. splits_mixed_change PAYS for recommending a split; this
  // metric fined it on the same rows. Naming the act alone was not enough - a
  // stored zero says the recommendation "is explicitly excluded from
  // consideration" and then fines a sentence the recommendation is made of -
  // so the exemption has to reach the proposed messages and the rationale.
  assert.match(invented, /recommendation about HOW TO COMMIT/i,
    'recommending a split is not a claim about the code');
  for (const part of [/proposing a boundary between commits/i, /writing out the\s+subject and body of each proposed commit/i, /the standing reasons for splitting/i]) {
    assert.match(invented, part, `the split exemption has to name what the recommendation is made of: ${part}`);
  }
  // The exemption is scoped: a fabricated cause inside a proposed commit's body
  // is still an invention, or splitting would launder any claim at all.
  assert.match(invented, /a fabricated cause inside\s+it still counts/,
    'exempting the proposal must not exempt what the proposed messages assert about the code');
  // And it is only load-bearing because the same cases carry both metrics.
  const mixed = cases.filter((c) => (c.assert || []).some((a) => a.metric === 'splits_mixed_change'));
  assert.ok(mixed.length >= 4, `splits_mixed_change rides on only ${mixed.length} cases`);
  assert.ok(defaultMetricNames.has('no_invented_claims'),
    'no_invented_claims runs on every case, the mixed ones included - which is why the exemption is needed');

  // The latency assertion stays UNNAMED. Named, it is a graded column beside
  // the quality metrics - and a message slow enough to trip 120s is one the
  // completion cap cut off, which why_quality and conventional_header already
  // fine. fix-bug paid that double charge on 22 of 120 rows; this suite never
  // tripped it at all, so as `latency_overhead` it was a column that could only
  // ever read 1.00/1.00. report.js prints the timing either way.
  for (const a of [...cfg.defaultTest.assert, ...cases.flatMap((c) => c.assert || [])]) {
    assert.ok(!(a && a.type === 'latency' && a.metric),
      `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
  }

  // No metric is scored in two places at once.
  for (const n of defaultMetricNames) {
    assert.ok(!cases.some((c) => (c.assert || []).some((a) => a.metric === n)), `${n} is defined in defaultTest and again on a case`);
  }

  console.log('commit assertions: ok');
}

main();
