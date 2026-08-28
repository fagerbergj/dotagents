# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 5.30 | 16.70 | 20.10 | 16.50 | +11.2 |
| ci:deepseek-v4-flash | latency p50 (s) | 2.30 | 4.90 | 5.80 | 4.80 | +2.5 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 2.76 | 6.91 | 7.83 | 5.81 | +3.0 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | 0.93 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | pr_quality | 0.57 | 1.00 | 0.83 | 0.72 | +0.15 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.97 | 0.94 | −0.06 |
| ci:deepseek-v4-flash | restraint | 1.00 | 0.86 | 0.67 | 0.76 | −0.24 |
| ci:deepseek-v4-flash | tokens p50 | 840 | 2090 | 2180 | 2208 | +1368 |
| ci:deepseek-v4-flash | tokens total | 13612 | 36499 | 35133 | 35158 | +21546 |
