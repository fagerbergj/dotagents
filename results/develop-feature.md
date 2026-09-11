# develop-feature

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | names_existing_solution | 0.67 | 0.83 | +0.17 |
| ci:deepseek-v4-flash | plan_quality | 0.47 | 0.81 | +0.34 |
| ci:deepseek-v4-flash | recognizes_existing | 0.55 | 0.30 | −0.25 |
| ci:deepseek-v4-flash | tests_as_gate | 0.10 | 0.45 | +0.35 |
| ci:deepseek-v4-flash | tokens p50 | 143435 | 144948 | +1513 |
| ci:deepseek-v4-flash | tokens total | 2970652 | 3742480 | +771828 |
