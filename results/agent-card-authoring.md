# agent-card-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | capabilities_match_brief | 0.00 | 0.83 | +0.83 |
| ci:deepseek-v4-flash | contract_shape | 0.00 | 0.17 | +0.17 |
| ci:deepseek-v4-flash | latency max (s) | 35.00 | 57.20 | +22.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 14.70 | 28.60 | +13.9 |
| ci:deepseek-v4-flash | latency_s | 15.89 | 30.91 | +15.0 |
| ci:deepseek-v4-flash | no_fabrication | 0.00 | 0.17 | +0.17 |
| ci:deepseek-v4-flash | security_scheme_matches_brief | 0.00 | 1.00 | +1.00 |
| ci:deepseek-v4-flash | tokens p50 | 819 | 11106 | +10287 |
| ci:deepseek-v4-flash | tokens total | 10461 | 120091 | +109630 |
