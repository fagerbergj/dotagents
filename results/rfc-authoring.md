# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.60 | 0.92 | 0.76 | +0.16 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.42 | 0.62 | 1.00 | +0.58 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 40.40 | 68.40 | 66.60 | +26.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 8.40 | 43.10 | 24.10 | +15.7 |
| ci:deepseek-v4-flash | latency_s | 14.07 | 37.25 | 32.72 | +18.6 |
| ci:deepseek-v4-flash | proposal_quality | 0.78 | 1.00 | 0.88 | +0.09 |
| ci:deepseek-v4-flash | tokens p50 | 553 | 6155 | 6132 | +5579 |
| ci:deepseek-v4-flash | tokens total | 8099 | 74925 | 68684 | +60585 |
