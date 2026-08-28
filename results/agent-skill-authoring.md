# agent-skill-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.17 | 0.17 | +0.00 |
| ci:deepseek-v4-flash | latency max (s) | 27.10 | 152.60 | +125.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 14.30 | 63.60 | +49.3 |
| ci:deepseek-v4-flash | latency_s | 15.10 | 63.38 | +48.3 |
| ci:deepseek-v4-flash | skill_quality | 0.87 | 0.67 | −0.20 |
| ci:deepseek-v4-flash | skill_validates | 0.00 | 0.71 | +0.71 |
| ci:deepseek-v4-flash | spec_budget_and_refs | 0.39 | 0.57 | +0.18 |
| ci:deepseek-v4-flash | tokens p50 | 1155 | 15905 | +14750 |
| ci:deepseek-v4-flash | tokens total | 11946 | 163723 | +151777 |
