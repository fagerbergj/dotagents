// A grader that cannot tell a real improvement from an answer that deleted,
// padded or golfed the file is the failure this catches, so each of those runs
// here against the suite's own cases - as does the answer the skill actually
// asks for, which a grader can punish just as easily.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const s = require('./slop.cjs');

// The suite's own cases, via the yaml the repo's python checkers already use.
const casesPath = path.join(__dirname, '..', 'tests', 'cases.yaml');
const cases = JSON.parse(
  execFileSync('python3', ['-c', 'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', casesPath], {
    encoding: 'utf8',
  }),
);
const source = (name) => cases.find((c) => c.vars.filename === name).vars.source;
const ctx = (name) => ({ vars: { source: source(name) } });
const fenced = (code) => `Here you go.\n\n\`\`\`python\n${code}\`\`\`\n`;

// The dispatcher repeats a scaffold; both controls are clean.
assert.equal(s.cloneRatio(source('cli.py')).cloned, 66);
assert.ok(s.cloneRatio(source('cli.py')).ratio > 0.7, JSON.stringify(s.cloneRatio(source('cli.py'))));
assert.equal(s.cloneRatio(source('dialcodes.py')).ratio, 0);
assert.equal(s.cloneRatio(source('lexer.py')).ratio, 0);

// A nested helper is its own function, so its assignments are not its parent's.
const nested = 'def outer(x):\n    def inner(y):\n        seen = x\n        return seen\n    return inner(x)\n';
assert.deepEqual(s.pythonFunctions(nested).map((f) => f.name).sort(), ['inner', 'outer']);
assert.equal(s.singleUseVars(nested), 1);

assert.equal(s.answerCode('```sh\npytest -q\n```\n'), '');
assert.ok(s.answerCode(fenced('def f():\n    return 1\n')).includes('def f'));

// The data-region rule, both directions. A table of entries identical but for
// one literal is not duplication; four procedural blocks that repeat are.
const TABLE = `COMMANDS = {
    "check": {
        "run": cmd_check,
        "fmt": "text",
        "seed": None,
        "path": None,
        "strict": False,
        "color": "auto",
    },
    "stats": {
        "run": cmd_stats,
        "fmt": "text",
        "seed": None,
        "path": None,
        "strict": False,
        "color": "auto",
    },
    "lint": {
        "run": cmd_lint,
        "fmt": "text",
        "seed": None,
        "path": None,
        "strict": False,
        "color": "auto",
    },
    "dot": {
        "run": cmd_dot,
        "fmt": "dot",
        "seed": None,
        "path": None,
        "strict": False,
        "color": "auto",
    },
}`;
const PARSE_ONCE = `def _parse(rest, spec):
    opts = dict(spec)
    i = 0
    while i < len(rest):
        if rest[i] == "--format":
            opts["fmt"] = rest[i + 1]
            i += 2
        elif rest[i] == "--seed":
            opts["seed"] = int(rest[i + 1])
            i += 2
        elif opts["path"] is None:
            opts["path"] = rest[i]
            i += 1
        else:
            raise Usage(rest[i])
    return opts


def main(argv):
    args = list(argv[1:])
    if not args:
        print("usage: circuit <command> [options]")
        return 2
    spec = COMMANDS.get(args[0])
    if spec is None:
        print("unknown command: " + args[0])
        return 2
    opts = _parse(args[1:], spec)
    return opts["run"](opts["path"], opts["fmt"], opts["seed"])
`;
// Every table line is inside the region, and the parsing loop's lines are not.
const tableLines = TABLE.split('\n').length;
assert.equal(s.dataRegionLines(TABLE.split('\n').map((l) => l.trim())).size, tableLines - 1);
assert.equal(s.dataRegionLines(PARSE_ONCE.split('\n').map((l) => l.trim()).filter(Boolean)).size, 0);

// The answer the skill asks for: four repeated blocks collapsed into one table
// plus one parse.
const tabled = `${TABLE}\n\n\n${PARSE_ONCE}`;
assert.equal(s.cloneRatio(tabled).cloned, 0);
assert.equal(s.cloneRatioReduced(fenced(tabled), ctx('cli.py')).pass, true);

