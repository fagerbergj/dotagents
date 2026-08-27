# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.57 | 0.70 | +0.14 |
| ci:deepseek-v4-flash | latency max (s) | 29.00 | 24.20 | −4.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 7.70 | 17.90 | +10.2 |
| ci:deepseek-v4-flash | latency_s | 9.73 | 16.52 | +6.8 |
| ci:deepseek-v4-flash | no_invented_facts | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | semantic_quality | 0.66 | 0.73 | +0.07 |
| ci:deepseek-v4-flash | tokens p50 | 319 | 6605 | +6286 |
| ci:deepseek-v4-flash | tokens total | 3809 | 71307 | +67498 |
