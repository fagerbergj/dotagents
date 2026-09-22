# slop-detection

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | clone_ratio_reduced | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | names_defect | 0.00 | 0.67 | +0.67 |
| ci:deepseek-v4-flash | restraint | 0.00 | 1.00 | +1.00 |
| ci:deepseek-v4-flash | single_use_vars_reduced | 1.00 | 0.00 | −1.00 |
| ci:deepseek-v4-flash | tokens p50 | 928 | 9315 | +8387 |
| ci:deepseek-v4-flash | tokens total | 4085 | 49337 | +45252 |
