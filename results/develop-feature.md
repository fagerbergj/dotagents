# develop-feature

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | names_existing_solution | 0.72 | 0.83 | +0.11 |
| ci:deepseek-v4-flash | plan_quality | 0.69 | 1.00 | +0.31 |
| ci:deepseek-v4-flash | recognizes_existing | 0.35 | 0.45 | +0.10 |
| ci:deepseek-v4-flash | tests_as_gate | 0.10 | 0.45 | +0.35 |
| ci:deepseek-v4-flash | tokens p50 | 186582 | 138537 | −48045 |
| ci:deepseek-v4-flash | tokens total | 3341546 | 3113580 | −227966 |
