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
const armsFactory = require('./arms.js');

// arms.withPersonaEveryArm: attaches identically to every arm, whether the arm
// already returns {prompt, config} (post skillDir/repoDir wiring) or a bare
// message array - and never touches config a suite already set.
{
  const persona = { knows: 'x', wants: 'y' };
  const raw = [{ role: 'user', content: 'hi' }];
  const bareArm = () => raw;
  const configuredArm = () => ({ prompt: raw, config: { skillDir: '/x' } });
  const wrapped = armsFactory.withPersonaEveryArm(persona, { a: bareArm, b: configuredArm });
  assert.deepEqual(wrapped.a({}), { prompt: raw, config: { userPersona: persona } });
  assert.deepEqual(wrapped.b({}), { prompt: raw, config: { skillDir: '/x', userPersona: persona } });
  console.log('ok   arms.withPersonaEveryArm (symmetric attachment, preserves existing config)');
}

// arms.withConfigEveryArm: the general form, used for workspaceDir. run_bash is
// the case's environment, not something an arm earns, so it must land on every
// arm at once - and on the arm that already carries a skillDir too.
{
  const raw = [{ role: 'user', content: 'hi' }];
  const wrapped = armsFactory.withConfigEveryArm({ workspaceDir: '/w' }, {
    a: () => raw,
    b: () => ({ prompt: raw, config: { skillDir: '/x' } }),
  });
  assert.deepEqual(wrapped.a({}), { prompt: raw, config: { workspaceDir: '/w' } });
  assert.deepEqual(wrapped.b({}), { prompt: raw, config: { skillDir: '/x', workspaceDir: '/w' } });
  console.log('ok   arms.withConfigEveryArm (workspaceDir reaches every arm)');
}

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

