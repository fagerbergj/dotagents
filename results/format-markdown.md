# format-markdown

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | heading_hierarchy | 0.92 | 1.00 | +0.08 |
| ci:deepseek-v4-flash | preserved | 0.33 | 0.83 | +0.50 |
| ci:deepseek-v4-flash | readability | 0.47 | 0.88 | +0.42 |
| ci:deepseek-v4-flash | tokens p50 | 378 | 1029 | +651 |
| ci:deepseek-v4-flash | tokens total | 5222 | 13118 | +7896 |
| ci:deepseek-v4-flash | unchanged_when_clean | 0.10 | 0.73 | +0.63 |
