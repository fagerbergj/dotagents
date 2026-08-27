# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.92 | 1.00 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 10.00 | 4.60 | −5.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.50 | 1.60 | +0.1 |
| ci:deepseek-v4-flash | latency_s | 2.72 | 1.48 | −1.2 |
| ci:deepseek-v4-flash | preserved | 0.42 | 0.83 | +0.41 |
| ci:deepseek-v4-flash | readability | 0.63 | 0.85 | +0.22 |
| ci:deepseek-v4-flash | tokens p50 | 359 | 1031 | +672 |
| ci:deepseek-v4-flash | tokens total | 5240 | 12949 | +7709 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.02 | 0.75 | +0.73 |
