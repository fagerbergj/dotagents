# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.86 | 0.70 | 0.84 | −0.02 |
| ci:deepseek-v4-flash | latency max (s) | 31.30 | 24.20 | 20.40 | −10.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.40 | 17.90 | 15.10 | +8.7 |
| ci:deepseek-v4-flash | latency_s | 10.16 | 16.52 | 15.53 | +5.4 |
| ci:deepseek-v4-flash | no_invented_facts | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | semantic_quality | 0.82 | 0.73 | 0.91 | +0.09 |
| ci:deepseek-v4-flash | tokens p50 | 346 | 6605 | 5431 | +5085 |
| ci:deepseek-v4-flash | tokens total | 3963 | 71307 | 55767 | +51804 |
