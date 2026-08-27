# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 0.86 | 1.00 | +0.14 |
| ci:deepseek-v4-flash | control_quality | 0.67 | 0.87 | +0.20 |
| ci:deepseek-v4-flash | latency max (s) | 79.20 | 24.00 | −55.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 4.20 | 15.30 | +11.1 |
| ci:deepseek-v4-flash | latency_s | 11.24 | 15.73 | +4.5 |
| ci:deepseek-v4-flash | semantic_quality | 0.80 | 0.94 | +0.14 |
| ci:deepseek-v4-flash | tokens p50 | 421 | 5004 | +4583 |
| ci:deepseek-v4-flash | tokens total | 5210 | 67499 | +62289 |
