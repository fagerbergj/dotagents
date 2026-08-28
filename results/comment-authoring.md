# comment-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@2.0 | skill@2.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | code_block | 1.00 | 1.00 | 0.93 | −0.07 |
| ci:deepseek-v4-flash | code_preserved | 1.00 | 0.93 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | doc_placement_floor | 0.33 | 1.00 | 0.67 | +0.33 |
| ci:deepseek-v4-flash | fact_transfer | 0.68 | 0.94 | 0.94 | +0.26 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 17.30 | – | 15.60 | −1.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 8.20 | – | 10.60 | +2.4 |
| ci:deepseek-v4-flash | latency_s | 8.44 | – | 10.94 | +2.5 |
| ci:deepseek-v4-flash | not_narration | 0.62 | 0.38 | 0.41 | −0.21 |
| ci:deepseek-v4-flash | restraint | 0.10 | 0.38 | 0.25 | +0.15 |
| ci:deepseek-v4-flash | tokens p50 | 1001 | 2594 | 2700 | +1699 |
| ci:deepseek-v4-flash | tokens total | 14115 | 36216 | 41881 | +27766 |
