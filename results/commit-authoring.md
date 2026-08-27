# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.67 | 0.87 | +0.20 |
| ci:deepseek-v4-flash | latency max (s) | 2.60 | 9.90 | +7.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.40 | 1.50 | +0.1 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.36 | 2.03 | +0.7 |
| ci:deepseek-v4-flash | marks_breaking | 0.00 | 0.50 | +0.50 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.25 | 1.00 | +0.75 |
| ci:deepseek-v4-flash | tokens p50 | 1023 | 1722 | +699 |
| ci:deepseek-v4-flash | tokens total | 17852 | 29636 | +11784 |
| ci:deepseek-v4-flash | why_quality | 0.69 | 0.67 | −0.03 |
