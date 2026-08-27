# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.64 | 0.92 | 0.60 | −0.04 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.41 | 0.62 | 0.63 | +0.21 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 72.10 | 68.40 | 68.00 | −4.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 8.70 | 43.10 | 32.10 | +23.4 |
| ci:deepseek-v4-flash | latency_s | 15.95 | 37.25 | 33.13 | +17.2 |
| ci:deepseek-v4-flash | proposal_quality | 0.78 | 1.00 | 0.84 | +0.06 |
| ci:deepseek-v4-flash | tokens p50 | 686 | 6155 | 2963 | +2277 |
| ci:deepseek-v4-flash | tokens total | 8262 | 74925 | 57380 | +49118 |
