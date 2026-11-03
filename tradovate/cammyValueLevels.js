/*
 * Cammy Capital's volume profile levels  (Tradovate custom indicator)
 *                                                      APPLY TO A 1-MINUTE CHART.
 *
 * Draws the levels Cammy's strategy is built from and the facts it reads off them, and
 * leaves every call Cammy makes by eye to you, labelled as yours. Taken from the 44
 * videos of the Order Flow and Volume Profile playlists (2024-2025); the brackets name
 * the video: VP n = Volume Profile Series, OF n = Order Flow Series. The checklist for
 * trading it is in tradovate/README.md.
 *
 * THE PROFILES (New York time; value area 70%; 1000 rows, as Cammy sets TradingView's
 * fixed range volume profile on a 1-minute chart [VP 10, 15, OF 12]):
 *   PW   previous week, Sunday 18:00 -> Friday 17:00, all week             orange
 *   PD   previous day: the latest RTH session, 09:30 -> 16:00, until the
 *        next 16:00 close, overnight included                              white
 *   ON   overnight, 18:00 -> 09:29, during the New York session             lavender
 *   dev  the developing profile of the session you are in: from 18:00 overnight
 *        (16:00 with overnightStart), from 09:30 in New York; blue VAH and VAL, red POC,
 *        and its histogram from the session's first bar [VP 10, 20, 26]
 * VAH is premium, POC fair value, VAL discount; above the POC is already premium,
 * below it discount [VP 12, 21].
 *
 * WHAT IT WORKS OUT (facts behind rules the strategy states)
 *   - first tap: which PW, PD and ON levels are untapped this session, and "1st" where
 *     each is first touched. A new developing profile starts a new session [VP 4, 5, 14]
 *   - stacks: levels of different profiles within stackTicks of each other, and how
 *     many [VP 3, 13, 14, 20, 22]. No distance is ever given: stackTicks is YOUR setting
 *   - the 30 minutes Cammy lets a developing profile form before trading it [VP 19, 20]
 *   - where the session opened and where price is now, against each profile's value
 *   - how far developing value has moved since it formed [VP 22, 24, 25]
 *   - the nearest levels above and below: the opposing levels Cammy targets [VP 3, 4, 14]
 *   - optional, off: VWAP and a band, which the latest video adds as a confluence and an
 *     exit, at TradingView's defaults (session anchor, 1 standard deviation) [VP 1]
 *
 * WHAT IT LEAVES TO YOU (Cammy's discretion; none of it is turned into a rule)
 *   - whether price holds or fails at fair value, and so which side to trade
 *   - which high-volume nodes, shelves and hard edges count: read the histogram
 *   - the profile's shape, and whether to fade an edge or wait for the break
 *   - whether a level has broken, and whether its retest holds
 *   - what else counts toward a grade: a node, an edge, the context
 *   - entry, stop, target and size
 *
 * HOW THE PROFILES ARE BUILT. Each 1-minute bar's volume is spread evenly across its
 * high-low range; on bars coarser than a minute, Tradovate's own volume at price is used
 * when the chart provides it. Rows are 1/1000 of a profile's range, never finer than a
 * tick (rows = 0: one row a tick). The POC is the row with the most volume (the middle of
 * a run of exact ties); the value area grows from it a row at a time toward the larger
 * neighbour until it holds 70%.
 * TradingView's own arithmetic is not published, so a level can sit a tick or a row from
 * what it shows. The clock is checked against CME's 18:00 ET reopen, so charts stamped in
 * local time or at bar close get the same sessions.
 */
const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

const RTH_OPEN = 570;       // 09:30 ET
const RTH_CLOSE = 960;      // 16:00 ET
const GLOBEX_OPEN = 1080;   // 18:00 ET: the next trading day starts
const DAY_MS = 86400000;
const VALUE_AREA = 0.7;     // Cammy's value area [VP 15]
const FORMING_MIN = 30;     // Cammy lets a developing profile build for 30 minutes [VP 19, 20]

const COLORS = {
    pw: "#ff9800", pd: "#e6e6e6", on: "#9fa8da",
    dev: "#2962ff", devPoc: "#f23645", vwap: "#26c6da",
    stack: "#ffd54f", panel: "#cfd8dc", yours: "#ffcc80", dim: "#78909c"
};
const PROFILES = {
    pw: { tag: "PW", show: "showWeek", color: COLORS.pw },
    pd: { tag: "PD", show: "showPrevDay", color: COLORS.pd },
    on: { tag: "ON", show: "showOvernight", color: COLORS.on },
    dev: { tag: "dev", show: "showDeveloping", color: COLORS.dev }
};
const PARTS = [["vah", "VAH"], ["poc", "POC"], ["val", "VAL"]];
const FIXED = ["pw", "pd", "on"];
// The latest bar always returns the same keys, empty when unused: an item a bar returned
// stays on the chart under its key until a later bar returns that key again.
const MAX_LABELS = 12, MAX_PANEL = 9;
const PANEL_TOP = 34;       // px from the top: below the platform's legend line

