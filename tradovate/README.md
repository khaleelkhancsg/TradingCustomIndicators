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
| orange line | The 40-minute checkpoint: fill ± 1 ATR |
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

## `mnqDonchian1250.js` — MNQ Donchian for a $1,250-target evaluation

A custom indicator for a **2-minute MNQ chart**, built for an evaluation with a **$1,250 profit target, $1,000 trailing maximum loss, $600 daily loss limit and a 50% consistency rule**. It uses the same breakout signal as `mnqDonchianBot.js`, with the smaller size and tighter day rules those account rules reward. On top of that, it only trades breakouts that go with the 10-minute EMA trend. Unlike `mnqDonchianBot.js`, it adds up the day's P&L from its own trades, so it applies the day rules and shows when the day is done.

On 2026 data (1 tick of slippage a side, $0.75/side commission) it passed **71.1%** of 21-day windows (Jan–Mar 74.3%, Apr–Jul 75.1%), against 61.3% without the EMA filter. On the actual calendar windows of 2026 it passed 74.8%.

### The 10-minute EMA filter

- **What it checks.** A breakout places an order only if the 10-minute EMA 9 is on its side of the 10-minute EMA 21, i.e. the breakout goes with the last few hours' trend. Breakouts against that trend were often false starts.
- **Why 10 minutes.** EMAs covering roughly 2.5–10 hours helped (65–76% depending on the pair). 1–3 minute EMAs agree with almost every breakout, so they add nothing, and trends spanning several sessions made results worse.
- **Fewer trades.** It mainly decides the day's first breakout, which is mostly what the day rules let through. It cut the 2026 trades from 148 to 128 (1.06 → 0.92 a session).
- **Every signal still exits.** A breakout against the trend still closes an open trade the other way and cancels a resting order the other way. It just doesn't place a new order.
- **Efficiency gate unchanged.** With the filter on, every looser efficiency setting tested did worse.

| Rule | |
|---|---|
| Signal | 2-min close outside the previous 30 bars' high/low, ADX(14) ≥ 25, efficiency(20) ≥ 0.5, on a bar opening 08:30–15:00 CT. Or the slow-trend rescue: efficiency 0.45–0.5 with the 2-min EMA 125 on the breakout's side of the EMA 500 |
| Filter | Only if the 10-minute EMA 9 is on the breakout's side of the 10-minute EMA 21 (10-minute bars built from the chart's 2-minute bars, counted once closed) |
| Size | 4 lots; 2 once the day's RTH range has covered 90% of its 10-session average |
| Entry | Stop 0.15 ATR beyond the signal close, live for 10 bars. If price is already through it, the same price goes in as a limit |
| Stop | 5 ATR from the signal close, or the price where the day would reach −$600 after commission, whichever is nearer. At 4 lots that is nearly always the $600 line (about 75 points) |
| Target | 1.75 ATR from the signal close |
| Exits | The bracket; out at the next open if the trade is not +1 ATR by the 20th bar after entry (40 minutes); an opposite signal; flat at 15:04 CT. The 40-minute exit and the opposite signal happen at the next open, before that bar can touch the stop or target |
| Day | No new orders once the day is −$300 (breaker), +$250 (profit block) or at the −$600 limit |

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `mnqDonchian1250.js` and save.
3. Add it to a 2-minute MNQ chart from the indicator list (tagged **MNQ bot**).

### Chart setup

- **Include the overnight session.** The channel, ATR, ADX and EMAs run over every bar, overnight included. An RTH-only chart gives different signals.
- **Load at least 11 days.** The late-day size rule compares today's range with the previous 10 sessions, the slow-trend rescue needs 1,500 bars behind a signal, and the 10-minute EMAs need a few hours to settle.
- **One check on first load:** signals should sit on the candle whose close broke the channel. If everything looks one candle late, turn on `barTimeIsClose`.

### Reading it

