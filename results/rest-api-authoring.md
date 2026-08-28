# rest-api-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | compatibility | 0.80 | 0.80 | +0.00 |
| ci:deepseek-v4-flash | contract_requirements | 0.72 | 0.89 | +0.17 |
| ci:deepseek-v4-flash | contract_shape | 0.75 | 1.00 | +0.25 |
| ci:deepseek-v4-flash | contract_valid | 0.83 | 0.75 | −0.08 |
| ci:deepseek-v4-flash | control_quality | 0.25 | 0.60 | +0.35 |
| ci:deepseek-v4-flash | design_quality | 0.53 | 0.60 |  |
| ci:deepseek-v4-flash | latency max (s) | 79.70 | 100.40 | +20.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 8.20 | 51.00 | +42.8 |
| ci:deepseek-v4-flash | latency_s | 15.14 | 52.86 | +37.7 |
| ci:deepseek-v4-flash | resource_modeling | 0.83 | 1.00 | +0.17 |
| ci:deepseek-v4-flash | tokens p50 | 692 | 19159 | +18467 |
| ci:deepseek-v4-flash | tokens total | 13182 | 278848 | +265666 |