// ---------------------------------------------------------------- time ----
function nthSundayOfMonth(y, month, n) {
    const firstDow = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - firstDow) % 7) + 7 * (n - 1);
}

// US Eastern offset in ms (DST: 2nd Sunday of March 02:00 -> 1st Sunday of November 02:00)
function etOffsetMs(t) {
    const y = new Date(t).getUTCFullYear();
    const start = Date.UTC(y, 2, nthSundayOfMonth(y, 2, 2), 7);
    const end = Date.UTC(y, 10, nthSundayOfMonth(y, 10, 1), 6);
    return (t >= start && t < end ? -4 : -5) * 3600000;
}

const isDst = (t) => etOffsetMs(t) === -4 * 3600000;

// The CME trading day (18:00 ET starts the next one) and the minute of the day in ET,
// less the clock correction `shift` (minutes, per DST regime).
function clockOf(t, shift) {
    const et = t + etOffsetMs(t) - (isDst(t) ? shift.dst : shift.std) * 60000;
    return { key: Math.floor((et + 6 * 3600000) / DAY_MS), m: Math.floor((((et % DAY_MS) + DAY_MS) % DAY_MS) / 60000) };
}

// Weeks of Monday-Friday sessions: Sunday 18:00 opens Monday's (day 0 of the epoch is a Thursday)
const weekOf = (key) => Math.floor((key + 3) / 7);
const partOf = (m) => (m >= RTH_OPEN && m < RTH_CLOSE ? "rth" : m >= RTH_CLOSE && m < GLOBEX_OPEN ? "post" : "on");
const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

// ------------------------------------------------------------- profile ----
// One bar's volume into a profile of ticks: spread evenly across its high-low range, or
// Tradovate's own volume at price (b.vp) on bars coarser than a minute.
function spread(map, b, tick) {
    if (b.vp) {
        for (const lv of b.vp) {
            const k = Math.round(lv.price / tick);
            map.set(k, (map.get(k) || 0) + lv.vol);
        }
        return;
    }
    const lo = Math.round(b.l / tick), hi = Math.round(b.h / tick), w = b.v / (hi - lo + 1);
    for (let k = lo; k <= hi; k++) map.set(k, (map.get(k) || 0) + w);
}

// VAH, POC and VAL of the profile made of `maps` (tick -> volume), in ticks. `rows` rows
// across its range, never finer than a tick; the POC is the row with the most volume and
// the value area grows from it a row at a time, toward the larger neighbour (up on a tie),
// to 70%. Rows covered by the same bars hold exactly the same volume, so a young profile
// can be flat across many rows: the POC is then the middle of the lowest run of them.
function valueLevels(maps, rows) {
    let loT = Infinity, hiT = -Infinity, total = 0;
    for (const m of maps) {
        for (const [k, v] of m) {
            if (!(v > 1e-9)) continue;
            if (k < loT) loT = k;
            if (k > hiT) hiT = k;
            total += v;
        }
    }
    if (!(total > 0)) return null;
    const span = hiT - loT + 1;
    const per = rows > 0 ? Math.max(1, span / rows) : 1;     // ticks a row
    const n = Math.max(1, Math.ceil(span / per - 1e-9));
    const vol = new Float64Array(n);
    for (const m of maps) for (const [k, v] of m) if (v > 1e-9) vol[Math.min(n - 1, Math.floor((k - loT) / per + 1e-9))] += v;
    let poc = 0;
    for (let r = 1; r < n; r++) if (vol[r] > vol[poc]) poc = r;
    let run = poc;
    while (run + 1 < n && vol[run + 1] === vol[poc]) run++;
    poc = (poc + run) >> 1;
    let a = poc, b = poc, acc = vol[poc];
    while (acc < VALUE_AREA * total - 1e-9 && (a > 0 || b < n - 1)) {
        const up = b < n - 1 ? vol[b + 1] : -1, dn = a > 0 ? vol[a - 1] : -1;
        if (up >= dn) acc += vol[++b];
        else acc += vol[--a];
    }
    const bottom = (r) => loT + Math.ceil(r * per - 1e-9);           // lowest tick in row r
    const top = (r) => loT + Math.ceil((r + 1) * per - 1e-9) - 1;     // highest tick in row r
    return {
        loT, hiT, per, n, vol, poc, a, b, bottom, top,
        vahT: top(b), valT: bottom(a), pocT: Math.round((bottom(poc) + top(poc)) / 2)
    };
}

const fmtPx = (v, dp) => v.toFixed(dp);
const signed = (v, dp) => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(dp);

// Where a price sits against one profile's value, in Cammy's words [VP 12, 21]
function zoneOf(p, L, tick) {
    if (!L) return null;
    if (p > L.vah + tick / 2) return "above VAH (high premium)";
    if (p < L.val - tick / 2) return "below VAL (deep discount)";
    if (Math.abs(p - L.poc) <= tick / 2) return "at POC (fair value)";
    return p > L.poc ? "POC-VAH (premium)" : "VAL-POC (discount)";
}

