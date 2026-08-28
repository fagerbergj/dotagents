# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.80 | 0.07 | 0.60 | −0.20 |
| ci:deepseek-v4-flash | finds_the_decision | 0.04 | 0.46 | 0.76 | +0.72 |
| ci:deepseek-v4-flash | framing_quality | 0.68 | 0.72 | 0.80 | +0.13 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 17.60 | – | 35.20 | +17.6 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.20 | – | 17.80 | +11.6 |
| ci:deepseek-v4-flash | latency_s | 7.64 | – | 18.22 | +10.6 |
| ci:deepseek-v4-flash | stays_open | 0.66 | 1.00 | 0.97 | +0.31 |
| ci:deepseek-v4-flash | tokens p50 | 442 | 2094 | 2419 | +1977 |
| ci:deepseek-v4-flash | tokens total | 7978 | 54084 | 64006 | +56028 |
