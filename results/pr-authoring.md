# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 25.90 | 16.70 | 30.80 | +4.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.50 | 4.90 | 4.40 | +0.9 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 6.04 | 6.91 | 6.94 | +0.9 |
| ci:deepseek-v4-flash | no_invented_identifiers | 0.93 | 0.93 | 0.93 | +0.00 |
| ci:deepseek-v4-flash | pr_quality | 1.00 | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.93 | −0.07 |
| ci:deepseek-v4-flash | restraint | 1.00 | 0.86 | 1.22 | +0.22 |
| ci:deepseek-v4-flash | tokens p50 | 838 | 2090 | 2222 | +1384 |
| ci:deepseek-v4-flash | tokens total | 13572 | 36499 | 35269 | +21697 |
