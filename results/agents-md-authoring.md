# agents-md-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | cited_facts_exist | 0.48 | 0.42 | −0.06 |
| ci:deepseek-v4-flash | discoverability_filter | 0.76 | 0.81 | +0.05 |
| ci:deepseek-v4-flash | latency max (s) | 51.10 | 65.90 | +14.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 22.70 | 13.80 | −8.9 |
| ci:deepseek-v4-flash | latency_s | 24.21 | 17.74 | −6.5 |
| ci:deepseek-v4-flash | nested_not_redundant | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | tokens p50 | 6077 | 9469 | +3392 |
| ci:deepseek-v4-flash | tokens total | 216255 | 274221 | +57966 |
