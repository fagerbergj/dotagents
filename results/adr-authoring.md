# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 0.71 | 1.00 | +0.29 |
| ci:deepseek-v4-flash | control_quality | 0.60 | 0.60 | −0.00 |
| ci:deepseek-v4-flash | latency max (s) | 13.90 | 31.40 | +17.5 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.10 | 14.70 | +9.6 |
| ci:deepseek-v4-flash | latency_s | 5.91 | 16.45 | +10.5 |
| ci:deepseek-v4-flash | no_invented_specifics | 0.88 | 0.88 | +0.00 |
| ci:deepseek-v4-flash | semantic_quality | 0.89 | 0.97 | +0.09 |
| ci:deepseek-v4-flash | tokens p50 | 431 | 4852 | +4421 |
| ci:deepseek-v4-flash | tokens total | 5952 | 63947 | +57995 |
