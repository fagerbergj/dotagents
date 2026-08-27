# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.92 | 1.00 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 3.30 | 1.60 | −1.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.00 | 0.90 | −0.1 |
| ci:deepseek-v4-flash | latency_s | 1.09 | 0.88 | −0.2 |
| ci:deepseek-v4-flash | preserved | 0.17 | 0.91 | +0.74 |
| ci:deepseek-v4-flash | readability | 0.58 | 0.90 | +0.32 |
| ci:deepseek-v4-flash | tokens p50 | 401 | 1030 | +629 |
| ci:deepseek-v4-flash | tokens total | 5363 | 12842 | +7479 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.19 | 0.73 | +0.55 |
