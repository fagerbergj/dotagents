# rest-api-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | compatibility | 0.60 | 1.00 | +0.40 |
| ci:deepseek-v4-flash | contract_requirements | 0.63 | 0.94 | +0.31 |
| ci:deepseek-v4-flash | contract_shape | 0.73 | 1.00 | +0.27 |
| ci:deepseek-v4-flash | contract_valid | 0.64 | 0.82 | +0.18 |
| ci:deepseek-v4-flash | control_quality | 0.40 | 0.50 | +0.10 |
| ci:deepseek-v4-flash | design_quality | 0.40 | 0.48 |  |
| ci:deepseek-v4-flash | latency max (s) | 39.10 | 66.10 | +27.0 |
| ci:deepseek-v4-flash | latency p50 (s) | 9.10 | 40.80 | +31.7 |
| ci:deepseek-v4-flash | latency_s | 13.65 | 37.36 | +23.7 |
| ci:deepseek-v4-flash | resource_modeling | 0.64 | 1.00 | +0.36 |
| ci:deepseek-v4-flash | tokens p50 | 651 | 15779 | +15128 |
| ci:deepseek-v4-flash | tokens total | 12475 | 243430 | +230955 |
