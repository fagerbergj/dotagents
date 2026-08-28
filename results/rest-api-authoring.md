# rest-api-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | compatibility | 0.60 | 1.00 | +0.40 |
| ci:deepseek-v4-flash | contract_requirements | 0.78 | 1.00 | +0.22 |
| ci:deepseek-v4-flash | contract_shape | 0.67 | 0.92 | +0.25 |
| ci:deepseek-v4-flash | contract_valid | 0.83 | 0.83 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.40 | 0.60 | +0.20 |
| ci:deepseek-v4-flash | design_quality | 0.45 | 0.57 |  |
| ci:deepseek-v4-flash | latency max (s) | 30.60 | 114.90 | +84.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 6.30 | 31.70 | +25.4 |
| ci:deepseek-v4-flash | latency_s | 10.85 | 40.75 | +29.9 |
| ci:deepseek-v4-flash | resource_modeling | 0.83 | 1.00 | +0.17 |
| ci:deepseek-v4-flash | tokens p50 | 832 | 11804 | +10972 |
| ci:deepseek-v4-flash | tokens total | 14109 | 245555 | +231446 |
