# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 0.86 | 1.00 | +0.14 |
| ci:deepseek-v4-flash | control_quality | 0.60 | 1.00 | +0.40 |
| ci:deepseek-v4-flash | latency max (s) | 24.90 | 24.90 | +0.0 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.30 | 17.20 | +11.9 |
| ci:deepseek-v4-flash | latency_s | 7.58 | 18.17 | +10.6 |
| ci:deepseek-v4-flash | semantic_quality | 0.80 | 0.83 | +0.03 |
| ci:deepseek-v4-flash | tokens p50 | 464 | 4869 | +4405 |
| ci:deepseek-v4-flash | tokens total | 5504 | 69140 | +63636 |
