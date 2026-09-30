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
