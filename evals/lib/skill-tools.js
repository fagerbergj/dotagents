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

const DEFAULTS = {
  // SKILL.md asks for one README per diagram; a careful author also pulls
  // shapes.md and examples.md. Eight leaves room for a wrong guess and a retry
  // and still catches a model stuck in a loading loop.
  maxToolCalls: 8,
  // 64 KB is ~16 of this skill's files (largest is 4.1 KB, 173 KB bundled in
  // total). Enough to read widely, far short of inlining the whole tree.
  maxResourceBytes: 64 * 1024,
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

// Thrown for anything that means the harness could not run the turn. A grader or
// tool that could not run is not a verdict, so this propagates and promptfoo
// records an error row rather than scoring an empty completion as a bad answer.
class LoopError extends Error {}

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

function loadResource(root, rel, budget) {
  const r = resolveInside(root, rel);
  if (r.refused) return `refused: ${r.refused}`;
  if (!r.exists) {
    // A wrong guess is not the end of the turn: a real agent would list the
    // directory and try again, so hand back what is actually there.
    return `not found: "${rel}". Available at ${listing(r.nearest, root)}`;
  }
  const stat = fs.statSync(r.target);
  if (stat.isDirectory()) return listing(r.target, root);
  if (stat.size > budget.remaining) {
    // Never truncate: a half file of syntax is worse than none, and a silent cut
    // would look like the skill documenting the type badly.
    return `refused: "${rel}" is ${stat.size} bytes and only ${budget.remaining} of the ${budget.total}-byte resource budget is left. Stop loading and write the answer from what you already have.`;
  }
  budget.remaining -= stat.size;
  return fs.readFileSync(r.target, 'utf8');
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

  async callApi(prompt, context = {}) {
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
    let root = null;
    if (skillDir) {
      try {
        root = fs.realpathSync(skillDir);
      } catch {
        throw new LoopError(`skillDir does not exist: ${skillDir}`);
      }
    }
    const maxToolCalls = this.config.maxToolCalls ?? DEFAULTS.maxToolCalls;
    const maxBytes = this.config.maxResourceBytes ?? DEFAULTS.maxResourceBytes;
    const budget = { total: maxBytes, remaining: maxBytes };

    const usage = { prompt: 0, completion: 0, total: 0, cached: 0, numRequests: 0 };
    const loaded = [];
    for (let round = 0; ; round += 1) {
      const body = {
        model: this.config.model,
        messages,
        ...(this.config.max_tokens ? { max_tokens: this.config.max_tokens } : {}),
        ...(root ? { tools: [TOOL], tool_choice: 'auto' } : {}),
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
        // A `tools` key makes the gateway's tool-calling chat template prefix the
        // reply with blank lines, and only the skill arm sends one - so untrimmed
        // output leaves the arms differing by whitespace as well as by the skill.
        const content = message.content ?? '';
        return {
          output: typeof content === 'string' ? content.trim() : content,
          tokenUsage: usage,
          metadata: { resourcesLoaded: loaded, toolRounds: round },
        };
      }
      if (round >= maxToolCalls) {
        throw new LoopError(`load_resource loop exceeded ${maxToolCalls} rounds (requested: ${loaded.join(', ')})`);
      }
      messages = messages.concat([message]);
      for (const call of calls) {
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || '{}');
        } catch {
          args = {};
        }
        const requested = args.path;
        const content = call.function?.name === TOOL.function.name
          ? loadResource(root, requested, budget)
          : `refused: unknown tool "${call.function?.name}".`;
        loaded.push(String(requested));
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
  }
}

module.exports = SkillToolsProvider;
module.exports.loadResource = loadResource;
module.exports.resolveInside = resolveInside;
module.exports.DEFAULTS = DEFAULTS;
