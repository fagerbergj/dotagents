# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.56 | 0.92 | 0.80 | +0.24 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.56 | 0.62 | 0.94 | +0.38 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 25.30 | 68.40 | 66.90 | +41.6 |
| ci:deepseek-v4-flash | latency p50 (s) | 12.30 | 43.10 | 45.30 | +33.0 |
| ci:deepseek-v4-flash | latency_s | 11.81 | 37.25 | 37.68 | +25.9 |
| ci:deepseek-v4-flash | no_invented_specifics | 0.97 | – | 0.88 | −0.09 |
| ci:deepseek-v4-flash | proposal_quality | 0.88 | 1.00 | 0.94 | +0.06 |
| ci:deepseek-v4-flash | tokens p50 | 558 | 6155 | 6071 | +5513 |
| ci:deepseek-v4-flash | tokens total | 7874 | 74925 | 68257 | +60383 |
