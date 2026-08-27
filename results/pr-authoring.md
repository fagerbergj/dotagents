# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 15.30 | 16.70 | +1.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.10 | 4.90 | +1.8 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 4.77 | 6.91 | +2.1 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | −0.07 |
| ci:deepseek-v4-flash | pr_quality | 0.73 | 1.00 | +0.27 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | −0.14 |
| ci:deepseek-v4-flash | restraint | 0.88 | 0.86 | −0.02 |
| ci:deepseek-v4-flash | tokens p50 | 850 | 2090 | +1240 |
| ci:deepseek-v4-flash | tokens total | 13717 | 36499 | +22782 |