// ---------------------------------------------------------- calculator ----
class CammyValueLevels {
    init() {
        this.bars = [];            // every finished bar, for a rebuild after a clock correction
        this.sessions = new Map(); // trading day -> its profiles by part, first bars, VWAP sums
        this.keys = [];            // trading days in order
        this.cache = new Map();    // finished profiles' levels
        this.shift = { dst: 0, std: 0 };
        this.reopens = { dst: {}, std: {} };
        this.gaps = {};            // bar spacing in minutes -> count
        this.barMin = 1;
        this.cur = null;           // the bar being mapped and what it found: it joins the profiles when the next bar starts
        this.resetState();
    }

    resetState() {
        // through the last finished bar
        this.st = { devId: null, taps: new Map(), formed: null, prevClose: null, lastPlot: {}, lastKey: null };
    }

    tick() {
        const p = this.props.tickSize;
        return p > 0 ? p : (this.contractInfo && this.contractInfo.tickSize) || 0.25;
    }

    // The videos never say how close levels must be to stack, so this is a setting. The
    // default follows their examples: about 1.5 points on ES, about 4 on NQ [VP 12, 22].
    stackTicks() {
        if (this.props.stackTicks > 0) return this.props.stackTicks;
        const ci = this.contractInfo || {};
        const name = `${ci.product || ""} ${ci.contract || ""} ${ci.name || ""}`.toUpperCase();
        if (/\bM?NQ/.test(name)) return 16;
        if (/\bM?ES/.test(name)) return 6;
        return 8;
    }

    session(key) {
        let S = this.sessions.get(key);
        if (!S) {
            S = {
                key, all: new Map(), rth: new Map(), on: new Map(), post: new Map(),
                first: {}, sv: 0, svp: 0, svp2: 0
            };
            this.sessions.set(key, S);
            this.keys.push(key);
        }
        return S;
    }

    prevSession(key) {
        for (let k = this.keys.length - 1; k >= 0; k--) if (this.keys[k] < key) return this.sessions.get(this.keys[k]);
        return null;
    }

    // A finished bar joins its session's profiles: the whole day, and its part of it.
    apply(b) {
        const S = this.session(b.key), part = partOf(b.m), tick = this.tick();
        spread(S.all, b, tick);
        spread(S[part], b, tick);
        const tp = (b.h + b.l + b.c) / 3;
        S.sv += b.v;
        S.svp += b.v * tp;
        S.svp2 += b.v * tp * tp;
        if (!S.first.any) S.first.any = b;
        if (!S.first[part]) S.first[part] = b;
    }

    // ---- the finished profiles ----
    levelsOf(cacheKey, maps) {
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        const L = valueLevels(maps, this.props.rows);
        const tick = this.tick();
        const out = L ? { vah: L.vahT * tick, poc: L.pocT * tick, val: L.valT * tick, hi: L.hiT * tick, lo: L.loT * tick } : null;
        this.cache.set(cacheKey, out);
        return out;
    }

    // PD: the latest RTH session that has closed. In 16:00-18:00 that is today's.
    dayLevels(key, part) {
        let S = part === "post" ? this.sessions.get(key) : null;
        if (!S || !S.rth.size) {
            S = null;
            for (let k = this.keys.length - 1; k >= 0; k--) {
                const s = this.sessions.get(this.keys[k]);
                if (this.keys[k] < key && s.rth.size) { S = s; break; }
            }
        }
        if (!S || !S.first.rth || S.first.rth.m !== RTH_OPEN) return null;    // not loaded from 09:30
        return this.levelsOf("pd" + S.key, [S.rth]);
    }

    // ON: this trading day's 18:00 -> 09:29, used in the New York session
    overnightLevels(key) {
        const S = this.sessions.get(key);
        if (!S || !S.on.size || !S.first.on || S.first.on.m !== GLOBEX_OPEN) return null;   // not loaded from 18:00
        return this.levelsOf("on" + key, [S.on]);
    }

    // PW: the previous week's sessions, if the chart holds them from Sunday's 18:00 open
    weekLevels(key) {
        const w = weekOf(key) - 1;
        const ks = this.keys.filter((k) => weekOf(k) === w);
        if (!ks.length) return null;
        const firstS = this.sessions.get(ks[0]);
        const loadedFromStart = this.keys[0] < ks[0] || (firstS.first.any && firstS.first.any.m === GLOBEX_OPEN);
        if (!loadedFromStart) return null;
        return this.levelsOf("pw" + w, ks.map((k) => this.sessions.get(k).all));
    }

    // ---- the developing profile of the session this bar is in ----
    // Its finished bars' profiles; the bar itself is added on top where it is read.
    devOf(b) {
        const S = this.session(b.key), part = partOf(b.m);
        const first = (pt) => S.first[pt] || (pt === part ? b : null);
        const mk = (id, maps, f, label) => ({ id, maps, first: f, label, from: hhmm(f.m) });
        if (part === "rth") return mk(b.key + "ny", [S.rth], first("rth"), "New York");
        if (this.props.overnightStart === "close") {
            if (part === "post") return mk("o" + b.key, [S.post], first("post"), "Overnight");
            const P = this.prevSession(b.key);
            return P && P.post.size ? mk("o" + P.key, [P.post, S.on], P.first.post, "Overnight")
                : mk("o" + b.key + "x", [S.on], first("on"), "Overnight");
        }
        if (part === "post") return null;          // between the New York close and the 18:00 open
        return mk(b.key + "on", [S.on], first("on"), "Overnight");
    }

