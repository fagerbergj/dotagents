# agent-card-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | capabilities_match_brief | 0.17 | 0.83 | +0.67 |
| ci:deepseek-v4-flash | contract_shape | 0.00 | 0.50 | +0.50 |
| ci:deepseek-v4-flash | latency max (s) | 28.40 | 49.10 | +20.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 10.40 | 22.50 | +12.1 |
| ci:deepseek-v4-flash | latency_s | 12.16 | 26.40 | +14.2 |
| ci:deepseek-v4-flash | no_fabrication | 0.00 | 0.17 | +0.17 |
| ci:deepseek-v4-flash | security_scheme_matches_brief | 0.00 | 0.67 | +0.67 |
| ci:deepseek-v4-flash | tokens p50 | 869 | 9034 | +8165 |
| ci:deepseek-v4-flash | tokens total | 9902 | 98895 | +88993 |
