# mermaid-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | diagram_choice | 0.81 | 0.97 | +0.16 |
| ci:deepseek-v4-flash | mermaid_renders | 0.90 | 0.94 | +0.03 |
| ci:deepseek-v4-flash | semantic_quality | 0.89 | 0.94 |  |
| ci:deepseek-v4-flash | tokens p50 | 266 | 19036 | +18770 |
| ci:deepseek-v4-flash | tokens total | 8208 | 547023 | +538815 |