    // Everything about one bar, against what had happened before it.
    evaluate(b) {
        const p = this.props, tick = this.tick(), part = partOf(b.m);
        const lv = {
            pw: this.weekLevels(b.key),
            pd: this.dayLevels(b.key, part),
            on: part === "rth" ? this.overnightLevels(b.key) : null,
            dev: null
        };
        const dev = this.devOf(b);
        let profile = null;
        if (dev) {
            const own = new Map();
            spread(own, b, tick);
            profile = valueLevels([...dev.maps, own], p.rows);
            if (profile) lv.dev = { vah: profile.vahT * tick, poc: profile.pocT * tick, val: profile.valT * tick };
        }
        const sameDev = dev && dev.id === this.st.devId;
        const elapsed = dev ? (b.t - dev.first.t) / 60000 : 0;
        const res = {
            b, lv, dev, profile, taps: [], elapsed,
            starts: !!dev && !sameDev,
            forms: !!dev && elapsed >= FORMING_MIN && !(sameDev && this.st.formed)
        };

        // First taps: the first bar of this session to reach each PW, PD and ON level. A
        // gap across a level counts, inside the session; an opening gap does not.
        if (dev) {
            const tol = this.stackTicks() * tick;
            const prevClose = sameDev ? this.st.prevClose : null;
            for (const pr of FIXED) {
                const L = lv[pr];
                if (!L) continue;
                for (const [part2, nm] of PARTS) {
                    const name = `${PROFILES[pr].tag} ${nm}`, P = L[part2];
                    if (sameDev && this.st.taps.has(name)) continue;
                    const touched = (b.l - tick / 4 <= P && P <= b.h + tick / 4) ||
                        (prevClose != null && ((prevClose < P && b.l > P) || (prevClose > P && b.h < P)));
                    if (!touched) continue;
                    const stacked = [];
                    for (const other of ["pw", "pd", "on", "dev"]) {
                        if (other === pr || !lv[other]) continue;
                        for (const [part3, nm3] of PARTS) {
                            if (Math.abs(lv[other][part3] - P) <= tol + 1e-9) stacked.push(`${PROFILES[other].tag} ${nm3}`);
                        }
                    }
                    res.taps.push({ name, profile: pr, price: P, stacked });
                }
            }
        }
        return res;
    }

    // Fold a finished bar into the state the next bars are judged against.
    commit(res) {
        const st = this.st, b = res.b;
        this.apply(b);
        if (res.dev && res.dev.id !== st.devId) {
            st.devId = res.dev.id;
            st.taps = new Map();
            st.formed = null;
            st.prevClose = null;
        }
        for (const t of res.taps) st.taps.set(t.name, { i: b.i, m: b.m });
        if (res.forms && res.lv.dev) st.formed = { m: b.m, lv: res.lv.dev };
        if (res.dev) st.prevClose = b.c;
        if (res.intended) st.lastPlot = res.intended;
        st.lastKey = b.key;
    }

    // Tradovate's bar times should read 18:00 ET at each reopen after the daily halt. A
    // whole number of hours off (local-time stamps) or one bar late (bar-close stamps)
    // would move every session, so that offset is taken out, separately for daylight and
    // standard time. Other offsets are missing bars and are ignored.
    checkClock(b, prev) {
        if (!prev) return false;
        const gap = (b.t - prev.t) / 60000;
        if (gap > 0 && gap <= 60 && prev.key === b.key) {
            this.gaps[gap] = (this.gaps[gap] || 0) + 1;
            let best = this.barMin, n = 0;
            for (const g in this.gaps) if (this.gaps[g] > n) { n = this.gaps[g]; best = +g; }
            this.barMin = best;
        }
        if (gap < this.barMin + 45 || gap > 4 * 1440) return false;
        const raw = clockOf(b.t, { dst: 0, std: 0 }).m;
        const off = ((raw - GLOBEX_OPEN + 720) % 1440 + 1440) % 1440 - 720;
        if (off % 60 !== 0 && off !== this.barMin) return false;
        const regime = isDst(b.t) ? "dst" : "std", c = this.reopens[regime];
        c[off] = (c[off] || 0) + 1;
        let best = 0, n = 0;
        for (const o in c) if (c[o] > n) { n = c[o]; best = +o; }
        if (best === this.shift[regime]) return false;
        this.shift = { ...this.shift, [regime]: best };
        if (!Object.keys(this.reopens[regime === "dst" ? "std" : "dst"]).length) this.shift[regime === "dst" ? "std" : "dst"] = best;
        return true;
    }

    // After a clock correction: every bar's session again, replayed as it happened.
    rebuild() {
        this.sessions = new Map();
        this.keys = [];
        this.cache = new Map();
        this.resetState();
        for (const b of this.bars) {
            const c = clockOf(b.t, this.shift);
            b.key = c.key;
            b.m = c.m;
            const res = this.evaluate(b);
            this.plots(res);
            this.commit(res);
        }
    }

