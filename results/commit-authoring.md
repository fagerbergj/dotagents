# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.80 | 0.87 | +0.07 |
| ci:deepseek-v4-flash | latency max (s) | 2.50 | 2.20 | −0.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.00 | 1.50 | +0.5 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.13 | 1.50 | +0.4 |
| ci:deepseek-v4-flash | marks_breaking | 0.00 | 0.50 | +0.50 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.75 | 1.00 | +0.25 |
| ci:deepseek-v4-flash | tokens p50 | 965 | 1792 | +827 |
| ci:deepseek-v4-flash | tokens total | 17545 | 29766 | +12221 |
| ci:deepseek-v4-flash | why_quality | 0.55 | 0.85 | +0.31 |
