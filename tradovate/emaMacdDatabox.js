/*
 * EMA + MACD databox  (Tradovate custom indicator)              ANY TIMEFRAME, ANY BARS.
 *
 * A box in the chart's corner, one row for the EMA cross and one for the MACD:
 *
 *     EMA 9/21        Long                12 bars
 *     MACD 12/26/9    Potentially short    3 bars
 *
 * EACH ROW is the side of its latest cross, read at bar close:
 *   EMA    Long while the fast EMA is above the slow one, Short while it is below.
 *   MACD   Long while the MACD line is above its signal line, Short while it is below.
 * A difference of exactly zero is not a cross: the row keeps its side.
 *
 * AND ITS HISTOGRAM, the bar that just closed against the one before it:
 *   MACD   the MACD line minus the signal line: the histogram Tradovate's MACD plots.
 *   EMA    the fast EMA minus the slow one: the gap that closes before they cross.
 * On the long side, a histogram bar smaller than the one before it reads Potentially
 * short. On the short side, a bar smaller than the one before it (nearer zero) reads
 * Potentially long. A bar the same size or larger leaves the row on its side. Each
 * row's warning can be switched off.
 *
 * The count is how many closed bars the row has been on its side, the cross bar
 * included. A warning does not reset it: the lines have not crossed.
 *
 * AT BAR CLOSE. The box reads the last finished bar, so it changes once a bar and
 * never flickers while a bar forms. "Read the forming bar" reads the live bar instead.
 * On a chart whose last bar has finished (the market closed), that switch shows that
 * bar; off, the box reads the one before it.
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

// One row on a bar, from the same row on the bar before. `diff` is its histogram.
function rowStep(prev, diff, warnOn) {
    const side = diff > 0 ? 1 : diff < 0 ? -1 : prev ? prev.side : 0;
    const bars = prev && side === prev.side ? prev.bars + 1 : 1;
    let warn = 0;
    if (warnOn && prev && side !== 0) {
        if (side === 1 && diff < prev.diff) warn = -1;           // long, the bar smaller than the last
        else if (side === -1 && diff > prev.diff) warn = 1;      // short, the bar nearer zero
    }
    return { side, bars, warn, diff };
}

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
            ema: rowStep(prev && prev.ema, ef.v - es.v, p.emaWarning),
            macd: sg ? rowStep(prev && prev.macd, line - sg.v, p.macdWarning) : null,
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
            const read = p.readFormingBar || !prev ? S : prev;
            out.graphics = { items: this.box(read) };
        }
        return out;
    }

    // The box: always the same keys, so the platform replaces it rather than stacking it.
    box(S) {
        const p = this.props, fs = Math.max(8, p.fontSize), step = fs + 7;
        const em = fs * 0.56;            // about one character's width
        const rows = [
            { label: `EMA ${p.emaFast}/${p.emaSlow}`, r: S.ema, ready: S.emaReady },
            { label: `MACD ${p.macdFast}/${p.macdSlow}/${p.macdSignal}`, r: S.macd || { side: 0 }, ready: S.macdReady }
        ];
        const labelW = Math.max(...rows.map((r) => r.label.length)) * em;
        const stateW = "Potentially short".length * em;
        const ageW = p.showBars ? "999 bars".length * em : 0;
        const x0 = p.boxX, y0 = p.boxY;
        const xLabel = x0 + 8, xState = xLabel + labelW + 14, xAge = xState + stateW + 14;
        const width = 8 + labelW + 14 + stateW + (p.showBars ? 14 + ageW : 0) + 8;
        const head = p.readFormingBar ? "live bar" : "at bar close";
        const height = (rows.length + 1) * step + 6;

        const outline = () => [{ tag: "Polygon", points: [
            { x: px(x0), y: px(y0) }, { x: px(x0 + width), y: px(y0) },
            { x: px(x0 + width), y: px(y0 + height) }, { x: px(x0), y: px(y0 + height) }
        ] }];
        const items = [{
            tag: "Shapes", key: "dbBox", global: true, primitives: outline(),
            fillStyle: { color: COLORS.box, opacity: 0.9 }
        }, {
            tag: "ContourShapes", key: "dbEdge", global: true, primitives: outline(),
            lineStyle: { lineWidth: 1, color: COLORS.edge }
        }, {
            tag: "Text", key: "dbHead", global: true,
            point: { x: px(xLabel), y: px(y0 + 3 + step / 2) },
            text: `EMA + MACD, ${head}`, style: { fontSize: fs - 2, fill: COLORS.dim }, textAlignment: "leftMiddle"
        }];
        rows.forEach((row, k) => {
            const y = px(y0 + 3 + (k + 1.5) * step);
            const [text, fill] = stateText(row.r, row.ready);
            const n = row.ready && row.r.side !== 0 ? row.r.bars : 0;
            items.push(
                { tag: "Text", key: "dbLabel" + k, global: true, point: { x: px(xLabel), y },
                  text: row.label, style: { fontSize: fs, fill: COLORS.label }, textAlignment: "leftMiddle" },
                { tag: "Text", key: "dbState" + k, global: true, point: { x: px(xState), y },
                  text, style: { fontSize: fs, fontWeight: "bold", fill }, textAlignment: "leftMiddle" },
                { tag: "Text", key: "dbBars" + k, global: true, point: { x: px(xAge), y },
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
        emaFast: predef.paramSpecs.period(9),
        emaSlow: predef.paramSpecs.period(21),
        macdFast: predef.paramSpecs.period(12),
        macdSlow: predef.paramSpecs.period(26),
        macdSignal: predef.paramSpecs.period(9),
        emaWarning: predef.paramSpecs.bool(true),
        macdWarning: predef.paramSpecs.bool(true),
        readFormingBar: predef.paramSpecs.bool(false),
        showBars: predef.paramSpecs.bool(true),
        showEmas: predef.paramSpecs.bool(false),
        fontSize: predef.paramSpecs.number(13, 1, 8),
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
