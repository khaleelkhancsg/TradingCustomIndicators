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
    brk: "#ef5350",
    round: "#9e9e9e"
};

// Per-scale definitions. SESSION reproduces the tested research exactly.
const SCALES = {
    session: { hvn: 20, poc: 5, prefix: "PD", hvnTag: "20s", pocTag: "5s", pPocTag: "pdPOC" },
    week: { hvn: 12, poc: 4, prefix: "PW", hvnTag: "12W", pocTag: "4W", pPocTag: "pwPOC" },
    month: { hvn: 12, poc: 3, prefix: "PM", hvnTag: "12M", pocTag: "3M", pPocTag: "pmPOC" }
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

// CME session key (18:00 ET -> 17:00 ET belongs to the next day) and ET minute
function sessionInfo(t) {
    const et = t + etOffsetMs(t);
    const key = Math.floor((et + 6 * 3600000) / DAY_MS);
    const minute = Math.floor((((et % DAY_MS) + DAY_MS) % DAY_MS) / 60000);
    return { key, minute };
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
    computeLevels(scale, done, barMin) {
        const p = this.props;
        const def = SCALES[scale];
        const hvnN = p.hvnLookback > 0 ? p.hvnLookback : def.hvn;
        const pocN = p.pocLookback > 0 ? p.pocLookback : def.poc;

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
        const out = { scale, U, bin, hvn: [], poc: null, pPoc: null, ph: null, pl: null };

        const composite = (n) => {
            if (done.length < n) return null;
            const bars = [];
            for (const per of done.slice(-n)) for (const b of per.bars) bars.push(b);
            const { prof, lo } = buildProfile(bars, bin, useVp);
            const sm = gaussianSmooth(prof, Math.max(1, 0.015 * U / bin));
            return { sm, lo };
        };
        const price = (lo, i) => lo + i * bin + bin / 2;

        const cH = composite(hvnN);
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
        out.roundStep = scale === "session" ? p.roundStep : niceStepAtLeast(Math.max(p.roundStep, 0.36 * U));
        return out;
    }

    map(d) {
        const t = d.timestamp().getTime();
        const { key, minute } = sessionInfo(t);
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
        const scale = this.props.levelScale === "auto" ? autoScale(barMin) : this.props.levelScale;
        const periods = this.groupPeriods(scale);
        const cur = periods[periods.length - 1];
        const done = periods.slice(0, -1);
        const ck = scale + ":" + (done.length ? done[done.length - 1].key : "none");
        if (ck !== this.cacheKey) {
            this.levels = this.computeLevels(scale, done, barMin);
            this.cacheKey = ck;
            // drop bars no level can reach any more
            const need = Math.max(SCALES[scale].hvn, SCALES[scale].poc, this.props.hvnLookback,
                this.props.pocLookback, 10) + 1;
            if (periods.length > need + 1) {
                const firstKept = periods[periods.length - 1 - need].bars[0];
                this.bars = this.bars.slice(this.bars.indexOf(firstKept));
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
        const groups = { zones: [], hvn: [], poc: [], pPoc: [], brk: [], round: [] };
        const marks = [];   // {price, text, color} - one label per drawn level

        const line = (g, y, text, color) => {
            groups[g].push({ tag: "Line", a: { x: x0, y: du(y) }, b: { x: xEnd, y: du(y) }, infiniteEnd: true });
            marks.push({ price: y, text, color });
        };

        if (p.showHVN) {
            for (const z of L.hvn) {
                groups.zones.push({ tag: "Polygon", points: [
                    { x: x0, y: du(z.top) }, { x: xFar, y: du(z.top) },
                    { x: xFar, y: du(z.bottom) }, { x: x0, y: du(z.bottom) }
                ] });
                line("hvn", z.price, `HVN ${def.hvnTag} ${fmt(z.price)}`, COLORS.hvn);
            }
        }
        if (p.showPOC && L.poc != null) line("poc", L.poc, `POC ${def.pocTag} ${fmt(L.poc)}`, COLORS.poc);
        if (p.showPriorPOC && L.pPoc != null) line("pPoc", L.pPoc, `${def.pPocTag} ${fmt(L.pPoc)}`, COLORS.pPoc);
        if (p.showPriorHL && L.ph != null) {
            line("brk", L.ph, `${def.prefix}H ${fmt(L.ph)} break-prone`, COLORS.brk);
            line("brk", L.pl, `${def.prefix}L ${fmt(L.pl)} break-prone`, COLORS.brk);
        }
        if (p.showOvernightHL && L.scale === "session") {
            const bars = cur.bars;
            const hasEvening = bars.length && bars[0].m >= SESSION_START;
            const on = bars.filter((b) => b.m >= SESSION_START || b.m < RTH_OPEN);
            if (hasEvening && on.length) {
                const onh = Math.max(...on.map((b) => b.h));
                const onl = Math.min(...on.map((b) => b.l));
                line("brk", onh, `ONH ${fmt(onh)} break-prone`, COLORS.brk);
                line("brk", onl, `ONL ${fmt(onl)} break-prone`, COLORS.brk);
            }
        }
        if (p.showRound) {
            const last = d.close();
            const step = p.showHalfRound ? L.roundStep / 2 : L.roundStep;
            const k1 = Math.floor((last + 1.5 * L.U) / step);
            for (let k = Math.ceil((last - 1.5 * L.U) / step); k <= k1; k++) {
                const y = k * step;
                const whole = Math.abs(y / L.roundStep - Math.round(y / L.roundStep)) < 1e-9;
                line("round", y, `R${fmt(whole ? L.roundStep : step)} ${fmt(y)}`, COLORS.round);
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
        add("breakProne", "brk", { lineWidth: 1, color: COLORS.brk, lineStyle: 3 });
        add("round", "round", { lineWidth: 1, color: COLORS.round, lineStyle: 5 });

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
        showPriorHL: predef.paramSpecs.bool(true),
        showOvernightHL: predef.paramSpecs.bool(true),
        showRound: predef.paramSpecs.bool(true),
        showHalfRound: predef.paramSpecs.bool(false),
        showLabels: predef.paramSpecs.bool(true),
        labelSide: predef.paramSpecs.enum({ right: "Right (latest bar)", left: "Left (period start)" }, "right"),
        labelOffsetPx: predef.paramSpecs.number(8, 1, 0),
        labelFontSize: predef.paramSpecs.number(11, 1, 6)
    },
    tags: ["Drawings"]
};
