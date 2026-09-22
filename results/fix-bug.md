# fix-bug

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0.2 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | finds_the_fix | 0.88 | 0.90 | +0.03 |
| ci:deepseek-v4-flash | no_invented_file_refs | 1.00 | 0.95 | −0.05 |
| ci:deepseek-v4-flash | proportionate_fix | 0.78 | 0.82 | +0.05 |
| ci:deepseek-v4-flash | regression_proof | 0.45 | 0.70 | +0.25 |
| ci:deepseek-v4-flash | root_cause_depth | 0.80 | 0.77 | −0.03 |
| ci:deepseek-v4-flash | tokens p50 | 92750 | 736508 | +643758 |
| ci:deepseek-v4-flash | tokens total | 3157907 | 13651782 | +10493875 |
