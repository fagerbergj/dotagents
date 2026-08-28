# review-code

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 49.50 | 119.00 | +69.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 17.70 | 45.50 | +27.8 |
| ci:deepseek-v4-flash | latency_s | 19.61 | 56.66 | +37.0 |
| ci:deepseek-v4-flash | no_invented_citations | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | review_quality | 0.47 | 0.47 | +0.00 |
| ci:deepseek-v4-flash | tokens p50 | 2314 | 116088 | +113774 |
| ci:deepseek-v4-flash | tokens total | 186512 | 2035451 | +1848939 |
