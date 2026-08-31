// A disposable Docker container per eval row, so a model told to "get the build
// working" can run `rm -rf`, `git clean`, `sudo` or `curl | sh` somewhere that
// does not matter. Nothing from the host is ever mounted: the workspace is a
// tmpfs filled by streaming a tar into the container, so the owner's real
// checkouts are not merely out of the way, they are absent from the namespace.
//
// Every guard is a flag in containerArgs() below. sandbox.test.cjs attempts each
// escape against the real thing, and then removes the flag from a copy of this
// file to show the same attempt succeeds without it - a guard whose test passes
// either way is worse than no test.
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DEFAULTS = {
  // Alpine because it is small and already local. A suite whose fixture needs a
  // toolchain must name an image that already has it: --network=none means
  // nothing can be installed at run time.
  image: 'alpine:latest',
  dockerBin: 'docker',
  // 60s matches quack's workspace.DefaultCaps().Timeout - long enough for a test
  // suite, short enough that a hung command does not eat the row's wall clock.
  commandTimeoutMs: 60_000,
  // The real ceiling on a row: 25 commands x 60s would be 25 minutes.
  wallClockMs: 300_000,
  // Per command. Every byte re-enters the transcript on every later round, so
  // this is a quarter of quack's 64KB MaxOutputBytes: ~100 lines of pytest tail
  // is enough to see what failed and cheap enough to resend 25 times.
  maxOutputBytes: 8 * 1024,
  memoryMB: 1024,
  pids: 256,
  cpus: '1.0',
  // The workspace is tmpfs, so its contents are charged to --memory. Size the
  // two together: workspace bytes plus build memory must fit in memoryMB.
  workspaceMB: 512,
  tmpMB: 256,
};

