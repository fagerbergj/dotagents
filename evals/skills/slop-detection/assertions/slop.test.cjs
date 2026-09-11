// A grader that cannot tell a real improvement from an answer that deleted,
// padded, golfed or `match`-rewrote the file is the failure this catches, so
// each of those runs here against the suite's own cases.
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

// The ordering is what the graders rest on, not the absolute count.
const matcher = s.maxComplexity(source('matcher.py'));
assert.equal(matcher.name, 'find_matches_in_file');
assert.ok(matcher.cc > 20, `matcher CC ${matcher.cc}`);
assert.ok(s.maxComplexity(source('cli.py')).cc > 20);
assert.ok(s.maxComplexity(source('search.py')).cc < 10);

// A docstring full of English must not read as branching.
assert.equal(
  s.maxComplexity('def f(x):\n    """Return x if and only if x, or else nothing."""\n    return x\n').cc,
  1,
);

// `case` is an ordinary identifier in Python, so only an arm counts.
assert.equal(s.maxComplexity('def f(x):\n    case = dict(a=1)\n    return case\n').cc, 1);
assert.equal(
  s.maxComplexity('def f(x):\n    match x:\n        case 1:\n            return 2\n        case _:\n            return 3\n').cc,
  3,
);

// Nested helpers carry their own branches, not their parent's.
const nested = 'def outer(x):\n    def inner(y):\n        if y:\n            return 1 and 2\n        return 0\n    return inner(x)\n';
assert.deepEqual(s.pythonFunctions(nested).map((f) => f.name).sort(), ['inner', 'outer']);
assert.equal(s.maxComplexity(nested).name, 'inner');

// The dispatcher repeats a scaffold; the lookup table is data, not a clone.
assert.ok(s.cloneRatio(source('cli.py')).ratio > 0.5, JSON.stringify(s.cloneRatio(source('cli.py'))));
assert.equal(s.cloneRatio(source('dialcodes.py')).ratio, 0);
assert.equal(s.cloneRatio(source('lexer.py')).ratio, 0);

assert.equal(s.answerCode('```sh\npytest -q\n```\n'), '');
assert.ok(s.answerCode(fenced('def f():\n    return 1\n')).includes('def f'));

// A real split: the rule kinds move into their own callables and every line of
// the work survives, so the floor passes and the CC drop is the answer's own.
const split = `def _exact_spans(text, rule):
    needle = rule["pattern"]
    hay = text
    if not rule.get("case_sensitive"):
        needle, hay = needle.lower(), text.lower()
    start, spans = 0, []
    while True:
        idx = hay.find(needle, start)
        if idx < 0:
            return spans
        spans.append((idx, idx + len(needle)))
        start = idx + 1


def _regex_spans(text, rule):
    flags = 0
    if not rule.get("case_sensitive"):
        flags |= re.IGNORECASE
    if rule.get("multiline"):
        flags |= re.MULTILINE
    try:
        compiled = re.compile(rule["pattern"], flags)
    except re.error:
        return []
    return [(m.start(), m.end()) for m in compiled.finditer(text)]


def _pattern_spans(text, rule, language):
    root = parse_tree(text, language)
    if root is None:
        return []
    spans = []
    for node in iter_tree_nodes(root):
        if not node_matches_selector(rule["selector"], node):
            continue
        if rule.get("capture") and node.capture != rule["capture"]:
            continue
        spans.append((node.start, node.end))
    return spans


def find_matches_in_file(text, path, language, rules):
    matches = []
    for rule in rules:
        kind = rule.get("kind")
        if kind == "exact":
            spans = _exact_spans(text, rule)
        elif kind == "regex":
            spans = _regex_spans(text, rule)
        elif kind == "pattern":
            spans = _pattern_spans(text, rule, language)
        else:
            continue
        for start, end in spans:
            line = text.count("\\n", 0, start) + 1
            if rule.get("max_line") and line > rule["max_line"]:
                continue
            matches.append(dict(path=path, line=line, rule=rule["id"], span=(start, end)))
    return matches
`;
assert.equal(s.retention(source('matcher.py'), split), 1);
assert.equal(s.maxCcReduced(fenced(split), ctx('matcher.py')).pass, true);

// An echo of the input must not pass, and prose must fail saying why.
assert.equal(s.maxCcReduced(fenced(source('matcher.py')), ctx('matcher.py')).pass, false);
const prose = s.maxCcReduced('You should split this function up.', ctx('matcher.py'));
assert.equal(prose.pass, false);
assert.match(prose.reason, /No function definition/);

// Deleting the body drops max CC to 1 and the clone ratio to 0. Both are wins
// on the delta alone, so the identifier floor is what has to reject them.
const gutted = 'def find_matches_in_file(text, path, language, rules):\n    return []\n';
assert.ok(s.maxComplexity(gutted).cc < matcher.cc);
const deleted = s.maxCcReduced(fenced(gutted), ctx('matcher.py'));
assert.equal(deleted.pass, false);
assert.match(deleted.reason, /too little survives/);
assert.equal(
  s.cloneRatioReduced(fenced('def main(argv):\n    return COMMANDS[argv[1]](*argv[2:])\n'), ctx('cli.py')).pass,
  false,
);

// A file the completion cap cut off mid-line: shorter on every count, and
// rejected for what did not survive rather than credited for being short.
const truncated = source('search.py').split('\n').slice(0, 3).join('\n');
const cut = s.singleUseVarsReduced(`\`\`\`python\n${truncated}`, ctx('search.py'));
assert.equal(cut.pass, false);
assert.match(cut.reason, /too little survives/);

// Renaming the entry point away is the same escape as deleting it.
assert.match(
  s.maxCcReduced(fenced(split.replace('def find_matches_in_file', 'def run')), ctx('matcher.py')).reason,
  /no longer defines find_matches_in_file/,
);

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

// A match/case rewrite keeps every branch, and reads as CC 1 unless the arm
// itself is a decision point.
const arm = (cmd) => `        case "${cmd}":
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
            return cmd_${cmd}(path, fmt, seed)`;
const matched = `def main(argv):
    args = list(argv[1:])
    if not args:
        print("usage: circuit <command> [options]")
        return 2
    command = args[0]
    rest = args[1:]
    match command:
${['check', 'stats', 'lint', 'dot'].map(arm).join('\n')}
        case _:
            print("unknown command: " + command)
            return 2
`;
assert.ok(s.maxComplexity(matched).cc >= s.maxComplexity(source('cli.py')).cc);
assert.equal(s.maxCcReduced(fenced(matched), ctx('cli.py')).pass, false);

// Extracting the shared scaffold is the answer that wins; keeping two copies of
// it does not, even where the rest improved.
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
assert.equal(s.cloneRatioReduced(fenced(source('cli.py')), ctx('cli.py')).pass, false);

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