    map(d) {
        const idx = d.index();
        const bar = { i: idx, t: d.timestamp().getTime(), o: d.open(), h: d.high(), l: d.low(), c: d.close(), v: d.volume() };
        // the same bar again, further formed, is read afresh; a new bar finishes the last one
        const again = !!this.cur && this.cur.b.i === idx;
        if (!again && this.cur) {
            this.commit(this.cur);
            this.bars.push(this.cur.b);
        }
        const prev = this.bars.length ? this.bars[this.bars.length - 1] : null;
        let c = clockOf(bar.t, this.shift);
        bar.key = c.key;
        bar.m = c.m;
        if (!again && this.checkClock(bar, prev)) {
            this.rebuild();
            c = clockOf(bar.t, this.shift);
            bar.key = c.key;
            bar.m = c.m;
        }
        // a 1-minute profile spreads each bar's volume evenly; coarser bars use Tradovate's
        // own volume at price when the chart has it
        if (this.barMin > 1 && typeof d.profile === "function") {
            try {
                const vp = d.profile();
                if (vp && vp.length) bar.vp = vp.map((lv) => ({ price: lv.price, vol: lv.vol }));
            } catch (e) { /* not provided on this chart */ }
        }
        const res = this.evaluate(bar);
        this.cur = res;
        this.trim();

        const out = this.plots(res);
        const items = this.barItems(res);
        if (d.isLast()) items.push(...this.globalItems(res));
        if (items.length) out.graphics = { items };
        return out;
    }

    // Keep the bars and sessions the previous week's profile can still need.
    trim() {
        if (this.bars.length < 20000 || this.keys.length < 14) return;
        const keepFrom = this.keys[this.keys.length - 13];
        const k = this.bars.findIndex((b) => b.key >= keepFrom);
        if (k > 0) this.bars = this.bars.slice(k);
        while (this.keys.length && this.keys[0] < keepFrom) this.sessions.delete(this.keys.shift());
    }

    // ---- per-bar output ----
    plots(res) {
        const p = this.props, st = this.st, out = {}, intended = {}, lv = res.lv;
        for (const pr of FIXED) {
            const L = p[PROFILES[pr].show] ? lv[pr] : null;
            for (const [part] of PARTS) {
                const name = pr + part[0].toUpperCase() + part.slice(1), v = L ? L[part] : null, last = st.lastPlot[name];
                if (v == null) continue;
                intended[name] = v;
                // a level that changes starts a new line instead of joining the old one
                if (last == null || Math.abs(last - v) <= 1e-9) out[name] = v;
            }
        }
        const D = p.showDeveloping && lv.dev && !res.starts ? lv.dev : null;
        if (D) {
            out.devVah = D.vah;
            out.devPoc = D.poc;
            out.devVal = D.val;
        }
        if (p.showVWAP) {
            const S = this.sessions.get(res.b.key), b = res.b, tp = (b.h + b.l + b.c) / 3;
            const sv = S.sv + b.v, svp = S.svp + b.v * tp, svp2 = S.svp2 + b.v * tp * tp;
            if (sv > 0 && st.lastKey === b.key) {
                const vw = svp / sv, sd = Math.sqrt(Math.max(0, svp2 / sv - vw * vw));
                out.vwap = vw;
                out.vwapUpper = vw + p.vwapBand * sd;
                out.vwapLower = vw - p.vwapBand * sd;
            }
        }
        res.intended = intended;
        return out;
    }

    barItems(res) {
        const p = this.props, items = [], b = res.b, fs = p.labelFontSize;
        if (p.showFirstTaps) {
            // taps on one bar close in price share one mark; "x2" counts a tap's stack
            const taps = res.taps.filter((t) => p[PROFILES[t.profile].show]).sort((x, y) => y.price - x.price);
            const tol = this.mergeTol(res.lv);
            const marks = [];
            for (const t of taps) {
                const m = marks[marks.length - 1], n = t.stacked.length + 1;
                const text = t.name + (n > 1 ? ` x${n}` : "");
                if (m && m.price - t.price <= tol) m.text += " + " + text;
                else marks.push({ price: t.price, text, color: PROFILES[t.profile].color, key: t.name });
            }
            for (const m of marks) {
                items.push({
                    tag: "Text", key: "tap " + m.key,
                    point: { x: du(b.i), y: op(du(m.price), "-", px(8)) },
                    text: "1st " + m.text,
                    style: { fontSize: fs - 1, fontWeight: "bold", fill: m.color },
                    textAlignment: "leftMiddle"
                });
            }
        }
        if (p.showSessions && res.dev && (res.starts || res.forms)) {
            // a dotted line at the bar, its text on a row under the panel, the formed mark a row lower
            const at = (key, text, row) => {
                items.push({
                    tag: "LineSegments", key: key + "Line",
                    lines: [{ tag: "Line", a: { x: du(b.i), y: px(0) }, b: { x: du(b.i), y: px(4000) } }],
                    lineStyle: { lineWidth: 1, color: COLORS.dim, lineStyle: 3 }
                });
                items.push({
                    tag: "Text", key: key + "Text",
                    point: { x: op(du(b.i), "+", px(4)), y: px(PANEL_TOP + (MAX_PANEL + row) * (fs + 4) + 4) },
                    text, style: { fontSize: fs - 1, fill: COLORS.dim }, textAlignment: "leftMiddle"
                });
            };
            if (res.starts) at("devStart", `${hhmm(b.m)} ${res.dev.label} profile starts`, 0);
            else at("devFormed", `${hhmm(b.m)} formed (${FORMING_MIN} min)`, 1);
        }
        return items;
    }

