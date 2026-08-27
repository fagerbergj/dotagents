# mermaid-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | diagram_choice | 0.74 | 0.87 | +0.13 |
| ci:deepseek-v4-flash | latency max (s) | 39.40 | 59.10 | +19.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.80 | 13.90 | +10.1 |
| ci:deepseek-v4-flash | latency_s | 10.18 | 18.60 | +8.4 |
| ci:deepseek-v4-flash | mermaid_renders | 0.94 | 0.90 | −0.03 |
| ci:deepseek-v4-flash | semantic_quality | 0.87 | 0.90 |  |
| ci:deepseek-v4-flash | tokens p50 | 242 | 18526 | +18284 |
| ci:deepseek-v4-flash | tokens total | 8071 | 462196 | +454125 |
