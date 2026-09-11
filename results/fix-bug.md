# fix-bug

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | finds_the_fix | 0.85 | 0.85 | +0.00 |
| ci:deepseek-v4-flash | no_invented_file_refs | 0.90 | 0.95 | +0.05 |
| ci:deepseek-v4-flash | proportionate_fix | 0.78 | 0.75 | −0.03 |
| ci:deepseek-v4-flash | regression_proof | 0.23 | 0.85 | +0.62 |
| ci:deepseek-v4-flash | root_cause_depth | 0.86 | 0.87 | +0.01 |
| ci:deepseek-v4-flash | tokens p50 | 40184 | 524996 | +484812 |
| ci:deepseek-v4-flash | tokens total | 3117998 | 15125992 | +12007994 |
