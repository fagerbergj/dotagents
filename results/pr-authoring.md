# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 16.60 | 16.70 | 20.10 | 15.50 | −1.1 |
| ci:deepseek-v4-flash | latency p50 (s) | 2.40 | 4.90 | 5.80 | 5.60 | +3.2 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 4.33 | 6.91 | 7.83 | 6.89 | +2.6 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | 0.93 | 0.73 | −0.27 |
| ci:deepseek-v4-flash | pr_quality | 0.35 | 1.00 | 0.83 | 0.88 | +0.53 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.97 | 0.94 | −0.06 |
| ci:deepseek-v4-flash | restraint | 1.00 | 0.86 | 0.67 | 0.73 | −0.27 |
| ci:deepseek-v4-flash | tokens p50 | 838 | 2090 | 2180 | 2181 | +1343 |
| ci:deepseek-v4-flash | tokens total | 13592 | 36499 | 35133 | 35218 | +21626 |
