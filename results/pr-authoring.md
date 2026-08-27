# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 11.00 | 16.70 | 10.20 | −0.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 2.50 | 4.90 | 4.50 | +2.0 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 3.58 | 6.91 | 5.00 | +1.4 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | 0.87 | −0.13 |
| ci:deepseek-v4-flash | pr_quality | 0.93 | 1.00 | 0.98 | +0.05 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.92 | −0.08 |
| ci:deepseek-v4-flash | restraint | 0.86 | 0.86 | 0.78 | −0.08 |
| ci:deepseek-v4-flash | tokens p50 | 837 | 2090 | 2219 | +1382 |
| ci:deepseek-v4-flash | tokens total | 13524 | 36499 | 35371 | +21847 |
