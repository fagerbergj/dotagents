# review-code

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 27.70 | 178.00 | +150.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 13.30 | 37.70 | +24.4 |
| ci:deepseek-v4-flash | latency_s | 14.66 | 54.01 | +39.3 |
| ci:deepseek-v4-flash | no_invented_citations | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | review_quality | 0.44 | 0.61 | +0.17 |
| ci:deepseek-v4-flash | tokens p50 | 2462 | 113397 | +110935 |
| ci:deepseek-v4-flash | tokens total | 80792 | 2038421 | +1957629 |
