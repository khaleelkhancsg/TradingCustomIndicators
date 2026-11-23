/*
 * EMA + MACD databox  (Tradovate custom indicator)              ANY TIMEFRAME, ANY BARS.
 *
 * A box in a corner of the chart, one row for the EMA cross and one for the MACD:
 *
 *     EMA 12/26       Long                12 bars
 *     MACD 12/26/9    Potentially short    3 bars
 *
 * EACH ROW is the side of its latest cross:
 *   EMA    Long while the fast EMA is above the slow one, Short while it is below.
 *   MACD   Long while the MACD line is above its signal line, Short while it is below.
 * A difference of exactly zero is not a cross: the row keeps its side.
 * At the defaults the two rows share their EMAs: the MACD line is the 12 EMA minus the 26,
 * so the EMA row reads the MACD line against zero, and the MACD row it against its signal.
 *
 * AND WHETHER IT IS TURNING, on the bar it reads against the bars before it.
 *   MACD   The histogram (the MACD line minus the signal line, as Tradovate's MACD plots
 *          it) is smaller than the bar before: nearer zero.
 *   EMA    The gap between the EMAs closed by more on this bar than on the bar before:
 *          the lines are heading for a cross, and faster.
 *          A gap still closing, but more slowly, is not a warning. That is what a fading
 *          bounce in a drop, or a fading pullback in a rise, looks like: the lagging EMAs
 *          drift together for a while after the move has run out, which the MACD's
 *          histogram already shows. "Closing at all" warns on any closing gap instead,
 *          as the first version did.
 * On the long side a warning reads Potentially short; on the short side, Potentially
 * long. Each row's warning can be switched off.
 *
 * The count is how many bars the row has been on its side, the cross bar included, and
 * the forming bar too while the box reads it. A warning does not reset it: the lines have
 * not crossed.
 *
 * LIVE, BY DEFAULT. The box reads the forming bar, so it moves with each tick, as
 * Tradovate's EMA and MACD lines do. A row can change and change back while a bar forms.
 * Once the bar closes, the row reads what it would have read at bar close.
 * "Updates: At bar close" reads the last finished bar instead: one change a bar, and no
 * flicker. Until 2026-11-23 this was "Read forming bar", off by default; a saved value of
 * that setting is no longer read.
 *
 * WHERE IT SITS. In a corner of the chart ("Corner"), "Box X" and "Box Y" pixels in from
 * it. Tradovate gives an indicator no mouse input, so the box cannot be dragged: move it
 * with these settings.
 *
 * ANY TIMEFRAME. It reads the chart's own bars, whatever they are: minutes, hours,
 * days, ticks, range or Renko. Put it on each chart you want read.
 *
 * THE ARITHMETIC is Tradovate's own (tools/EMA.js, and the built-in MACD). Each EMA is
 * the average of its first n values, then value + 2 / (n + 1) of each step. The MACD
 * is the fast EMA minus the slow one from the first bar. Its signal starts on bar
 * slow - 1. So the rows agree with Tradovate's EMA and MACD drawn on the same chart,
 * at the same settings, to the last digit. A row reads "Warming up" until its slow EMA,
 * or the MACD's signal line, has had its full length.
 */
const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px } = require("./tools/graphics");

const COLORS = {
    long: "#26a65b", short: "#d1566e",
    potShort: "#e0a341", potLong: "#a8d36a",
    label: "#c3c2b7", dim: "#898781", box: "#0e1116", edge: "#3a404c"
};
const KEEP = 3;    // bars of state kept: the bar being mapped and the two before it

// The corners the box can sit in. Tradovate's `origin` moves a graphic's zero to a corner
// of the chart and keeps the axes' direction: x still grows to the right and y down. So
// from a right-hand corner, a point inside the chart has a negative x ("we need to use
// negative numbers to move into the visible quadrant", its Creating Advanced Custom
// Indicators guide), and from a bottom corner a negative y.
const CORNERS = {
    topLeft: { right: false, bottom: false, origin: null },
    topRight: { right: true, bottom: false, origin: { cs: "grid", h: "right", v: "top" } },
    bottomLeft: { right: false, bottom: true, origin: { cs: "grid", h: "left", v: "bottom" } },
    bottomRight: { right: true, bottom: true, origin: { cs: "grid", h: "right", v: "bottom" } }
};

