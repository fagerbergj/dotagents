// An OpenAI-compatible chat provider that lets the skill arm load the skill's own
// bundled files mid-turn, the way a real agent does. Every suite inlines only
// SKILL.md, so an instruction like mermaid's "read references/<id>/README.md before
// writing" is unfollowable and the model writes syntax from memory - which showed up
// as the skill arm failing to render specialised diagram types the baseline avoided.
//
// The tool exists only when the prompt hands the provider a `skillDir`. The baseline
// arm has no skill and therefore no resources, so it never names one and gets a plain
// single-shot call: the arms still differ by the skill and nothing else.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// Read off the module object rather than destructured, so a test can swap in a
// fake container without Docker. No test-only export, no injection parameter.
const sandboxMod = require('./sandbox.js');

const DEFAULTS = {
  // SKILL.md asks for one README per diagram; a careful author also pulls
  // shapes.md and examples.md. Eight leaves room for a wrong guess and a retry
  // and still catches a model stuck in a loading loop.
  maxToolCalls: 8,
  // 64 KB is ~16 of this skill's files (largest is 4.1 KB, 173 KB bundled in
  // total). Enough to read widely, far short of inlining the whole tree.
  maxResourceBytes: 64 * 1024,
  // "Batch your questions and ask early" is only a real claim if asking has a
  // cost. Small enough that a chatty arm visibly pays for it in questionsAsked.
  maxQuestions: 3,
  // A clone-build-test-debug-retest loop is ~8 commands; 25 leaves room for two
  // wrong theories and still stops a row that has started guessing at the shell.
  // Identical for every arm - a per-arm cap would make the delta measure budget.
  maxCommands: 25,
  // Cumulative prompt+completion tokens for the row, the sandbox tools included.
  // Command output re-enters the transcript on every later round, so an
  // execution row's cost grows quadratically; this bounds the tail so the
  // per-arm cost comparison stays attributable rather than dominated by one
  // thrashing row. It should bind rarely - 150k is ~10x a text-only row.
  maxTokens: 150_000,
  // Rounds, not commands: run_bash rows need more than the text-only 8, and this
  // applies only when a workspace is configured, so no existing suite's budget
  // moves. maxCommands is what should stop a row; this is the runaway guard
  // behind it, and it throws rather than refusing.
  maxToolCallsWithBash: 40,
};

