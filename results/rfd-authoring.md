# rfd-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | skill@1.0.1 | Δ |
| --- | --- | ---: | ---: | ---: | ---: |
| ci:deepseek-v4-flash | control_quality | 0.67 | 0.07 | 0.20 | −0.47 |
| ci:deepseek-v4-flash | finds_the_decision | 0.20 | 0.46 | 0.76 | +0.56 |
| ci:deepseek-v4-flash | framing_quality | 0.63 | 0.72 | 0.85 | +0.22 |
| ci:deepseek-v4-flash | latency | 1.00 | 1.00 | 1.00 | +0.0 |
| ci:deepseek-v4-flash | latency max (s) | 16.90 | – | 30.60 | +13.7 |
| ci:deepseek-v4-flash | latency p50 (s) | 5.30 | – | 10.10 | +4.8 |
| ci:deepseek-v4-flash | latency_s | 6.54 | – | 13.71 | +7.2 |
| ci:deepseek-v4-flash | stays_open | 0.77 | 1.00 | 1.00 | +0.23 |
| ci:deepseek-v4-flash | tokens p50 | 434 | 2094 | 2264 | +1830 |
| ci:deepseek-v4-flash | tokens total | 8330 | 54084 | 58724 | +50394 |
