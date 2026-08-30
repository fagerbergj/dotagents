// Self-check for the run_bash sandbox. Every test here attempts a real escape
// against a real container, and then MUTATES the guard out of a copy of the
// source and shows the same attempt succeeds - a security test that passes with
// the guard removed is worse than no test at all.
//
// It needs Docker and costs ~15 container starts (about a minute). It never
// touches the network on purpose except to prove egress is refused, and the one
// mutation that mounts a host path mounts it read-only.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const SANDBOX_SRC = path.join(__dirname, 'sandbox.js');
const TOOLS_SRC = path.join(__dirname, 'skill-tools.js');
const { Sandbox, SandboxError } = require('./sandbox.js');

const probe = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.log(`SKIPPING sandbox.test.cjs: Docker is not usable here (${(probe.stderr || probe.error?.message || '').trim().slice(0, 200)})`);
  process.exit(0);
}

// A fixture tree that is not a real checkout: the point of the copy semantics is
// that whatever lands here can be destroyed.
const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-ws-'));
fs.writeFileSync(path.join(workspaceDir, 'hello.txt'), 'fixture content\n');

// The secret a leak test looks for. Set before any container starts, so a
// container that inherited the harness environment would carry it.
process.env.EVAL_FAKE_API_KEY = 'sk-canary-3f9a-do-not-leak';
process.env.EVAL_FAKE_GH_TOKEN = 'ghp-canary-do-not-leak';

const failures = [];
const skips = [];
function ok(what) { console.log(`ok   ${what}`); }
function skip(what, why) { skips.push(what); console.log(`SKIP ${what}: ${why}`); }

// Writes a one-edit copy of a lib file NEXT TO the original (relative requires
// must still resolve) and hands back the loaded module. The anchor must appear
// exactly once, or the "mutation" might be editing something else entirely.
let mutantSeq = 0;
async function withMutation(file, from, to, fn) {
  const src = fs.readFileSync(file, 'utf8');
  assert.notEqual(src.indexOf(from), -1, `mutation anchor not found in ${path.basename(file)}: ${JSON.stringify(from)}`);
  assert.equal(src.indexOf(from), src.lastIndexOf(from), `mutation anchor is not unique in ${path.basename(file)}`);
  const mutated = src.replace(from, to);
  assert.notEqual(mutated, src, 'mutation changed nothing');
  const mutantPath = path.join(path.dirname(file), `.mutant-${process.pid}-${mutantSeq += 1}-${path.basename(file)}`);
  fs.writeFileSync(mutantPath, mutated);
  try {
    return await fn(require(mutantPath));
  } finally {
    delete require.cache[require.resolve(mutantPath)];
    fs.rmSync(mutantPath, { force: true });
  }
}

// Runs one probe against a sandbox built by `mod` (real or mutated) and always
// tears the container down.
async function inSandbox(mod, options, fn) {
  const box = await mod.Sandbox.start({ workspaceDir, ...options });
  try {
    return await fn(box);
  } finally {
    await box.stop();
  }
}

