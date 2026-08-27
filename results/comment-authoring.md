# comment-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@2.0 | skill@2.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | code_block | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | code_preserved | 1.00 | 0.93 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | doc_placement_floor | 0.67 | 1.00 | 0.67 | +0.00 |
| ci:deepseek-v4-flash | fact_transfer | 0.94 | 0.94 | 0.77 | −0.16 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 105.20 | – | 13.70 | −91.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 9.40 | – | 10.10 | +0.7 |
| ci:deepseek-v4-flash | latency_s | 16.50 | – | 10.10 | −6.4 |
| ci:deepseek-v4-flash | not_narration | 0.35 | 0.38 | 0.42 | +0.06 |
| ci:deepseek-v4-flash | restraint | 0.00 | 0.38 | 0.22 | +0.22 |
| ci:deepseek-v4-flash | tokens p50 | 1106 | 2594 | 2708 | +1602 |
| ci:deepseek-v4-flash | tokens total | 14084 | 36216 | 38943 | +24859 |
