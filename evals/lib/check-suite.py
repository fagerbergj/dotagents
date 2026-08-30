#!/usr/bin/env python3
"""Structural check on a promptfoo suite: every assertion has a metric, no null
assert block, every file://...:fn resolves to a real export - in providers and
prompts as well as assertions - and every rubric carries the 0-to-1 clause.
`validate config` reports valid on a case with no assertions."""
import sys, os, re, glob, yaml

def load(path):
    with open(path) as f:
        return yaml.safe_load(f)

def exports(js_path):
    """Export names, or None when they cannot be read statically. Three suites
    re-export a factory call - `module.exports = require('../lib/arms.js')(...)`
    - and the names only exist at runtime; asserting on them would fail every
    one of those suites. Callers treat None as "existence checked, names not"."""
    src = open(js_path).read()
    m = re.search(r'module\.exports\s*=\s*(\S)', src)
    if m and m.group(1) != '{':
        return None
    names = set(re.findall(r'^\s*(?:async\s+)?function\s+(\w+)', src, re.M))
    names |= set(re.findall(r'exports\.(\w+)\s*=', src))
    m = re.search(r'module\.exports\s*=\s*\{([^}]*)\}', src, re.S)
    if m:
        for part in m.group(1).split(','):
            part = part.strip()
            if part:
                names.add(part.split(':')[0].strip())
    return names

def file_ref(where, value, suite, errs):
    """A `file://path[:fn]` must name a real file, and `:fn` a real export."""
    ref = value[7:]
    path, _, fn = ref.rpartition(':')
    if not path:
        path, fn = ref, None
    p = os.path.normpath(os.path.join(suite, path))
    if not os.path.exists(p):
        errs.append(f'{where}: missing file {path}')
        return
    if fn:
        names = exports(p)
        if names is not None and fn not in names:
            errs.append(f'{where}: {path} does not export {fn}')

def walk_file_refs(where, node, suite, errs):
    """Same rule outside assertions. A provider or prompt naming a module that
    does not exist passes every offline gate and only fails after spend."""
    if isinstance(node, str):
        if node.startswith('file://'):
            file_ref(where, node, suite, errs)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk_file_refs(f'{where}[{i}]', v, suite, errs)
    elif isinstance(node, dict):
        for k, v in node.items():
            walk_file_refs(f'{where}.{k}', v, suite, errs)

def check(suite):
    errs = []
    cfg = load(os.path.join(suite, 'promptfooconfig.yaml'))
    # `tests:` is excluded: those refs are globs, resolved below. defaultTest's
    # assert block is walked by walk_asserts, so only its options are taken here.
    for key in ('providers', 'prompts'):
        walk_file_refs(key, cfg.get(key), suite, errs)
    walk_file_refs('defaultTest.options', (cfg.get('defaultTest') or {}).get('options'), suite, errs)
    files = []
    for pattern in cfg.get('tests', []):
        if isinstance(pattern, str) and pattern.startswith('file://'):
            files += sorted(glob.glob(os.path.join(suite, pattern[7:])))
    if not files:
        errs.append('no test files resolved')
    cases = []
    for f in files:
        data = load(f)
        if not isinstance(data, list):
            errs.append(f'{f}: not a list')
            continue
        for c in data:
            cases.append((f, c))

    # latency and cost are run-shape guards, not scored metrics; promptfoo does
    # not roll them into namedScores, so a metric on them buys nothing.
    NO_METRIC_NEEDED = {'latency', 'cost'}

    def walk_asserts(where, asserts, case_vars=None):
        if asserts is None:
            errs.append(f'{where}: assert: is null')
            return
        if not asserts:
            errs.append(f'{where}: no assertions')
            return
        for i, a in enumerate(asserts):
            at = f'{where} assert[{i}]'
            if a is None:
                errs.append(f'{at}: null assertion')
                continue
            if a.get('type') == 'assert-set':
                walk_asserts(at, a.get('assert'), case_vars)
                continue
            if not a.get('metric') and a.get('type') not in NO_METRIC_NEEDED:
                errs.append(f'{at}: no metric')
            v = a.get('value')
            if isinstance(v, str) and v.startswith('file://'):
                file_ref(at, v, suite, errs)
            if a.get('type') in ('llm-rubric', 'g-eval', 'select-best'):
                text = v if isinstance(v, str) else '\n'.join(v or [])
                # A rubric body can be a per-case var; resolve it before looking
                # for the clause, or every {{rubric}} suite reports a false fail.
                for name, val in (case_vars or {}).items():
                    if isinstance(val, str):
                        text = text.replace('{{' + name + '}}', val).replace('{{ ' + name + ' }}', val)
                if a.get('type') != 'select-best' and 'score from 0 to 1, never above 1' not in text.lower():
                    errs.append(f'{at}: rubric lacks the 0-to-1 clause')

    dt = cfg.get('defaultTest') or {}
    if 'assert' in dt:
        # defaultTest assertions run against every case, so resolve their vars
        # per case rather than once with none.
        for f, c in cases or [(None, {})]:
            walk_asserts(f"defaultTest on {c.get('description','?')}", dt.get('assert'), (c.get('vars') or {}))
    default_metrics = {a.get('metric') for a in (dt.get('assert') or []) if isinstance(a, dict)}
    for f, c in cases:
        where = f"{os.path.basename(f)}::{c.get('description','?')}"
        if 'assert' in c or not default_metrics:
            walk_asserts(where, c.get('assert'), (c.get('vars') or {}))
    return errs, len(cases)

# With no arguments this used to loop zero times and exit 0 - a gate that reports
# success while checking nothing, which is the exact failure it exists to catch.
# Default to every suite instead.
targets = sys.argv[1:]
if not targets:
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'skills')
    targets = sorted(
        os.path.join(root, d) for d in os.listdir(root)
        if os.path.isfile(os.path.join(root, d, 'promptfooconfig.yaml'))
    )
    if not targets:
        print(f'check-suite: no suites found under {os.path.normpath(root)}', file=sys.stderr)
        sys.exit(1)

bad = 0
for suite in targets:
    errs, n = check(suite)
    name = os.path.basename(suite.rstrip('/'))
    if errs:
        bad = 1
        print(f'FAIL {name} ({n} cases)')
        for e in errs:
            print('  -', e)
    else:
        print(f'ok   {name} ({n} cases)')
sys.exit(bad)
