# pr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@unversioned | skill@1.0.1 | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | coverage | 0.72 | – | – | 0.80 | +0.08 |
| ci:deepseek-v4-flash | latency max (s) | 9.60 | 16.70 | 20.10 | 12.00 | +2.4 |
| ci:deepseek-v4-flash | latency p50 (s) | 2.70 | 4.90 | 5.80 | 3.70 | +1.0 |
| ci:deepseek-v4-flash | latency_ceiling | 1.00 | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency_s | 3.23 | 6.91 | 7.83 | 4.66 | +1.4 |
| ci:deepseek-v4-flash | no_invented_identifiers | 1.00 | 0.93 | 0.93 | 0.90 | −0.10 |
| ci:deepseek-v4-flash | pr_quality | 0.65 | 1.00 | 0.83 | 0.82 | +0.17 |
| ci:deepseek-v4-flash | proportionality | 1.00 | 0.86 | 0.97 | 1.00 |  |
| ci:deepseek-v4-flash | restraint | 1.00 | 0.86 | 0.67 | 0.75 | −0.25 |
| ci:deepseek-v4-flash | tokens p50 | 1227 | 2090 | 2180 | 2419 | +1192 |
| ci:deepseek-v4-flash | tokens total | 31618 | 36499 | 35133 | 44387 | +12769 |