    // Levels nearer than this would print on top of each other: they share one label.
    mergeTol(lv) {
        const range = lv.pd ? lv.pd.hi - lv.pd.lo : 0;
        return Math.max(this.stackTicks() * this.tick(), 0.02 * range);
    }

    // ---- the current state, drawn once at the latest bar ----
    activeLevels(res) {
        const p = this.props, out = [];
        for (const pr of ["pw", "pd", "on", "dev"]) {
            const L = res.lv[pr];
            if (!L || !p[PROFILES[pr].show]) continue;
            for (const [part, nm] of PARTS) {
                out.push({ profile: pr, name: `${PROFILES[pr].tag} ${nm}`, part, price: L[part],
                           color: pr === "dev" && part === "poc" ? COLORS.devPoc : PROFILES[pr].color });
            }
        }
        return out;
    }

    // Groups of levels within stackTicks of each other, most of all from different profiles
    stacks(levels) {
        const tol = this.stackTicks() * this.tick() + 1e-9;
        const sorted = levels.slice().sort((a, b) => a.price - b.price);
        const groups = [];
        for (const lv of sorted) {
            const g = groups[groups.length - 1];
            if (g && lv.price - g[0].price <= tol) g.push(lv);
            else groups.push([lv]);
        }
        return groups.filter((g) => new Set(g.map((x) => x.profile)).size >= 2);
    }

    globalItems(res) {
        const p = this.props, tick = this.tick(), dp = (String(tick).split(".")[1] || "").length;
        const items = [], b = res.b, levels = this.activeLevels(res), fs = p.labelFontSize;
        const tapState = (name) => {
            const sameDev = res.dev && res.dev.id === this.st.devId;
            const t = (sameDev && this.st.taps.get(name)) || res.taps.find((x) => x.name === name) && { m: b.m };
            return t ? `1st tap ${hhmm(t.m)}` : "untapped";
        };
        const stacks = p.showStacks ? this.stacks(levels) : [];

        items.push({
            tag: "Shapes", key: "stacks", global: true,
            primitives: !res.dev ? [] : stacks.map((g) => {
                const lo = g[0].price - tick / 2, hi = g[g.length - 1].price + tick / 2;
                return { tag: "Polygon", points: [
                    { x: du(res.dev.first.i), y: du(hi) }, { x: op(du(b.i), "+", px(8)), y: du(hi) },
                    { x: op(du(b.i), "+", px(8)), y: du(lo) }, { x: du(res.dev.first.i), y: du(lo) }
                ] };
            }),
            fillStyle: { color: COLORS.stack, opacity: 0.16 }
        });

        items.push(...this.histogram(p.showProfile && res.profile && res.dev ? res : null));

        const labels = [];
        if (p.showLabels && levels.length) {
            // one label a level; levels too close to read apart share one, and a stack says so
            const tol = this.mergeTol(res.lv);
            const marks = levels.map((lv) => ({
                ...lv, text: `${lv.name} ${fmtPx(lv.price, dp)}` + (lv.profile === "dev" ? "" : ` (${tapState(lv.name)})`)
            })).sort((a, b2) => b2.price - a.price);
            const groups = [];
            for (const m of marks) {
                const g = groups[groups.length - 1];
                if (g && g[0].price - m.price <= tol) g.push(m);
                else groups.push([m]);
            }
            for (const g of groups) {
                const st = stacks.find((s) => g.some((m) => s.includes(levels.find((x) => x.name === m.name))));
                labels.push({ price: g[0].price, text: (st ? `STACK x${st.length}  ` : "") + g.map((m) => m.text).join("  |  "),
                              fill: st ? COLORS.stack : g[0].color });
            }
        }
        for (let k = 0; k < MAX_LABELS; k++) {
            const L = labels[k] || { price: b.c, text: "", fill: COLORS.dim };
            items.push({
                tag: "Text", key: "lbl" + k, global: true,
                point: { x: op(du(b.i), "+", px(p.labelOffsetPx)), y: op(du(L.price), "-", px(7)) },
                text: L.text, style: { fontSize: fs, fill: L.fill }, textAlignment: "rightMiddle"
            });
        }

        items.push(...this.panel(res, levels, stacks, dp));
        return items;
    }

