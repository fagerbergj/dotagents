# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 1.00 | 0.07 | −0.93 |
| ci:deepseek-v4-flash | finds_the_decision | 0.20 | 0.46 | +0.26 |
| ci:deepseek-v4-flash | framing_quality | 0.72 | 0.72 | −0.01 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | stays_open | 0.74 | 1.00 | +0.26 |
| ci:deepseek-v4-flash | tokens p50 | 401 | 2094 | +1693 |
| ci:deepseek-v4-flash | tokens total | 8020 | 54084 | +46064 |
