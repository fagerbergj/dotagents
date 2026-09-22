# agent-skill-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.50 | 0.17 | −0.33 |
| ci:deepseek-v4-flash | latency max (s) | 128.20 | 262.10 | +133.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 14.90 | 120.30 | +105.4 |
| ci:deepseek-v4-flash | latency_s | 29.21 | 108.18 | +79.0 |
| ci:deepseek-v4-flash | skill_quality | 0.67 | 0.20 | −0.47 |
| ci:deepseek-v4-flash | skill_validates | 0.17 | 0.33 | +0.17 |
| ci:deepseek-v4-flash | spec_budget_and_refs | 0.33 | 0.29 | −0.04 |
| ci:deepseek-v4-flash | tokens p50 | 1511 | 19632 | +18121 |
| ci:deepseek-v4-flash | tokens total | 13101 | 161087 | +147986 |
