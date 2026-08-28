# mermaid-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | diagram_choice | 0.81 | 0.90 | +0.10 |
| ci:deepseek-v4-flash | latency max (s) | 40.50 | 65.40 | +24.9 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.70 | 16.20 | +12.5 |
| ci:deepseek-v4-flash | latency_s | 8.47 | 22.01 | +13.5 |
| ci:deepseek-v4-flash | mermaid_renders | 0.90 | 0.87 | −0.03 |
| ci:deepseek-v4-flash | semantic_quality | 0.95 | 0.85 |  |
| ci:deepseek-v4-flash | tokens p50 | 255 | 18469 | +18214 |
| ci:deepseek-v4-flash | tokens total | 8861 | 477810 | +468949 |
