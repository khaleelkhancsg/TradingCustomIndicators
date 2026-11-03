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

A custom indicator for a **2-minute MNQ chart**, built for an evaluation with a **$1,250 profit target, $1,000 trailing maximum loss, $600 daily loss limit and a 50% consistency rule**. It uses the same breakout signal as `mnqDonchianBot.js`, with the smaller size and tighter day rules those account rules reward. On top of that, it only trades breakouts that go with the 10-minute EMA trend. Unlike `mnqDonchianBot.js`, it adds up the day's P&L from its own trades, so it applies the day rules and shows when the day is done. My $1,250 bot trades these same rules, and this draws them on the chart.

It also shows **why**: the readings behind each order, the level the close broke, and the reason a close outside the channel was not a signal.

On 2026 data (1 tick of slippage a side, $0.75/side commission) it passed **71.1%** of 21-day windows (Jan–Mar 74.3%, Apr–Jul 75.1%), against 61.3% without the EMA filter. On the actual calendar windows of 2026 it passed 74.8%. Forward on TopstepX bars, Sep 10 – Oct 26 2026, it made +$2,532 over 23 trades, and all 17 calendar windows passed.

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
| Exits | The bracket; out at the next open if the trade is not +1 ATR by the 20th bar after entry (40 minutes); an opposite signal; flat at 15:06 CT (the first bar opening at or after 15:05), or earlier on an early close (see the notes). The 40-minute exit and the opposite signal happen at the next open, before that bar can touch the stop or target |
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
| bare `▲` / `▼`, `▲ · too late` | A signal that places nothing: already in that trade, or too late in the session |
| `ADX 39 · eff 0.53 · 10m up · range 58%` | Under the first order of a run of breakouts (`showWhy`): the readings its rules used. ADX 25 or more, efficiency 0.5 or more (`+ trend` when the slow trend rescued it at 0.45–0.5), the 10-minute EMA direction, and how much of its usual range the day has covered (90% or more halves the size). Rounded down, so a reading never prints on the wrong side of its rule |
| `30-bar high 29120.50` + short thick line | The level the close broke, from the bar that set it to the signal bar (`showWhy`, on that same first order) |
| grey `× ADX 21 · eff 0.42` | A close outside the channel that is **not** a signal, and what refused it: ADX under 25, or efficiency under 0.5. `vs trend` means efficiency was 0.45–0.5 but the slow trend pointed the other way. Only the first bar of a run outside the channel is marked, about 6 a session. It places nothing and changes nothing (`showSkipped`) |
| blue and purple lines | The 10-minute EMA 9 and 21 (`showEma`) |
| gold line + `BUY STOP` | The stop-entry: signal close ± 0.15 ATR. Starts **on the signal candle** |
| red line + `SL`, green line + `TP` | The bracket, at the tick prices the orders rest at. `· day limit` when the $600 line sets the stop |
| `● BOUGHT 4 @ price` | The fill (`(limit)` when a refused stop was re-placed as a limit) |
| orange line | The 40-minute checkpoint: fill ± 1 ATR |
| `TP +$324`, `SL -$594 · day limit`, `TIME 40m -$84`, `FLIP`, `FLAT` | The exit and the trade's dollars (after $0.75/side commission, no slippage). `FLAT early close`: the session ended before the flat time, so the trade goes out at its last close, on that day's books |
| `DAY DONE +$324 (profit block)` | The day is done: profit block, breaker or daily limit. Later signals that day are not drawn |
| `no fill` / `cancelled` | A stop-entry that expired, or that an opposite signal cancelled |

### Settings

- **The filter:** `emaFilter` (on), plus `emaTf` (10 minutes, whole 2-minute bars, so an even number), `emaFast` (9) and `emaSlow` (21). With `emaFilter` off it trades every breakout, as the first version did (60.9% in 2026).
- **Size and day rules:** `contracts`, `lateContracts`, `dayLossLimit`, `breaker` and `profitBlock`. 0 turns the breaker or the profit block off.
- **Display:** `showWhy` (the readings and the broken level), `showSkipped` (the grey marks: refused breakouts and breakouts against the 10-minute trend), `showEma`, `showChannel`, `showTrend`, `showMarkers`, `showLineLabels` and `showCheckpoint`.

### The day rules