async function check(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

(async () => {
  // --- the workspace is a copy, and the sandbox works at all ------------------
  await check('workspace is a copy, not a mount (host tree cannot be modified)', async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const read = await box.run('cat hello.txt');
      assert.equal(read.exitCode, 0, `fixture not readable inside: ${read.stderr}`);
      assert.match(read.stdout, /fixture content/);
      const wrote = await box.run('rm -f hello.txt && echo destroyed > wrecked.txt && echo done');
      assert.equal(wrote.exitCode, 0, wrote.stderr);
      // State persists between calls, which is what makes install-then-test work.
      const again = await box.run('cat wrecked.txt');
      assert.match(again.stdout, /destroyed/);
    });
    assert.ok(fs.existsSync(path.join(workspaceDir, 'hello.txt')), 'the container deleted a file from the HOST tree');
    assert.ok(!fs.existsSync(path.join(workspaceDir, 'wrecked.txt')), 'the container wrote into the HOST tree');
  });

  await withMutation(
    SANDBOX_SRC,
    "    '--tmpfs', `/workspace:rw,exec,size=${c.workspaceMB}m,mode=1777`,\n",
    "    '-v', `${c.workspaceDir}:/workspace`,\n",
    async (mod) => check('MUTANT (workspace bind-mounted instead of copied) is caught', async () => {
      await inSandbox(mod, {}, async (box) => { await box.run('echo destroyed > wrecked.txt'); });
      const leaked = fs.existsSync(path.join(workspaceDir, 'wrecked.txt'));
      fs.rmSync(path.join(workspaceDir, 'wrecked.txt'), { force: true });
      assert.ok(leaked, 'mutation did not reach the host tree, so the copy test proves nothing');
    }),
  );

  // --- network egress ---------------------------------------------------------
  const egress = 'wget -T 4 -q -O- http://example.com';
  await check('network egress is refused', async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const r = await box.run(egress);
      assert.notEqual(r.exitCode, 0, `egress SUCCEEDED from inside the container: ${r.stdout.slice(0, 200)}`);
      assert.ok(!/Example Domain/.test(r.stdout), 'the container fetched a page from the internet');
      const iface = await box.run('ip -o addr | grep -vc " lo "');
      assert.notEqual(iface.exitCode, 0, 'the container has a non-loopback interface');
    });
  });

  await withMutation(SANDBOX_SRC, "    '--network=none',\n", '', async (mod) => {
    const r = await inSandbox(mod, {}, (box) => box.run(egress));
    if (r.exitCode !== 0) {
      skip('MUTANT (no --network=none) reaches the internet',
        'this host has no egress even with default bridge networking, so the egress test cannot be proven non-vacuous here');
      return;
    }
    await check('MUTANT (no --network=none) reaches the internet, so the guard is what stops it', async () => {
      assert.match(r.stdout, /Example Domain/);
    });
  });

  // --- credentials ------------------------------------------------------------
  await check('no host environment reaches the container', async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const r = await box.run('env; printenv');
      assert.equal(r.exitCode, 0, r.stderr);
      assert.ok(!r.stdout.includes('sk-canary'), 'an API key from the harness environment is visible inside');
      assert.ok(!r.stdout.includes('ghp-canary'), 'a token from the harness environment is visible inside');
      assert.ok(!/(_API_KEY|_TOKEN|OPENROUTER|ANTHROPIC|^GH_)/m.test(r.stdout), `credential-shaped variable inside:\n${r.stdout}`);
    });
  });

  await withMutation(
    SANDBOX_SRC,
    "    '--env', 'HOME=/workspace',\n",
    "    '--env', 'HOME=/workspace',\n    '--env', 'EVAL_FAKE_API_KEY',\n",
    async (mod) => check('MUTANT (one env passthrough) is caught by the credential test', async () => {
      const r = await inSandbox(mod, {}, (box) => box.run('env; printenv'));
      assert.ok(r.stdout.includes('sk-canary'), 'the mutation did not leak, so the credential test proves nothing');
    }),
  );

  // --- the host filesystem ----------------------------------------------------
  const QUACK = '/home/jason/workspace/quack-fix';
  // head -1, not cat: go.mod is 8.7KB and the output cap keeps the TAIL, so a