// Tradovate's EMA as a step from the previous bar's state, so a bar mapped again as it
// forms starts from the same place every time: the average of the first `n` values,
// then prev + 2 / (n + 1) * (x - prev), in the same order as tools/EMA.js.
function emaStep(prev, x, n) {
    if (!prev || prev.count < n) {
        const count = prev ? prev.count + 1 : 1, total = (prev ? prev.total : 0) + x;
        return { count, total, v: total / count };
    }
    return { count: prev.count + 1, total: prev.total, v: prev.v + (2 / (n + 1)) * (x - prev.v) };
}

// One row on a bar, from the same row on the bar before. `diff` is its histogram, and
// `rule` when it warns:
//   "shrink"  the bar is smaller than the one before (nearer zero): the MACD row's
//   "speed"   the bar moved toward zero, and by more than the bar before moved: the EMA row's
//   "off"
function rowStep(prev, diff, rule) {
    const side = diff > 0 ? 1 : diff < 0 ? -1 : prev ? prev.side : 0;
    const bars = prev && side === prev.side ? prev.bars + 1 : 1;
    const move = prev ? diff - prev.diff : NaN;
    let warn = 0;
    if (prev && side !== 0) {
        if (rule === "shrink") warn = side === 1 ? (diff < prev.diff ? -1 : 0) : diff > prev.diff ? 1 : 0;
        else if (rule === "speed" && Number.isFinite(prev.move)) {
            warn = side === 1 ? (move < 0 && move < prev.move ? -1 : 0) : move > 0 && move > prev.move ? 1 : 0;
        }
    }
    return { side, bars, warn, diff, move };
}
// The settings as rules; a setting saved as on / off by the first version still reads.
const emaRule = (v) => (v === false || v === "off" ? "off" : v === "closer" ? "shrink" : "speed");
const macdRule = (v) => (v === false || v === "off" ? "off" : "shrink");

function stateText(r, ready) {
    if (!ready || r.side === 0) return ["Warming up", COLORS.dim];
    if (r.side === 1) return r.warn ? ["Potentially short", COLORS.potShort] : ["Long", COLORS.long];
    return r.warn ? ["Potentially long", COLORS.potLong] : ["Short", COLORS.short];
}

class EmaMacdDatabox {
    init() {
        this.st = [];
    }

    map(d, i) {
        const p = this.props;
        const idx = typeof i === "number" ? i : d.index();
        const prev = idx > 0 ? this.st[idx - 1] : null;
        const x = d.value();

        // the EMA row: fast against slow
        const ef = emaStep(prev && prev.ef, x, p.emaFast);
        const es = emaStep(prev && prev.es, x, p.emaSlow);
        // the MACD row: Tradovate's MACD, its signal from bar slow - 1
        const mf = emaStep(prev && prev.mf, x, p.macdFast);
        const ms = emaStep(prev && prev.ms, x, p.macdSlow);
        const line = mf.v - ms.v;
        const sg = idx >= p.macdSlow - 1 ? emaStep(prev && prev.sg, line, p.macdSignal) : null;

        const S = {
            ef, es, mf, ms, sg,
            ema: rowStep(prev && prev.ema, ef.v - es.v, emaRule(p.emaWarning)),
            macd: sg ? rowStep(prev && prev.macd, line - sg.v, macdRule(p.macdWarning)) : null,
            emaReady: idx >= p.emaSlow,
            macdReady: !!sg && sg.count >= p.macdSignal
        };
        this.st[idx] = S;
        if (idx >= KEEP) this.st[idx - KEEP] = undefined;

        const out = {};
        if (p.showEmas && idx >= p.emaSlow) {
            out.emaFast = ef.v;
            out.emaSlow = es.v;
        }
        if (d.isLast()) {
            const live = p.updates !== "close";
            out.graphics = { items: this.box(live || !prev ? S : prev, live) };
        }
        return out;
    }

