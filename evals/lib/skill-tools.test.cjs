// Self-check for the load_resource provider. Free, no network: the model turn is
// a stubbed fetch. Covers the two things that would fail silently in a run -
// a path escaping the skill directory, and token usage counting only the last
// round-trip of a multi-turn loop.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Provider = require('./skill-tools.js');
const { loadResource } = Provider;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tools-test-'));
fs.mkdirSync(path.join(root, 'references/flowchart'), { recursive: true });
fs.mkdirSync(path.join(root, 'references/railroad'), { recursive: true });
fs.writeFileSync(path.join(root, 'references/flowchart/README.md'), 'flowchart syntax');
fs.writeFileSync(path.join(root, 'SKILL.md'), 'skill');
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tools-outside-'));
fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'escape.md'));
const real = fs.realpathSync(root);
const budget = () => ({ total: 1 << 20, remaining: 1 << 20 });

// Reads what it should.
assert.equal(loadResource(real, 'references/flowchart/README.md', budget()), 'flowchart syntax');

// Confinement: absolute, traversal, and a symlink out are all refused.
for (const bad of ['/etc/passwd', '../../../etc/passwd', 'references/../../../etc/passwd', 'escape.md', '~/.ssh/id_rsa']) {
  assert.match(loadResource(real, bad, budget()), /^refused:/, `not refused: ${bad}`);
}
assert.ok(!loadResource(real, 'escape.md', budget()).includes('secret'));

// A wrong guess lists the nearest real directory instead of dead-ending.
const miss = loadResource(real, 'references/railroad/SYNTAX.md', budget());
assert.match(miss, /^not found/);
assert.match(miss, /references\/railroad: \(empty\)/);
const missDeeper = loadResource(real, 'references/nope/README.md', budget());
assert.match(missDeeper, /flowchart\/, railroad\//);
// A directory reads as a listing.
assert.match(loadResource(real, 'references', budget()), /^references: flowchart\/, railroad\//);

// Over budget refuses loudly rather than returning half a file.
const tight = { total: 4, remaining: 4 };
assert.match(loadResource(real, 'references/flowchart/README.md', tight), /^refused:.*budget/);
assert.equal(tight.remaining, 4);

// --- the loop: token usage sums across round-trips, tool only when skillDir set.
const reply = (message, tokens) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    choices: [{ message }],
    usage: { prompt_tokens: tokens, completion_tokens: tokens, total_tokens: tokens * 2 },
  }),
});
const toolCall = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'load_resource', arguments: JSON.stringify({ path: 'references/flowchart/README.md' }) } }] };

process.env.TEST_KEY = 'k';
const provider = new Provider({ config: { model: 'm', apiKeyEnvar: 'TEST_KEY', maxToolCalls: 2 } });
const bodies = [];
global.fetch = async (_url, opts) => {
  bodies.push(JSON.parse(opts.body));
  return bodies.length === 1 && bodies[0].tools
    ? reply(toolCall, 10)
    : reply({ role: 'assistant', content: 'done' }, 25);
};

(async () => {
  const withSkill = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hi' }]), { prompt: { config: { skillDir: real } } });
  assert.equal(withSkill.output, 'done');
  assert.equal(withSkill.tokenUsage.total, 20 + 50, 'usage must sum every round-trip, not just the last');
  assert.equal(withSkill.tokenUsage.numRequests, 2);
  assert.deepEqual(withSkill.metadata.resourcesLoaded, ['references/flowchart/README.md']);
  assert.equal(bodies[1].messages.at(-1).content, 'flowchart syntax', 'file contents must reach the next request');

  bodies.length = 0;
  const baseline = await provider.callApi(JSON.stringify([{ role: 'user', content: 'hi' }]), { prompt: { config: {} } });
  assert.equal(baseline.output, 'done');
  assert.equal(bodies.length, 1, 'no skillDir means one plain call');
  assert.ok(!('tools' in bodies[0]), 'baseline arm must not be offered a tool');

  // Sending `tools` makes the gateway prefix the reply with blank lines, so the
  // skill arm alone arrived with a leading "\n\n" and every shape assertion on it
  // failed. Only the tool-carrying arm is affected, so untrimmed output is a
  // difference between the arms that is not the skill.
  global.fetch = async () => reply({ role: 'assistant', content: '\n\n```go\npackage a\n```\n' }, 5);
  const padded = await provider.callApi('[]', { prompt: { config: { skillDir: real } } });
  assert.equal(padded.output, '```go\npackage a\n```', 'template whitespace must not reach the graders');

  // A source tree is the subject matter, not a skill affordance, so read_source
  // is offered to whichever arm names a repoDir - including the baseline. If it
  // were gated on the skill the baseline would be reviewing hunks while the skill
  // arm read the code, and the delta would measure file access, not the skill.
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return reply({ role: 'assistant', content: 'done' }, 5); };
  bodies.length = 0;
  await provider.callApi('[]', { prompt: { config: { repoDir: real } } });
  assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['read_source'],
    'repoDir alone offers the source tool and not the skill one');

  bodies.length = 0;
  await provider.callApi('[]', { prompt: { config: { skillDir: real, repoDir: real } } });
  assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['load_resource', 'read_source'],
    'both roots offer both tools');

  // Each tool reads its own root, and an unknown name is refused rather than
  // silently served from whichever root happens to be first.
  bodies.length = 0;
  const srcCall = { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'read_source', arguments: JSON.stringify({ path: 'references/flowchart/README.md' }) } }] };
  let n = 0;
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); n += 1; return n === 1 ? reply(srcCall, 1) : reply({ role: 'assistant', content: 'done' }, 1); };
  await provider.callApi('[]', { prompt: { config: { repoDir: real } } });
  assert.equal(bodies[1].messages.at(-1).content, 'flowchart syntax', 'read_source must serve from repoDir');

  // A runaway loop throws instead of returning an empty answer to be graded.
  bodies.length = 0;
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return reply(toolCall, 1); };
  await assert.rejects(
    provider.callApi(JSON.stringify([{ role: 'user', content: 'hi' }]), { prompt: { config: { skillDir: real } } }),
    /exceeded 2 rounds/,
  );

  // So does an API failure - a tool that could not run is not a verdict.
  global.fetch = async () => ({ ok: false, status: 500, statusText: 'boom', text: async () => 'upstream' });
  await assert.rejects(provider.callApi('[]', { prompt: { config: {} } }), /500 boom/);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  console.log('ok   skill-tools (confinement, listings, budget, token summing, loud failure)');
})();
