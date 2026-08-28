# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.93 | 0.07 | 0.60 | −0.33 |
| ci:deepseek-v4-flash | finds_the_decision | 0.40 | 0.46 | 0.90 | +0.50 |
| ci:deepseek-v4-flash | framing_quality | 0.82 | 0.72 | 0.91 | +0.08 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 17.70 | – | 30.50 | +12.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.00 | – | 17.80 | +12.8 |
| ci:deepseek-v4-flash | latency_s | 7.49 | – | 18.39 | +10.9 |
| ci:deepseek-v4-flash | stays_open | 0.51 | 1.00 | 1.00 | +0.49 |
| ci:deepseek-v4-flash | tokens p50 | 414 | 2094 | 2367 | +1953 |
| ci:deepseek-v4-flash | tokens total | 7875 | 54084 | 61089 | +53214 |
