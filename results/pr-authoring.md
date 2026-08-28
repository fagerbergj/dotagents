# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 15.20 | 16.70 | 20.10 | +4.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.20 | 4.90 | 5.80 | +2.6 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 5.11 | 6.91 | 7.83 | +2.7 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | 0.93 | −0.07 |
| ci:deepseek-v4-flash | pr_quality | 0.65 | 1.00 | 0.83 | +0.18 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.97 | −0.03 |
| ci:deepseek-v4-flash | restraint | 0.96 | 0.86 | 0.67 | −0.29 |
| ci:deepseek-v4-flash | tokens p50 | 866 | 2090 | 2180 | +1314 |
| ci:deepseek-v4-flash | tokens total | 13570 | 36499 | 35133 | +21563 |
