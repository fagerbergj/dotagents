#!/usr/bin/env python3
"""Fail loudly if a case var contains nunjucks syntax.

promptfoo renders every var through nunjucks before the prompt function sees it.
A Go table-driven test (`}{{MsgQueued, false}, ...`) inside a real diff parses as
an interpolation, the render throws, and BOTH arms return empty output - which a
comparative assertion will happily score, awarding a winner on two empty strings.
The case is gone from the results and nothing says so.

Only `vars` are checked. Assertion values and rubric prompts use {{output}},
{{criteria}} and {{rubric}} on purpose.
"""
import os, sys, glob, yaml

BAD = ('{{', '{%')

def templating_off(path):
    """A suite that opts out of nunjucks entirely can hold whatever its diffs hold."""
    if os.environ.get('PROMPTFOO_DISABLE_TEMPLATING'):
        return True
    cfg = os.path.join(os.path.dirname(os.path.dirname(path)), 'promptfooconfig.yaml')
    if not os.path.exists(cfg):
        return False
    with open(cfg) as fh:
        env = (yaml.safe_load(fh) or {}).get('env') or {}
    return str(env.get('PROMPTFOO_DISABLE_TEMPLATING', '')).lower() in ('1', 'true', 'yes')

def strings(node, path):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, f'{path}.{k}')
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from strings(v, f'{path}[{i}]')

def main(argv):
    paths = sorted({p for a in (argv or ['skills/*/tests/*.yaml']) for p in glob.glob(a)})
    if not paths:
        sys.exit(f'check-case-vars: nothing matched {argv}')
    bad = []
    for path in paths:
        if templating_off(path):
            continue
        with open(path) as fh:
            doc = yaml.safe_load(fh)
        for case in doc if isinstance(doc, list) else [doc]:
            if not isinstance(case, dict):
                continue
            name = case.get('description', '<unnamed>')
            for where, text in strings(case.get('vars') or {}, 'vars'):
                for marker in BAD:
                    if marker in text:
                        line = next(l for l in text.splitlines() if marker in l)
                        bad.append(f'{path}: {name}: {where} contains {marker} -> {line.strip()[:90]}')
    if bad:
        print('Template syntax in case vars - promptfoo would render these and the case would', file=sys.stderr)
        print('die in every arm with an empty output. Escape it or set PROMPTFOO_DISABLE_TEMPLATING=1', file=sys.stderr)
        print('in the suite config.\n', file=sys.stderr)
        print('\n'.join(bad), file=sys.stderr)
        sys.exit(1)
    print(f'case vars: no template syntax in {len(paths)} file(s)')

main(sys.argv[1:])
