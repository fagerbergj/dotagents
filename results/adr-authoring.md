# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.80 | 0.94 | +0.13 |
| ci:deepseek-v4-flash | latency max (s) | 8.90 | 22.60 | +13.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 3.80 | 17.10 | +13.3 |
| ci:deepseek-v4-flash | latency_s | 4.42 | 17.50 | +13.1 |
| ci:deepseek-v4-flash | semantic_quality | 0.71 | 0.89 | +0.17 |
| ci:deepseek-v4-flash | tokens p50 | 422 | 4992 | +4570 |
| ci:deepseek-v4-flash | tokens total | 5440 | 65868 | +60428 |
