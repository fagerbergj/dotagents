# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.68 | 0.92 | 0.48 | −0.20 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.41 | 0.62 | 0.79 | +0.38 |
| ci:deepseek-v4-flash | latency | 0.92 | 1.00 | 1.00 | +0.1 |
| ci:deepseek-v4-flash | latency max (s) | 227.90 | 68.40 | 38.20 | −189.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 7.40 | 43.10 | 24.60 | +17.2 |
| ci:deepseek-v4-flash | latency_s | 25.64 | 37.25 | 23.10 | −2.5 |
| ci:deepseek-v4-flash | proposal_quality | 0.81 | 1.00 | 0.78 | −0.03 |
| ci:deepseek-v4-flash | tokens p50 | 624 | 6155 | 3150 | +2526 |
| ci:deepseek-v4-flash | tokens total | 8093 | 74925 | 51627 | +43534 |
