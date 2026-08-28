# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.79 | 0.70 | 0.78 | −0.01 |
| ci:deepseek-v4-flash | latency max (s) | 16.30 | 24.20 | 21.50 | +5.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.00 | 17.90 | 16.70 | +11.7 |
| ci:deepseek-v4-flash | latency_s | 6.08 | 16.52 | 16.55 | +10.5 |
| ci:deepseek-v4-flash | no_invented_facts | 1.00 | 1.00 | 0.91 | −0.09 |
| ci:deepseek-v4-flash | semantic_quality | 0.68 | 0.73 | 0.70 | +0.02 |
| ci:deepseek-v4-flash | tokens p50 | 354 | 6605 | 6325 | +5971 |
| ci:deepseek-v4-flash | tokens total | 4015 | 71307 | 70862 | +66847 |
