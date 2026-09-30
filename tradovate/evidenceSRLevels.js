/*
 * Evidence-Based S/R Levels  (Tradovate custom indicator)
 *
 * Draws support/resistance from volume, split into two groups by how price
 * actually behaved at each level type on 5 years of MNQ 1-minute data
 * (2021-07 -> 2026-07, ~470k level touches, each compared against random
 * "twin" levels at the same time of day). See tradovate/README.md.
 *
 *  HOLD levels  (bounced MORE often than random levels)
 *    - HVN zones: high-volume nodes of the lookback profile      (+4.1pp)
 *    - POC: point of control of the recent profile                (+5.6pp)
 *    - prior-period POC                                            (+5.8pp)
 *
 *  BREAK-PRONE levels  (broke MORE often than random = stop clusters;
 *  do not fade them blindly, expect acceleration once through)
 *    - Round numbers                                               (-3 to -5pp)
 *    - Prior-period high / low                                     (-5 to -6pp)
 *    - Overnight high / low (session scale only)                   (-4 to -5pp)
 *
 *  ALSO ON INTRADAY CHARTS
 *    - Weekly / monthly POCs (prior week, 4 weeks, prior month, 3 months):
 *      held about as well as the daily POCs on intraday touches (+5pp)
 *
 *  REFERENCE ONLY (tested as neither holding nor breaking)
 *    - Prior-period settlement (CME's 16:00 ET settlement)
 *    - Prior week / month high and low on the Week and Month scales
 *
 *  Tested and NOT included, no better than random: order blocks, fair
 *  value gaps, 5-min/1-hour swing highs/lows, RTH VWAP, LVNs, VAH/VAL.
 *
 * LEVEL SCALE follows the chart timeframe (detected from bar timestamps):
 *    <= 30 min bars   SESSION  prior day, overnight, 5-session POC, 20-session HVNs
 *    1H - 4H bars     WEEK     prior week, 4-week POC, 12-week HVNs
 *    daily and up     MONTH    prior month, 3-month POC, 12-month HVNs
 * Only the SESSION scale was tested in the research; WEEK and MONTH apply
 * the same definitions to longer periods. "levelScale" overrides the choice.
 *
 * LEVELS ARE FIXED once set, as they were in the research (known in advance,
 * never redrawn around price). They are recomputed when a new period starts.
 *    - Overnight high/low are drawn only from 09:30 ET, when they are final
 *      (showDevelopingOvernight shows the running values before that).
 *    - A level price has traded R through (R = 5% of the typical range) stays
 *      in place, dimmed, labelled "broken at 10:42 ET" (markBroken).
 *    - The clock is calibrated against CME's 18:00 ET reopen, so charts whose
 *      timestamps are local time or bar-close times get the same sessions.
 *
 * Set "binSize" to the instrument's natural price step (1.0 for NQ/MNQ,
 * 0.25 for ES/MES) and "roundStep" to its session round number (100 for
 * NQ/MNQ, 25 for ES/MES).
 */
const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

const RTH_OPEN = 570;       // 09:30 ET
const RTH_CLOSE = 960;      // 16:00 ET
const SESSION_START = 1080; // 18:00 ET
const DAY_MS = 86400000;

const COLORS = {
    hvn: "#26a69a",
    poc: "#ffd54f",
    pPoc: "#ffb74d",
    weekPoc: "#ba68c8",
    monthPoc: "#7e57c2",
    settle: "#64b5f6",
    neutral: "#bcaaa4",
    brk: "#ef5350",
    round: "#9e9e9e",
    broken: "#78909c",
    developing: "#b0bec5"
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];

// Per-scale definitions. SESSION reproduces the tested research exactly.
const SCALES = {
    session: { hvn: 20, poc: 5, period: "Day", unit: "session" },
    week: { hvn: 12, poc: 4, period: "Week", unit: "week" },
    month: { hvn: 12, poc: 3, period: "Month", unit: "month" }
};

// ---------------------------------------------------------------- time ----
function nthSundayOfMonth(y, month, n) {
    const firstDow = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - firstDow) % 7) + 7 * (n - 1);
}

