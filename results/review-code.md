# review-code

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 25.20 | 119.00 | +93.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 14.40 | 51.50 | +37.1 |
| ci:deepseek-v4-flash | latency_s | 14.49 | 54.42 | +39.9 |
| ci:deepseek-v4-flash | no_invented_citations | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | review_quality | 0.53 | 0.70 | +0.17 |
| ci:deepseek-v4-flash | tokens p50 | 2372 | 147051 | +144679 |
| ci:deepseek-v4-flash | tokens total | 67934 | 2259820 | +2191886 |
