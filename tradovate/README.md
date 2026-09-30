# Tradovate indicators

## `mnqDonchianBot.js` — MNQ Donchian breakout, 2026 rules

A custom indicator for a **2-minute MNQ chart** that draws what my Donchian breakout bot sees and does: the channel, every signal, the stop-entry order it places, the bracket, the fill and the exit.

It uses the 2026 version of the rules:

- **7 lots** per trade (was 8)
- **4 lots** once the day's RTH range has already covered 90% of its average (the mean RTH range of the previous 10 sessions)
- **40-minute exit**: if a trade has not moved +1 ATR in its favour by the 20th bar after entry, it is closed at the next open

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `mnqDonchianBot.js` and save.
3. Add it to a 2-minute MNQ chart from the indicator list (tagged **MNQ bot**).

### Chart setup

- **Include the overnight session.** The channel, ATR and ADX run over every bar, overnight included. An RTH-only chart gives different signals.
- **Load at least 11 days.** The late-day size rule compares today's range with the previous 10 sessions, and the slow-trend rescue needs 1,500 bars behind a signal.
- **One check on first load:** signals should sit on the candle whose close broke the channel. If everything looks one candle late, turn on `barTimeIsClose` (Tradovate is then stamping bars at their close rather than their open).

### Reading it

| On the chart | Meaning |
|---|---|
| `▲ BUY 7` / `▼ SELL 7` | A signal, and the order it places: side and size |
| `△` / `▽` … `· trend` | Let through by the slow-trend rescue (efficiency 0.45–0.5 with the 2-min EMA 125 on the breakout's side of the EMA 500) |
| `· range 96%` | 4 lots instead of 7: the day had already covered 96% of its average range |
| `· moves stop` | An earlier stop-entry is still resting; this signal moves it to the new level |
| `· flip` | Reverses an open trade |
| bare `▲` / `▼` | A signal that will not place an order (already in that trade, or too late in the session) |
| gold line + `BUY STOP` | The stop-entry: signal close ± 0.15 ATR. Starts **on the signal candle** |
| red line + `SL`, green line + `TP` | The bracket, at the tick prices the orders rest at |
| `● BOUGHT 7 @ price` | The fill (`(limit)` when a refused stop was re-placed as a limit) |
| dashed orange line | The 40-minute checkpoint: fill ± 1 ATR |
| `TP +$612`, `SL -$998`, `TIME 40m -$84`, `FLIP`, `FLAT` | The exit and the trade's dollars (after $0.75/side commission, no slippage) |
| `no fill` | A stop-entry that expired |

A line that stops after one candle means the order it shows was never placed: an earlier stop-entry on the same side filled on the next candle first.

### What it cannot see

It has no access to your account, so it draws every trade as if the day were flat. It does not model:

- the $500 circuit breaker and $750 profit block, which stop new orders once the day's realised P&L crosses them;
- the $1,000 day cap tightening the stop after a loss earlier in the day.

A signal the bot skipped is usually one of those.

### Notes

- Verified outside Tradovate against the bot's golden test file and seven years of MNQ data, including every 2026-rule trade against the research engine (34 checks). The research and verification files named in the code's header live in my separate backtesting project.
- Not verified inside Tradovate itself: the label placement uses Tradovate's pixel offsets and left/right text alignment. If labels look misplaced, turn off `showLineLabels`; the lines and markers still draw.

## `evidenceSRLevels.js` — Evidence-based S/R levels

A custom indicator that draws volume-based support and resistance. It only includes level types that behaved differently from random price levels when tested on 5 years of MNQ 1-minute data (2021-07 to 2026-07).

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `evidenceSRLevels.js` and save.
3. Add **Evidence-Based S/R Levels** to any chart. It overlays the price pane and works on any timeframe.

### Chart setup

- **Include the overnight session** on intraday charts. ONH/ONL need the overnight bars.
- **Load enough history** for the lookback: about 25 days intraday, about 4 months on 1H/4H, about 14 months on daily.
- **ES/MES:** set `binSize` to 0.25 and `roundStep` to 25. The defaults (1.0 and 100) are for NQ/MNQ.

### Reading it

| On the chart | Group | Measured vs random levels |
|---|---|---|
| teal band + `HVN 20s 21585.5` | **Hold:** high-volume node of the lookback profile | +4.1 to +4.3 pp more bounces |
| gold line + `POC 5s 21775.5` | **Hold:** point of control of the recent profile | +5.6 to +5.8 pp |
| orange line + `pdPOC 21785.75` | **Hold:** prior period's point of control | +1.7 to +5.8 pp |
| red dashed + `PDH 21860 break-prone` | **Break-prone:** prior-period high/low, overnight high/low | −1 to −6 pp (breaks more) |
| grey dashed + `R100 21800` | **Break-prone:** round numbers | −3.1 to −4.6 pp (breaks more) |

"Break-prone" levels are stop clusters. Price broke through them more often than through random levels, so don't fade them blindly. When levels sit within about 1.5% of the typical range of each other, they share one label, e.g. `POC 3M 29342.5 | HVN 12M 29340.75`.

### Timeframe adaptation

The indicator detects the bar size from the bar timestamps and picks the scale. `levelScale` overrides it.

| Chart bars | Scale | Prior-period levels | POC / HVN lookback | Round step (MNQ) |
|---|---|---|---|---|
| tick, 1–30 min | Session | PDH / PDL (RTH), ONH / ONL, pdPOC | 5 / 20 sessions | 100 |
| 1H – 4H | Week | PWH / PWL, pwPOC | 4 / 12 weeks | 500 |
| daily and up | Month | PMH / PML, pmPOC | 3 / 12 months | 1000 |

On bars coarser than 1 minute, the indicator uses Tradovate's per-bar volume-at-price, requested via `requirements: { volumeProfiles: true }`. Spreading each bar's volume evenly across its range gets worse as bars get bigger. In testing, 30-minute bars matched only 49% of the 1-minute HVNs that way, versus 100% with volume-at-price. If the platform doesn't supply the data, the indicator falls back to the even spread.

### What the research found

- **Method.** Each real level was scored against 4 random "twin" levels at the same time of day, using a day-clustered bootstrap and about 470k touches per run. This follows Osler's method.
- **Excluded.** Order blocks, fair value gaps, swing highs/lows, RTH VWAP, LVNs and VAH/VAL were no better than random, so they're left out. Order blocks were tested as a break of structure plus a displacement candle, with the last opposite candle as the block.
- **These are context levels, not a strategy.** The best hold level nets about $1–2 per touch after costs. Breakouts through the break-prone levels come out around breakeven.
- **2026 is too thin to confirm the hold edge**, with only about 35–70 POC/HVN touches. The round-number and overnight-high break effect did hold in 2026.
- **Only the Session scale was tested.** Week and Month apply the same definitions to longer periods but haven't been measured.

### Notes

- Verified outside Tradovate. On 12 real days from 2021 to 2026, the 1-minute levels are identical to the research code. Live-bar updates don't double-count. 5m, 15m, 30m, 1H, 4H and daily charts pick the right scale, and every drawn line carries a label. The research and test files live in my separate `tradovate_levels` project.
- Not verified inside Tradovate itself. The shaded zones, label alignment, dashed styles and the volume-at-price request are written from Tradovate's API docs. If labels look misplaced, try `labelSide`, `labelOffsetPx`, or turn off `showLabels`; the lines still draw.
