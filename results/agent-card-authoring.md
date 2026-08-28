# agent-card-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | capabilities_match_brief | 0.17 | 0.83 | +0.67 |
| ci:deepseek-v4-flash | contract_shape | 0.00 | 0.50 | +0.50 |
| ci:deepseek-v4-flash | latency max (s) | 85.50 | 58.70 | −26.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 10.50 | 35.40 | +24.9 |
| ci:deepseek-v4-flash | latency_s | 24.06 | 34.06 | +10.0 |
| ci:deepseek-v4-flash | no_fabrication | 0.17 | 0.00 | −0.17 |
| ci:deepseek-v4-flash | security_scheme_matches_brief | 0.00 | 0.67 | +0.67 |
| ci:deepseek-v4-flash | tokens p50 | 724 | 9175 | +8451 |
| ci:deepseek-v4-flash | tokens total | 9829 | 107636 | +97807 |