// US Eastern offset in ms (DST: 2nd Sunday March 02:00 -> 1st Sunday Nov 02:00)
function etOffsetMs(t) {
    const y = new Date(t).getUTCFullYear();
    const start = Date.UTC(y, 2, nthSundayOfMonth(y, 2, 2), 7);
    const end = Date.UTC(y, 10, nthSundayOfMonth(y, 10, 1), 6);
    return (t >= start && t < end ? -4 : -5) * 3600000;
}

const isDst = (t) => etOffsetMs(t) === -4 * 3600000;

// CME session key (18:00 ET -> 17:00 ET belongs to the next day) and ET minute.
// `shift` = clock correction in minutes per DST regime (see clockShift).
function sessionInfo(t, shift) {
    const et = t + etOffsetMs(t) - (isDst(t) ? shift.dst : shift.std) * 60000;
    const key = Math.floor((et + 6 * 3600000) / DAY_MS);
    const minute = Math.floor((((et % DAY_MS) + DAY_MS) % DAY_MS) / 60000);
    return { key, minute };
}

// Calibrate the clock against the exchange: after the daily 17:00-18:00 ET
// halt (and the weekend) CME always reopens at 18:00 ET. If the bar after
// such a gap does not read 18:00, the chart's timestamps are not plain UTC
// bar-open times (local-time stamps, bar-close stamps), and every session and
// RTH boundary would be off by that much. Measured separately for daylight
// and standard time, since a local-time stamp shifts by an hour between them.
function clockShift(bars, barMin) {
    const out = { dst: 0, std: 0 };
    if (barMin >= 1440 || bars.length < 50) return out;
    const counts = { dst: {}, std: {} };
    for (let i = 1; i < bars.length; i++) {
        const gap = (bars[i].t - bars[i - 1].t) / 60000;
        if (gap < Math.max(barMin, 1) + 45 || gap > 4 * 1440) continue;
        const t = bars[i].t;
        const et = t + etOffsetMs(t);
        const m = Math.floor((((et % DAY_MS) + DAY_MS) % DAY_MS) / 60000);
        const c = counts[isDst(t) ? "dst" : "std"];
        c[m] = (c[m] || 0) + 1;
    }
    const mode = (c) => {
        let best = null, n = 2;       // need at least 3 reopenings to trust it
        for (const k in c) if (c[k] > n) { n = c[k]; best = +k; }
        return best == null ? null : ((best - SESSION_START + 720) % 1440 + 1440) % 1440 - 720;
    };
    const d = mode(counts.dst), s = mode(counts.std);
    out.dst = d != null ? d : (s != null ? s : 0);
    out.std = s != null ? s : out.dst;
    return out;
}

// First bar, once a level is active, that trades R through it from the side
// price started on: the research's break definition. Null while unbroken.
function brokenBar(P, bars, R) {
    let side = 0;
    for (const b of bars) {
        if (!side) {
            if (Math.abs(b.c - P) >= R) side = b.c > P ? 1 : -1;
            continue;
        }
        if (side > 0 ? b.l <= P - R : b.h >= P + R) return b;
    }
    return null;
}

// Settlement price of the last session in `bars`. CME settles equity index
// futures on the 15:59:30-16:00:00 ET average; the close of the last bar that
// ends by 16:00 ET is within a tick or two of it. Half days settle at their
// early close, which this rule also finds. Daily bars: the bar's close.
function settlementOf(bars, barMin) {
    if (!bars.length) return null;
    if (barMin >= 1440) return bars[bars.length - 1].c;
    const lastKey = bars[bars.length - 1].s;
    for (let i = bars.length - 1; i >= 0 && bars[i].s === lastKey; i--) {
        if (bars[i].m + Math.max(barMin, 1) <= RTH_CLOSE) return bars[i].c;
    }
    return null;
}

