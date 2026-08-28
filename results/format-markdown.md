# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.92 | 1.00 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 4.20 | 1.90 | −2.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 0.90 | 0.40 | −0.5 |
| ci:deepseek-v4-flash | latency_s | 1.11 | 0.67 | −0.4 |
| ci:deepseek-v4-flash | preserved | 0.24 | 0.91 | +0.67 |
| ci:deepseek-v4-flash | readability | 0.53 | 0.83 | +0.30 |
| ci:deepseek-v4-flash | tokens p50 | 379 | 1028 | +649 |
| ci:deepseek-v4-flash | tokens total | 4928 | 12865 | +7937 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.10 | 0.92 | +0.82 |
