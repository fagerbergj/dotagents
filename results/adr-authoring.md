# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.74 | 1.00 | +0.26 |
| ci:deepseek-v4-flash | latency max (s) | 13.90 | 31.40 | +17.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.10 | 14.70 | +9.6 |
| ci:deepseek-v4-flash | latency_s | 5.91 | 16.45 | +10.5 |
| ci:deepseek-v4-flash | semantic_quality | 0.86 | 0.89 | +0.03 |
| ci:deepseek-v4-flash | tokens p50 | 462 | 5060 | +4598 |
| ci:deepseek-v4-flash | tokens total | 5765 | 69722 | +63957 |
