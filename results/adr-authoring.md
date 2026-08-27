# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.47 | 1.00 | +0.53 |
| ci:deepseek-v4-flash | latency max (s) | 120.90 | 26.40 | −94.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 4.10 | 15.30 | +11.2 |
| ci:deepseek-v4-flash | latency_s | 16.77 | 15.03 | −1.7 |
| ci:deepseek-v4-flash | semantic_quality | 0.66 | 0.91 | +0.26 |
| ci:deepseek-v4-flash | tokens p50 | 438 | 4980 | +4542 |
| ci:deepseek-v4-flash | tokens total | 5337 | 72870 | +67533 |
