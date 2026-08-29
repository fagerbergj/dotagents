// Offline self-test for the parsing/scoring logic; SKIP_NETWORK_TESTS gates the
// one grader that shells out to skills-ref (npx fetches the package on a cold
// cache). The parsing and computed-fact graders need no network at all.
const assert = require('node:assert');
const g = require('./skillauth.cjs');

const wrap = (files) => Object.entries(files).map(([p, c]) => `FILE: ${p}\n\`\`\`\n${c}\n\`\`\`\n`).join('\n');

const ok = (name, res) => assert.ok(res.pass, `${name} should pass: ${res.reason}`);
const bad = (name, res) => assert.ok(!res.pass, `${name} should fail but passed: ${res.reason}`);

const goodSkill = () => `---\nname: pdf-processing\ndescription: Extracts text from PDF files. Use when the user mentions PDFs or document extraction.\n---\n\n# PDF Processing\n\nRead references/api.md if the extraction call returns an error.\n`;

// --- parseFiles / extractFence -----------------------------------------------

{
  const text = wrap({ 'SKILL.md': goodSkill(), 'references/api.md': 'error codes here' });
  const files = g.parseFiles(text);
  assert.strictEqual(files.size, 2);
  // extractFence trims trailing whitespace, so the fenced round-trip drops the
  // source string's own trailing newline.
  assert.strictEqual(files.get('SKILL.md'), goodSkill().replace(/\s+$/, ''));
  assert.strictEqual(files.get('references/api.md'), 'error codes here');
}
// A markdown heading prefix on the FILE line is tolerated.
{
  const files = g.parseFiles('## FILE: SKILL.md\n```\nbody\n```\n');
  assert.strictEqual(files.get('SKILL.md'), 'body');
}
// A leading "./" is normalised away.
{
  const files = g.parseFiles('FILE: ./SKILL.md\n```\nbody\n```\n');
  assert.ok(files.has('SKILL.md'));
}
// A fenced block nested inside SKILL.md's own content (documenting a command)
// does not truncate the outer fence, as long as the outer fence is longer.
{
  const inner = 'Run:\n```bash\necho hi\n```\ndone';
  const text = `FILE: SKILL.md\n\`\`\`\`\n${inner}\n\`\`\`\`\n`;
  const files = g.parseFiles(text);
  assert.strictEqual(files.get('SKILL.md'), inner);
}
// No FILE: block at all - the transform's sentinel path.
assert.match(g.normalizeToFiles('I would not build a skill for a one-time task.'), /^NO SKILL PACKAGE IN OUTPUT/);
assert.ok(!g.loadPackage(g.normalizeToFiles('no package here')).ok);
{
  const normalized = g.normalizeToFiles(wrap({ 'SKILL.md': goodSkill() }));
  const loaded = g.loadPackage(normalized);
  assert.ok(loaded.ok);
  assert.strictEqual(loaded.files['SKILL.md'], goodSkill().replace(/\s+$/, ''));
}

// --- withinBodyBudget ---------------------------------------------------------

