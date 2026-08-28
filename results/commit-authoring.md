# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.73 | 1.00 | +0.27 |
| ci:deepseek-v4-flash | latency max (s) | 4.10 | 6.10 | +2.0 |
| ci:deepseek-v4-flash | latency p50 (s) | 0.70 | 1.60 | +0.9 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.07 | 2.02 | +0.9 |
| ci:deepseek-v4-flash | marks_breaking | 0.00 | 0.25 | +0.25 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.50 | 1.00 | +0.50 |
| ci:deepseek-v4-flash | tokens p50 | 1016 | 1735 | +719 |
| ci:deepseek-v4-flash | tokens total | 17827 | 29841 | +12014 |
| ci:deepseek-v4-flash | why_quality | 0.61 | 0.73 | +0.12 |
