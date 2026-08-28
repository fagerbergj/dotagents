# agents-md-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | cited_facts_exist | 0.53 | 0.41 | −0.13 |
| ci:deepseek-v4-flash | discoverability_filter | 0.75 | 0.77 | +0.02 |
| ci:deepseek-v4-flash | latency max (s) | 67.20 | 56.80 | −10.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 7.40 | 18.30 | +10.9 |
| ci:deepseek-v4-flash | latency_s | 17.65 | 21.69 | +4.0 |
| ci:deepseek-v4-flash | nested_not_redundant | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | tokens p50 | 2436 | 15407 | +12971 |
| ci:deepseek-v4-flash | tokens total | 215098 | 411420 | +196322 |
