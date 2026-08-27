# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.57 | 0.70 | 0.75 | +0.17 |
| ci:deepseek-v4-flash | latency max (s) | 56.00 | 24.20 | 19.90 | −36.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.40 | 17.90 | 12.40 | +6.0 |
| ci:deepseek-v4-flash | latency_s | 10.07 | 16.52 | 12.60 | +2.5 |
| ci:deepseek-v4-flash | no_invented_facts | 0.91 | 1.00 | 1.00 | +0.09 |
| ci:deepseek-v4-flash | semantic_quality | 0.70 | 0.73 | 0.82 | +0.11 |
| ci:deepseek-v4-flash | tokens p50 | 343 | 6605 | 6308 | +5965 |
| ci:deepseek-v4-flash | tokens total | 4028 | 71307 | 64486 | +60458 |