| On the chart | Meaning |
|---|---|
| `▲ BUY 4` / `▼ SELL 4` | A signal, and the order it places: side and size |
| `△` / `▽` … `· trend` | Let through by the slow-trend rescue |
| `· range 93%` | 2 lots instead of 4: the day had already covered 93% of its average range |
| `· moves stop if unfilled` | A stop-entry on the same side is still resting. It keeps the next candle; if it has not filled by then, it moves to the new level |
| `· cancels sell stop` | A stop-entry resting the other way is cancelled at the next open |
| `· flip` | Reverses an open trade |
| grey `▲ vs 10m trend` | A breakout against the 10-minute EMA trend: not traded. With `· closes trade` it still exits the open trade, and with `· cancels sell stop` it cancels the resting order. `showSkipped` off hides the ones that do neither |
| `▼ · closes trade` | Closes the open trade at the next open but places no new order (too late in the session, or that trade's result ends the day) |
| bare `▲` / `▼` | A signal that places nothing: already in that trade, or too late in the session |
| blue and purple lines | The 10-minute EMA 9 and 21 (`showEma`) |
| gold line + `BUY STOP` | The stop-entry: signal close ± 0.15 ATR. Starts **on the signal candle** |
| red line + `SL`, green line + `TP` | The bracket, at the tick prices the orders rest at. `· day limit` when the $600 line sets the stop |
| `● BOUGHT 4 @ price` | The fill (`(limit)` when a refused stop was re-placed as a limit) |
| orange line | The 40-minute checkpoint: fill ± 1 ATR |
| `TP +$324`, `SL -$594 · day limit`, `TIME 40m -$84`, `FLIP`, `FLAT` | The exit and the trade's dollars (after $0.75/side commission, no slippage) |
| `DAY DONE +$324 (profit block)` | The day is done: profit block, breaker or daily limit. Later signals that day are not drawn |
| `no fill` / `cancelled` | A stop-entry that expired, or that an opposite signal cancelled |

### Settings

- **The filter:** `emaFilter` (on), plus `emaTf` (10 minutes, whole 2-minute bars, so an even number), `emaFast` (9) and `emaSlow` (21). With `emaFilter` off it trades every breakout, as the first version did (60.9% in 2026).
- **Size and day rules:** `contracts`, `lateContracts`, `dayLossLimit`, `breaker` and `profitBlock`. 0 turns the breaker or the profit block off.
- **Display:** `showEma`, `showSkipped`, `showChannel`, `showTrend`, `showMarkers`, `showLineLabels` and `showCheckpoint`.

### The day rules

- It adds up the day's P&L from the trades it draws (after commission, no slippage) and starts again at the 16:00 CT session change.
- The stop goes where the day would reach −$600 after the trade's commission. After a winning trade the day has more room, so a later loss can be bigger than $600: after +$237, the stop allows −$837.
- It cannot see your account. If anything else trades the account (manual trades, another strategy), its day P&L and its stops will be wrong.

### Notes

- **Verified outside Tradovate** on seven years of MNQ data:
  - Its 10-minute EMA direction matches the research's, built separately from 1-minute bars, on every 2-minute bar.
  - In research mode it reproduces every trade of the research engine, day rules included (2,450 of 2,450).
  - The 2026 pass rate rebuilt from its own trades is the same 71.1%.
  - Every order's lines start on its signal candle, at the exact prices the order then rests at.

  The research and verification files named in the code's header live in my separate backtesting project.
- **Exit order.** A trade the 40-minute exit or an opposite signal closes goes out at the next open, before that bar can touch the stop or target; only a gap through the stop at the open comes first. The first version checked the stop and target first. Correcting it moved the 2026 result by under 0.1 point with the filter, and 0.4 without.
- **Place the orders as the lines appear.** One bar of entry delay cut the 2026 pass rate to 57.5% (51.8% without the filter).
- **Not verified inside Tradovate itself.** The label placement uses Tradovate's pixel offsets and left/right text alignment. If labels look misplaced, turn off `showLineLabels`; the lines and markers still draw.
- **Chosen on 2026 alone.** The filter was picked from 21 timeframe/EMA-pair combinations tested on 2026 (139 sessions). The whole band of good settings (65–76%) is a fairer guide than the single 71.1%.

## `mnqMacdFade1250.js` — MNQ MACD fade for a $1,250-target evaluation

A custom indicator for a **1-minute MNQ chart**, for the same evaluation rules. It trades against short pushes. When the 1-minute MACD histogram crosses zero during RTH, it takes the other side (a cross up is a sell, a cross down a buy), but only on the crosses that tend to reverse.

On 2026 data (same costs) it passed **67.7%** of 21-day windows (Jan–Mar 64.8%, Apr–Jul 73.8%). That compares with 58.6% for fading every cross, and 71.1% for `mnqDonchian1250.js`. On the actual calendar windows of 2026 it passed 57.1%.

### Which crosses it fades, and why

- **Weak crosses only.** A cross is weak when the MACD line is already on the fade's side of zero: the cross is a bounce against the short-term trend. A strong cross, with the line on the same side, is the trend resuming. That is persistent buying or selling, and it keeps going. In 2026, fading strong crosses lost $10 a trade; fading only weak ones made $66.
- **Only when the market is moving.** The 1-minute ATR must be at least the average ATR of the previous 10 sessions' 08:30–15:00 bars. A fade is paid for absorbing a burst of one-sided orders, and that pays when volatility is high. In quiet conditions, fades lost $23 a trade.
- **Every cross still exits.** A strong or quiet cross closes an open trade at the next open and cancels a resting order the other way. It just doesn't place a new order.

| Rule | |
|---|---|
| Signal | The MACD(12, 26, 9) histogram crosses zero on a 1-min bar opening 08:30–15:00 CT, the cross is weak, and the ATR is at least its 10-session average. The trade goes the other way: cross up → SELL, cross down → BUY |
| Size | 4 lots |
| Entry | Stop 0.15 ATR(14) beyond the signal close, live for 10 bars. If price is already through it, the same price goes in as a limit |
| Stop | 5 ATR from the signal close, or the price where the day would reach −$600 after commission, whichever is nearer |
| Target | From the stop-entry, as far as the stop is on a flat day: 5.15 ATR, at most 75 points at 4 lots |
| Exits | The next cross of any kind, at the next open, before that bar can touch the stop or target; the bracket; flat at 15:05 CT |
| Day | No new orders once the day is −$200 (breaker), +$250 (profit block) or at the −$600 limit |

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `mnqMacdFade1250.js` and save.
3. Add it to a 1-minute MNQ chart from the indicator list (tagged **MNQ bot**).

### Chart setup

- **Include the overnight session.** The MACD and ATR run over every bar. An RTH-only chart computes different crosses near the open.
- **Load at least 11 sessions.** The volatility check compares with the previous 10 sessions. Until it has them, it lets every weak cross through.
- **To see the crosses**, add Tradovate's built-in MACD (12, 26, 9) in a pane below. Its zero crosses should line up with the signals once enough bars are loaded (not checked inside Tradovate).
- **One check on first load:** a signal should sit on the candle where the histogram changed sign. If everything looks one candle late, turn on `barTimeIsClose`.

### Reading it

| On the chart | Meaning |
|---|---|
| `▲ BUY 4` / `▼ SELL 4` | A cross it fades, and the order it places. `▲ BUY` fades a cross down |
| `· flip` | Reverses the open trade |
| `· cancels sell stop` | The stop-entry resting the other way is cancelled at the next open |
| grey `▲ strong` / `▼ quiet` | A cross it does not fade. `strong` resumes the short-term trend; `quiet` came with below-normal volatility. With `· closes trade` it still exits the open trade, and with `· cancels sell stop` it cancels the resting order. `showSkipped` off hides the ones that do neither |
| `▼ · closes trade` | A cross it would fade, but that places no new order (too late in the session, or that trade's result ends the day): it only exits |
| bare `▲` / `▼` | A cross it would fade, after 14:55 CT: no new order |
| gold, red and green lines | Stop-entry, stop and target, starting **on the signal candle**. `· day limit` when the $600 line sets the stop |
| `● SOLD 4 @ price` | The fill (`(limit)` when a refused stop was re-placed as a limit) |
| `TP`, `SL`, `FLIP`, `FLAT` with dollars | The exit and the trade's dollars (after $0.75/side commission, no slippage) |
| `DAY DONE +$312 (profit block)` | The day is done. Later crosses that day are not drawn |
| `no fill` / `cancelled` | A stop-entry that expired, or that the next cross cancelled |

Most trades end at the next cross (`FLIP`): 109 of 172 in 2026. Expect none to two trades on most days; the +$250 profit block or the breaker usually ends the day early.

### Settings

- `onlyWeakCrosses` (on) and `minVolRatio` (1, meaning ATR at least 1× its 10-session average; 0 turns it off) are the two filters. With both off it fades every cross, as the first version did (58.6% in 2026).
- `contracts`, `dayLossLimit`, `breaker` and `profitBlock` are the size and the day rules.
- `showSkipped`, `showLineLabels` and `showMarkers` control the labels.

### The day rules

The same as `mnqDonchian1250.js` ([above](#the-day-rules)), with a −$200 breaker: the day's P&L comes from its own trades, and it cannot see anything else trading the account.

### Notes

- Verified outside Tradovate on seven years of MNQ data:
  - Which crosses it fades matches the research at every one of 57,712 crosses.
  - In research mode it reproduces every trade of the research engine, day rules included (4,080 of 4,080).
  - The 2026 pass rate rebuilt from its own trades is the same 67.7%.
- A flip's new order is drawn on the signal candle using that candle's close, but the flip itself happens at the next open. When the $600 line sets the stop, the stop can move by the gap between the two (usually 0–2 ticks).
- **Place the orders as the lines appear.** One bar of entry delay cut the 2026 pass rate to 45% (49% for fading every cross). The filters make it more sensitive to late entries.
- The weak-cross filter works only with the MACD line itself. Measuring "the trend" by VWAP, EMA 50/200, the 5-minute MACD or the opening drive made results worse.
- Not verified inside Tradovate itself (label placement). If labels look misplaced, turn off `showLineLabels`.
- The filters were chosen on 2026 alone (139 sessions), from about 150 variants. They held in both halves of 2026 and against random filters, but treat the pass rate as an estimate with a wide margin.

## `evidenceSRLevels.js` — Evidence-based S/R levels

A custom indicator that draws volume-based support and resistance. It only includes level types that behaved differently from random price levels when tested on 5 years of MNQ 1-minute data (2021-07 to 2026-07).

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `evidenceSRLevels.js` and save.
3. Add **Evidence-Based S/R Levels** to any chart. It overlays the price pane and works on any timeframe.

### Chart setup

- **Include the overnight session** on intraday charts. The overnight high/low need the overnight bars.
- **Load enough history** for the lookback: about 25 days intraday, about 4 months on 1H/4H, about 14 months on daily.
- **ES/MES:** set `binSize` to 0.25 and `roundStep` to 25. The defaults (1.0 and 100) are for NQ/MNQ.

### Reading it

| On the chart | Group | Measured vs random levels |
|---|---|---|
| teal band + `High Volume Node (20 sessions) 21585.25` | **Hold:** high-volume node of the lookback profile | +4.1 to +4.3 pp more bounces |
| gold line + `Point of Control (5 sessions) 21775.5` | **Hold:** point of control of the recent profile | +5.6 to +5.8 pp |
| orange line + `Prior Day Point of Control 21785.75` | **Hold:** prior period's point of control | +1.7 to +5.8 pp |
| red dashed + `Prior Day High 21871.25 (break-prone)` | **Break-prone:** prior-day high/low, overnight high/low (weekly/monthly highs and lows are neutral, drawn grey) | −1 to −6 pp (breaks more) |
| grey dashed + `Round Number 21800 (break-prone)` | **Break-prone:** round numbers | −3.1 to −4.6 pp (breaks more) |

"Break-prone" levels are stop clusters. Price broke through them more often than through random levels, so don't fade them blindly. When levels sit within about 1.5% of the typical range of each other, they share one label, e.g. `Point of Control (3 months) 29342.5 | High Volume Node (12 months) 29340.75`.

### Levels are fixed; broken levels stay

A level never moves once it's set. That matches the research, where every level was known before price reached it. All levels are recomputed when a new period starts.

- **Overnight high/low** are drawn only from 09:30 ET, when the overnight session is over. Before then they're just the running high and low so far, so every new extreme would move the line. To see those running values, turn on `showDevelopingOvernight`: they appear as grey "Overnight Low so far … (developing, fixed at 09:30 ET)".
- **Broken levels** are ones price has traded R through from the side it started on (R = 5% of the typical range, about 15 points on MNQ; the research's break rule). They stay where they were, drawn in dimmed grey and labelled with the time, e.g. `Overnight Low 21510 (break-prone, broken at 09:54 ET)`. They're kept because after a break, price came back to the level within 30 minutes about 80% of the time. `markBroken` turns this off.
- **Clock calibration.** The indicator checks its clock against CME's 18:00 ET reopen. If Tradovate stamps bars in local time or at bar close, the session and 09:30 boundaries still land correctly. The previous version got the prior-day and overnight levels wrong on 11–12 of 12 test days under those formats.

### Settlement, and weekly/monthly POCs on intraday charts

- **Settlement.** A blue dashed line labelled `Prior Day Settlement` (`Prior Week` / `Prior Month Settlement` on 1H and daily charts). It's the close of the last bar ending by 16:00 ET. CME settles on the 15:59:30–16:00:00 ET average, so the two are usually within a tick or two; half days settle at their early close. It's a reference line only: tested as the prior-day close, it neither held nor broke more than random levels. `showSettlement` turns it off.
- **Weekly and monthly POCs on 1–30 minute charts.** Purple lines: `Prior Week Point of Control`, `Point of Control (4 weeks)`, `Prior Month Point of Control` and `Point of Control (3 months)`. On intraday touches they held about as well as the daily POCs (+5 pp vs random levels, pooled). They need enough history loaded: about 5 weeks for the weekly lines and about 4 months for the monthly lines. `showWeeklyPOC` and `showMonthlyPOC` turn them off.
- **Prior week/month high and low** (on 1H and slower charts) are drawn as plain grey reference lines, not break-prone. Unlike the daily ones, they were neutral in the research.
- **Rolls.** The 4-week, 3-month and 12-week/12-month profiles cross quarterly contract rolls, which have shifted MNQ by 200–300 points each time since 2023. The research used roll-adjusted prices. On a continuous chart that isn't roll-adjusted, those profiles are skewed around each roll. Charting the actual contract (e.g. MNQZ6) avoids this.

### Which timeframe

The levels are the same on any chart from 1 to 30 minutes, because they come from the session-scale definitions. What changes is how precisely you can see price react to them.

- **1–5 minute charts are the best fit.** The reactions were measured over about 15–35 points within 60 minutes of a touch, which is only visible on fast charts. The levels are also exact there (on 5m, 86% of HVNs match 1-minute even without Tradovate's volume-at-price).
- **15 minute** still works, but it shows a 15-point reaction as a single candle.
- **30 minute and slower** give coarse levels unless Tradovate supplies volume-at-price.
- **1H and up** switch to weekly/monthly levels, which were never tested.
- **Hold levels vs break-prone levels.** The hold levels (Point of Control, High Volume Node) showed up more clearly at the ~35-point reaction size: Prior Day Point of Control was +5.8 pp there vs +1.7 pp at ~15 points. The break-prone levels, round numbers especially, showed up at both sizes. Treat hold levels as intraday swing context and break-prone levels as scalp-scale context.

### Timeframe adaptation

The indicator detects the bar size from the bar timestamps and picks the scale. `levelScale` overrides it.

| Chart bars | Scale | Prior-period levels | POC / HVN lookback | Round step (MNQ) |
|---|---|---|---|---|
| tick, 1–30 min | Session | Prior Day High / Low (RTH), Overnight High / Low, Prior Day Point of Control | 5 / 20 sessions | 100 |
| 1H – 4H | Week | Prior Week High / Low, Prior Week Point of Control | 4 / 12 weeks | 500 |
| daily and up | Month | Prior Month High / Low, Prior Month Point of Control | 3 / 12 months | 1000 |

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
