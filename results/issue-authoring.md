# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.79 | 0.70 | 0.76 | −0.02 |
| ci:deepseek-v4-flash | latency max (s) | 18.20 | 24.20 | 16.50 | −1.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.40 | 17.90 | 12.10 | +5.7 |
| ci:deepseek-v4-flash | latency_s | 8.10 | 16.52 | 12.45 | +4.3 |
| ci:deepseek-v4-flash | no_invented_facts | 0.91 | 1.00 | 1.00 | +0.09 |
| ci:deepseek-v4-flash | semantic_quality | 0.61 | 0.73 | 0.80 | +0.18 |
| ci:deepseek-v4-flash | tokens p50 | 335 | 6605 | 6474 | +6139 |
| ci:deepseek-v4-flash | tokens total | 3926 | 71307 | 74074 | +70148 |
