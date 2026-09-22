# agents-md-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | cited_facts_exist | 0.79 | 0.91 | +0.11 |
| ci:deepseek-v4-flash | discoverability_filter | 0.76 | 0.81 | +0.05 |
| ci:deepseek-v4-flash | latency max (s) | 51.10 | 65.90 | +14.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 22.70 | 13.80 | −8.9 |
| ci:deepseek-v4-flash | latency_s | 24.21 | 17.74 | −6.5 |
| ci:deepseek-v4-flash | length_proportionate | 0.95 | 1.00 | +0.05 |
| ci:deepseek-v4-flash | nested_not_redundant | 0.97 | 1.00 | +0.03 |
| ci:deepseek-v4-flash | says_nothing_else | 0.42 | 0.54 | +0.12 |
| ci:deepseek-v4-flash | states_critical_fact | 0.67 | 0.58 | −0.08 |
| ci:deepseek-v4-flash | tokens p50 | 4921 | 9299 | +4378 |
| ci:deepseek-v4-flash | tokens total | 298058 | 291465 | −6593 |
