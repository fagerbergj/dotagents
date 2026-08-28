# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency max (s) | 19.50 | 16.70 | 20.10 | 14.70 | −4.8 |
| ci:deepseek-v4-flash | latency p50 (s) | 2.90 | 4.90 | 5.80 | 6.30 | +3.4 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 4.36 | 6.91 | 7.83 | 6.84 | +2.5 |
| ci:deepseek-v4-flash | no_invented_identifiers | 0.93 | 0.93 | 0.93 | 0.87 | −0.07 |
| ci:deepseek-v4-flash | pr_quality | 0.47 | 1.00 | 0.83 | 0.92 | +0.45 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.97 | 0.98 | −0.02 |
| ci:deepseek-v4-flash | restraint | 1.00 | 0.86 | 0.67 | 0.78 | −0.22 |
| ci:deepseek-v4-flash | tokens p50 | 836 | 2090 | 2180 | 2162 | +1326 |
| ci:deepseek-v4-flash | tokens total | 13559 | 36499 | 35133 | 34752 | +21193 |
