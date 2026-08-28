# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.67 | 0.93 | +0.27 |
| ci:deepseek-v4-flash | latency max (s) | 5.00 | 10.00 | +5.0 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.30 | 1.10 | −0.2 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.59 | 1.84 | +0.3 |
| ci:deepseek-v4-flash | marks_breaking | 0.25 | 0.50 | +0.25 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.25 | 1.00 | +0.75 |
| ci:deepseek-v4-flash | tokens p50 | 935 | 1785 | +850 |
| ci:deepseek-v4-flash | tokens total | 18049 | 29686 | +11637 |
| ci:deepseek-v4-flash | why_quality | 0.65 | 0.73 | +0.08 |
