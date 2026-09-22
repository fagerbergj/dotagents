# comment-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@2.0 | skill@2.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | code_block | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | code_preserved | 1.00 | 0.93 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | doc_placement_floor | 0.67 | 1.00 | 0.33 | −0.33 |
| ci:deepseek-v4-flash | fact_transfer | 0.89 | 0.94 | 0.90 | +0.01 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 15.50 | – | 17.60 | +2.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 9.40 | – | 10.90 | +1.5 |
| ci:deepseek-v4-flash | latency_s | 9.34 | – | 10.73 | +1.4 |
| ci:deepseek-v4-flash | no_false_comments | 0.67 | – | 0.33 | −0.33 |
| ci:deepseek-v4-flash | not_narration | 0.49 | 0.38 | 0.28 | −0.21 |
| ci:deepseek-v4-flash | restraint | 0.46 | 0.38 | 0.10 | −0.36 |
| ci:deepseek-v4-flash | tokens p50 | 1145 | 2594 | 2658 | +1513 |
| ci:deepseek-v4-flash | tokens total | 16012 | 36216 | 38328 | +22316 |
