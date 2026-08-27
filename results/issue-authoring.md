# issue-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | bounded_scope | 0.90 | 1.00 | 1.00 | +0.10 |
| ci:deepseek-v4-flash | case_fidelity | 0.74 | 0.70 | 0.81 | +0.07 |
| ci:deepseek-v4-flash | latency max (s) | 101.40 | 24.20 | 16.30 | −85.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.50 | 17.90 | 14.00 | +8.5 |
| ci:deepseek-v4-flash | latency_s | 21.39 | 16.52 | 13.58 | −7.8 |
| ci:deepseek-v4-flash | no_invented_facts | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | semantic_quality | 0.57 | 0.73 | 0.73 | +0.16 |
| ci:deepseek-v4-flash | tokens p50 | 366 | 6605 | 6536 | +6170 |
| ci:deepseek-v4-flash | tokens total | 4216 | 71307 | 70065 | +65849 |
