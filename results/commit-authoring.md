# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.67 | 0.93 | +0.27 |
| ci:deepseek-v4-flash | latency max (s) | 4.80 | 10.00 | +5.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.40 | 1.00 | −0.4 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.59 | 1.73 | +0.1 |
| ci:deepseek-v4-flash | marks_breaking | 0.25 | 0.25 | +0.00 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.50 | 1.00 | +0.50 |
| ci:deepseek-v4-flash | tokens p50 | 942 | 1789 | +847 |
| ci:deepseek-v4-flash | tokens total | 17666 | 29544 | +11878 |
| ci:deepseek-v4-flash | why_quality | 0.55 | 0.76 | +0.21 |
