# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.32 | 0.92 | 0.80 | +0.48 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.54 | 0.62 | 1.00 | +0.46 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 33.90 | 68.40 | 85.10 | +51.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 10.20 | 43.10 | 32.40 | +22.2 |
| ci:deepseek-v4-flash | latency_s | 12.72 | 37.25 | 36.45 | +23.7 |
| ci:deepseek-v4-flash | proposal_quality | 0.66 | 1.00 | 0.88 | +0.22 |
| ci:deepseek-v4-flash | tokens p50 | 528 | 6155 | 5142 | +4614 |
| ci:deepseek-v4-flash | tokens total | 7393 | 74925 | 63651 | +56258 |
