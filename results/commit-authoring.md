# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.60 | 0.93 | +0.33 |
| ci:deepseek-v4-flash | latency max (s) | 6.70 | 2.30 | −4.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.30 | 1.40 | +0.1 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.60 | 1.15 | −0.5 |
| ci:deepseek-v4-flash | marks_breaking | 0.25 | 0.25 | +0.00 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.00 | 1.00 | +1.00 |
| ci:deepseek-v4-flash | tokens p50 | 930 | 1786 | +856 |
| ci:deepseek-v4-flash | tokens total | 17567 | 29697 | +12130 |
| ci:deepseek-v4-flash | why_quality | 0.65 | 0.75 | +0.09 |
