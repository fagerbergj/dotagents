# rfc-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.40 | 0.92 | +0.52 |
| ci:deepseek-v4-flash | honest_tradeoffs | 0.50 | 0.62 | +0.12 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 175.90 | 68.40 | −107.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 12.30 | 43.10 | +30.8 |
| ci:deepseek-v4-flash | latency_s | 31.98 | 37.25 | +5.3 |
| ci:deepseek-v4-flash | proposal_quality | 0.75 | 1.00 | +0.25 |
| ci:deepseek-v4-flash | tokens p50 | 642 | 6155 | +5513 |
| ci:deepseek-v4-flash | tokens total | 8395 | 74925 | +66530 |