// "10:42 ET" / "Tuesday 10:42 ET" / "14 March", in full words
function whenText(b, scale) {
    const hhmm = String(Math.floor(b.m / 60)).padStart(2, "0") + ":" + String(b.m % 60).padStart(2, "0");
    const cal = new Date((b.s - (b.m >= SESSION_START ? 1 : 0)) * DAY_MS);   // calendar day of the bar
    if (scale === "session") return `at ${hhmm} ET`;
    if (scale === "week") return `${WEEKDAYS[cal.getUTCDay()]} ${hhmm} ET`;
    return `on ${cal.getUTCDate()} ${MONTHS[cal.getUTCMonth()]}`;
}

// Period key for a session key (days since epoch; epoch day 0 is a Thursday)
function periodKey(scale, s) {
    if (scale === "session") return s;
    if (scale === "week") return Math.floor((s + 3) / 7);   // weeks start Monday
    const dt = new Date(s * DAY_MS);
    return dt.getUTCFullYear() * 12 + dt.getUTCMonth();
}

// Most common spacing between bars, in minutes (0 for sub-minute/tick charts)
function detectBarMinutes(bars) {
    const counts = {};
    const from = Math.max(1, bars.length - 400);
    for (let i = from; i < bars.length; i++) {
        const dm = Math.round((bars[i].t - bars[i - 1].t) / 60000);
        if (dm >= 0) counts[dm] = (counts[dm] || 0) + 1;
    }
    let best = 1, bestN = -1;
    for (const k in counts) if (counts[k] > bestN) { bestN = counts[k]; best = +k; }
    return best;
}

function autoScale(barMinutes) {
    if (barMinutes <= 30) return "session";
    if (barMinutes <= 240) return "week";
    return "month";
}

// Smallest 1/2.5/5 x 10^k step >= target
function niceStepAtLeast(target) {
    let p = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-9))));
    for (;;) {
        for (const m of [1, 2.5, 5]) if (m * p >= target) return m * p;
        p *= 10;
    }
}

// ------------------------------------------------------------- profile ----
// Volume-at-price. With useVp, a bar carrying Tradovate's own volume-at-price
// (b.vp, from d.profile()) is binned exactly; otherwise its volume is spread
// evenly across its high-low range, which is the definition the research tested.
function buildProfile(bars, bin, useVp) {
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) {
        if (b.l < lo) lo = b.l;
        if (b.h > hi) hi = b.h;
    }
    const nb = Math.floor((hi - lo) / bin) + 2;
    const diff = new Array(nb + 1).fill(0);
    for (const b of bars) {
        if (useVp && b.vp) {
            for (const lv of b.vp) {
                const k = Math.min(nb - 1, Math.max(0, Math.floor((lv.price - lo) / bin)));
                diff[k] += lv.vol;
                diff[k + 1] -= lv.vol;
            }
            continue;
        }
        const s = Math.floor((b.l - lo) / bin);
        const e = Math.floor((b.h - lo) / bin);
        const w = b.v / (e - s + 1);
        diff[s] += w;
        diff[e + 1] -= w;
    }
    const prof = new Array(nb);
    let acc = 0;
    for (let i = 0; i < nb; i++) {
        acc += diff[i];
        prof[i] = acc;
    }
    return { prof, lo };
}

// Gaussian smoothing, same kernel and edge handling as scipy gaussian_filter1d
function gaussianSmooth(x, sigma) {
    const r = Math.floor(4 * sigma + 0.5);
    const k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) {
        const w = Math.exp(-0.5 * i * i / (sigma * sigma));
        k.push(w);
        sum += w;
    }
    const n = x.length;
    const reflect = (i) => {
        while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1;
        return i;
    };
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) acc += x[reflect(i + j)] * k[j + r];
        out[i] = acc / sum;
    }
    return out;
}