    // The developing profile, drawn from its session's first bar as Cammy drags it [VP 10, 15].
    // Null draws nothing, under the same keys.
    histogram(res) {
        const groups = { va: [], out: [], poc: [] };
        const P = res && res.profile;
        if (P) {
            const p = this.props, tick = this.tick();
            const g = Math.max(1, Math.ceil(P.n / 120)), rows = [];
            let max = 0;
            for (let j = 0; j * g < P.n; j++) {
                const r0 = j * g, r1 = Math.min(P.n, (j + 1) * g) - 1;
                let v = 0;
                for (let r = r0; r <= r1; r++) v += P.vol[r];
                rows.push({ r0, r1, v });
                if (v > max) max = v;
            }
            const x0 = p.profileSide === "right" ? op(du(res.b.i), "+", px(14)) : du(res.dev.first.i);
            for (const row of rows) {
                if (!(max > 0)) break;
                const lo = (P.bottom(row.r0) - 0.5) * tick, hi = (P.top(row.r1) + 0.5) * tick;
                const x1 = op(x0, "+", px(Math.max(1, (p.profileWidthPx * row.v) / max)));
                const poly = { tag: "Polygon", points: [{ x: x0, y: du(hi) }, { x: x1, y: du(hi) }, { x: x1, y: du(lo) }, { x: x0, y: du(lo) }] };
                const isPoc = P.poc >= row.r0 && P.poc <= row.r1;
                groups[isPoc ? "poc" : row.r1 >= P.a && row.r0 <= P.b ? "va" : "out"].push(poly);
            }
        }
        return [
            { tag: "Shapes", key: "profOut", global: true, primitives: groups.out, fillStyle: { color: COLORS.dev, opacity: 0.14 } },
            { tag: "Shapes", key: "profVa", global: true, primitives: groups.va, fillStyle: { color: COLORS.dev, opacity: 0.32 } },
            { tag: "Shapes", key: "profPoc", global: true, primitives: groups.poc, fillStyle: { color: COLORS.devPoc, opacity: 0.55 } }
        ];
    }

    // Facts in the top-left corner; the last line is what stays yours to judge.
    panel(res, levels, stacks, dp) {
        const p = this.props, tick = this.tick(), b = res.b, lines = [], fs = p.labelFontSize;
        const lv = res.lv, dev = res.dev;
        const zones = (price, which) => which.filter((pr) => lv[pr]).map((pr) => `${PROFILES[pr].tag} ${zoneOf(price, lv[pr], tick)}`).join(" | ");
        if (dev) {
            const formAt = hhmm((dev.first.m + FORMING_MIN) % 1440);
            const formed = res.elapsed >= FORMING_MIN;
            lines.push([`${dev.label} session: developing profile from ${dev.from}` +
                (formed ? `, formed at ${formAt}` : `, FORMING until ${formAt} (Cammy waits 30 min` + (dev.label === "Overnight" ? "; overnight, usually from 19:00)" : ")")), COLORS.panel]);
            const opened = zones(dev.first.o, dev.label === "New York" ? ["pd", "on", "pw"] : ["pd", "pw"]);
            if (opened) lines.push([`Opened ${hhmm(dev.first.m)} at ${fmtPx(dev.first.o, dp)}: ${opened}`, COLORS.panel]);
        } else {
            lines.push(["16:00-18:00: between sessions. The next developing profile starts at 18:00", COLORS.panel]);
        }
        const now = zones(b.c, ["pd", "on", "pw"]);
        if (now) lines.push([`Now ${fmtPx(b.c, dp)}: ${now}`, COLORS.panel]);
        const formed = dev && this.st.devId === dev.id ? this.st.formed : null;
        if (formed && lv.dev) {
            lines.push([`Developing value since ${hhmm(formed.m)}: POC ${signed(lv.dev.poc - formed.lv.poc, dp)}, VAH ${signed(lv.dev.vah - formed.lv.vah, dp)}, VAL ${signed(lv.dev.val - formed.lv.val, dp)}`, COLORS.panel]);
        }
        const fixed = levels.filter((x) => x.profile !== "dev");
        if (dev && fixed.length) {
            const sameDev = this.st.devId === dev.id;
            const open = fixed.filter((x) => !(sameDev && this.st.taps.has(x.name)) && !res.taps.some((t) => t.name === x.name));
            lines.push([open.length ? `Untapped this session: ${open.map((x) => x.name).join(", ")}` : "Every PW, PD and ON level has been tapped this session", COLORS.panel]);
        }
        const near = (sign) => {
            const at = new Map();
            for (const x of levels.filter((x) => sign * (x.price - b.c) > tick / 2).sort((x, y) => sign * (x.price - y.price))) {
                const k = fmtPx(x.price, dp);
                if (!at.has(k)) at.set(k, { names: [], price: x.price });
                at.get(k).names.push(x.name);
            }
            return [...at.values()].slice(0, 2).map((g) => `${g.names.join(" + ")} ${fmtPx(g.price, dp)} (${signed(g.price - b.c, dp)})`).join(", ");
        };
        const up = near(1), dn = near(-1);
        if (up || dn) lines.push([`Next above: ${up || "none"}   Next below: ${dn || "none"}`, COLORS.panel]);
        if (stacks.length) lines.push([`Stacked now: ` + stacks.map((g) => g.map((x) => x.name).join(" + ")).join("; "), COLORS.stack]);
        lines.push([`Yours: hold/fail at fair value, nodes & edges, shape, breaks & retests, the side. Stack = ${this.stackTicks()} ticks (your setting)`, COLORS.yours]);
        // below the platform's legend line, on a backing sized to the text (about 0.56 em a character)
        const top = PANEL_TOP, step = fs + 4, shown = p.showPanel ? lines : [];
        const width = Math.max(0, ...shown.map(([t]) => t.length)) * fs * 0.56 + 16;
        const out = [{
            tag: "Shapes", key: "panelBox", global: true,
            primitives: shown.length ? [{ tag: "Polygon", points: [
                { x: px(2), y: px(top - step / 2 - 3) }, { x: px(2 + width), y: px(top - step / 2 - 3) },
                { x: px(2 + width), y: px(top + (shown.length - 0.5) * step + 3) }, { x: px(2), y: px(top + (shown.length - 0.5) * step + 3) }
            ] }] : [],
            fillStyle: { color: "#0e1116", opacity: 0.78 }
        }];
        for (let k = 0; k < MAX_PANEL; k++) {
            const [text, fill] = shown[k] || ["", COLORS.panel];
            out.push({
                tag: "Text", key: "panel" + k, global: true,
                point: { x: px(8), y: px(top + k * step) },
                text, style: { fontSize: fs, fill }, textAlignment: "leftMiddle"
            });
        }
        return out;
    }
}

