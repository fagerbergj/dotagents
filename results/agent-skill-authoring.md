# agent-skill-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.08 | 0.17 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 128.20 | 262.10 | +133.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 14.90 | 120.30 | +105.4 |
| ci:deepseek-v4-flash | latency_s | 29.21 | 108.18 | +79.0 |
| ci:deepseek-v4-flash | skill_quality | 0.83 | 0.80 | −0.03 |
| ci:deepseek-v4-flash | skill_validates | 0.00 | 0.86 | +0.86 |
| ci:deepseek-v4-flash | spec_budget_and_refs | 0.14 | 0.71 | +0.57 |
| ci:deepseek-v4-flash | tokens p50 | 953 | 24321 | +23368 |
| ci:deepseek-v4-flash | tokens total | 11150 | 227482 | +216332 |
