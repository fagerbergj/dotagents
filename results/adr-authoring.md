# adr-authoring

Δ compares the rightmost skill column with `no-skill`. `–` means not run, never zero.

| model | metric | no-skill | skill@1.0 | Δ |
| --- | --- | ---: | ---: | ---: |
| ci:deepseek-v4-flash | adr_context | 1.00 | 1.00 | +0.00 |
| ci:deepseek-v4-flash | control_quality | 0.47 | 0.87 | +0.40 |
| ci:deepseek-v4-flash | latency max (s) | 48.60 | 21.30 | −27.3 |
| ci:deepseek-v4-flash | latency p50 (s) | 7.30 | 15.00 | +7.7 |
| ci:deepseek-v4-flash | latency_s | 17.11 | 15.13 | −2.0 |
| ci:deepseek-v4-flash | semantic_quality | 0.83 | 0.80 | −0.03 |
| ci:deepseek-v4-flash | tokens p50 | 471 | 5026 | +4555 |
| ci:deepseek-v4-flash | tokens total | 5641 | 64365 | +58724 |
