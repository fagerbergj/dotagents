# develop-feature

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | names_existing_solution | 0.83 | 0.89 | +0.06 |
| ci:deepseek-v4-flash | plan_quality | 0.31 | 0.59 | +0.28 |
| ci:deepseek-v4-flash | recognizes_existing | 0.50 | 0.50 | +0.00 |
| ci:deepseek-v4-flash | tests_as_gate | 0.23 | 0.55 | +0.33 |
| ci:deepseek-v4-flash | tokens p50 | 189196 | 163593 | −25603 |
| ci:deepseek-v4-flash | tokens total | 3720775 | 3588644 | −132131 |
