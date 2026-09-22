# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.63 | 0.96 | +0.33 |
| ci:deepseek-v4-flash | latency max (s) | 4.80 | 10.00 | +5.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.40 | 1.00 | −0.4 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.59 | 1.73 | +0.1 |
| ci:deepseek-v4-flash | marks_breaking | 0.00 | 0.30 | +0.30 |
| ci:deepseek-v4-flash | no_invented_claims | 0.89 | 0.56 |  |
| ci:deepseek-v4-flash | splits_mixed_change | 0.20 | 1.00 | +0.80 |
| ci:deepseek-v4-flash | tokens p50 | 1237 | 1967 | +730 |
| ci:deepseek-v4-flash | tokens total | 35295 | 55963 | +20668 |
| ci:deepseek-v4-flash | why_quality | 0.75 | 0.83 |  |