const TOOL = {
  type: 'function',
  function: {
    name: 'load_resource',
    description:
      'Read a file bundled with the active skill. `path` is relative to the skill root, e.g. "references/flowchart/README.md" or "assets/flowchart/shapes.md". A directory path returns its entries.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the skill root.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
};

// Reading the code under review is not a skill affordance - it is the subject
// matter - so this tool is offered to every arm that names a source tree, and
// both arms then send an identical `tools` shape. Only load_resource above is
// gated on the skill.
const SOURCE_TOOL = {
  type: 'function',
  function: {
    name: 'read_source',
    description:
      'Read a file from the source tree under review, at the commit the change was opened against. `path` is repo-relative, e.g. "internal/vetting/node.go". A directory path returns its entries.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the repository root.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
};

// Offered whenever the prompt hands the provider a `workspaceDir`, on exactly the
// same terms as read_source: running the build is the subject matter of a case
// that asks whether a repo's instructions help, not an affordance a skill or an
// AGENTS.md earns. Gate it on the arm and every exit code the suite grades
// measures tool access instead. Commands run in a throwaway container with no
// network and nothing of the host in it - see lib/sandbox.js.
const RUN_BASH_TOOL = {
  type: 'function',
  function: {
    name: 'run_bash',
    description:
      'Run a shell command in the project workspace. It runs in a disposable container with NO network access, so nothing can be downloaded or installed - work with what the workspace and the image already contain. State persists between calls. Returns the exit code, stdout and stderr; output is tail-truncated, so pipe through head/grep when you expect a lot.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The shell command, run with `sh -c` from the workspace root.' } },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

// Offered whenever the prompt hands the provider a `userPersona`, on the same
// terms as read_source: having someone to ask is the environment the case sets
// up, not a skill affordance, so both arms get it when a persona is configured
// and neither does when it isn't. Otherwise a skill that says "ask before you
// design" is graded down for having nobody to ask, and a skill that doesn't
// say so wins by default for inventing an answer instead of stalling.
const ASK_USER_TOOL = {
  type: 'function',
  function: {
    name: 'ask_user',
    description:
      'Ask the user a single clarifying question before proceeding. Questions are limited - batch what you need into as few calls as possible. Returns the user\'s answer, or a refusal once the budget is spent.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'One question for the user.' } },
      required: ['question'],
      additionalProperties: false,
    },
  },
};

// The simulated user's whole world. A maximally cooperative persona is the
// failure mode: asked what backoff library to use, an LLM playing "the user"
// will happily suggest one from training data even though no case gave it
// that fact, handing the model the exact thing a case tests whether it finds
// on its own. Rule 2 forecloses that even when the model asks point-blank.
function personaSystemPrompt(persona) {
  return `You are role-playing the human user in a conversation. An AI assistant is doing work on your behalf and may ask you a clarifying question. Answer as that person would in a quick chat reply - not as a helpful assistant.

What you know: ${persona.knows || '(nothing beyond what you already asked for)'}
What you want: ${persona.wants || '(exactly what you already asked for, nothing more specific)'}
What you explicitly do NOT know: ${persona.doesNotKnow || '(anything not listed under "what you know")'}

Rules, in order:
1. Answer only from "what you know" and "what you want" above. Never volunteer anything else, even if it seems helpful.
2. If the question touches "what you explicitly do NOT know", or anything not covered above - including a specific library, tool, file, API, or technical choice you were not told about - say plainly that you don't know and it's the assistant's call. Do not guess, suggest, hint, or reason your way to a plausible answer.
3. One or two sentences, the way a busy person types. No lists, no caveats about being an AI.`;
}

// Thrown for anything that means the harness could not run the turn. A grader or
// tool that could not run is not a verdict, so this propagates and promptfoo
// records an error row rather than scoring an empty completion as a bad answer.
class LoopError extends Error {}

function questionBudget(persona) {
  return persona?.maxQuestions ?? DEFAULTS.maxQuestions;
}

function listing(dir, root) {
  const rel = path.relative(root, dir) || '.';
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort();
  return `${rel}: ${entries.join(', ') || '(empty)'}`;
}

// Resolves `rel` under `root` and refuses anything that lands outside it. The
// containment test runs on the real path of the deepest existing ancestor, so a
// symlink pointing out of the tree is caught as well as `..` and absolute paths.
function resolveInside(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return { refused: 'path must be a non-empty string.' };
  if (path.isAbsolute(rel) || rel.startsWith('~')) {
    return { refused: `absolute paths are not readable. Use a path relative to the skill root, e.g. "references/flowchart/README.md".` };
  }
  const target = path.resolve(root, rel);
  let probe = target;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let real;
  try {
    real = fs.realpathSync(probe);
  } catch {
    return { refused: 'path could not be resolved.' };
  }
  if (real !== root && !real.startsWith(root + path.sep)) {
    return { refused: `"${rel}" resolves outside the skill directory and was not read. Only the skill's own files are readable.` };
  }
  return { target, nearest: real, exists: probe === target };
}

// `cache` is optional and owned by the caller (one per callApi invocation, never
// process-global): omitting it reproduces the old unmemoized behaviour exactly,
// which is what keeps every direct call in skill-tools.test.cjs unchanged.
function loadResource(root, rel, budget, cache) {
  const r = resolveInside(root, rel);
  if (r.refused) return `refused: ${r.refused}`;
  if (!r.exists) {
    // A wrong guess is not the end of the turn: a real agent would list the
    // directory and try again, so hand back what is actually there.
    return `not found: "${rel}". Available at ${listing(r.nearest, root)}`;
  }
  const stat = fs.statSync(r.target);
  if (stat.isDirectory()) return listing(r.target, root);
  // Root-prefixed key: load_resource and read_source share this function but must
  // not share a cache slot, even if a path string coincides between skillDir and
  // repoDir.
  const key = cache && `${root}::${r.target}`;
  if (cache && cache.has(key)) {
    // A marker, not the file again: a model that re-requests the same path isn't
    // missing the bytes, it's failed to recognise the earlier tool result (the
    // measured case re-requested one file 7 times past a spent budget). Repeating
    // the content wouldn't fix that recognition failure and would only add to the
    // transcript bloat this exists to cut.
    cache.set(key, cache.get(key) + 1);
    return `already loaded: "${rel}" was served earlier in this conversation - reuse that content, it has not changed. Not charged against the ${budget.total}-byte budget.`;
  }
  if (stat.size > budget.remaining) {
    // Never truncate: a half file of syntax is worse than none, and a silent cut
    // would look like the skill documenting the type badly.
    return `refused: "${rel}" is ${stat.size} bytes and only ${budget.remaining} of the ${budget.total}-byte resource budget is left. Stop loading and write the answer from what you already have.`;
  }
  budget.remaining -= stat.size;
  if (cache) cache.set(key, 1);
  return fs.readFileSync(r.target, 'utf8');
}

// Tail-truncation is named in the result rather than left silent: a model that
// cannot see the head of a 4MB build log should pipe through grep, and one that
// thinks it read the whole thing will conclude the wrong thing from it.
function formatCommandResult(r) {
  if (r.refused) return `refused: ${r.refused}`;
  const section = (name, text, dropped) => {
    const head = dropped ? `--- ${name} (truncated, ${dropped} earlier bytes dropped) ---` : `--- ${name} ---`;
    return `${head}\n${text.trim() ? text.replace(/\s+$/, '') : '(empty)'}`;
  };
  return [
    `exit_code: ${r.exitCode}${r.timedOut ? ' (killed - the command exceeded its per-command timeout)' : ''}`,
    section('stdout', r.stdout, r.droppedStdout),
    section('stderr', r.stderr, r.droppedStderr),
  ].join('\n');
}

class SkillToolsProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.providerLabel = options.label;
    if (!this.config.model) throw new LoopError('skill-tools provider needs config.model');
  }

  // Reported into results as the provider id; rollup.js derives the model label
  // from it, so keep it in the `openai:chat:<model>` shape the suites use.
  id() {
    return `openai:chat:${this.config.model}`;
  }

  async chat(body, context) {
    const key = this.config.apiKeyEnvar ? process.env[this.config.apiKeyEnvar] : process.env.OPENAI_API_KEY;
    if (!key) throw new LoopError(`no API key in ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'}`);
    const url = `${(this.config.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
    // Cached per round-trip, keyed on the whole request. The tool results are in
    // `messages`, so an edited reference file changes the second call's key by
    // itself - no separate content hash needed, and the first call carries no
    // file content to go stale.
    const cacheKey = `skill-tools:${crypto.createHash('sha256').update(url + JSON.stringify(body)).digest('hex')}`;
    const cache = this.cacheEnabled(context) ? context.getCache() : null;
    if (cache) {
      const hit = await cache.get(cacheKey);
      if (hit) return { json: JSON.parse(hit), cached: true };
    }
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LoopError(`request failed: ${err.message}`);
    }
    const text = await res.text();
    if (!res.ok) throw new LoopError(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LoopError(`unparseable response: ${text.slice(0, 500)}`);
    }
    if (json.error) throw new LoopError(`api error: ${JSON.stringify(json.error).slice(0, 500)}`);
    if (!json.choices?.length) throw new LoopError(`no choices in response: ${text.slice(0, 500)}`);
    if (cache) await cache.set(cacheKey, JSON.stringify(json));
    return { json, cached: false };
  }

  cacheEnabled(context) {
    return Boolean(context?.getCache)
      && !process.argv.includes('--no-cache')
      && process.env.PROMPTFOO_CACHE_ENABLED !== 'false';
  }

  // A second call through the same chat() plumbing the main loop uses, so it
  // gets identical error handling (a dead gateway fails the turn the same way,
  // rather than the sim going silently empty). It also gets identical caching
  // semantics, which does NOT mean --repeat replays one answer: promptfoo
  // namespaces every repeat index separately and wraps the whole per-step
  // provider call in it, so the sim re-rolls each repeat exactly as the model
  // does. Correct - --repeat exists for independent samples - but it means a
  // persona doubles the independent LLM draws per row; see AGENTS.md Harness
  // facts. Its tokens are folded into `state.usage` by the caller.
  async askUser(question, persona, state, context) {
    const max = questionBudget(persona);
    if (!question || !String(question).trim()) return 'refused: question must be a non-empty string.';
    if (state.count >= max) {
      return `refused: question budget of ${max} is spent. Proceed on your stated assumptions and say what you assumed.`;
    }
    state.count += 1;
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: personaSystemPrompt(persona) },
        { role: 'user', content: String(question) },
      ],
    };
    const { json, cached } = await this.chat(body, context);
    const u = json.usage || {};
    const roundTotal = u.total_tokens ?? (u.prompt_tokens || 0) + (u.completion_tokens || 0);
    state.usage.prompt += u.prompt_tokens || 0;
    state.usage.completion += u.completion_tokens || 0;
    state.usage.total += roundTotal;
    if (cached) state.usage.cached += roundTotal;
    state.usage.numRequests += 1;
    const content = json.choices[0].message?.content ?? '';
    return typeof content === 'string' ? content.trim() : content;
  }

  // Thin wrapper so the container is torn down on every exit from the turn,
  // including a thrown LoopError. A leaked container would keep a tmpfs of the
  // row's workspace alive on the host until its own sleep expires.
  async callApi(prompt, context = {}) {
    const session = { sandbox: null };
    try {
      return await this.turn(prompt, context, session);
    } finally {
      if (session.sandbox) await session.sandbox.stop();
    }
  }

  async turn(prompt, context, session) {
    let messages;
    try {
      messages = JSON.parse(prompt);
    } catch {
      messages = [{ role: 'user', content: String(prompt) }];
    }
    if (!Array.isArray(messages)) messages = [{ role: 'user', content: String(prompt) }];

    // The one mechanism that separates the arms: the skill arm's prompt function
    // returns a skillDir alongside its messages, the baseline's returns nothing.
    const skillDir = context.prompt?.config?.skillDir;
    // The source tree, when the suite reviews real code. Symmetric across arms.
    const repoDir = context.prompt?.config?.repoDir;
    // Same symmetry: whichever arm's prompt function hands the provider a
    // persona gets ask_user, and an arm that names none never sees the tool
    // exist. Gating this on the skill instead would make the delta measure
    // tool access, not the skill - the exact reasoning read_source already
    // applies to the repo tree.
    const persona = context.prompt?.config?.userPersona || null;
    // The workspace a run_bash tool would execute in - a host directory that is
    // COPIED into a container, never mounted. Symmetric across arms for the same
    // reason repoDir is.
    const workspaceDir = context.prompt?.config?.workspaceDir || null;
    // The case's own post-turn check. Run in the SAME container after the model's
    // last turn, so a suite can grade whether the work is RIGHT rather than
    // whether the answer named the right command - the distinction Gloaguen et
    // al. found decisive, since instruction-following is already high. It never
    // reaches the model: it arrives as provider config, not in the prompt, and
    // it is not charged against the command budget.
    const verifyCommand = context.prompt?.config?.verify || null;
    const real = (dir, label) => {
      try {
        return fs.realpathSync(dir);
      } catch {
        throw new LoopError(`${label} does not exist: ${dir}`);
      }
    };
    const roots = {};
    if (skillDir) roots[TOOL.function.name] = real(skillDir, 'skillDir');
    if (repoDir) roots[SOURCE_TOOL.function.name] = real(repoDir, 'repoDir');
    const root = roots[TOOL.function.name] || null;
    // A budget of 0 or less would offer a tool that always refuses, still
    // costing the model a round to find that out - treat it as no persona.
    const tools = [
      ...(roots[TOOL.function.name] ? [TOOL] : []),
      ...(roots[SOURCE_TOOL.function.name] ? [SOURCE_TOOL] : []),
      ...(persona && questionBudget(persona) > 0 ? [ASK_USER_TOOL] : []),
      ...(workspaceDir ? [RUN_BASH_TOOL] : []),
    ];
    const maxToolCalls = this.config.maxToolCalls
      ?? (workspaceDir ? DEFAULTS.maxToolCallsWithBash : DEFAULTS.maxToolCalls);
    const maxCommands = this.config.maxCommands ?? DEFAULTS.maxCommands;
    const maxTokens = this.config.maxTokens ?? DEFAULTS.maxTokens;
    const maxBytes = this.config.maxResourceBytes ?? DEFAULTS.maxResourceBytes;
    const budget = { total: maxBytes, remaining: maxBytes };
    const questions = { count: 0, usage: { prompt: 0, completion: 0, total: 0, cached: 0, numRequests: 0 } };
    // Scoped to this callApi call - one row, one arm - never process-global, or
    // content served to one row would silently answer another.
    const resourceCache = new Map();

    const usage = { prompt: 0, completion: 0, total: 0, cached: 0, numRequests: 0 };
    const loaded = [];
    // Counted separately from `loaded`: an ask_user call has no resource path, so
    // a model that burns its rounds on refused questions would otherwise throw
    // with an empty `requested:` and hide the real cause.
    let askAttempts = 0;
    // `list` alongside the counts: WHAT a row ran is the behavioural record a
    // spillover metric needs - ETH's finding is that a context file makes agents
    // "run more tests... search more files (grep), read more files" - and a bare
    // count cannot distinguish exploring from straying.
    const commands = { count: 0, timedOut: 0, truncated: 0, list: [] };
    // Started on the first command, not up front, so a row that never runs one
    // pays nothing - the model cannot tell, the tool is offered either way.
    // Throws, and is never caught into a host fallback: the whole point of the
    // tool is that the command did not run on this machine.
    const startSandbox = async () => {
      if (!session.sandbox) {
        session.sandbox = await sandboxMod.Sandbox.start({ ...(this.config.sandbox || {}), workspaceDir });
      }
    };
    const runBash = async (command) => {
      if (commands.count >= maxCommands) {
        return `refused: the command budget of ${maxCommands} is spent. Stop running commands and answer from what you have already seen.`;
      }
      if (usage.total >= maxTokens) {
        return `refused: this task has spent its ${maxTokens}-token ceiling. Stop running commands and answer now.`;
      }
      await startSandbox();
      commands.count += 1;
      commands.list.push(String(command));
      const r = await session.sandbox.run(command);
      if (r.timedOut) commands.timedOut += 1;
      if (r.truncated) commands.truncated += 1;
      return formatCommandResult(r);
    };

    for (let round = 0; ; round += 1) {
      const body = {
        model: this.config.model,
        messages,
        ...(this.config.max_tokens ? { max_tokens: this.config.max_tokens } : {}),
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        ...(this.config.passthrough || {}),
      };
      const { json, cached } = await this.chat(body, context);
      const u = json.usage || {};
      // Not every gateway sends total_tokens; without the fallback a whole arm's
      // token column silently reads 0.
      const roundTotal = u.total_tokens ?? (u.prompt_tokens || 0) + (u.completion_tokens || 0);
      usage.prompt += u.prompt_tokens || 0;
      usage.completion += u.completion_tokens || 0;
      usage.total += roundTotal;
      if (cached) usage.cached += roundTotal;
      usage.numRequests += 1;

      const message = json.choices[0].message || {};
      const calls = message.tool_calls || [];
      if (!calls.length) {
        // A verified row buys its check whether or not the model ran anything:
        // "did nothing" has to be gradeable, so the container is started here
        // when the model never touched it.
        let verify = null;
        if (verifyCommand && workspaceDir) {
          await startSandbox();
          const v = await session.sandbox.run(verifyCommand);
          verify = {
            cmd: verifyCommand,
            exitCode: v.exitCode,
            timedOut: v.timedOut,
            // A spent wall clock refuses the check. That is a harness condition,
            // not a wrong answer, and it rides through so a grader can error
            // rather than record a zero that looks like a failed task.
            refused: v.refused,
            stdout: `${v.stdout}${v.stderr}`.trim().slice(-2000),
          };
        }
        // A `tools` key makes the gateway's tool-calling chat template prefix the
        // reply with blank lines, and only the skill arm sends one - so untrimmed
        // output leaves the arms differing by whitespace as well as by the skill.
        const content = message.content ?? '';
        // The sim's own tokens are a real cost of the turn, not a side channel -
        // folded into the same usage object the grader's cost assertions read.
        usage.prompt += questions.usage.prompt;
        usage.completion += questions.usage.completion;
        usage.total += questions.usage.total;
        usage.cached += questions.usage.cached;
        usage.numRequests += questions.usage.numRequests;
        // Sum(hits - 1) over every cached path: how many of `loaded` were repeats
        // a suite can use to see a row thrashing without diffing the transcript.
        let resourcesDeduped = 0;
        for (const hits of resourceCache.values()) resourcesDeduped += hits - 1;
        return {
          output: typeof content === 'string' ? content.trim() : content,
          tokenUsage: usage,
          metadata: {
            resourcesLoaded: loaded,
            toolRounds: round,
            questionsAsked: questions.count,
            resourcesDeduped,
            // Execution effort, the counterpart of resourcesLoaded: how much a
            // row actually ran, how much of that hit a wall.
            commandsRun: commands.count,
            commandsTimedOut: commands.timedOut,
            commandsTruncated: commands.truncated,
            commands: commands.list,
            ...(verify ? { verify } : {}),
          },
        };
      }
      if (round >= maxToolCalls) {
        const hint = [askAttempts && `${askAttempts} were ask_user`, commands.count && `${commands.count} were run_bash`]
          .filter(Boolean).map((s) => `; ${s}`).join('');
        throw new LoopError(`tool loop exceeded ${maxToolCalls} rounds (requested: ${loaded.join(', ')}${hint})`);
      }
      messages = messages.concat([message]);
      for (const call of calls) {
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || '{}');
        } catch {
          args = {};
        }
        const called = call.function?.name;
        let content;
        if (called === ASK_USER_TOOL.function.name) {
          askAttempts += 1;
          content = await this.askUser(args.question, persona || {}, questions, context);
        } else if (called === RUN_BASH_TOOL.function.name && workspaceDir) {
          content = await runBash(args.command);
        } else {
          const requested = args.path;
          content = roots[called]
            ? loadResource(roots[called], requested, budget, resourceCache)
            : `refused: unknown tool "${called}".`;
          loaded.push(String(requested));
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
  }
}

module.exports = SkillToolsProvider;
module.exports.loadResource = loadResource;
module.exports.resolveInside = resolveInside;
module.exports.DEFAULTS = DEFAULTS;
module.exports.formatCommandResult = formatCommandResult;
module.exports.RUN_BASH_TOOL = RUN_BASH_TOOL;
