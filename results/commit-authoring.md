# commit-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | conventional_header | 0.67 | 0.87 | +0.20 |
| ci:deepseek-v4-flash | latency max (s) | 4.20 | 1.80 | −2.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 1.40 | 1.10 | −0.3 |
| ci:deepseek-v4-flash | latency_overhead | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 1.46 | 1.06 | −0.4 |
| ci:deepseek-v4-flash | marks_breaking | 0.25 | 0.25 | +0.00 |
| ci:deepseek-v4-flash | splits_mixed_change | 0.50 | 1.00 | +0.50 |
| ci:deepseek-v4-flash | tokens p50 | 989 | 1805 | +816 |
| ci:deepseek-v4-flash | tokens total | 17867 | 29751 | +11884 |
| ci:deepseek-v4-flash | why_quality | 0.77 | 0.83 | +0.05 |
