# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.83 | 1.00 | +0.17 |
| ci:deepseek-v4-flash | latency max (s) | 2.30 | 10.10 | +7.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.00 | 1.10 | +0.1 |
| ci:deepseek-v4-flash | latency_s | 1.04 | 2.47 | +1.4 |
| ci:deepseek-v4-flash | preserved | 0.25 | 0.92 | +0.67 |
| ci:deepseek-v4-flash | readability | 0.65 | 0.92 | +0.27 |
| ci:deepseek-v4-flash | tokens p50 | 378 | 1028 | +650 |
| ci:deepseek-v4-flash | tokens total | 4909 | 12878 | +7969 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.02 | 0.95 | +0.93 |
