# TradingCustomIndicators
Custom indicators that i've made (utlised agentic AI with my own analysis)

## Indicators

| Platform | Indicator | What it is |
|---|---|---|
| Tradovate | [`tradovate/mnqDonchianBot.js`](tradovate/mnqDonchianBot.js) | MNQ Donchian breakout on a 2-minute chart: signals, stop-entry, bracket, fills and exits, with the 2026 rules. See [`tradovate/README.md`](tradovate/README.md). |
| Tradovate | [`tradovate/mnqDonchian1250.js`](tradovate/mnqDonchian1250.js) | The same Donchian breakout set up for a $1,250-target evaluation ($1,000 trailing max loss, $600 daily limit, 50% consistency): 4 lots, -$300 breaker, +$250 profit block, day rules tracked from its own trades. See [`tradovate/README.md`](tradovate/README.md#mnqdonchian1250js--mnq-donchian-for-a-1250-target-evaluation). |
| Tradovate | [`tradovate/mnqMacdFade1250.js`](tradovate/mnqMacdFade1250.js) | Fades weak RTH 1-minute MACD crosses (bounces against the short-term trend) while the market is moving, for the same $1,250-target evaluation: 4 lots, -$200 breaker, +$250 profit block. See [`tradovate/README.md`](tradovate/README.md#mnqmacdfade1250js--mnq-macd-fade-for-a-1250-target-evaluation). |
| Tradovate | [`tradovate/evidenceSRLevels.js`](tradovate/evidenceSRLevels.js) | Support/resistance from volume (HVN zones, POCs) plus break-prone stop-cluster levels (round numbers, prior high/low, overnight high/low), each kept only if it beat random levels on 5 years of MNQ data. Adapts to the chart timeframe. See [`tradovate/README.md`](tradovate/README.md#evidencesrlevelsjs--evidence-based-sr-levels). |
