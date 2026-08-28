# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.60 | 0.07 | 0.60 | +0.00 |
| ci:deepseek-v4-flash | finds_the_decision | 0.24 | 0.46 | 0.40 | +0.16 |
| ci:deepseek-v4-flash | framing_quality | 0.68 | 0.72 | 0.90 | +0.22 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 14.60 | – | 45.10 | +30.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.40 | – | 20.10 | +14.7 |
| ci:deepseek-v4-flash | latency_s | 7.03 | – | 20.78 | +13.8 |
| ci:deepseek-v4-flash | stays_open | 0.26 | 1.00 | 1.00 | +0.74 |
| ci:deepseek-v4-flash | tokens p50 | 453 | 2094 | 2360 | +1907 |
| ci:deepseek-v4-flash | tokens total | 7975 | 54084 | 61791 | +53816 |
