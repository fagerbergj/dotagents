# agents-md-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | cited_facts_exist | 0.80 | 0.78 | −0.02 |
| ci:deepseek-v4-flash | discoverability_filter | 0.76 | 0.81 | +0.05 |
| ci:deepseek-v4-flash | latency max (s) | 51.10 | 65.90 | +14.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 22.70 | 13.80 | −8.9 |
| ci:deepseek-v4-flash | latency_s | 24.21 | 17.74 | −6.5 |
| ci:deepseek-v4-flash | length_proportionate | 0.94 | 1.00 | +0.06 |
| ci:deepseek-v4-flash | nested_not_redundant | 0.86 | 1.00 | +0.14 |
| ci:deepseek-v4-flash | says_nothing_else | 0.75 | 0.67 | −0.08 |
| ci:deepseek-v4-flash | states_critical_fact | 0.92 | 0.83 | −0.08 |
| ci:deepseek-v4-flash | tokens p50 | 7655 | 9181 | +1526 |
| ci:deepseek-v4-flash | tokens total | 165542 | 289560 | +124018 |
