# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.92 | 1.00 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 5.50 | 2.30 | −3.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 0.70 | 0.90 | +0.2 |
| ci:deepseek-v4-flash | latency_s | 1.00 | 1.01 | +0.0 |
| ci:deepseek-v4-flash | preserved | 0.33 | 0.91 | +0.58 |
| ci:deepseek-v4-flash | readability | 0.67 | 0.85 | +0.18 |
| ci:deepseek-v4-flash | tokens p50 | 358 | 1029 | +671 |
| ci:deepseek-v4-flash | tokens total | 4723 | 13071 | +8348 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.06 | 0.79 | +0.73 |