// Peak detection matching scipy.signal.find_peaks(x, distance, prominence)
function findPeaks(x, distance, minProminence) {
    const n = x.length;
    let peaks = [];
    let i = 1;
    while (i < n - 1) {
        if (x[i - 1] < x[i]) {
            let ahead = i + 1;
            while (ahead < n - 1 && x[ahead] === x[i]) ahead++;
            if (x[ahead] < x[i]) {
                peaks.push(Math.floor((i + ahead - 1) / 2));
                i = ahead;
            }
        }
        i++;
    }
    // distance: keep the highest peaks, drop lesser peaks within `distance`
    const keep = peaks.map(() => true);
    const order = peaks.map((p, idx) => idx).sort((a, b) => x[peaks[a]] - x[peaks[b]]);
    for (let o = order.length - 1; o >= 0; o--) {
        const j = order[o];
        if (!keep[j]) continue;
        for (let k = j - 1; k >= 0 && peaks[j] - peaks[k] < distance; k--) keep[k] = false;
        for (let k = j + 1; k < peaks.length && peaks[k] - peaks[j] < distance; k++) keep[k] = false;
    }
    peaks = peaks.filter((p, idx) => keep[idx]);
    const out = [];
    for (const p of peaks) {
        let leftMin = x[p], rightMin = x[p];
        for (let j = p; j >= 0 && x[j] <= x[p]; j--) if (x[j] < leftMin) leftMin = x[j];
        for (let j = p; j < n && x[j] <= x[p]; j++) if (x[j] < rightMin) rightMin = x[j];
        const prom = x[p] - Math.max(leftMin, rightMin);
        if (prom >= minProminence) out.push({ index: p, prominence: prom });
    }
    return out;
}

function argmax(x) {
    let best = 0;
    for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i;
    return best;
}

function fmt(v) {
    return (Math.round(v * 100) / 100).toString();
}

// ---------------------------------------------------------- calculator ----
class EvidenceLevels {
    init() {
        this.bars = [];         // every bar mapped so far (trimmed to what the levels need)
        this.lastIndex = -1;
        this.cacheKey = null;
        this.levels = null;
        this.shift = { dst: 0, std: 0 };
        this.calibrated = false;
    }

    // Re-derive every bar's session and ET minute after a clock correction.
    applyShift(shift) {
        this.shift = shift;
        for (const b of this.bars) {
            const { key, minute } = sessionInfo(b.t, shift);
            b.s = key;
            b.m = minute;
        }
        this.cacheKey = null;
    }

    // RTH bars of one session: bars overlapping 09:30-16:00 ET, kept only if
    // they cover >= 300 minutes (the research's full-session rule).
    rthOf(bars, barMin) {
        const rth = bars.filter((b) => b.m < RTH_CLOSE && b.m + Math.max(barMin, 1) > RTH_OPEN);
        const minutes = new Set(rth.map((b) => b.m)).size * Math.max(barMin, 1);
        return minutes >= 300 ? rth : null;
    }

    groupPeriods(scale) {
        const periods = [];
        let cur = null;
        for (const b of this.bars) {
            const k = periodKey(scale, b.s);
            if (!cur || k !== cur.key) {
                cur = { key: k, startIndex: b.i, bars: [] };
                periods.push(cur);
            }
            cur.bars.push(b);
        }
        return periods;
    }

    // Levels that depend only on completed periods: computed once per period.
    computeLevels(scale, done, barMin, pocsOnly = false) {
        const p = this.props;
        const def = SCALES[scale];
        const hvnN = p.hvnLookback > 0 && !pocsOnly ? p.hvnLookback : def.hvn;
        const pocN = p.pocLookback > 0 && !pocsOnly ? p.pocLookback : def.poc;

        // range of each completed period: RTH range per session, full range otherwise
        const ranged = [];
        for (const per of done) {
            const src = scale === "session" ? this.rthOf(per.bars, barMin) : per.bars;
            if (!src) continue;
            let hi = -Infinity, lo = Infinity;
            for (const b of src) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; }
            ranged.push({ per, src, hi, lo, close: src[src.length - 1].c });
        }
        const recent = ranged.slice(-10);
        if (!recent.length) return null;
        const U = recent.reduce((a, r) => a + (r.hi - r.lo), 0) / recent.length;
        const bin = scale === "session"
            ? p.binSize
            : p.binSize * Math.max(1, Math.round(U / (275 * p.binSize)));
        // coarse bars smear volume across their range: prefer true volume-at-price
        const useVp = barMin > 1;
        const R = Math.max(0.25, Math.round(0.05 * U * 4) / 4);   // break distance, as in the research
        const out = { scale, U, R, bin, hvnN, pocN, hvn: [], poc: null, pPoc: null, ph: null, pl: null };

