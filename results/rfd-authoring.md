# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 1.00 | 0.07 | 0.80 | −0.20 |
| ci:deepseek-v4-flash | finds_the_decision | 0.20 | 0.46 | 0.64 | +0.44 |
| ci:deepseek-v4-flash | framing_quality | 0.72 | 0.72 | 0.92 | +0.20 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 104.50 | – | 29.30 | −75.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.70 | – | 15.40 | +9.7 |
| ci:deepseek-v4-flash | latency_s | 18.06 | – | 16.66 | −1.4 |
| ci:deepseek-v4-flash | stays_open | 0.60 | 1.00 | 1.00 | +0.40 |
| ci:deepseek-v4-flash | tokens p50 | 448 | 2094 | 2302 | +1854 |
| ci:deepseek-v4-flash | tokens total | 8462 | 54084 | 60107 | +51645 |
