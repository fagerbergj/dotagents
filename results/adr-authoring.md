# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 0.86 | 1.00 | +0.14 |
| ci:deepseek-v4-flash | control_quality | 0.67 | 1.00 | +0.33 |
| ci:deepseek-v4-flash | latency max (s) | 13.90 | 31.40 | +17.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.10 | 14.70 | +9.6 |
| ci:deepseek-v4-flash | latency_s | 5.91 | 16.45 | +10.5 |
| ci:deepseek-v4-flash | no_invented_specifics | 0.88 | 0.63 | −0.25 |
| ci:deepseek-v4-flash | semantic_quality | 0.91 | 0.94 | +0.03 |
| ci:deepseek-v4-flash | tokens p50 | 533 | 4865 | +4332 |
| ci:deepseek-v4-flash | tokens total | 6203 | 56610 | +50407 |