// Memoization at the loadResource level: a second read through the same cache
// does not re-charge the budget and returns a marker, not the file again. No
// cache argument (all the calls above) must keep behaving exactly as before.
{
  const b = budget();
  const cache = new Map();
  const first = loadResource(real, 'references/flowchart/README.md', b, cache);
  assert.equal(first, 'flowchart syntax');
  const afterFirst = b.remaining;
  const second = loadResource(real, 'references/flowchart/README.md', b, cache);
  assert.equal(b.remaining, afterFirst, 'a repeat must not decrement the budget again');
  assert.match(second, /^already loaded:/);
  assert.notEqual(second, first, 'a repeat returns a marker, not the file content again');
  // A directory listing is free either way, so it is never cached or marked.
  assert.equal(
    loadResource(real, 'references', b, cache),
    loadResource(real, 'references', b, new Map()),
    'directory listings are unaffected by the cache',
  );
}

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

  // --- memoization: a repeat load of a path already served this invocation
  // still costs a round (a free round would let a confused retry loop for
  // free) but does not re-decrement the budget, and metadata says how often it
  // happened so a suite can see a row thrashing.
  bodies.length = 0;
  const dedupProvider = new Provider({ config: { model: 'm', apiKeyEnvar: 'TEST_KEY', maxToolCalls: 5 } });
  const loadFlowchart = (id) => ({
    role: 'assistant',
    content: null,
    tool_calls: [{ id, type: 'function', function: { name: 'load_resource', arguments: JSON.stringify({ path: 'references/flowchart/README.md' }) } }],
  });
  const dedupQueue = [
    reply(loadFlowchart('r1'), 3), // round 0: first read
    reply(loadFlowchart('r2'), 3), // round 1: repeat of the same path
    reply({ role: 'assistant', content: 'done' }, 5), // round 2: final
  ];
  let dq = 0;
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return dedupQueue[dq++]; };
  const dedupResult = await dedupProvider.callApi(JSON.stringify([{ role: 'user', content: 'hi' }]), { prompt: { config: { skillDir: real } } });
  assert.equal(dedupResult.output, 'done');
  assert.equal(dedupResult.metadata.toolRounds, 2, 'a repeat still consumes a tool round');
  assert.deepEqual(
    dedupResult.metadata.resourcesLoaded,
    ['references/flowchart/README.md', 'references/flowchart/README.md'],
    'both the original request and the repeat are recorded',
  );
  assert.equal(dedupResult.metadata.resourcesDeduped, 1, 'metadata reports how many loads were repeats');
  assert.equal(bodies[1].messages.at(-1).content, 'flowchart syntax', 'the first read still returns full content');
  assert.match(bodies[2].messages.at(-1).content, /^already loaded:/, 'the repeat gets a marker, not the file again');

  // The cache is per callApi invocation, not per provider or process: a second
  // call on the SAME provider instance, for the SAME path, must not inherit the
  // first call's cache - otherwise content served to one row would silently
  // answer another.
  bodies.length = 0;
  const secondInvocationQueue = [reply(loadFlowchart('s1'), 3), reply({ role: 'assistant', content: 'done' }, 5)];
  let sq = 0;
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return secondInvocationQueue[sq++]; };
  const secondInvocation = await dedupProvider.callApi(JSON.stringify([{ role: 'user', content: 'hi again' }]), { prompt: { config: { skillDir: real } } });
  assert.equal(bodies[1].messages.at(-1).content, 'flowchart syntax', 'a new callApi invocation must not inherit a previous call\'s cache');
  assert.equal(secondInvocation.metadata.resourcesDeduped, 0, 'a fresh invocation starts with an empty cache');

  // Restore the shared generic stub the rest of this file's tests rely on.
  global.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    return bodies.length === 1 && bodies[0].tools
      ? reply(toolCall, 10)
      : reply({ role: 'assistant', content: 'done' }, 25);
  };

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

  // The exceeded-loop error names ask_user attempts too - otherwise a model that
  // burns its rounds on refused questions throws with an empty "requested: "
  // and no hint questions were the cause.
  bodies.length = 0;
  const askLoopProvider = new Provider({ config: { model: 'm', apiKeyEnvar: 'TEST_KEY', maxToolCalls: 1 } });
  const askOnly = { role: 'assistant', content: null, tool_calls: [{ id: 'a1', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: 'what now?' }) } }] };
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return reply(askOnly, 1); };
  await assert.rejects(
    askLoopProvider.callApi('[]', { prompt: { config: { userPersona: { knows: 'x', wants: 'y' } } } }),
    /exceeded 1 rounds.*1 were ask_user/,
  );

  // So does an API failure - a tool that could not run is not a verdict.
  global.fetch = async () => ({ ok: false, status: 500, statusText: 'boom', text: async () => 'upstream' });
  await assert.rejects(provider.callApi('[]', { prompt: { config: {} } }), /500 boom/);

  // --- ask_user: offered only when a persona is configured, on the same terms
  // as read_source (case supplies it, either arm can ask for it).
  const persona = {
    knows: 'The button should say "Export".',
    wants: 'A CSV export button on the reports page.',
    doesNotKnow: 'Which CSV library or parsing approach to use - not the user\'s call.',
    maxQuestions: 2,
  };
  const noPersonaProvider = new Provider({ config: { model: 'm', apiKeyEnvar: 'TEST_KEY' } });
  global.fetch = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return reply({ role: 'assistant', content: 'done' }, 1); };
  bodies.length = 0;
  await noPersonaProvider.callApi('[]', { prompt: { config: { skillDir: real, repoDir: real } } });
  assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['load_resource', 'read_source'],
    'no userPersona means no ask_user, even alongside other tools');

  bodies.length = 0;
  await noPersonaProvider.callApi('[]', { prompt: { config: { skillDir: real, repoDir: real, userPersona: persona } } });
  assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['load_resource', 'read_source', 'ask_user'],
    'a configured persona offers ask_user alongside whatever else the arm named');

  // maxQuestions: 0 (or negative) must not offer the tool at all - offering it
  // and always refusing would still cost the model a round for nothing.
  bodies.length = 0;
  await noPersonaProvider.callApi('[]', { prompt: { config: { userPersona: { ...persona, maxQuestions: 0 } } } });
  assert.ok(!('tools' in bodies[0]), 'maxQuestions: 0 must not offer ask_user at all');

  // Full loop: two questions spend the budget (max 2), a third is refused
  // locally without a network call, and the final answer still comes through.
  const personaProvider = new Provider({ config: { model: 'm', apiKeyEnvar: 'TEST_KEY', maxToolCalls: 5 } });
  const twoAsks = {
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'q1', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: 'What should the button say?' }) } },
      { id: 'q2', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: 'Which CSV library should I use?' }) } },
    ],
  };
  const thirdAsk = {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'q3', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: 'Which database schema should back it?' }) } }],
  };
  const queue = [
    reply(twoAsks, 8), // main loop round 0
    reply({ role: 'assistant', content: 'Export, like we said.' }, 5), // sim answers q1
    reply({ role: 'assistant', content: "I don't know, that's your call." }, 6), // sim answers q2 (out of scope)
    reply(thirdAsk, 4), // main loop round 1
    reply({ role: 'assistant', content: 'done' }, 7), // main loop round 2, final
  ];
  const personaBodies = [];
  global.fetch = async (_url, opts) => { personaBodies.push(JSON.parse(opts.body)); return queue[personaBodies.length - 1]; };
  const result = await personaProvider.callApi(
    JSON.stringify([{ role: 'user', content: 'add csv export' }]),
    { prompt: { config: { userPersona: persona } } },
  );

  assert.equal(result.output, 'done');
  assert.equal(personaBodies.length, 5, 'the budget-exceeded 3rd question must not reach the network');
  assert.equal(result.metadata.questionsAsked, 2, 'only the questions that actually asked the sim are counted');
  // 8+5+6+4+7, doubled by the reply() helper's total_tokens = tokens*2: the
  // sim's own two round-trips (5, 6) must be summed in, not dropped.
  assert.equal(result.tokenUsage.total, (8 + 5 + 6 + 4 + 7) * 2, 'simulated-user tokens must be counted in tokenUsage');
  assert.equal(result.tokenUsage.numRequests, 5);

  // Leakage: the persona's own "do not know" text reaches the sim's system
  // prompt, so it has something to refuse with rather than guessing.
  const q2SystemPrompt = personaBodies[2].messages[0].content;
  assert.match(q2SystemPrompt, /CSV library/, 'the sim must be told what it does not know, or it will invent an answer');
  assert.match(q2SystemPrompt, /Never volunteer/, 'the system prompt must forbid volunteering beyond the persona');
  assert.equal(personaBodies[2].messages[1].content, 'Which CSV library should I use?');

  // The out-of-scope answer passes through to the model untouched.
  const round1Messages = personaBodies[3].messages;
  assert.equal(round1Messages.find((m) => m.tool_call_id === 'q2').content, "I don't know, that's your call.");

  // The budget refusal is a normal tool result, not a thrown error, and tells
  // the model what to do instead of dead-ending it.
  const round2Messages = personaBodies[4].messages;
  const q3Result = round2Messages.find((m) => m.tool_call_id === 'q3').content;
  assert.match(q3Result, /refused:.*budget/);
  assert.match(q3Result, /proceed on your stated assumptions/i);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  console.log('ok   skill-tools (confinement, listings, budget, token summing, loud failure, ask_user persona)');
})();