        const composite = (n) => {
            if (done.length < n) return null;
            const bars = [];
            for (const per of done.slice(-n)) for (const b of per.bars) bars.push(b);
            const { prof, lo } = buildProfile(bars, bin, useVp);
            const sm = gaussianSmooth(prof, Math.max(1, 0.015 * U / bin));
            return { sm, lo };
        };
        const price = (lo, i) => lo + i * bin + bin / 2;

        const cH = pocsOnly ? null : composite(hvnN);
        if (cH) {
            const { sm, lo } = cH;
            const mx = Math.max(...sm);
            const pk = findPeaks(sm, Math.max(2, Math.floor(0.08 * U / bin)), 0.10 * mx)
                .sort((a, b) => b.prominence - a.prominence)
                .slice(0, p.maxHVN);
            const cap = Math.max(1, Math.round(0.04 * U / bin));
            for (const q of pk) {
                let a = q.index, b = q.index;
                while (a > 0 && q.index - a < cap && sm[a - 1] >= 0.85 * sm[q.index]) a--;
                while (b < sm.length - 1 && b - q.index < cap && sm[b + 1] >= 0.85 * sm[q.index]) b++;
                out.hvn.push({ price: price(lo, q.index), top: lo + (b + 1) * bin, bottom: lo + a * bin });
            }
        }
        const cP = composite(pocN);
        if (cP) out.poc = price(cP.lo, argmax(cP.sm));