ok('short body', g.withinBodyBudget({ 'SKILL.md': goodSkill() }));
{
  const longBody = Array.from({ length: 600 }, (_, i) => `Line ${i}.`).join('\n');
  const longSkill = `---\nname: x\ndescription: y\n---\n\n${longBody}\n`;
  const res = g.withinBodyBudget({ 'SKILL.md': longSkill });
  bad('600-line body', res);
  assert.match(res.reason, /over the spec's 500-line budget/);
}
bad('no SKILL.md at all', g.withinBodyBudget({}));
// Frontmatter with nothing after it - the live bug: this used to pass outright.
{
  const res = g.withinBodyBudget({ 'SKILL.md': '---\nname: x\ndescription: y\n---\n' });
  bad('frontmatter-only, empty body', res);
  assert.match(res.reason, /empty body/);
}

// --- hop1Paths / unreachableFiles ---------------------------------------------

assert.deepStrictEqual(g.hop1Paths({ 'SKILL.md': 'See references/a.md.', 'references/a.md': 'x' }), ['references/a.md']);
// Nothing in the body means nothing is hop 1, however many files are bundled.
assert.deepStrictEqual(g.hop1Paths({ 'SKILL.md': '', 'references/a.md': 'x' }), []);
// A path the body names but the package never supplied is not a bundled hop.
assert.deepStrictEqual(g.hop1Paths({ 'SKILL.md': 'See references/missing.md.' }), []);

assert.deepStrictEqual(g.unreachableFiles({ 'SKILL.md': 'See references/a.md.', 'references/a.md': 'x' }), []);
assert.deepStrictEqual(g.unreachableFiles({ 'SKILL.md': 'nothing linked', 'references/a.md': 'x' }), ['references/a.md']);
assert.deepStrictEqual(g.unreachableFiles({ 'SKILL.md': 'nothing linked' }), []);

// --- hasFrontmatter -------------------------------------------------------------

assert.ok(g.hasFrontmatter('---\nname: x\ndescription: y\n---\n\nbody'));
assert.ok(!g.hasFrontmatter('# just a heading, no frontmatter'));
assert.ok(!g.hasFrontmatter(undefined));

// --- danglingAndChains ---------------------------------------------------------

{
  const files = { 'SKILL.md': 'See references/api.md for errors.', 'references/api.md': 'no further pointers' };
  const { dangling, chains } = g.danglingAndChains(files);
  assert.strictEqual(dangling.length, 0);
  assert.strictEqual(chains.length, 0);
}
// A path named in the body with no matching file - the fact skills-ref misses.
{
  const files = { 'SKILL.md': 'See references/missing.md for details.' };
  const { dangling } = g.danglingAndChains(files);
  assert.strictEqual(dangling.length, 1);
  assert.match(dangling[0], /references\/missing\.md/);
}
// A file SKILL.md links (hop 1) pointing at a second bundled file is a chain.
{
  const files = {
    'SKILL.md': 'See references/a.md if X.',
    'references/a.md': 'For more, see references/b.md.',
    'references/b.md': 'the actual detail',
  };
  const { dangling, chains } = g.danglingAndChains(files);
  assert.strictEqual(dangling.length, 0);
  assert.strictEqual(chains.length, 1);
  assert.match(chains[0], /references\/a\.md.*references\/b\.md/);
}
// Trailing prose punctuation does not become part of the path.
{
  const files = { 'SKILL.md': 'Read references/api.md, then continue.', 'references/api.md': 'x' };
  const { dangling } = g.danglingAndChains(files);
  assert.strictEqual(dangling.length, 0);
}
// Regression, adversarial review: two bundled files that mention each other
// are NOT a chain when SKILL.md's body is empty and links neither. The old
// logic matched on `filePath`'s own directory prefix and flagged this as a
// chain from an empty SKILL.md; a package with nothing hop-1 has no chain to
// form, only two unreachable files (that is unreachableFiles's claim, not
// this one's).
{
  const files = {
    'SKILL.md': '---\nname: x\ndescription: y\n---\n',
    'scripts/restore-feature-flags.sh': 'echo "see references/manual-flag-restore.md for the full procedure"',
    'references/manual-flag-restore.md': 'the actual procedure',
  };
  const { dangling, chains } = g.danglingAndChains(files);
  assert.strictEqual(dangling.length, 0, `unexpected dangling: ${dangling}`);
  assert.strictEqual(chains.length, 0, `unexpected chain on an empty SKILL.md: ${chains}`);
  assert.deepStrictEqual(g.unreachableFiles(files).sort(), ['references/manual-flag-restore.md', 'scripts/restore-feature-flags.sh']);
}

// --- specBudgetAndRefs (composite) --------------------------------------------

{
  const clean = wrap({ 'SKILL.md': goodSkill(), 'references/api.md': 'error codes' });
  const res = g.specBudgetAndRefs(g.normalizeToFiles(clean));
  assert.strictEqual(res.score, 1);
  ok('clean package', res);
}
{
  const res = g.specBudgetAndRefs(g.normalizeToFiles(wrap({ 'SKILL.md': `---\nname: x\ndescription: y\n---\n\nSee references/nope.md for detail.\n` })));
  assert.ok(res.score < 1, `dangling reference should not score 1, got ${res.score}`);
  assert.match(res.reason, /references_exist: FAIL/);
}
// The live bug: a bundled file SKILL.md never links should cost the metric,
// not sail through because nothing "dangles".
{
  const files = {
    'SKILL.md': '---\nname: x\ndescription: y\n---\n\nDoes the rollback.',
    'scripts/rollback.sh': 'echo done',
  };
  const res = g.specBudgetAndRefs(g.normalizeToFiles(wrap(files)));
  assert.ok(res.score < 1, `an unlinked bundled file should not score 1, got ${res.score}`);
  assert.match(res.reason, /all_files_reachable: FAIL/);
}
bad('no package at all', g.specBudgetAndRefs('NO SKILL PACKAGE IN OUTPUT\n\nnope'));
// The live bug: no frontmatter at all (a bare reply mislabeled SKILL.md) has
// nothing to dangle and nothing unreachable, so it must not score 1 by
// vacuous absence of violations.
{
  const res = g.specBudgetAndRefs(g.normalizeToFiles(wrap({ 'SKILL.md': '#!/bin/bash\necho "rollback done"\n' })));
  bad('no frontmatter at all', res);
  assert.strictEqual(res.score, 0);
}

// --- validatesWithSkillsRef (network) -----------------------------------------

if (process.env.SKIP_NETWORK_TESTS) {
  console.log('skillauth assertions: skipping skills-ref checks (SKIP_NETWORK_TESTS)');
} else {
  const clean = wrap({ 'SKILL.md': goodSkill(), 'references/api.md': 'error codes' });
  ok('skills-ref accepts a clean skill', g.validatesWithSkillsRef(g.normalizeToFiles(clean)));

  const badName = `---\nname: PDF_Processing\ndescription: Helps with PDFs.\n---\n\nbody\n`;
  const nameRes = g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': badName })));
  bad('uppercase/underscored name', nameRes);
  assert.match(nameRes.reason, /lowercase|invalid characters/i);

  const noDescription = `---\nname: no-description\n---\n\nbody\n`;
  bad('missing description', g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': noDescription }))));

  const longDescription = `---\nname: long-description\ndescription: ${'x'.repeat(1100)}\n---\n\nbody\n`;
  bad('description over 1024 chars', g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': longDescription }))));

  // The two of the five hand-verified behaviours the comment claimed but this
  // file did not exercise (adversarial review caught the gap).
  const longCompatibility = `---\nname: long-compat\ndescription: fine. use when testing.\ncompatibility: ${'z'.repeat(600)}\n---\n\nbody\n`;
  const compatRes = g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': longCompatibility })));
  bad('compatibility over 500 chars', compatRes);
  assert.match(compatRes.reason, /compatibility/i);

  const malformedYaml = `---\nname: malformed\ndescription: [unterminated\n---\n\nbody\n`;
  const yamlRes = g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': malformedYaml })));
  bad('malformed YAML frontmatter', yamlRes);
  assert.match(yamlRes.reason, /yaml/i);

  bad('no SKILL.md in the package', g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'references/api.md': 'x' }))));

  // The materialisation directory is always named "skill-under-test", so a
  // model's own `name:` choice never trips the directory-mismatch line -
  // that check would only ever fire on the harness's own fixture, not on
  // anything a model did.
  const mismatchNamed = `---\nname: totally-different-name\ndescription: fine. use when testing.\n---\n\nbody\n`;
  ok('name need not match the harness directory', g.validatesWithSkillsRef(g.normalizeToFiles(wrap({ 'SKILL.md': mismatchNamed }))));
}