    // The box: always the same keys, so the platform replaces it rather than stacking it.
    // It is laid out from its own top-left corner, then placed from the chart's corner.
    box(S, live) {
        const p = this.props, fs = Math.max(8, p.fontSize), step = fs + 7;
        const em = fs * 0.56;            // about one character's width
        const rows = [
            { label: `EMA ${p.emaFast}/${p.emaSlow}`, r: S.ema, ready: S.emaReady },
            { label: `MACD ${p.macdFast}/${p.macdSlow}/${p.macdSignal}`, r: S.macd || { side: 0 }, ready: S.macdReady }
        ];
        const labelW = Math.max(...rows.map((r) => r.label.length)) * em;
        const stateW = "Potentially short".length * em;
        const ageW = p.showBars ? "999 bars".length * em : 0;
        const xLabel = 8, xState = xLabel + labelW + 14, xAge = xState + stateW + 14;
        const width = 8 + labelW + 14 + stateW + (p.showBars ? 14 + ageW : 0) + 8;
        const height = (rows.length + 1) * step + 6;

        // a point x pixels from the box's left edge and y from its top
        const c = CORNERS[p.corner] || CORNERS.topLeft;
        const X = (x) => px(c.right ? x - p.boxX - width : p.boxX + x);
        const Y = (y) => px(c.bottom ? y - p.boxY - height : p.boxY + y);
        const at = c.origin ? { origin: c.origin } : {};

        const outline = () => [{ tag: "Polygon", points: [
            { x: X(0), y: Y(0) }, { x: X(width), y: Y(0) },
            { x: X(width), y: Y(height) }, { x: X(0), y: Y(height) }
        ] }];
        const items = [{
            tag: "Shapes", key: "dbBox", global: true, ...at, primitives: outline(),
            fillStyle: { color: COLORS.box, opacity: 0.9 }
        }, {
            tag: "ContourShapes", key: "dbEdge", global: true, ...at, primitives: outline(),
            lineStyle: { lineWidth: 1, color: COLORS.edge }
        }, {
            tag: "Text", key: "dbHead", global: true, ...at,
            point: { x: X(xLabel), y: Y(3 + step / 2) },
            text: `EMA + MACD, ${live ? "live" : "at bar close"}`, style: { fontSize: fs - 2, fill: COLORS.dim }, textAlignment: "leftMiddle"
        }];
        rows.forEach((row, k) => {
            const y = Y(3 + (k + 1.5) * step);
            const [text, fill] = stateText(row.r, row.ready);
            const n = row.ready && row.r.side !== 0 ? row.r.bars : 0;
            items.push(
                { tag: "Text", key: "dbLabel" + k, global: true, ...at, point: { x: X(xLabel), y },
                  text: row.label, style: { fontSize: fs, fill: COLORS.label }, textAlignment: "leftMiddle" },
                { tag: "Text", key: "dbState" + k, global: true, ...at, point: { x: X(xState), y },
                  text, style: { fontSize: fs, fontWeight: "bold", fill }, textAlignment: "leftMiddle" },
                { tag: "Text", key: "dbBars" + k, global: true, ...at, point: { x: X(xAge), y },
                  text: p.showBars && n ? `${n} bar${n === 1 ? "" : "s"}` : "",
                  style: { fontSize: fs - 1, fill: COLORS.dim }, textAlignment: "leftMiddle" }
            );
        });
        return items;
    }
}

module.exports = {
    name: "emaMacdDatabox",
    description: "EMA + MACD databox: each row's side, and when its histogram shrinks",
    calculator: EmaMacdDatabox,
    params: {
        emaFast: predef.paramSpecs.period(12),
        emaSlow: predef.paramSpecs.period(26),
        macdFast: predef.paramSpecs.period(12),
        macdSlow: predef.paramSpecs.period(26),
        macdSignal: predef.paramSpecs.period(9),
        emaWarning: predef.paramSpecs.enum({ speed: "Gap closing faster than the bar before", closer: "Gap closing at all", off: "Off" }, "speed"),
        macdWarning: predef.paramSpecs.bool(true),
        updates: predef.paramSpecs.enum({ live: "Live: the forming bar, every tick", close: "At bar close" }, "live"),
        showBars: predef.paramSpecs.bool(true),
        showEmas: predef.paramSpecs.bool(false),
        fontSize: predef.paramSpecs.number(13, 1, 8),
        corner: predef.paramSpecs.enum({ topLeft: "Top left", topRight: "Top right", bottomLeft: "Bottom left", bottomRight: "Bottom right" }, "topLeft"),
        boxX: predef.paramSpecs.number(8, 1, 0),
        boxY: predef.paramSpecs.number(30, 1, 0)
    },
    validate(obj) {
        if (obj.emaSlow <= obj.emaFast) return meta.error("emaSlow", "The slow EMA should be longer than the fast one");
        if (obj.macdSlow <= obj.macdFast) return meta.error("macdSlow", "The MACD's slow period should be longer than its fast one");
    },
    inputType: meta.InputType.BARS,
    areaChoice: meta.AreaChoice.OVERLAY,
    plots: {
        emaFast: { title: "Fast EMA" },
        emaSlow: { title: "Slow EMA" }
    },
    tags: ["Trend"],
    schemeStyles: {
        dark: {
            emaFast: predef.styles.plot("#e0c341"),
            emaSlow: predef.styles.plot("#5b9bd5")
        }
    }
};
