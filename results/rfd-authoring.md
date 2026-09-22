# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.76 | 0.07 | 1.00 | +0.24 |
| ci:deepseek-v4-flash | finds_the_decision | 0.40 | 0.46 | 0.78 | +0.38 |
| ci:deepseek-v4-flash | framing_quality | 0.71 | 0.72 | 0.71 | +0.00 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 17.60 | – | 35.20 | +17.6 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.20 | – | 17.80 | +11.6 |
| ci:deepseek-v4-flash | latency_s | 7.64 | – | 18.22 | +10.6 |
| ci:deepseek-v4-flash | no_invented_specifics | 0.65 | – | 0.54 | −0.12 |
| ci:deepseek-v4-flash | review_framing | 1.00 | – | 1.00 | +0.00 |
| ci:deepseek-v4-flash | stays_open | 0.57 | 1.00 | 1.00 | +0.43 |
| ci:deepseek-v4-flash | tokens p50 | 479 | 2094 | 2280 | +1801 |
| ci:deepseek-v4-flash | tokens total | 9491 | 54084 | 61865 | +52374 |