module.exports = {
    name: "cammyValueLevels",
    description: "Cammy Capital's volume profile levels (week, day, overnight, developing)",
    calculator: CammyValueLevels,
    inputType: meta.InputType.BARS,
    areaChoice: "overlay",
    // per-bar volume at price, used on bars coarser than a minute
    requirements: { volumeProfiles: true },
    params: {
        tickSize: predef.paramSpecs.number(0, 0.01, 0),
        rows: predef.paramSpecs.number(1000, 1, 0),
        overnightStart: predef.paramSpecs.enum({ globex: "18:00 (Globex open)", close: "16:00 (with post-close volume)" }, "globex"),
        stackTicks: predef.paramSpecs.number(0, 1, 0),
        showWeek: predef.paramSpecs.bool(true),
        showPrevDay: predef.paramSpecs.bool(true),
        showOvernight: predef.paramSpecs.bool(true),
        showDeveloping: predef.paramSpecs.bool(true),
        showProfile: predef.paramSpecs.bool(true),
        profileSide: predef.paramSpecs.enum({ start: "From the session's first bar", right: "Right of the latest bar" }, "start"),
        profileWidthPx: predef.paramSpecs.number(140, 10, 20),
        showFirstTaps: predef.paramSpecs.bool(true),
        showStacks: predef.paramSpecs.bool(true),
        showSessions: predef.paramSpecs.bool(true),
        showLabels: predef.paramSpecs.bool(true),
        showPanel: predef.paramSpecs.bool(true),
        showVWAP: predef.paramSpecs.bool(false),
        vwapBand: predef.paramSpecs.number(1, 0.25, 0),
        labelOffsetPx: predef.paramSpecs.number(8, 1, -400),
        labelFontSize: predef.paramSpecs.number(11, 1, 6)
    },
    plots: {
        pwVah: { title: "Prev week VAH" }, pwPoc: { title: "Prev week POC" }, pwVal: { title: "Prev week VAL" },
        pdVah: { title: "Prev day VAH" }, pdPoc: { title: "Prev day POC" }, pdVal: { title: "Prev day VAL" },
        onVah: { title: "Overnight VAH" }, onPoc: { title: "Overnight POC" }, onVal: { title: "Overnight VAL" },
        devVah: { title: "Developing VAH" }, devPoc: { title: "Developing POC" }, devVal: { title: "Developing VAL" },
        vwap: { title: "VWAP" }, vwapUpper: { title: "VWAP upper band" }, vwapLower: { title: "VWAP lower band" }
    },
    tags: ["Volume profile"],
    schemeStyles: {
        dark: {
            pwVah: { color: COLORS.pw }, pwPoc: { color: COLORS.pw, lineWidth: 2 }, pwVal: { color: COLORS.pw },
            pdVah: { color: COLORS.pd }, pdPoc: { color: COLORS.pd, lineWidth: 2 }, pdVal: { color: COLORS.pd },
            onVah: { color: COLORS.on, lineStyle: 3 }, onPoc: { color: COLORS.on, lineWidth: 2, lineStyle: 3 }, onVal: { color: COLORS.on, lineStyle: 3 },
            devVah: { color: COLORS.dev }, devPoc: { color: COLORS.devPoc, lineWidth: 2 }, devVal: { color: COLORS.dev },
            vwap: { color: COLORS.vwap }, vwapUpper: { color: COLORS.vwap, lineStyle: 3 }, vwapLower: { color: COLORS.vwap, lineStyle: 3 }
        }
    }
};