- It adds up the day's P&L from the trades it draws (after commission, no slippage) and starts again at the 16:00 CT session change.
- The stop goes where the day would reach −$600 after the trade's commission. After a winning trade the day has more room, so a later loss can be bigger than $600: after +$237, the stop allows −$837.
- It cannot see your account. If anything else trades the account (manual trades, another strategy), its day P&L and its stops will be wrong.

### Notes

- **Verified outside Tradovate** on seven years of MNQ data:
  - Its 10-minute EMA direction matches the research's, built separately from 1-minute bars, on every 2-minute bar.
  - In research mode it reproduces every trade of the research engine, day rules included (2,450 of 2,450).
  - The 2026 pass rate rebuilt from its own trades is the same 71.1%.
  - All 128 of its 2026 trades match the backtesting chart's book, to the cent.
  - Every order's lines start on its signal candle, at the exact prices the order then rests at.
  - Every 2026 reading and refusal it prints (214 orders, 840 refused breakouts) matches the chart's own explanation of that bar.

  The research and verification files named in the code's header live in my separate backtesting project.
- **Flat at 15:06.** The first version drew the flat at 15:04. The research measured 15:06 and the bot trades it, so the indicator now does too.
- **Early closes.** Topstep liquidates anything still open 15 minutes before an early close. On those days (the `EARLY` list near the top of the code: Nov 26, Nov 27 and Dec 24 2026) the indicator does what the bot does: no new order from 15 minutes before the cutoff, flat from 5 before it. Add each year's dates from Topstep's holiday hours page. A session that ends early without being on the list goes out at its last close, and its dollars stay on that day. No trade in the 2026 test data was open at an early close, so the 2026 results don't change.
- **Exit order.** A trade the 40-minute exit or an opposite signal closes goes out at the next open, before that bar can touch the stop or target; only a gap through the stop at the open comes first. The first version checked the stop and target first. Correcting it moved the 2026 result by under 0.1 point with the filter, and 0.4 without.
- **Place the orders as the lines appear.** One bar of entry delay cut the 2026 pass rate to 57.5% (51.8% without the filter).
- **Not verified inside Tradovate itself.** The label placement uses Tradovate's pixel offsets and left/right text alignment. If labels look misplaced, turn off `showLineLabels`; the lines and markers still draw.
- **Chosen on 2026 alone.** The filter was picked from 21 timeframe/EMA-pair combinations tested on 2026 (139 sessions). The whole band of good settings (65–76%) is a fairer guide than the single 71.1%.

## `mnqMacdFade1250.js` — MNQ MACD fade for a $1,250-target evaluation

A custom indicator for a **1-minute MNQ chart**, for the same evaluation rules. It trades against short pushes. When the 1-minute MACD histogram crosses zero during RTH, it takes the other side (a cross up is a sell, a cross down a buy), but only on the crosses that tend to reverse. Like the Donchian, it shows why: the readings behind each order, and what refused each cross it did not fade.

On 2026 data (same costs) it passed **67.7%** of 21-day windows (Jan–Mar 64.8%, Apr–Jul 73.8%). That compares with 58.6% for fading every cross, and 71.1% for `mnqDonchian1250.js`. On the actual calendar windows of 2026 it passed 57.1%.

