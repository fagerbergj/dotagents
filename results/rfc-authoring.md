# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.60 | 0.92 | 0.56 | −0.04 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.62 | 0.62 | 0.79 | +0.17 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 37.30 | 68.40 | 56.30 | +19.0 |
| ci:deepseek-v4-flash | latency p50 (s) | 10.40 | 43.10 | 25.00 | +14.6 |
| ci:deepseek-v4-flash | latency_s | 14.33 | 37.25 | 29.07 | +14.7 |
| ci:deepseek-v4-flash | proposal_quality | 0.56 | 1.00 | 1.00 | +0.44 |
| ci:deepseek-v4-flash | tokens p50 | 713 | 6155 | 5961 | +5248 |
| ci:deepseek-v4-flash | tokens total | 9095 | 74925 | 65345 | +56250 |
