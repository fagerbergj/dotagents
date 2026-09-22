# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.64 | 0.92 | 0.80 | +0.16 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.06 | 0.62 | 0.38 | +0.31 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 25.30 | 68.40 | 66.90 | +41.6 |
| ci:deepseek-v4-flash | latency p50 (s) | 12.30 | 43.10 | 45.30 | +33.0 |
| ci:deepseek-v4-flash | latency_s | 11.81 | 37.25 | 37.68 | +25.9 |
| ci:deepseek-v4-flash | no_invented_specifics | 0.97 | – | 0.84 | −0.13 |
| ci:deepseek-v4-flash | proposal_quality | 0.50 | 1.00 | 0.50 | +0.00 |
| ci:deepseek-v4-flash | tokens p50 | 703 | 6155 | 6050 | +5347 |
| ci:deepseek-v4-flash | tokens total | 9776 | 74925 | 62688 | +52912 |
