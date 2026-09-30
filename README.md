# TradingCustomIndicators
Custom indicators that i've made (utlised agentic AI with my own analysis)

## Indicators

| Platform | Indicator | What it is |
|---|---|---|
| Tradovate | [`tradovate/mnqDonchianBot.js`](tradovate/mnqDonchianBot.js) | MNQ Donchian breakout on a 2-minute chart: signals, stop-entry, bracket, fills and exits, with the 2026 rules. See [`tradovate/README.md`](tradovate/README.md). |
| Tradovate | [`tradovate/evidenceSRLevels.js`](tradovate/evidenceSRLevels.js) | Support/resistance from volume (HVN zones, POCs) plus break-prone stop-cluster levels (round numbers, prior high/low, overnight high/low), each kept only if it beat random levels on 5 years of MNQ data. Adapts to the chart timeframe. See [`tradovate/README.md`](tradovate/README.md#evidencesrlevelsjs--evidence-based-sr-levels). |
