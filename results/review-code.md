# review-code

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 63.90 | 118.00 | +54.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 19.80 | 47.00 | +27.2 |
| ci:deepseek-v4-flash | latency_s | 25.46 | 46.42 | +21.0 |
| ci:deepseek-v4-flash | no_invented_citations | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | review_quality | 0.56 | 0.56 | +0.00 |
| ci:deepseek-v4-flash | tokens p50 | 2016 | 74079 | +72063 |
| ci:deepseek-v4-flash | tokens total | 154449 | 1489214 | +1334765 |
