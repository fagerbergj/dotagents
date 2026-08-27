# comment-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@2.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | code_block | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | code_preserved | 1.00 | 0.93 | −0.07 |
| ci:deepseek-v4-flash | doc_placement_floor | 0.33 | 1.00 | +0.67 |
| ci:deepseek-v4-flash | fact_transfer | 0.71 | 0.94 | +0.23 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | not_narration | 0.63 | 0.38 | −0.25 |
| ci:deepseek-v4-flash | restraint | 0.04 | 0.38 | +0.34 |
| ci:deepseek-v4-flash | tokens p50 | 1041 | 2594 | +1553 |
| ci:deepseek-v4-flash | tokens total | 14422 | 36216 | +21794 |
