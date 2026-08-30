#!/usr/bin/env python3
"""check-suite.py must FAIL a suite whose provider or prompt names a module that
is not there. A gate that passes everything is the defect it exists to catch, and
running it over the real suites only ever proves the green half."""
import os, subprocess, sys, tempfile, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))

CONFIG = """
prompts:
  - id: file://prompts/arms.js:{fn}
    label: no-skill
providers:
  - id: file://{provider}
tests:
  - file://tests/cases.yaml
"""

CASES = """
- description: a case
  vars: {ask: hi}
  assert:
    - type: llm-rubric
      metric: quality
      value: 'Answers the question. Give a score from 0 to 1, never above 1.'
"""

def run(provider, fn):
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(f'{d}/prompts'); os.makedirs(f'{d}/tests')
        open(f'{d}/prompts/arms.js', 'w').write('module.exports = { noSkill: () => "" };\n')
        open(f'{d}/real-provider.js', 'w').write('module.exports = { callApi: () => ({}) };\n')
        open(f'{d}/tests/cases.yaml', 'w').write(textwrap.dedent(CASES))
        open(f'{d}/promptfooconfig.yaml', 'w').write(
            CONFIG.format(provider=provider, fn=fn))
        p = subprocess.run([sys.executable, f'{HERE}/check-suite.py', d],
                           capture_output=True, text=True)
        return p.returncode, p.stdout

code, out = run('real-provider.js', 'noSkill')
assert code == 0, f'a sound suite must pass:\n{out}'

# The real #51 case: providers named ../../lib/sandbox-bash.js, which never
# existed. Every offline gate passed and it died on the first paid run.
code, out = run('sandbox-bash.js', 'noSkill')
assert code == 1 and 'missing file sandbox-bash.js' in out, f'dangling provider not caught:\n{out}'

code, out = run('real-provider.js', 'noSkil')
assert code == 1 and 'does not export noSkil' in out, f'dangling prompt export not caught:\n{out}'

print('check-suite.py catches dangling provider and prompt refs')
