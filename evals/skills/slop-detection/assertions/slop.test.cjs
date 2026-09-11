// A grader that cannot tell a real improvement from an echo of the input is the
// failure this catches, so every check runs both directions against the suite's
// own cases rather than fixtures written to flatter it.
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

// Nested helpers carry their own branches, not their parent's.
const nested = s.pythonFunctions('def outer(x):\n    def inner(y):\n        if y:\n            return 1 and 2\n        return 0\n    return inner(x)\n');
assert.deepEqual(nested.map((f) => f.name).sort(), ['inner', 'outer']);
assert.equal(s.maxComplexity('def outer(x):\n    def inner(y):\n        if y:\n            return 1 and 2\n        return 0\n    return inner(x)\n').name, 'inner');

// The dispatcher repeats a scaffold; the parametrize table is data, not a clone.
assert.ok(s.cloneRatio(source('cli.py')).ratio > 0.5, JSON.stringify(s.cloneRatio(source('cli.py'))));
assert.equal(s.cloneRatio(source('test_radix.py')).ratio, 0);
assert.equal(s.cloneRatio(source('lexer.py')).ratio, 0);

assert.equal(s.answerCode('```sh\npytest -q\n```\n'), '');
assert.ok(s.answerCode(fenced('def f():\n    return 1\n')).includes('def f'));

// An echo of the input must not pass, and prose must fail saying why.
const ctx = (name) => ({ vars: { source: source(name) } });
const split = `def _exact_spans(text, rule):
    return []


def _regex_spans(text, rule):
    return []


def find_matches_in_file(text, path, language, rules):
    matches = []
    for rule in rules:
        for start, end in SPANNERS[rule["kind"]](text, rule):
            matches.append((path, start, end))
    return matches
`;
assert.equal(s.maxCcReduced(fenced(split), ctx('matcher.py')).pass, true);
assert.equal(s.maxCcReduced(fenced(source('matcher.py')), ctx('matcher.py')).pass, false);
const prose = s.maxCcReduced('You should split this function up.', ctx('matcher.py'));
assert.equal(prose.pass, false);
assert.match(prose.reason, /No function definition/);

// Keeping two copies of the scaffold must fail even where the rest improved.
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
            raise Usage(rest[i])
    return path, fmt, seed


def main(argv):
    command = argv[1]
    return COMMANDS[command](*_parse_common(argv[2:]))
`;
assert.equal(s.cloneRatioReduced(fenced(deduped), ctx('cli.py')).pass, true);
assert.equal(s.cloneRatioReduced(fenced(source('cli.py')), ctx('cli.py')).pass, false);

const condensed = `def search_tree(source_files, all_compiled_rules, encoding):
    matches = []
    for _, full_path, language in source_files:
        rules = [r for r in all_compiled_rules if language in r["languages"]]
        with open(full_path, encoding=encoding) as f:
            matches.extend(find_matches_in_content(f.read(), rules, language))
    return deduplicate_matches(matches)
`;
assert.equal(s.codeLinesReduced(fenced(condensed), ctx('search.py')).pass, true);
assert.equal(s.codeLinesReduced(fenced(source('search.py')), ctx('search.py')).pass, false);

console.log('slop.test.cjs: ok');