function containerArgs(c, seconds) {
  return [
    'run', '-d', '--rm',
    '--label', 'eval-sandbox=1',
    // No network at all. Fixtures are materialised before the container starts,
    // so nothing legitimate needs egress, and `curl | sh` has nothing to fetch.
    '--network=none',
    // Read-only root, writable tmpfs workspace. mode=1777 so the unprivileged
    // user can write it; nothing survives the container.
    //
    // uid/gid are not decoration. populate() streams `tar -c .`, whose first
    // entry is the top directory itself, and GNU tar then restores that entry's
    // mode and mtime onto /workspace. Owned by root that is EPERM for uid 1000,
    // tar exits 2, and Sandbox.start throws "could not populate /workspace" -
    // every row, on any image with GNU tar. busybox tar does not try, which is
    // why alpine (the default, and all sandbox.test.cjs uses) never showed it.
    '--read-only',
    '--tmpfs', `/workspace:rw,exec,size=${c.workspaceMB}m,mode=1777,uid=1000,gid=1000`,
    '--tmpfs', `/tmp:rw,exec,size=${c.tmpMB}m,mode=1777`,
    '--user', '1000:1000',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--memory=${c.memoryMB}m`,
    // Equal to --memory: without it the container swaps instead of being killed.
    `--memory-swap=${c.memoryMB}m`,
    `--pids-limit=${c.pids}`,
    `--cpus=${c.cpus}`,
    // The child's whole environment. Docker gives an exec only the container's
    // env, and this is it - no *_API_KEY, no GH_TOKEN, no gateway key from the
    // harness process can reach a command.
    '--env', 'HOME=/workspace',
    '--workdir', '/workspace',
    c.image,
    // Self-destructs if teardown is ever missed; --rm then removes it.
    'sleep', String(seconds),
  ];
}

// Streams a tar of `src` into the container's tmpfs workspace. `docker cp` is
// refused against a read-only rootfs, and streaming also means the files land as
// the unprivileged user - no chown, so --cap-drop=ALL can stay. Piped rather
// than buffered: a fixture tree is not something to hold in the harness heap,
// and a string round-trip would corrupt the archive.
function populate(dockerBin, id, src) {
  return new Promise((resolve) => {
    const tar = spawn('tar', ['-c', '-C', src, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const load = spawn(dockerBin, ['exec', '-i', id, 'tar', '-x', '-C', '/workspace'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    tar.stderr.on('data', (c) => { err += c; });
    load.stderr.on('data', (c) => { err += c; });
    // A failed `docker exec` closes the pipe under tar; without this the EPIPE
    // lands as an unhandled error event and takes the harness down.
    load.stdin.on('error', () => {});
    tar.stdout.pipe(load.stdin);
    let done = 0;
    let bad = null;
    const finish = (label) => (code) => {
      if (code !== 0 && bad === null) bad = `${label} exited ${code}`;
      if ((done += 1) === 2) resolve(bad ? `${bad}: ${err.trim().slice(0, 300)}` : null);
    };
    tar.on('close', finish('tar -c'));
    load.on('close', finish('tar -x in container'));
    tar.on('error', (e) => { bad = bad ?? `tar: ${e.message}`; });
    load.on('error', (e) => { bad = bad ?? `docker exec: ${e.message}`; });
  });
}

// One spawn helper for every other docker invocation: start, exec, teardown.
// Output is capped while it is collected, so `yes` cannot fill the harness heap.
function exec(bin, args, { input, timeoutMs, maxOutputBytes = 1 << 20 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ exitCode: -1, stdout: '', stderr: String(err.message), dropped: 0, spawnError: err });
      return;
    }
    const bufs = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    const dropped = { stdout: 0, stderr: 0 };
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', (chunk) => {
        const joined = Buffer.concat([bufs[stream], chunk]);
        if (joined.length > maxOutputBytes) {
          dropped[stream] += joined.length - maxOutputBytes;
          bufs[stream] = joined.subarray(joined.length - maxOutputBytes);
        } else {
          bufs[stream] = joined;
        }
      });
    }
    let killed = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : null;
    let spawnError = null;
    child.on('error', (err) => {
      spawnError = err;
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: killed ? -1 : (code ?? -1),
        stdout: bufs.stdout.toString('utf8'),
        stderr: bufs.stderr.toString('utf8'),
        droppedStdout: dropped.stdout,
        droppedStderr: dropped.stderr,
        hostKilled: killed,
        spawnError,
      });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

// Thrown when the sandbox cannot be established. Never caught into a fallback:
// running a model's commands on the host because Docker is missing is the one
// outcome this module exists to prevent.
class SandboxError extends Error {}

class Sandbox {
  constructor(id, cfg) {
    this.id = id;
    this.cfg = cfg;
    this.startedAt = Date.now();
    this.stopped = false;
  }

  static async start(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    if (!cfg.workspaceDir) throw new SandboxError('sandbox: workspaceDir is required');
    let src;
    try {
      src = fs.realpathSync(cfg.workspaceDir);
    } catch {
      throw new SandboxError(`sandbox: workspaceDir does not exist: ${cfg.workspaceDir}`);
    }
    const ttl = Math.ceil(cfg.wallClockMs / 1000) + 60;
    const created = await exec(cfg.dockerBin, containerArgs(cfg, ttl), { timeoutMs: 120_000 });
    if (created.exitCode !== 0 || !created.stdout.trim()) {
      throw new SandboxError(
        `sandbox: could not start a Docker container (${cfg.dockerBin} exited ${created.exitCode}): `
        + `${(created.stderr || created.spawnError?.message || '').trim().slice(0, 500)}. `
        + 'Commands are NOT run on the host when Docker is unavailable - fix Docker or drop the workspace from the suite.',
      );
    }
    const box = new Sandbox(created.stdout.trim(), cfg);
    try {
      const failed = await populate(cfg.dockerBin, box.id, src);
      if (failed) throw new SandboxError(`sandbox: could not populate /workspace: ${failed}`);
      // Without timeout(1) there is no per-command kill inside the container,
      // only a host-side kill of the docker client that leaves the process
      // running. Fail loudly rather than silently losing the guard.
      const probe = await exec(cfg.dockerBin, ['exec', box.id, 'sh', '-c', 'command -v timeout'], { timeoutMs: 30_000 });
      if (probe.exitCode !== 0) {
        throw new SandboxError(`sandbox: image ${cfg.image} has no timeout(1), so per-command timeouts cannot be enforced`);
      }
    } catch (err) {
      await box.stop();
      throw err;
    }
    return box;
  }

  remainingMs() {
    return this.cfg.wallClockMs - (Date.now() - this.startedAt);
  }

  // Non-zero exit is a result, not an error - the exit code is the answer key.
  // `refused` is set instead when no command was run at all.
  async run(command, options = {}) {
    if (this.stopped) throw new SandboxError('sandbox: session already stopped');
    if (typeof command !== 'string' || !command.trim()) {
      return { exitCode: -1, stdout: '', stderr: '', timedOut: false, truncated: 0, refused: 'command must be a non-empty string.' };
    }
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      return {
        exitCode: -1, stdout: '', stderr: '', timedOut: false, truncated: 0,
        refused: `the ${Math.round(this.cfg.wallClockMs / 1000)}s wall-clock budget for this task is spent. Stop running commands and report what you found.`,
      };
    }
    const limitMs = Math.min(options.timeoutMs ?? this.cfg.commandTimeoutMs, remaining);
    const seconds = Math.max(1, Math.ceil(limitMs / 1000));
    const maxOutputBytes = options.maxOutputBytes ?? this.cfg.maxOutputBytes;
    const began = Date.now();
    const r = await exec(
      this.cfg.dockerBin,
      ['exec', this.id, 'timeout', String(seconds), 'sh', '-c', command],
      // The host-side kill is a backstop for a wedged docker client; timeout(1)
      // inside the container is what actually kills the command.
      { timeoutMs: seconds * 1000 + 10_000, maxOutputBytes },
    );
    const elapsed = Date.now() - began;
    return {
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      // timeout(1) exits with the signal, not always 124, and an image's
      // coreutils and busybox disagree about which - the clock is the honest
      // test, and a command that finished in time cannot have been killed.
      timedOut: r.exitCode !== 0 && elapsed + 250 >= seconds * 1000,
      truncated: r.droppedStdout + r.droppedStderr,
      droppedStdout: r.droppedStdout,
      droppedStderr: r.droppedStderr,
      refused: null,
    };
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    await exec(this.cfg.dockerBin, ['rm', '-f', this.id], { timeoutMs: 60_000 });
  }
}

module.exports = { Sandbox, SandboxError, DEFAULTS, containerArgs, exec };