// Extracting the scaffold into a helper is the other shape of the same fix.
const deduped = `def _parse_common(rest):
    path = None
    fmt = "text"
    seed = None
    i = 0
    while i < len(rest):
        if rest[i] == "--format":
            fmt = rest[i + 1]
            i += 2
        elif rest[i] == "--seed":
            seed = int(rest[i + 1])
            i += 2
        elif path is None:
            path = rest[i]
            i += 1
        else:
            print("unexpected argument: " + rest[i])
            return 2
    return path, fmt, seed


COMMANDS = {"check": cmd_check, "stats": cmd_stats, "lint": cmd_lint, "dot": cmd_dot}


def main(argv):
    args = list(argv[1:])
    if not args:
        print("usage: circuit <command> [options]")
        return 2
    command = args[0]
    if command not in COMMANDS:
        print("unknown command: " + command)
        return 2
    return COMMANDS[command](*_parse_common(args[1:]))
`;
assert.equal(s.cloneRatioReduced(fenced(deduped), ctx('cli.py')).pass, true);

// An echo of the input must not pass, and prose must fail saying why.
assert.equal(s.cloneRatioReduced(fenced(source('cli.py')), ctx('cli.py')).pass, false);
const prose = s.cloneRatioReduced('You should pull the flag parsing out.', ctx('cli.py'));
assert.equal(prose.pass, false);
assert.match(prose.reason, /No function definition/);

// Deleting the dispatcher takes the clone ratio to 0, a win on the delta alone,
// so the identifier floor is what has to reject it.
const deleted = s.cloneRatioReduced(fenced('def main(argv):\n    return COMMANDS[argv[1]](*argv[2:])\n'), ctx('cli.py'));
assert.equal(deleted.pass, false);
assert.match(deleted.reason, /too little survives/);
assert.equal(s.retention(source('cli.py'), deduped) > s.MIN_RETENTION, true);

// A file the completion cap cut off mid-line: shorter on every count, and
// rejected for what did not survive rather than credited for being short.
const truncated = source('search.py').split('\n').slice(0, 3).join('\n');
const cut = s.singleUseVarsReduced(`\`\`\`python\n${truncated}`, ctx('search.py'));
assert.equal(cut.pass, false);
assert.match(cut.reason, /too little survives/);

// Padding: every duplicated block kept, unique helpers bolted on. The share
// falls, the count does not, and the count is what the grader requires.
const padding = Array.from(
  { length: 12 },
  (_, n) => `def _unused_${n}(value):\n    scaled_${n} = value * ${n + 3}\n    return scaled_${n} + ${n}\n`,
).join('\n\n');
const padded = `${source('cli.py')}\n\n${padding}`;
assert.ok(s.cloneRatio(padded).ratio < s.cloneRatio(source('cli.py')).ratio);
assert.equal(s.cloneRatio(padded).cloned, s.cloneRatio(source('cli.py')).cloned);
assert.equal(s.cloneRatioReduced(fenced(padded), ctx('cli.py')).pass, false);

// Single-use variables, not lines. Golfing the loop into one comprehension
// scores exactly what the readable rewrite scores, so shortness buys nothing.
const condensed = `def search_tree(source_files, all_compiled_rules, encoding):
    matches = []
    for posix_path, full_path, language in source_files:
        applicable_rules = [r for r in all_compiled_rules if language in r["languages"]]
        with open(full_path, "r", encoding=encoding) as f:
            matches.extend(find_matches_in_content(f.read(), applicable_rules, language))
    return deduplicate_matches(matches)
`;
const golfed = `def search_tree(source_files, all_compiled_rules, encoding):
    return deduplicate_matches([m for posix_path, full_path, language in source_files for m in find_matches_in_content(open(full_path, "r", encoding=encoding).read(), [r for r in all_compiled_rules if language in r["languages"]], language)])
`;
assert.equal(s.singleUseVars(source('search.py')), 2);
assert.equal(s.singleUseVarsReduced(fenced(condensed), ctx('search.py')).pass, true);
assert.equal(s.singleUseVarsReduced(fenced(golfed), ctx('search.py')).pass, true);
assert.equal(s.singleUseVarsReduced(fenced(source('search.py')), ctx('search.py')).pass, false);

console.log('slop.test.cjs: ok');