        const prev = ranged.length && ranged[ranged.length - 1].per === done[done.length - 1]
            ? ranged[ranged.length - 1] : null;
        if (prev) {
            out.ph = prev.hi;
            out.pl = prev.lo;
            const { prof, lo } = buildProfile(prev.src, bin, useVp);
            out.pPoc = price(lo, argmax(gaussianSmooth(prof, 2)));
        }
        out.settle = done.length ? settlementOf(done[done.length - 1].bars, barMin) : null;
        out.roundStep = scale === "session" ? p.roundStep : niceStepAtLeast(Math.max(p.roundStep, 0.36 * U));
        return out;
    }

    // Weekly and monthly POCs for an intraday chart: they held about as well as
    // the daily POCs on intraday touches (+5pp vs random levels). Same
    // definitions as the Week/Month scales; the oldest, partial period is dropped.
    higherPocs(barMin) {
        const out = {};
        for (const [sc, on] of [["week", this.props.showWeeklyPOC], ["month", this.props.showMonthlyPOC]]) {
            if (!on) continue;
            const periods = this.groupPeriods(sc).slice(1, -1);
            if (!periods.length) continue;
            const L = this.computeLevels(sc, periods, barMin, true);
            if (L) out[sc] = { poc: L.poc, pPoc: L.pPoc, pocN: L.pocN };
        }
        return out;
    }

    map(d) {
        const t = d.timestamp().getTime();
        const { key, minute } = sessionInfo(t, this.shift);
        const idx = d.index();
        const bar = { i: idx, t, h: d.high(), l: d.low(), c: d.close(), v: d.volume(), m: minute, s: key };
        // Keep the platform's volume-at-price when the chart provides it; it is
        // only used on bars coarser than 1 minute (see computeLevels).
        if (typeof d.profile === "function") {
            try {
                const vp = d.profile();
                if (vp && vp.length) bar.vp = vp.map((lv) => ({ price: lv.price, vol: lv.vol }));
            } catch (e) { /* not provided on this chart */ }
        }

        if (idx === this.lastIndex && this.bars.length) {
            this.bars[this.bars.length - 1] = bar;   // live bar update: replace, don't double count
        } else {
            this.bars.push(bar);
            this.lastIndex = idx;
        }
        if (!d.isLast()) return;

        const barMin = detectBarMinutes(this.bars);
        if (!this.calibrated) {
            // once the history is loaded; live bars then use the same correction
            const shift = clockShift(this.bars, barMin);
            if (shift.dst !== this.shift.dst || shift.std !== this.shift.std) this.applyShift(shift);
            this.calibrated = true;
        }
        const scale = this.props.levelScale === "auto" ? autoScale(barMin) : this.props.levelScale;
        const periods = this.groupPeriods(scale);
        const cur = periods[periods.length - 1];
        // the oldest week/month in the loaded history is almost always partial
        const done = periods.slice(scale === "session" ? 0 : 1, -1);
        const ck = scale + ":" + (done.length ? done[done.length - 1].key : "none");
        if (ck !== this.cacheKey) {
            this.levels = this.computeLevels(scale, done, barMin);
            if (this.levels && scale === "session") this.levels.higher = this.higherPocs(barMin);
            this.cacheKey = ck;
            // drop bars no level can reach any more
            const need = Math.max(SCALES[scale].hvn, SCALES[scale].poc, this.props.hvnLookback,
                this.props.pocLookback, 10) + 1;
            if (periods.length > need + 1) {
                let firstKept = this.bars.indexOf(periods[periods.length - 1 - need].bars[0]);
                // weekly/monthly POCs on an intraday chart need ~5 weeks / ~4 months
                const keepDays = scale === "session"
                    ? (this.props.showMonthlyPOC ? 130 : this.props.showWeeklyPOC ? 40 : 0) : 0;
                if (keepDays) {
                    const since = this.bars[this.bars.length - 1].t - keepDays * DAY_MS;
                    const k = this.bars.findIndex((b) => b.t >= since);
                    if (k >= 0) firstKept = Math.min(firstKept, k);
                }
                this.bars = this.bars.slice(firstKept);
            }
        }
        const L = this.levels;
        if (!L) return;
        return { graphics: { items: this.render(L, cur, barMin, d) } };
    }

    render(L, cur, barMin, d) {
        const p = this.props;
        const def = SCALES[L.scale];
        const x0 = du(cur.startIndex);
        const xEnd = du(d.index());
        const xFar = op(du(d.index()), "+", px(400));
        const groups = {
            zones: [], hvn: [], poc: [], pPoc: [], weekPoc: [], monthPoc: [], settle: [], neutral: [],
            brk: [], round: [], broken: [], developing: []
        };
        const marks = [];   // {price, text, color} - one label per drawn level

        // Levels never move once set. A level that price has traded R through
        // (from the side it started on) stays where it was, dimmed, with the
        // time it broke: after a break price was back at the level within 30
        // minutes about 80% of the time, so broken levels still matter.
        const line = (g, y, name, color, breakProne, active = cur.bars) => {
            const hit = active && p.markBroken ? brokenBar(y, active, L.R) : null;
            const tags = [];
            if (breakProne) tags.push("break-prone");
            if (hit) tags.push(`broken ${whenText(hit, L.scale)}`);
            if (g === "developing") tags.push("developing, fixed at 09:30 ET");
            const group = hit ? "broken" : g;
            groups[group].push({ tag: "Line", a: { x: x0, y: du(y) }, b: { x: xEnd, y: du(y) }, infiniteEnd: true });
            marks.push({
                price: y,
                text: `${name} ${fmt(y)}` + (tags.length ? ` (${tags.join(", ")})` : ""),
                color: hit ? COLORS.broken : color
            });
        };
        const span = (n) => `${n} ${def.unit}${n === 1 ? "" : "s"}`;

        if (p.showHVN) {
            for (const z of L.hvn) {
                groups.zones.push({ tag: "Polygon", points: [
                    { x: x0, y: du(z.top) }, { x: xFar, y: du(z.top) },
                    { x: xFar, y: du(z.bottom) }, { x: x0, y: du(z.bottom) }
                ] });
                line("hvn", z.price, `High Volume Node (${span(L.hvnN)})`, COLORS.hvn, false);
            }
        }
        if (p.showPOC && L.poc != null) {
            line("poc", L.poc, `Point of Control (${span(L.pocN)})`, COLORS.poc, false);
        }
        if (p.showPriorPOC && L.pPoc != null) {
            line("pPoc", L.pPoc, `Prior ${def.period} Point of Control`, COLORS.pPoc, false);
        }
        if (p.showWeeklyPOC && L.higher && L.higher.week) {
            const w = L.higher.week;
            if (w.pPoc != null) line("weekPoc", w.pPoc, "Prior Week Point of Control", COLORS.weekPoc, false);
            if (w.poc != null) line("weekPoc", w.poc, `Point of Control (${w.pocN} weeks)`, COLORS.weekPoc, false);
        }
        if (p.showMonthlyPOC && L.higher && L.higher.month) {
            const m = L.higher.month;
            if (m.pPoc != null) line("monthPoc", m.pPoc, "Prior Month Point of Control", COLORS.monthPoc, false);
            if (m.poc != null) line("monthPoc", m.poc, `Point of Control (${m.pocN} months)`, COLORS.monthPoc, false);
        }
        if (p.showSettlement && L.settle != null) {
            // a reference price only: it tested as neither holding nor breaking
            line("settle", L.settle, `Prior ${def.period} Settlement`, COLORS.settle, false);
        }
        if (p.showPriorHL && L.ph != null) {
            // Break-prone only at session scale. The prior week/month high and
            // low were neutral in the research, so they are drawn as plain references.
            if (L.scale === "session") {
                line("brk", L.ph, `Prior ${def.period} High`, COLORS.brk, true);
                line("brk", L.pl, `Prior ${def.period} Low`, COLORS.brk, true);
            } else {
                line("neutral", L.ph, `Prior ${def.period} High`, COLORS.neutral, false);
                line("neutral", L.pl, `Prior ${def.period} Low`, COLORS.neutral, false);
            }
        }
        if (p.showOvernightHL && L.scale === "session") {
            // The overnight high/low only exist once the overnight session is
            // over. Before 09:30 ET they are the running extremes so far, and
            // every new extreme would simply move the line.
            const bars = cur.bars;
            const hasEvening = bars.length && bars[0].m >= SESSION_START;
            const on = bars.filter((b) => b.m >= SESSION_START || b.m < RTH_OPEN);
            const firstRth = bars.findIndex((b) => b.m >= RTH_OPEN && b.m < SESSION_START);
            if (hasEvening && on.length && (firstRth >= 0 || p.showDevelopingOvernight)) {
                const onh = Math.max(...on.map((b) => b.h));
                const onl = Math.min(...on.map((b) => b.l));
                if (firstRth >= 0) {
                    const rthBars = bars.slice(firstRth);
                    line("brk", onh, "Overnight High", COLORS.brk, true, rthBars);
                    line("brk", onl, "Overnight Low", COLORS.brk, true, rthBars);
                } else {
                    line("developing", onh, "Overnight High so far", COLORS.developing, false, null);
                    line("developing", onl, "Overnight Low so far", COLORS.developing, false, null);
                }
            }
        }
        if (p.showRound) {
            const last = d.close();
            const step = p.showHalfRound ? L.roundStep / 2 : L.roundStep;
            const k1 = Math.floor((last + 1.5 * L.U) / step);
            for (let k = Math.ceil((last - 1.5 * L.U) / step); k <= k1; k++) {
                const y = k * step;
                const whole = Math.abs(y / L.roundStep - Math.round(y / L.roundStep)) < 1e-9;
                line("round", y, whole ? "Round Number" : "Half Round Number", COLORS.round, true);
            }
        }

        const items = [];
        const add = (key, g, style) => {
            if (groups[g].length) items.push({ tag: "LineSegments", key, lines: groups[g], lineStyle: style, global: true });
        };
        if (groups.zones.length) items.push({
            tag: "Shapes", key: "hvnZones", primitives: groups.zones,
            fillStyle: { color: COLORS.hvn, opacity: 0.16 }, global: true
        });
        add("hvnLines", "hvn", { lineWidth: 1, color: COLORS.hvn });
        add("poc", "poc", { lineWidth: 2, color: COLORS.poc });
        add("priorPoc", "pPoc", { lineWidth: 2, color: COLORS.pPoc });
        add("weekPoc", "weekPoc", { lineWidth: 2, color: COLORS.weekPoc });
        add("monthPoc", "monthPoc", { lineWidth: 2, color: COLORS.monthPoc });
        add("settle", "settle", { lineWidth: 1, color: COLORS.settle, lineStyle: 4 });
        add("neutral", "neutral", { lineWidth: 1, color: COLORS.neutral, lineStyle: 3 });
        add("breakProne", "brk", { lineWidth: 1, color: COLORS.brk, lineStyle: 3 });
        add("round", "round", { lineWidth: 1, color: COLORS.round, lineStyle: 5 });
        add("broken", "broken", { lineWidth: 1, color: COLORS.broken, lineStyle: 2 });
        add("developing", "developing", { lineWidth: 1, color: COLORS.developing, lineStyle: 5 });

        if (p.showLabels) items.push(...this.labels(marks, L, x0, d));
        return items;
    }

    // One text label per level. Levels closer than ~1.5% of the typical range
    // would print on top of each other, so they share one combined label.
    labels(marks, L, x0, d) {
        const p = this.props;
        const tol = 0.015 * L.U;
        const sorted = marks.slice().sort((a, b) => b.price - a.price);
        const merged = [];
        for (const m of sorted) {
            const g = merged[merged.length - 1];
            if (g && g.price - m.price <= tol) {
                g.text += "  |  " + m.text;
                if (m.color !== COLORS.round) g.color = g.color === COLORS.round ? m.color : g.color;
            } else {
                merged.push({ price: m.price, text: m.text, color: m.color });
            }
        }
        const x = p.labelSide === "left"
            ? op(x0, "+", px(p.labelOffsetPx))
            : op(du(d.index()), "+", px(p.labelOffsetPx));
        return merged.map((g, n) => ({
            tag: "Text",
            key: "lbl" + n,
            point: { x, y: op(du(g.price), "-", px(7)) },   // just above its line
            text: g.text,
            style: { fontSize: p.labelFontSize, fill: g.color },
            textAlignment: "rightMiddle",
            global: true
        }));
    }
}