// --- which graders ride the negative controls --------------------------------
// skill_validates and spec_budget_and_refs both demand a valid, complete,
// cross-referenced package. On a control whose right answer is no package (or a
// single short SKILL.md), they score correct behaviour 0 while control_quality
// scores it 1 - the same behaviour with opposite signs. Nothing else would
// notice them being aliased back on, and the aliases have to be resolved before
// an assertion list can be read at all, so PyYAML rather than a regex.
{
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const cases = JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
    path.join(__dirname, '..', 'tests', 'cases.yaml')], { encoding: 'utf8' }));

  const controls = cases.filter((c) => c.description.startsWith('negative control'));
  assert.strictEqual(controls.length, 3, 'expected three negative controls');
  const PACKAGE_GRADERS = ['skill_validates', 'spec_budget_and_refs', 'skill_quality'];
  for (const c of controls) {
    const metrics = (c.assert || []).map((a) => a.metric);
    assert.ok(metrics.includes('control_quality'), `${c.description}: no control_quality`);
    for (const m of PACKAGE_GRADERS) {
      assert.ok(!metrics.includes(m),
        `${c.description}: ${m} demands a full package where the right answer is not to build one`);
    }
  }
  // The other side of the partition: cutting them from a control must not cut
  // them from the cases they were written for.
  for (const c of cases.filter((c) => !c.description.startsWith('negative control'))) {
    const metrics = (c.assert || []).map((a) => a.metric);
    for (const m of PACKAGE_GRADERS) {
      assert.ok(metrics.includes(m), `${c.description}: lost ${m}`);
    }
  }
  console.log(`ok   control partition (${controls.length} controls on control_quality alone, ${cases.length - controls.length} package cases)`);
}

console.log('skillauth assertions: ok');
