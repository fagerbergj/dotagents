#!/usr/bin/env python3
"""Structural check on a promptfoo suite: every assertion has a metric, no null
assert block, every file://...:fn resolves to a real export, every rubric carries
the 0-to-1 clause. `validate config` reports valid on a case with no assertions."""
import sys, os, re, glob, yaml

def load(path):
    with open(path) as f:
        return yaml.safe_load(f)

def exports(js_path):
    src = open(js_path).read()
    names = set(re.findall(r'^\s*(?:async\s+)?function\s+(\w+)', src, re.M))
    names |= set(re.findall(r'exports\.(\w+)\s*=', src))
    m = re.search(r'module\.exports\s*=\s*\{([^}]*)\}', src, re.S)
    if m:
        for part in m.group(1).split(','):
            part = part.strip()
            if part:
                names.add(part.split(':')[0].strip())
    return names

def check(suite):
    errs = []
    cfg = load(os.path.join(suite, 'promptfooconfig.yaml'))
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
                ref = v[7:]
                path, _, fn = ref.rpartition(':')
                if not path:
                    path, fn = ref, None
                p = os.path.normpath(os.path.join(suite, path))
                if not os.path.exists(p):
                    errs.append(f'{at}: missing file {path}')
                elif fn and fn not in exports(p):
                    errs.append(f'{at}: {path} does not export {fn}')
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

bad = 0
for suite in sys.argv[1:]:
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
