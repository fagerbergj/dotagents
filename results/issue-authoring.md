# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.76 | 0.70 | 0.87 | +0.11 |
| ci:deepseek-v4-flash | latency max (s) | 9.60 | 24.20 | 22.10 | +12.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.50 | 17.90 | 14.70 | +9.2 |
| ci:deepseek-v4-flash | latency_s | 5.30 | 16.52 | 15.28 | +10.0 |
| ci:deepseek-v4-flash | no_invented_facts | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | semantic_quality | 0.55 | 0.73 | 0.93 | +0.39 |
| ci:deepseek-v4-flash | tokens p50 | 306 | 6605 | 6208 | +5902 |
| ci:deepseek-v4-flash | tokens total | 3839 | 71307 | 61721 | +57882 |