// whole-file read would drop the `module` line the assertions look for.
const hostProbe = `ls -a ${QUACK}; head -1 ${QUACK}/go.mod; ls -a /home/jason; head -1 ${path.join(__dirname, 'sandbox.js')}`;
  await check("the owner's checkout and the harness tree are unreachable", async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const r = await box.run(hostProbe);
      assert.notEqual(r.exitCode, 0, 'a host path was readable from inside the container');
      assert.ok(!/module github/.test(r.stdout), `${QUACK}/go.mod was readable from inside the container`);
      assert.ok(!/disposable Docker container/.test(r.stdout), 'the harness lib directory was readable from inside the container');
    });
  });

  if (!fs.existsSync(QUACK)) {
    skip("MUTANT (quack-fix bind-mounted) is caught", `${QUACK} does not exist on this host`);
  } else {
    await withMutation(
      SANDBOX_SRC,
      "    '--read-only',\n",
      `    '--read-only',\n    '-v', '${QUACK}:${QUACK}:ro',\n`,
      async (mod) => check('MUTANT (quack-fix bind-mounted read-only) is caught by the host-filesystem test', async () => {
        const r = await inSandbox(mod, {}, (box) => box.run(hostProbe));
        assert.match(r.stdout, /module github/, 'the mutation did not expose the checkout, so the host-filesystem test proves nothing');
      }),
    );
  }

  // --- per-command timeout ----------------------------------------------------
  await check('a command over its timeout is killed', async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const began = Date.now();
      const r = await box.run('sleep 60', { timeoutMs: 3000 });
      const elapsed = Date.now() - began;
      assert.ok(r.timedOut, `not reported as timed out (exit ${r.exitCode} after ${elapsed}ms)`);
      assert.notEqual(r.exitCode, 0);
      assert.ok(elapsed < 8000, `took ${elapsed}ms - the kill did not come from the per-command timeout`);
    });
  });

  await withMutation(
    SANDBOX_SRC,
    "      ['exec', this.id, 'timeout', String(seconds), 'sh', '-c', command],\n",
    "      ['exec', this.id, 'sh', '-c', command],\n",
    async (mod) => check('MUTANT (no timeout(1) wrapper) is caught by the timeout test', async () => {
      const began = Date.now();
      const r = await inSandbox(mod, {}, (box) => box.run('sleep 60', { timeoutMs: 3000 }));
      const elapsed = Date.now() - began;
      assert.ok(elapsed >= 8000, `the mutant still stopped within ${elapsed}ms, so the timeout test proves nothing`);
      assert.ok(!r.timedOut || elapsed >= 8000);
    }),
  );

  // --- output truncation ------------------------------------------------------
  const flood = 'yes 0123456789abcdef | head -c 400000';
  await check('oversized output is truncated, not passed through', async () => {
    await inSandbox({ Sandbox }, {}, async (box) => {
      const r = await box.run(flood);
      assert.ok(Buffer.byteLength(r.stdout) <= 8 * 1024, `stdout came back whole: ${Buffer.byteLength(r.stdout)} bytes`);
      assert.ok(r.truncated > 300_000, `truncation not reported (${r.truncated})`);
      const rendered = require('./skill-tools.js').formatCommandResult(r);
      assert.match(rendered, /truncated, \d+ earlier bytes dropped/, 'the model is not told the output was cut');
    });
  });

  await withMutation(SANDBOX_SRC, '  maxOutputBytes: 8 * 1024,\n', '  maxOutputBytes: 64 * 1024 * 1024,\n',
    async (mod) => check('MUTANT (no output cap) is caught by the truncation test', async () => {
      const r = await inSandbox(mod, {}, (box) => box.run(flood));
      assert.ok(Buffer.byteLength(r.stdout) > 8 * 1024, 'the mutant did not pass more through, so the truncation test proves nothing');
      assert.equal(r.truncated, 0);
    }));

  // --- pids: a fork storm ------------------------------------------------------
  const forkStorm = 'i=0; while [ $i -lt 200 ]; do sleep 30 & i=$((i+1)); done; echo started=200';
  await check('a fork storm is contained by the pids limit', async () => {
    await inSandbox({ Sandbox }, { pids: 64 }, async (box) => {
      const r = await box.run(forkStorm, { timeoutMs: 20_000 });
      assert.ok(!/started=200/.test(r.stdout), 'all 200 processes started - the pids limit did not bite');
    });
  });

  await withMutation(SANDBOX_SRC, '    `--pids-limit=${c.pids}`,\n', '    `--pids-limit=4096`,\n',
    async (mod) => check('MUTANT (pids limit raised) is caught by the fork-storm test', async () => {
      const r = await inSandbox(mod, { pids: 64 }, (box) => box.run(forkStorm, { timeoutMs: 20_000 }));
      assert.match(r.stdout, /started=200/, 'the mutant did not start them all, so the fork-storm test proves nothing');
    }));

  // The real thing, run only with the guard in place: it must return rather than
  // hang, and the host must be healthy enough to start a fresh sandbox after.
  await check('a real fork bomb is contained and the host survives it', async () => {
    await inSandbox({ Sandbox }, { pids: 64 }, async (box) => {
      const r = await box.run(':(){ :|:& };:', { timeoutMs: 15_000 });
      assert.ok(r !== null);
    });
    const after = await inSandbox({ Sandbox }, {}, (box) => box.run('echo host-still-fine'));
    assert.match(after.stdout, /host-still-fine/, 'the host could not run a new container after the fork bomb');
  });

  // --- memory ------------------------------------------------------------------
  // The workspace is tmpfs, so its pages are charged to the memory cgroup: a dd
  // bigger than --memory but smaller than the tmpfs is killed by the cgroup.
  const memHog = 'dd if=/dev/zero of=big bs=1M count=400 >/dev/null 2>&1; echo dd_rc=$?';
  await check('a memory hog is killed by the memory limit', async () => {
    await inSandbox({ Sandbox }, { memoryMB: 256, workspaceMB: 512 }, async (box) => {
      const r = await box.run(memHog, { timeoutMs: 60_000 });
      assert.ok(!/dd_rc=0/.test(r.stdout), `wrote all 400MB despite a 256MB limit:\n${r.stdout}`);
    });
  });

  await withMutation(
    SANDBOX_SRC,
    '    `--memory=${c.memoryMB}m`,\n    // Equal to --memory: without it the container swaps instead of being killed.\n    `--memory-swap=${c.memoryMB}m`,\n',
    '    `--memory=4096m`,\n    `--memory-swap=4096m`,\n',
    async (mod) => check('MUTANT (memory limit raised) is caught by the memory test', async () => {
      const r = await inSandbox(mod, { memoryMB: 256, workspaceMB: 512 }, (box) => box.run(memHog, { timeoutMs: 60_000 }));
      assert.match(r.stdout, /dd_rc=0/, 'the mutant did not get further, so the memory test proves nothing');
    }),
  );

  // --- the command cap, in the provider ----------------------------------------
  // Stubbed model turn: the model asks for one command per round, forever.
  const Provider = require('./skill-tools.js');
  const bashRound = (id) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'run_bash', arguments: JSON.stringify({ command: 'echo ran' }) } }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  });
  const finalRound = {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'done' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
  };
  const realFetch = global.fetch;
  const cappedRun = async (ProviderClass, config = { maxCommands: 2 }) => {
    const bodies = [];
    let n = 0;
    global.fetch = async (_url, opts) => {
      bodies.push(JSON.parse(opts.body));
      n += 1;
      return n <= 4 ? bashRound(`c${n}`) : finalRound;
    };
    process.env.SANDBOX_TEST_KEY = 'k';
    const provider = new ProviderClass({ config: { model: 'm', apiKeyEnvar: 'SANDBOX_TEST_KEY', ...config } });
    const result = await provider.callApi(JSON.stringify([{ role: 'user', content: 'go' }]), { prompt: { config: { workspaceDir } } });
    global.fetch = realFetch;
    // The LAST request carries the whole transcript; every earlier one is a
    // prefix of it, so flattening all of them would count each result twice.
    const toolResults = bodies.at(-1).messages.filter((m) => m.role === 'tool').map((m) => m.content);
    return { result, toolResults, bodies };
  };

  await check('the command cap is enforced and both arms are offered the tool', async () => {
    const { result, toolResults, bodies } = await cappedRun(Provider);
    assert.equal(result.metadata.commandsRun, 2, `ran ${result.metadata.commandsRun} commands against a cap of 2`);
    const refusals = toolResults.filter((t) => /^refused: the command budget/.test(t));
    assert.equal(refusals.length, 2, `expected the 3rd and 4th calls to be refused, got:\n${toolResults.join('\n---\n')}`);
    assert.ok(toolResults.some((t) => /exit_code: 0/.test(t) && /ran/.test(t)), 'the first commands did not actually run');
    assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['run_bash'],
      'run_bash must be offered on workspaceDir alone - i.e. to whichever arm the suite configures, skill or baseline');
  });

  await withMutation(TOOLS_SRC, '      if (commands.count >= maxCommands) {\n', '      if (false) {\n',
    async (mod) => check('MUTANT (no command cap) is caught', async () => {
      const { result } = await cappedRun(mod);
      assert.equal(result.metadata.commandsRun, 4, 'the mutant did not run more commands, so the cap test proves nothing');
    }));

  // Each stubbed round costs 2 tokens, so a ceiling of 3 lets the first command
  // through and refuses the rest - a ceiling that bound before any work would
  // pass whether or not it were wired to the counter.
  await check('the token ceiling is enforced', async () => {
    const { result, toolResults } = await cappedRun(Provider, { maxCommands: 25, maxTokens: 3 });
    assert.equal(result.metadata.commandsRun, 1, `ran ${result.metadata.commandsRun} commands past a 3-token ceiling`);
    assert.ok(toolResults.some((t) => /^refused: this task has spent its 3-token ceiling/.test(t)), toolResults.join('\n---\n'));
  });

  await withMutation(TOOLS_SRC, '      if (usage.total >= maxTokens) {\n', '      if (false) {\n',
    async (mod) => check('MUTANT (no token ceiling) is caught', async () => {
      const { result } = await cappedRun(mod, { maxCommands: 25, maxTokens: 3 });
      assert.equal(result.metadata.commandsRun, 4, 'the mutant did not run more commands, so the ceiling test proves nothing');
    }));

  // --- the wall clock ----------------------------------------------------------
  await check('the wall-clock cap refuses further commands', async () => {
    await inSandbox({ Sandbox }, { wallClockMs: 1 }, async (box) => {
      const r = await box.run('echo should-not-run');
      assert.match(r.refused || '', /wall-clock budget/);
      assert.ok(!/should-not-run/.test(r.stdout), 'the command ran after the wall clock was spent');
    });
  });

  await withMutation(SANDBOX_SRC, '    if (remaining <= 0) {\n', '    if (false) {\n',
    async (mod) => check('MUTANT (no wall-clock cap) is caught', async () => {
      const r = await inSandbox(mod, { wallClockMs: 1 }, (box) => box.run('echo should-not-run'));
      assert.match(r.stdout, /should-not-run/, 'the mutant still refused, so the wall-clock test proves nothing');
    }));

  // --- no Docker means no execution, never a host fallback ----------------------
  await check('a missing Docker fails loudly and runs nothing on the host', async () => {
    const marker = path.join(os.tmpdir(), `sandbox-host-escape-${process.pid}`);
    fs.rmSync(marker, { force: true });
    const command = `touch ${marker}`;

    // Positive control for the detector: run the same command on the host and
    // confirm the marker is how host execution would show up.
    await new Promise((resolve) => spawn('sh', ['-c', command]).on('close', resolve));
    assert.ok(fs.existsSync(marker), 'the marker cannot detect host execution - this test would prove nothing');
    fs.rmSync(marker, { force: true });

    await assert.rejects(
      () => Sandbox.start({ workspaceDir, dockerBin: path.join(os.tmpdir(), 'definitely-not-docker') }),
      (err) => {
        assert.ok(err instanceof SandboxError, `threw ${err.constructor.name}, not SandboxError`);
        assert.match(err.message, /NOT run on the host/);
        return true;
      },
    );

    // And through the provider: the turn fails rather than answering.
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'run_bash', arguments: JSON.stringify({ command }) } }] } }],
        usage: { total_tokens: 2 },
      }),
    });
    process.env.SANDBOX_TEST_KEY = 'k';
    const provider = new Provider({ config: { model: 'm', apiKeyEnvar: 'SANDBOX_TEST_KEY', sandbox: { dockerBin: path.join(os.tmpdir(), 'definitely-not-docker') } } });
    await assert.rejects(
      () => provider.callApi(JSON.stringify([{ role: 'user', content: 'go' }]), { prompt: { config: { workspaceDir } } }),
      /NOT run on the host/,
    );
    global.fetch = realFetch;
    assert.ok(!fs.existsSync(marker), 'the command RAN ON THE HOST when Docker was unavailable');
  });

  // --- no container is left behind ---------------------------------------------
  await check('containers are torn down', async () => {
    const left = spawnSync('docker', ['ps', '-aq', '--filter', 'label=eval-sandbox=1'], { encoding: 'utf8' });
    assert.equal(left.stdout.trim(), '', `sandbox containers left running: ${left.stdout.trim()}`);
  });

  fs.rmSync(workspaceDir, { recursive: true, force: true });
  if (skips.length) console.log(`\n${skips.length} inconclusive: ${skips.join(', ')}`);
  if (failures.length) {
    console.log(`\nFAILED: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nok   sandbox (egress, credentials, host filesystem, timeout, truncation, caps, fork bomb, memory, no-Docker), each with its mutation proof');
})();