**It has not held up.** Forward on TopstepX bars, Sep 10 – Oct 26 2026, it lost $2,160 over 56 trades and passed 17.6% of calendar windows, below its coin-flip twin. `mnqDonchian1250.js` made +$2,532 over the same stretch. Treat the 2026 figures as a regime, not an edge; on these rules the Donchian alone is the better choice.

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
| Exits | The next cross of any kind, at the next open, before that bar can touch the stop or target; the bracket; flat at 15:05 CT, or earlier on an early close |
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
| `cross down · line +26.90 · ATR 1.18×` | Under an order (`showWhy`): the readings its rules used. The cross it fades, the MACD line (on the fade's side of zero: a bounce against the short-term trend), and the ATR as a multiple of its 10-session average (1× or more: the market is moving; rounded down) |
| grey `▲ strong` / `▼ quiet` | A cross it does not fade. `strong` resumes the short-term trend; `quiet` came with below-normal volatility. With `showWhy` it adds the reading that refused it: `· line +3.36` or `· ATR 0.87×`, or both. With `· closes trade` it still exits the open trade, and with `· cancels sell stop` it cancels the resting order. `showSkipped` off hides the ones that do neither |
| `▼ · closes trade` | A cross it would fade, but that places no new order (too late in the session, or that trade's result ends the day): it only exits |
| `▲ · too late` | A cross it would fade, after 14:55 CT: no new order. A bare `▲` is one the same way as the open trade |
| gold, red and green lines | Stop-entry, stop and target, starting **on the signal candle**. `· day limit` when the $600 line sets the stop |
| `● SOLD 4 @ price` | The fill (`(limit)` when a refused stop was re-placed as a limit) |
| `TP`, `SL`, `FLIP`, `FLAT` with dollars | The exit and the trade's dollars (after $0.75/side commission, no slippage). `FLAT early close`: the session ended before the flat time, so the trade goes out at its last close, on that day's books |
| `DAY DONE +$312 (profit block)` | The day is done. Later crosses that day are not drawn |
| `no fill` / `cancelled` | A stop-entry that expired, or that the next cross cancelled |

Most trades end at the next cross (`FLIP`): 109 of 172 in 2026. Expect none to two trades on most days; the +$250 profit block or the breaker usually ends the day early.

### Settings

- `onlyWeakCrosses` (on) and `minVolRatio` (1, meaning ATR at least 1× its 10-session average; 0 turns it off) are the two filters. With both off it fades every cross, as the first version did (58.6% in 2026).
- `contracts`, `dayLossLimit`, `breaker` and `profitBlock` are the size and the day rules.
- `showWhy`, `showSkipped`, `showLineLabels` and `showMarkers` control the labels.

### The day rules

The same as `mnqDonchian1250.js` ([above](#the-day-rules)), with a −$200 breaker: the day's P&L comes from its own trades, and it cannot see anything else trading the account.

### Notes

- Verified outside Tradovate on seven years of MNQ data:
  - Which crosses it fades matches the research at every one of 57,712 crosses.
  - In research mode it reproduces every trade of the research engine, day rules included (4,080 of 4,080).
  - The 2026 pass rate rebuilt from its own trades is the same 67.7%.
  - All 172 of its 2026 trades match the backtesting chart's book, to the cent.
  - Every 2026 reading and refusal it prints (232 orders, 446 grey crosses) matches the chart's own explanation of that bar.
- **Early closes.** As in `mnqDonchian1250.js`: no new order from 15 minutes before Topstep's cutoff, flat from 5 before it.
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
- **2026 alone does not support the hold or break groups.** Stress-tested in the chart lab (2026-10-30) with touches matched by side and time of day, 100 random-market placebos per level, and 32 forward sessions, Sep 11 – Oct 26. Prior POCs came in at +0.9 pp (95% CI about −5 to +6), HVNs −1.4 (−6 to +3), prior-day high/low −2.0, overnight high/low −4.0, all inside the noise. Round 100s and 500s were the one signal, −5.5 (−10 to −2), and that went to −0.3 forward. A pool of levels needs about 7 pp to show on this sample, so this does not overturn the 5-year figures above. It does mean the labels are reference lines, not a forecast for the current market.
- **Only the Session scale was tested.** Week and Month apply the same definitions to longer periods but haven't been measured.

### Notes

- Verified outside Tradovate. On 12 real days from 2021 to 2026, the 1-minute levels are identical to the research code. Live-bar updates don't double-count. 5m, 15m, 30m, 1H, 4H and daily charts pick the right scale, and every drawn line carries a label. The research and test files live in my separate `tradovate_levels` project.
- Not verified inside Tradovate itself. The shaded zones, label alignment, dashed styles and the volume-at-price request are written from Tradovate's API docs. If labels look misplaced, try `labelSide`, `labelOffsetPx`, or turn off `showLabels`; the lines still draw.

## `cammyValueLevels.js` — Cammy Capital's volume profile levels

A custom indicator for a **1-minute chart** that draws what Cammy Capital's volume profile strategy is built on, as the 44 videos of their [Order Flow](https://www.youtube.com/playlist?list=PLyPfiwj3BtkwqVG-WBA2kNWr-S5AcT3zW) and [Volume Profile](https://www.youtube.com/playlist?list=PLyPfiwj3Btkz8PqJeXUOO7mPKLGtgWwy-) playlists set it out. It never signals a trade. It draws the levels, works out the facts the strategy states as rules (first taps, stacked levels, the 30-minute wait), and labels every call Cammy makes by eye as yours. The checklist below is the strategy's process, in order. In the code and here, `VP 14` means video 14 of the Volume Profile Series and `OF 5` video 5 of the Order Flow Series.

### Install

1. In Tradovate, open the custom indicator code editor and create a new indicator.
2. Paste the **entire** contents of `cammyValueLevels.js` and save.
3. Add it to a 1-minute chart from the indicator list (tagged **Volume profile**).

### Chart setup

- **1-minute bars, overnight session included.** The overnight and developing profiles need the overnight bars, and the profiles are built the way Cammy draws them, on a 1-minute chart. Other intraday sizes work if they have a bar at 09:30 ET.
- **Load at least two weeks.** The previous week's profile needs that week from its Sunday 18:00 open; until it is loaded, the orange lines don't draw.
- **One check on first load:** the white lines should change at 16:00 ET and the orange ones at the Sunday open. The clock checks itself against CME's 18:00 reopen, so local-time or bar-close stamps still land right once a reopen is in the history.
- **Set `stackTicks` for your market.** Cammy never says how close levels must be to stack. The default follows the examples in the videos: 16 ticks (4 points) on NQ/MNQ, 6 ticks (1.5 points) on ES/MES, 8 ticks otherwise.
- **In a roll week, chart the contract you trade.** The weekly profile mixes contracts on a continuous chart that is not roll-adjusted.

### Reading it

| On the chart | Meaning |
|---|---|
| orange lines | Previous week (Sunday 18:00 → Friday 17:00): VAH, POC (thicker), VAL. All week [VP 10] |
| white lines | Previous day: the latest regular session, 09:30 → 16:00, until the next 16:00 close, overnight included [VP 10] |
| lavender dashed | Overnight, 18:00 → 09:29, drawn in the New York session [VP 4, 20] |
| blue lines, red line | The developing profile's VAH and VAL, and its POC, bar by bar: from 18:00 overnight (or 16:00 with `overnightStart`), from 09:30 in New York [VP 10, 26] |
| blue histogram | The developing profile, from its session's first bar. Brighter rows are the value area, red is the POC row. Read nodes, shelves, edges and the shape here |
| `1st PD VAL` | The first touch of a level this session. `x2` means it sat in a stack at that moment [VP 4, 5, 14] |
| yellow zone, `STACK x3` | Levels of different profiles within `stackTicks` of each other [VP 3, 13, 22] |
| dotted line, `09:30 New York profile starts`, `10:00 formed (30 min)` | The developing profile's start, and the end of the 30 minutes Cammy lets it form [VP 19, 20] |
| labels at the right | Each level, with `(untapped)` or `(1st tap 10:42)` for this session |
| panel, top left | The session and whether its profile has formed; where the session opened and where price is now against each profile (premium, discount, above VAH, below VAL); how far developing value has moved since it formed; the untapped levels; the next levels above and below; the stacks now. The last line, in orange, is what stays yours |

VAH is premium, POC fair value, VAL discount; above the POC is already premium and below it discount [VP 12, 21].

### What is a rule here, and what stays yours

Drawn or worked out, because the strategy states them as rules:
- the four profiles, their windows and value areas;
- the first tap of each previous-week, previous-day and overnight level in the session;
- which levels of different profiles sit together, and how many;
- the 30 minutes before a developing profile counts;
- where price opened and where it is against each profile's value, and how far value has moved;
- the opposing levels above and below.

Left to you, because Cammy judges them by eye:
- whether price holds or fails at fair value, and so which side to trade;
- which nodes, shelves and edges count, and the profile's shape;
- whether a level has broken and whether its retest holds;
- what else adds to a grade: a node, an edge, the context;
- the entry, stop, target and size.

### The checklist

**Before the session**
- [ ] 1-minute chart, two weeks loaded, white lines changing at 16:00 ET and orange at the Sunday open.
- [ ] The day's risk set: about 10% of the account's drawdown, 20% at most [VP 9, 18]. Stop after one win, or after two losses [VP 26]; lock out at your daily loss or after a good win [VP 30].

**Which side** (the panel gives the facts; the read is yours)
- [ ] Where did the session open against the previous day's value? (panel: *Opened*)
- [ ] At the previous day's POC: held or reclaimed → look for longs; failed below, or rejected from underneath → look for shorts [VP 13, 17, 24, 25, 26].
- [ ] At a VAH or VAL: broken with no one defending it → trade the retest that way; a clean rejection → fade back into value [VP 22, 25, 26].
- [ ] Is developing value moving? (panel: *Developing value since*) Yesterday's fair value or premium becoming today's discount = buy there; overnight fair value becoming today's premium = sell there [VP 12, 20, 25].
- [ ] No trade into a higher-timeframe level [OF 5]; no fading a level with a node building under it [VP 17].

**The setup**
- [ ] At least 30 minutes since the developing profile started (chart: *formed*) [VP 19, 20].
- [ ] Which one: first tap of a value edge; break and retest; stacked levels; the edges of a balanced (D-shaped) profile; the range around a POC, taking profit at the POC; node to node [VP 4, 13, 14, 23, 29].
- [ ] Is it the level's first tap? (labels: *untapped*) [VP 4, 5, 14]
- [ ] Grade it: the stacked levels (chart: *STACK xN*) plus any node, edge or context you count. 3 or more = A, full risk; 2 = B, half; 1 = C, a quarter, and Cammy says to aim for 2 or more [VP 13, 14, 20].

**The order**
- [ ] A limit order at the level, on the first tap, with no candle confirmation [VP 14].
- [ ] Stop behind the nearest high-volume node ("sandbagging"), behind the stack, or just past fair value; in a range, outside it [VP 5, 13, 19, 20, 24, 25].
- [ ] Target 1:1, or the opposing value level (panel: *Next above/below*). Take most off at a POC rather than hold through it [VP 3, 4, 5, 12, 14].

**Managing it**
- [ ] A trades: most off at the first target, stop to breakeven, one or two runners to the next level [VP 12, 13, 18].
- [ ] Add to a winner at a level, never to a loser [VP 18].
- [ ] Journal the grade and the result.

### Settings

| Setting | Default | |
|---|---|---|
| `tickSize` | 0 | 0 uses the contract's tick |
| `rows` | 1000 | Rows across each profile, as Cammy sets it in TradingView; never finer than a tick. 0 gives one row a tick |
| `overnightStart` | 18:00 | Where the overnight developing profile starts: the Globex open, or 16:00 to include the post-close volume [VP 20, 26] |
| `stackTicks` | 0 | How close levels must be to stack; 0 is the per-market default above. Your setting |
| `showWeek`, `showPrevDay`, `showOvernight`, `showDeveloping` | on | Each profile's lines, labels and taps |
| `showProfile`, `profileSide`, `profileWidthPx` | on, session start, 140 | The developing histogram, from the session's first bar or right of the latest bar |
| `showFirstTaps`, `showStacks`, `showSessions`, `showLabels`, `showPanel` | on | Each layer |
| `showVWAP`, `vwapBand` | off, 1 | VWAP and a band, at TradingView's defaults (session anchor, 1 standard deviation). The latest video adds it as a confluence and an exit [VP 1] |
| `labelOffsetPx`, `labelFontSize` | 8, 11 | Label placement |

### Notes

- **How a profile is built.** Each 1-minute bar's volume is spread evenly across its high-low range, as a 1-minute profile is, with Tradovate's own volume at price on coarser bars when the chart has it. The POC is the row with the most volume, and the value area grows from it a row at a time toward the larger neighbour until it holds 70%. TradingView does not publish its arithmetic, so a level can sit a tick or a row from what Cammy's chart shows; NQ's weekly profile has rows of about a point at 1000 rows.
- **Verified outside Tradovate.** A second implementation of the same definitions, built on the backtester's own session fields instead of this clock, agreed on every level the indicator drew. That was 851,409 readings on MNQ 1-minute bars from January to July 2026, at both overnight starts and both row settings. It also agreed on every first tap (1,314). Three planted mistakes (a 69% value area, a 15:59 close, the opposite tie rule) were each caught. A bar read while still forming changes nothing once it closes, and the VWAP matches a separate calculation. The checks ran on the backtester's mock (`npm run mock -- cammyValueLevels`).
- **Not verified inside Tradovate.** The panel's pixel position (below the platform's legend line), the histogram widths and the label alignment are written from Tradovate's API docs. If the panel sits badly, turn off `showPanel`; the lines and labels still draw.
- **It is not a backtest.** Nothing here says the strategy has an edge.
