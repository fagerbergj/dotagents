# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.40 | 0.92 | 0.88 | +0.48 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.29 | 0.62 | 1.00 | +0.71 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 25.30 | 68.40 | 66.90 | +41.6 |
| ci:deepseek-v4-flash | latency p50 (s) | 12.30 | 43.10 | 45.30 | +33.0 |
| ci:deepseek-v4-flash | latency_s | 11.81 | 37.25 | 37.68 | +25.9 |
| ci:deepseek-v4-flash | proposal_quality | 0.72 | 1.00 | 0.94 | +0.22 |
| ci:deepseek-v4-flash | tokens p50 | 567 | 6155 | 6226 | +5659 |
| ci:deepseek-v4-flash | tokens total | 9158 | 74925 | 74337 | +65179 |