module.exports = {
    name: "evidenceSRLevels",
    description: "Evidence-Based S/R Levels (HVN / POC / stop clusters)",
    calculator: EvidenceLevels,
    inputType: meta.InputType.BARS,
    areaChoice: "overlay",
    // ask Tradovate for per-bar volume-at-price (d.profile()); on bars coarser
    // than 1 minute it replaces the even high-low spread
    requirements: { volumeProfiles: true },
    params: {
        levelScale: predef.paramSpecs.enum({
            auto: "Auto (follows timeframe)",
            session: "Session (prior day)",
            week: "Week (prior week)",
            month: "Month (prior month)"
        }, "auto"),
        binSize: predef.paramSpecs.number(1.0, 0.25, 0.25),
        roundStep: predef.paramSpecs.number(100, 5, 1),
        hvnLookback: predef.paramSpecs.number(0, 1, 0),
        pocLookback: predef.paramSpecs.number(0, 1, 0),
        maxHVN: predef.paramSpecs.number(6, 1, 1),
        showHVN: predef.paramSpecs.bool(true),
        showPOC: predef.paramSpecs.bool(true),
        showPriorPOC: predef.paramSpecs.bool(true),
        showWeeklyPOC: predef.paramSpecs.bool(true),
        showMonthlyPOC: predef.paramSpecs.bool(true),
        showSettlement: predef.paramSpecs.bool(true),
        showPriorHL: predef.paramSpecs.bool(true),
        showOvernightHL: predef.paramSpecs.bool(true),
        showDevelopingOvernight: predef.paramSpecs.bool(false),
        markBroken: predef.paramSpecs.bool(true),
        showRound: predef.paramSpecs.bool(true),
        showHalfRound: predef.paramSpecs.bool(false),
        showLabels: predef.paramSpecs.bool(true),
        labelSide: predef.paramSpecs.enum({ right: "Right (latest bar)", left: "Left (period start)" }, "right"),
        labelOffsetPx: predef.paramSpecs.number(8, 1, 0),
        labelFontSize: predef.paramSpecs.number(11, 1, 6)
    },
    tags: ["Drawings"]
};