// The case's post-turn verification. This is what lets a suite grade whether the
// work is RIGHT rather than whether the answer named the right command, so it
// has to run in the SAME container, after the last turn, without the model ever
// seeing it and without spending the command budget. A fake Sandbox stands in
// for Docker so this stays free and offline.
(async () => {
  const sandboxMod = require('./sandbox.js');
  const realSandbox = sandboxMod.Sandbox;
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tools-ws-'));
  const seen = [];
  let started = 0;

  const fake = (result) => class {
    static async start() { started += 1; return new this(); }
    async run(cmd) { seen.push(cmd); return result(cmd); }
    async stop() {}
  };

  const provider = (verify) => {
    const p = new Provider({ config: { model: 'm', apiKeyEnvar: 'X' } });
    p.chat = async () => ({ json: { choices: [{ message: { content: 'done' } }] }, cached: false });
    return p.callApi(JSON.stringify([{ role: 'user', content: 'go' }]), {
      prompt: { config: { workspaceDir: ws, ...(verify ? { verify } : {}) } },
    });
  };

  process.env.X = 'k';

  // A row that ran no commands still gets its check: "did nothing" must be
  // gradeable, so the container is started for the verification alone.
  sandboxMod.Sandbox = fake(() => ({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false, truncated: 0, refused: null }));
  const passed = await provider('go build ./...');
  assert.deepStrictEqual(seen, ['go build ./...'], 'the verify command must run, exactly once');
  assert.strictEqual(started, 1, 'the container must start even when the model ran nothing');
  assert.strictEqual(passed.metadata.verify.exitCode, 0);
  assert.strictEqual(passed.metadata.verify.cmd, 'go build ./...');
  assert.strictEqual(passed.metadata.commandsRun, 0, 'the check must not be charged to the command budget');
  assert.ok(!JSON.stringify(passed.output).includes('go build'), 'the verify command must never reach the model');

  // A non-zero exit is the answer key, and its output has to survive for the
  // grader's reason - an unreadable failure row is a wasted row.
  seen.length = 0;
  sandboxMod.Sandbox = fake(() => ({ exitCode: 2, stdout: 'FAIL x', stderr: 'boom', timedOut: false, truncated: 0, refused: null }));
  const failed = await provider('go test ./...');
  assert.strictEqual(failed.metadata.verify.exitCode, 2);
  assert.match(failed.metadata.verify.stdout, /FAIL x/);
  assert.match(failed.metadata.verify.stdout, /boom/);

  // A spent wall clock refuses the check. That is a harness condition, not a
  // wrong answer, so the refusal rides through for the grader to error on
  // rather than being recorded as a task the model got wrong.
  sandboxMod.Sandbox = fake(() => ({ exitCode: -1, stdout: '', stderr: '', timedOut: false, truncated: 0, refused: 'wall clock spent' }));
  const refused = await provider('go test ./...');
  assert.match(refused.metadata.verify.refused, /wall clock/);

  // No verify declared, no verify recorded - and no container started for it.
  seen.length = 0;
  started = 0;
  sandboxMod.Sandbox = fake(() => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false, truncated: 0, refused: null }));
  const none = await provider(null);
  assert.strictEqual(none.metadata.verify, undefined);
  assert.strictEqual(started, 0, 'a row with no check and no commands must not pay for a container');

  // What a row RAN is the behavioural record a spillover metric reads - ETH's
  // finding is that a context file makes agents "run more tests... search more
  // files (grep), read more files" - so the command strings themselves have to
  // survive into metadata, not just their count. Folded into this IIFE rather
  // than given its own: the stub on sandboxMod is shared module state, and two
  // top-level async blocks swapping it race each other.
  const chatty = new Provider({ config: { model: 'm', apiKeyEnvar: 'X' } });
  let turn = 0;
  chatty.chat = async () => {
    turn += 1;
    if (turn === 1) {
      return { json: { choices: [{ message: { tool_calls: [
        { id: 'c1', function: { name: 'run_bash', arguments: JSON.stringify({ command: 'grep -rn DefaultCaps .' }) } },
        { id: 'c2', function: { name: 'run_bash', arguments: JSON.stringify({ command: 'make test' }) } },
      ] } }] }, cached: false };
    }
    return { json: { choices: [{ message: { content: 'done' } }] }, cached: false };
  };
  const withCommands = await chatty.callApi(JSON.stringify([{ role: 'user', content: 'go' }]), {
    prompt: { config: { workspaceDir: ws } },
  });
  assert.deepStrictEqual(withCommands.metadata.commands, ['grep -rn DefaultCaps .', 'make test'],
    'the commands a row ran must reach metadata, in order');
  assert.strictEqual(withCommands.metadata.commandsRun, 2);

  sandboxMod.Sandbox = realSandbox;
  fs.rmSync(ws, { recursive: true, force: true });
  console.log('ok   skill-tools post-turn verify and command record');
})();
