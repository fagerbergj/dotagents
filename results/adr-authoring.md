# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.60 | 1.00 | +0.40 |
| ci:deepseek-v4-flash | latency max (s) | 18.30 | 25.50 | +7.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.60 | 19.30 | +12.7 |
| ci:deepseek-v4-flash | latency_s | 8.27 | 18.94 | +10.7 |
| ci:deepseek-v4-flash | semantic_quality | 0.86 | 0.91 | +0.06 |
| ci:deepseek-v4-flash | tokens p50 | 447 | 4828 | +4381 |
| ci:deepseek-v4-flash | tokens total | 5854 | 55242 | +49388 |
