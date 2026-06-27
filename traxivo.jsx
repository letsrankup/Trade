import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const COINS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT",
  "DOTUSDT","LINKUSDT","MATICUSDT","UNIUSDT","LTCUSDT","ATOMUSDT","ETCUSDT","XLMUSDT",
  "ALGOUSDT","NEARUSDT","FILUSDT","VETUSDT","TRXUSDT","FTMUSDT","SANDUSDT","MANAUSDT",
  "AXSUSDT","GALAUSDT","AAVEUSDT","COMPUSDT","MKRUSDT","SNXUSDT","SUSHIUSDT","CRVUSDT",
  "YFIUSDT","INJUSDT","APTUSDT","ARBUSDT","OPUSDT","SUIUSDT","SEIUSDT","TIAUSDT",
  "WLDUSDT","FETUSDT","AGIXUSDT","OCEANUSDT","RENDERUSDT","ICPUSDT","HBARUSDT","EGLDUSDT",
  "FLOWUSDT","THETAUSDT","KSMUSDT","ZILUSDT","IOSTUSDT","ONTUSDT","BATUSDT","ZRXUSDT",
  "STORJUSDT","CELRUSDT","COTIUSDT","ANKRUSDT","STMXUSDT","RVNUSDT","SKLUSDT","OGUSDT",
  "SPELLUSDT","HOOKUSDT","MAVUSDT","PENDLEUSDT","ARKMUSDT","WUSDT","ENAUSDT","EIGENUSDT",
  "NOTUSDT","BOMEUSDT","MEMEUSDT","PEPEUSDT","SHIBUSDT","FLOKIUSDT","BONKUSDT","WIFUSDT",
  "POPCATUSDT","MEWUSDT","BRETTUSDT","DOGSUSDT","TURBOUSDT","NEIROUSDT","GOATUSDT","PNUTUSDT",
  "ACTUSDT","VIRTUALUSDT","AIXBTUSDT","AIUSDT","MOVEUSDT","MEUSDT","ZEREBROUS","GRIFFAINUSDT",
  "TRUMPUSDT","MELANIAUSDT","KAITOUSDT","REZUSDT","ZROUSDT","JUPUSDT","PYTHUSDT","WIFUSDT",
  "RAYUSDT","JITOUSDT","JTOUSDT","BANANAUSDT","ONDOUSDT","LDOUSDT","STRKUSDT","ALTUSDT",
  "RONINUSDT","AXLUSDT","DYMUSDT","BLURUSDT","PIXELUSDT","AEVOUSDT","SAGAUSDT","TNSRUSDT",
  "PORTALUSDT","XAIUSDT","MANTAUSDT","JUPUSDT","ZETAUSDT","ALTUSDT","ACEUSDT","NFPUSDT",
  "AIUSDT","XVSUSDT","ORDIUSDT","SATSUSDT","RATS","MMSSUSDT","BCHUSDT","QNTUSDT",
  "RUNEUSDT","MINAUSDT","ONEUSDT","LUNAUSDT","KLAYUSDT","NEXOUSDT","CHZUSDT","ENJUSDT",
  "ROSESUSDT","TUSDT","GMTUSDT","APEUSDT","STEEMUSDT","DYDXUSDT","GMXUSDT","PERPUSDT"
];

const TIMEFRAMES = ["1m","5m","15m","1h","4h","1d"];
const TRADE_TYPES = ["Futures","Spot","Margin"];

// ─── MATH ENGINE ─────────────────────────────────────────────────────────────
class TradingMath {
  static calcLiquidationPrice(entryPrice, leverage, side, maintenanceMarginRate = 0.005) {
    if (side === "LONG") {
      return entryPrice * (1 - (1 / leverage) + maintenanceMarginRate);
    } else {
      return entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);
    }
  }

  static calcPnL(entryPrice, exitPrice, margin, leverage, side, makerFee = 0.0002, takerFee = 0.0004) {
    const positionSize = margin * leverage;
    const qty = positionSize / entryPrice;
    const priceDiff = side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
    const rawPnl = priceDiff * qty;
    const entryFee = positionSize * takerFee;
    const exitFee = (qty * exitPrice) * takerFee;
    const netPnl = rawPnl - entryFee - exitFee;
    const roi = (netPnl / margin) * 100;
    return { rawPnl, netPnl, roi, entryFee, exitFee, totalFees: entryFee + exitFee };
  }

  static calcRiskReward(entryPrice, stopLoss, takeProfit, side) {
    const risk = side === "LONG" ? entryPrice - stopLoss : stopLoss - entryPrice;
    const reward = side === "LONG" ? takeProfit - entryPrice : entryPrice - takeProfit;
    return risk > 0 ? (reward / risk).toFixed(2) : 0;
  }

  static calcSupportResistance(candles) {
    if (!candles || candles.length < 20) return { supports: [], resistances: [] };
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const supports = [], resistances = [];
    const window = 5;
    for (let i = window; i < candles.length - window; i++) {
      const sliceHigh = highs.slice(i - window, i + window + 1);
      const sliceLow = lows.slice(i - window, i + window + 1);
      if (highs[i] === Math.max(...sliceHigh)) resistances.push(highs[i]);
      if (lows[i] === Math.min(...sliceLow)) supports.push(lows[i]);
    }
    // Cluster nearby levels
    const cluster = (arr) => {
      const sorted = [...new Set(arr)].sort((a, b) => a - b);
      const clusters = [];
      let group = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] - sorted[i-1]) / sorted[i-1] < 0.005) {
          group.push(sorted[i]);
        } else {
          clusters.push(group.reduce((a,b) => a+b) / group.length);
          group = [sorted[i]];
        }
      }
      if (group.length) clusters.push(group.reduce((a,b) => a+b) / group.length);
      return clusters.slice(-5);
    };
    return { supports: cluster(supports), resistances: cluster(resistances) };
  }

  static calcPivotPoints(high, low, close) {
    const pp = (high + low + close) / 3;
    return {
      pp,
      r1: 2 * pp - low, r2: pp + (high - low), r3: high + 2 * (pp - low),
      s1: 2 * pp - high, s2: pp - (high - low), s3: low - 2 * (high - pp)
    };
  }

  static calcEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
    return ema;
  }

  static calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  static calcMACD(closes) {
    if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
    const ema12 = this.calcEMA(closes, 12);
    const ema26 = this.calcEMA(closes, 26);
    const macd = ema12 - ema26;
    return { macd, signal: macd * 0.9, histogram: macd * 0.1 };
  }

  static calcBollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { upper: mean + stdDev * std, middle: mean, lower: mean - stdDev * std };
  }

  static generateSignal(rsi, macd, ema50, ema200, price, bb, sr) {
    let bullScore = 0, bearScore = 0;
    if (rsi < 35) bullScore += 2; else if (rsi > 65) bearScore += 2;
    if (rsi < 50) bullScore += 1; else bearScore += 1;
    if (macd.histogram > 0) bullScore += 2; else bearScore += 2;
    if (price > ema200) bullScore += 3; else bearScore += 3;
    if (price > ema50) bullScore += 2; else bearScore += 2;
    if (price < bb.lower) bullScore += 2; else if (price > bb.upper) bearScore += 2;
    const nearSupport = sr.supports.some(s => Math.abs(price - s) / price < 0.01);
    const nearResistance = sr.resistances.some(r => Math.abs(price - r) / price < 0.01);
    if (nearSupport) bullScore += 3;
    if (nearResistance) bearScore += 3;
    const total = bullScore + bearScore;
    const bullPct = total > 0 ? (bullScore / total) * 100 : 50;
    if (bullPct >= 65) return { type: "LONG", label: "🟢 BULLISH LONG", strength: bullPct, color: "#00e5a0" };
    if (bullPct <= 35) return { type: "SHORT", label: "🔴 BEARISH SHORT", strength: 100 - bullPct, color: "#ff4d6d" };
    return { type: "NEUTRAL", label: "⚪ NEUTRAL", strength: 50, color: "#94a3b8" };
  }
}

// ─── MOCK DATA GENERATOR ─────────────────────────────────────────────────────
function generateMockCandles(basePrice, count = 100) {
  const candles = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.48) * price * 0.025;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * price * 0.008;
    const low = Math.min(open, close) - Math.random() * price * 0.008;
    const vol = Math.random() * 5000000 + 500000;
    candles.push({ time: now - i * 60000, open, high, low, close, volume: vol });
    price = close;
  }
  return candles;
}

const COIN_BASE_PRICES = {
  BTCUSDT: 67500, ETHUSDT: 3800, BNBUSDT: 620, SOLUSDT: 185,
  XRPUSDT: 0.72, ADAUSDT: 0.58, AVAXUSDT: 42, DOGEUSDT: 0.18,
  DOTUSDT: 9.5, LINKUSDT: 18, MATICUSDT: 1.1, UNIUSDT: 11,
  LTCUSDT: 95, ATOMUSDT: 11, ETCUSDT: 32, XLMUSDT: 0.15,
  PEPEUSDT: 0.0000185, SHIBUSDT: 0.0000285, FLOKIUSDT: 0.000235,
  BONKUSDT: 0.0000385, WIFUSDT: 3.2, NOTUSDT: 0.0095,
};
function getBasePrice(sym) {
  return COIN_BASE_PRICES[sym] || (Math.random() * 50 + 0.5);
}

// ─── MINI CHART ───────────────────────────────────────────────────────────────
function MiniChart({ candles, color, width = 120, height = 40 }) {
  if (!candles || candles.length < 2) return null;
  const closes = candles.slice(-30).map(c => c.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = height - ((c - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── LARGE CHART ─────────────────────────────────────────────────────────────
function TradingChart({ candles, sr, pivots, signal }) {
  const svgRef = useRef(null);
  const W = 800, H = 320, PAD = { l: 70, r: 15, t: 20, b: 30 };
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;
  if (!candles || candles.length === 0) return <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>Loading chart...</div>;
  const displayCandles = candles.slice(-60);
  const allHighs = displayCandles.map(c => c.high);
  const allLows = displayCandles.map(c => c.low);
  const srLevels = [...(sr?.supports || []), ...(sr?.resistances || [])];
  const rawMax = Math.max(...allHighs, ...srLevels);
  const rawMin = Math.min(...allLows, ...srLevels);
  const padding = (rawMax - rawMin) * 0.06;
  const yMax = rawMax + padding, yMin = rawMin - padding;
  const yRange = yMax - yMin || 1;
  const toX = (i) => PAD.l + (i / (displayCandles.length - 1)) * cw;
  const toY = (p) => PAD.t + ch - ((p - yMin) / yRange) * ch;
  const barW = Math.max(3, (cw / displayCandles.length) * 0.65);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, background: "#0b1120", borderRadius: 12, border: "1px solid #1e2d45" }}>
      {/* Grid */}
      {[0,0.25,0.5,0.75,1].map(t => {
        const y = PAD.t + t * ch;
        const val = yMax - t * yRange;
        return (
          <g key={t}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#1e2d45" strokeWidth="1" />
            <text x={PAD.l - 5} y={y + 4} textAnchor="end" fill="#475569" fontSize="10">
              {val >= 1000 ? val.toFixed(0) : val >= 1 ? val.toFixed(2) : val.toFixed(6)}
            </text>
          </g>
        );
      })}
      {/* S/R Lines */}
      {sr?.supports?.map((s, i) => (
        <g key={`s${i}`}>
          <line x1={PAD.l} y1={toY(s)} x2={W - PAD.r} y2={toY(s)} stroke="#00e5a0" strokeWidth="1" strokeDasharray="4,4" opacity="0.7" />
          <text x={W - PAD.r - 2} y={toY(s) - 3} textAnchor="end" fill="#00e5a0" fontSize="9">S</text>
        </g>
      ))}
      {sr?.resistances?.map((r, i) => (
        <g key={`r${i}`}>
          <line x1={PAD.l} y1={toY(r)} x2={W - PAD.r} y2={toY(r)} stroke="#ff4d6d" strokeWidth="1" strokeDasharray="4,4" opacity="0.7" />
          <text x={W - PAD.r - 2} y={toY(r) - 3} textAnchor="end" fill="#ff4d6d" fontSize="9">R</text>
        </g>
      ))}
      {/* Pivot Points */}
      {pivots?.pp && (
        <line x1={PAD.l} y1={toY(pivots.pp)} x2={W - PAD.r} y2={toY(pivots.pp)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="6,3" opacity="0.6" />
      )}
      {/* Candles */}
      {displayCandles.map((c, i) => {
        const x = toX(i);
        const isGreen = c.close >= c.open;
        const col = isGreen ? "#00e5a0" : "#ff4d6d";
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        return (
          <g key={i}>
            <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={col} strokeWidth="1" />
            <rect x={x - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={col} opacity="0.9" />
          </g>
        );
      })}
      {/* Signal label */}
      {signal && signal.type !== "NEUTRAL" && (
        <text x={PAD.l + 10} y={PAD.t + 18} fill={signal.color} fontSize="12" fontWeight="bold">{signal.label}</text>
      )}
    </svg>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function Traxivo() {
  const [activeCoin, setActiveCoin] = useState("BTCUSDT");
  const [activeTimeframe, setActiveTimeframe] = useState("1h");
  const [tradeType, setTradeType] = useState("Futures");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("chart"); // chart | calculator | signals
  const [marginType, setMarginType] = useState("Cross");
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState(100);
  const [side, setSide] = useState("LONG");
  const [makerFee, setMakerFee] = useState(0.02);
  const [takerFee, setTakerFee] = useState(0.04);
  const [tpPercent, setTpPercent] = useState(5);
  const [slPercent, setSlPercent] = useState(2);
  const [coinData, setCoinData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const priceTickerRef = useRef({});

  // Initialize coin data
  useEffect(() => {
    setIsLoading(true);
    const initial = {};
    COINS.forEach(sym => {
      const base = getBasePrice(sym);
      const candles = generateMockCandles(base, 120);
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const sr = TradingMath.calcSupportResistance(candles);
      const lastC = candles[candles.length - 1];
      const pivots = TradingMath.calcPivotPoints(lastC.high, lastC.low, lastC.close);
      const rsi = TradingMath.calcRSI(closes);
      const macd = TradingMath.calcMACD(closes);
      const ema50 = TradingMath.calcEMA(closes.slice(-50), 50);
      const ema200 = TradingMath.calcEMA(closes, 200);
      const bb = TradingMath.calcBollingerBands(closes);
      const signal = TradingMath.generateSignal(rsi, macd, ema50, ema200, lastC.close, bb, sr);
      const change24h = ((lastC.close - candles[0].close) / candles[0].close) * 100;
      initial[sym] = { candles, closes, sr, pivots, rsi, macd, ema50, ema200, bb, signal, price: lastC.close, change24h, volume: lastC.volume };
    });
    setCoinData(initial);
    setIsLoading(false);
  }, []);

  // Live price simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setCoinData(prev => {
        const updated = { ...prev };
        const sym = activeCoin;
        if (!updated[sym]) return prev;
        const last = updated[sym].candles.slice(-1)[0];
        const change = (Math.random() - 0.49) * last.close * 0.003;
        const newPrice = last.close + change;
        const newCandle = { ...last, close: newPrice, high: Math.max(last.high, newPrice), low: Math.min(last.low, newPrice), time: Date.now() };
        const newCandles = [...updated[sym].candles.slice(-119), newCandle];
        const closes = newCandles.map(c => c.close);
        const rsi = TradingMath.calcRSI(closes);
        const macd = TradingMath.calcMACD(closes);
        const ema50 = TradingMath.calcEMA(closes.slice(-50), 50);
        const ema200 = TradingMath.calcEMA(closes, 200);
        const bb = TradingMath.calcBollingerBands(closes);
        const signal = TradingMath.generateSignal(rsi, macd, ema50, ema200, newPrice, bb, updated[sym].sr);
        updated[sym] = { ...updated[sym], candles: newCandles, price: newPrice, rsi, macd, ema50, ema200, bb, signal };
        return updated;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [activeCoin]);

  const coin = coinData[activeCoin];
  const currentPrice = coin?.price || 0;
  const liqPrice = TradingMath.calcLiquidationPrice(currentPrice, leverage, side);
  const tpPrice = side === "LONG" ? currentPrice * (1 + tpPercent / 100) : currentPrice * (1 - tpPercent / 100);
  const slPrice = side === "LONG" ? currentPrice * (1 - slPercent / 100) : currentPrice * (1 + slPercent / 100);
  const pnlTP = TradingMath.calcPnL(currentPrice, tpPrice, margin, leverage, side, makerFee / 100, takerFee / 100);
  const pnlSL = TradingMath.calcPnL(currentPrice, slPrice, margin, leverage, side, makerFee / 100, takerFee / 100);
  const rr = TradingMath.calcRiskReward(currentPrice, slPrice, tpPrice, side);

  const filteredCoins = useMemo(() =>
    COINS.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const signals = useMemo(() =>
    COINS.filter(c => coinData[c]?.signal?.type !== "NEUTRAL").map(c => ({ sym: c, ...coinData[c]?.signal, price: coinData[c]?.price })).slice(0, 30),
    [coinData]
  );

  const getAiAnalysis = async () => {
    if (!coin) return;
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const prompt = `You are a professional crypto trading analyst. Analyze this data for ${activeCoin} and give a concise trading recommendation:
Price: $${currentPrice.toFixed(4)}
RSI(14): ${coin.rsi?.toFixed(1)}
MACD Histogram: ${coin.macd?.histogram?.toFixed(4)}
EMA50: ${coin.ema50?.toFixed(4)}, EMA200: ${coin.ema200?.toFixed(4)}
BB Upper: ${coin.bb?.upper?.toFixed(4)}, Lower: ${coin.bb?.lower?.toFixed(4)}
Support levels: ${coin.sr?.supports?.map(s => s.toFixed(4)).join(", ")}
Resistance levels: ${coin.sr?.resistances?.map(r => r.toFixed(4)).join(", ")}
Signal: ${coin.signal?.label}
Trade Type: ${tradeType}, Leverage: ${leverage}x, Margin Type: ${marginType}
Margin: $${margin}, Side: ${side}

Give:
1. Market Bias (Bullish/Bearish/Neutral) with reason
2. Key levels to watch (support/resistance)
3. Entry strategy with exact entry price range
4. Stop Loss recommendation
5. Take Profit targets (TP1, TP2)
6. Risk warning for ${leverage}x leverage
Keep response under 250 words, use emoji for visual clarity.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      setAiAnalysis(data.content?.[0]?.text || "Analysis unavailable.");
    } catch (e) {
      setAiAnalysis("⚠️ AI analysis temporarily unavailable.");
    }
    setAiLoading(false);
  };

  const fmt = (n, dec = 2) => {
    if (!n && n !== 0) return "—";
    if (Math.abs(n) < 0.0001) return n.toFixed(8);
    if (Math.abs(n) < 0.01) return n.toFixed(6);
    if (Math.abs(n) < 1) return n.toFixed(4);
    if (Math.abs(n) < 10000) return n.toFixed(dec);
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n?.toFixed(2)}%`;

  // ─── STYLES ────────────────────────────────────────────────────────────────
  const S = {
    app: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#070d1a", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13 },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#0b1120", borderBottom: "1px solid #1e2d45", position: "sticky", top: 0, zIndex: 100 },
    logo: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, background: "linear-gradient(135deg, #00e5a0, #0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
    main: { display: "flex", flex: 1, overflow: "hidden" },
    sidebar: { width: 220, background: "#0b1120", borderRight: "1px solid #1e2d45", display: "flex", flexDirection: "column", overflow: "hidden" },
    searchBox: { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", padding: "7px 10px", fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" },
    coinItem: (active) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", cursor: "pointer", background: active ? "#1e2d45" : "transparent", borderLeft: active ? "2px solid #00e5a0" : "2px solid transparent", transition: "all 0.15s" }),
    content: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    tabBar: { display: "flex", gap: 4, padding: "10px 16px", background: "#0b1120", borderBottom: "1px solid #1e2d45" },
    tab: (active) => ({ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, background: active ? "#0ea5e9" : "#111827", color: active ? "#fff" : "#64748b", transition: "all 0.15s" }),
    scrollArea: { flex: 1, overflow: "auto", padding: 16 },
    card: { background: "#0b1120", border: "1px solid #1e2d45", borderRadius: 12, padding: 16, marginBottom: 12 },
    grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }),
    metricCard: (color) => ({ background: "#070d1a", border: `1px solid ${color}22`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }),
    label: { fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
    value: (color = "#e2e8f0", size = 18) => ({ fontSize: size, fontWeight: 700, color }),
    badge: (color) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }),
    btn: (color = "#0ea5e9", outline = false) => ({ padding: "8px 16px", borderRadius: 8, border: outline ? `1px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }),
    input: { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", padding: "8px 12px", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    tfBtn: (active) => ({ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 11, background: active ? "#00e5a0" : "#111827", color: active ? "#070d1a" : "#64748b" }),
  };

  return (
    <div style={S.app}>
      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={S.logo}>TRAXIVO</span>
          <span style={{ fontSize: 11, color: "#475569" }}>Pro Trading Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {TRADE_TYPES.map(t => (
            <button key={t} onClick={() => setTradeType(t)} style={S.tab(tradeType === t)}>{t}</button>
          ))}
          <div style={{ ...S.badge("#00e5a0"), marginLeft: 8 }}>● LIVE</div>
        </div>
      </header>

      <div style={S.main}>
        {/* SIDEBAR - Coin List */}
        <aside style={S.sidebar}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e2d45" }}>
            <input placeholder="Search coins..." value={search} onChange={e => setSearch(e.target.value)} style={S.searchBox} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredCoins.map(sym => {
              const d = coinData[sym];
              const isUp = (d?.change24h || 0) >= 0;
              return (
                <div key={sym} style={S.coinItem(activeCoin === sym)} onClick={() => setActiveCoin(sym)}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: activeCoin === sym ? "#00e5a0" : "#e2e8f0" }}>{sym.replace("USDT","")}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{fmt(d?.price)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {d?.signal && <div style={{ ...S.badge(d.signal.color), fontSize: 9, padding: "1px 6px", marginBottom: 2 }}>{d.signal.type}</div>}
                    <MiniChart candles={d?.candles} color={isUp ? "#00e5a0" : "#ff4d6d"} width={60} height={24} />
                    <div style={{ fontSize: 10, color: isUp ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(d?.change24h)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={S.content}>
          {/* Coin Header */}
          <div style={{ padding: "12px 16px", background: "#0b1120", borderBottom: "1px solid #1e2d45", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{activeCoin.replace("USDT", "")}<span style={{ color: "#475569", fontSize: 12 }}>/USDT</span></div>
              <div style={{ fontSize: 11, color: "#475569" }}>{tradeType} • {marginType} Margin • {leverage}x</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: (coin?.change24h || 0) >= 0 ? "#00e5a0" : "#ff4d6d" }}>${fmt(currentPrice, 4)}</div>
            <div style={{ fontSize: 13, color: (coin?.change24h || 0) >= 0 ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(coin?.change24h)}</div>
            {coin?.signal && <span style={S.badge(coin.signal.color)}>{coin.signal.label}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {TIMEFRAMES.map(tf => <button key={tf} style={S.tfBtn(activeTimeframe === tf)} onClick={() => setActiveTimeframe(tf)}>{tf}</button>)}
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={S.tabBar}>
            {[["chart","📈 Chart & Analysis"],["calculator","🧮 Calculator"],["signals","⚡ Signals"]].map(([k,l]) => (
              <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          <div style={S.scrollArea}>

            {/* ── CHART TAB ── */}
            {tab === "chart" && (
              <>
                {/* Indicators Row */}
                <div style={{ ...S.grid(5), marginBottom: 12 }}>
                  {[
                    { label: "RSI (14)", val: coin?.rsi?.toFixed(1), color: (coin?.rsi || 50) < 35 ? "#00e5a0" : (coin?.rsi || 50) > 65 ? "#ff4d6d" : "#f59e0b" },
                    { label: "MACD", val: coin?.macd?.histogram?.toFixed(4), color: (coin?.macd?.histogram || 0) > 0 ? "#00e5a0" : "#ff4d6d" },
                    { label: "EMA 50", val: fmt(coin?.ema50), color: currentPrice > (coin?.ema50 || 0) ? "#00e5a0" : "#ff4d6d" },
                    { label: "EMA 200", val: fmt(coin?.ema200), color: currentPrice > (coin?.ema200 || 0) ? "#00e5a0" : "#ff4d6d" },
                    { label: "BB Width", val: coin?.bb ? ((coin.bb.upper - coin.bb.lower) / coin.bb.middle * 100).toFixed(2) + "%" : "—", color: "#0ea5e9" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={S.metricCard(color)}>
                      <div style={S.label}>{label}</div>
                      <div style={S.value(color, 15)}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Chart */}
                <div style={S.card}>
                  <TradingChart candles={coin?.candles} sr={coin?.sr} pivots={coin?.pivots} signal={coin?.signal} />
                </div>

                {/* S/R Levels */}
                <div style={S.grid(2)}>
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: "#00e5a0" }}>🟢 Support Levels</div>
                    {coin?.sr?.supports?.slice().reverse().map((s, i) => (
                      <div key={i} style={{ ...S.row, padding: "6px 0", borderBottom: "1px solid #1e2d45" }}>
                        <span style={{ color: "#64748b" }}>S{i + 1}</span>
                        <span style={{ fontWeight: 700, color: "#00e5a0" }}>${fmt(s)}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{(((s - currentPrice) / currentPrice) * 100).toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: "#ff4d6d" }}>🔴 Resistance Levels</div>
                    {coin?.sr?.resistances?.map((r, i) => (
                      <div key={i} style={{ ...S.row, padding: "6px 0", borderBottom: "1px solid #1e2d45" }}>
                        <span style={{ color: "#64748b" }}>R{i + 1}</span>
                        <span style={{ fontWeight: 700, color: "#ff4d6d" }}>${fmt(r)}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{(((r - currentPrice) / currentPrice) * 100).toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pivot Points */}
                {coin?.pivots && (
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: "#f59e0b" }}>📊 Pivot Points</div>
                    <div style={S.grid(7)}>
                      {[["S3","#ff4d6d",coin.pivots.s3],["S2","#ff6b6b",coin.pivots.s2],["S1","#ffa07a",coin.pivots.s1],
                        ["PP","#f59e0b",coin.pivots.pp],
                        ["R1","#90ee90",coin.pivots.r1],["R2","#00e5a0",coin.pivots.r2],["R3","#00b894",coin.pivots.r3]].map(([l,c,v]) => (
                        <div key={l} style={S.metricCard(c)}>
                          <div style={S.label}>{l}</div>
                          <div style={S.value(c, 12)}>${fmt(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Analysis */}
                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: "#0ea5e9" }}>🤖 AI Trade Analysis</div>
                    <button style={S.btn()} onClick={getAiAnalysis} disabled={aiLoading}>
                      {aiLoading ? "Analyzing..." : "Get AI Analysis"}
                    </button>
                  </div>
                  {aiLoading && (
                    <div style={{ color: "#64748b", fontStyle: "italic" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ea5e9", animation: "pulse 1s infinite" }} />
                        Analyzing {activeCoin} market conditions...
                      </div>
                    </div>
                  )}
                  {aiAnalysis && (
                    <div style={{ background: "#070d1a", border: "1px solid #1e2d45", borderRadius: 10, padding: 14, lineHeight: 1.7, fontSize: 13, whiteSpace: "pre-wrap" }}>
                      {aiAnalysis}
                    </div>
                  )}
                  {!aiAnalysis && !aiLoading && (
                    <div style={{ color: "#475569", fontSize: 12 }}>Click "Get AI Analysis" for a detailed AI-powered trading recommendation for {activeCoin}.</div>
                  )}
                </div>
              </>
            )}

            {/* ── CALCULATOR TAB ── */}
            {tab === "calculator" && (
              <>
                {/* Settings */}
                <div style={S.grid(2)}>
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, color: "#0ea5e9" }}>⚙️ Trade Settings</div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Margin Type</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["Cross","Isolated"].map(m => (
                          <button key={m} style={{ ...S.btn(m === "Cross" ? "#0ea5e9" : "#f59e0b", marginType !== m), flex: 1 }} onClick={() => setMarginType(m)}>{m}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Side</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...S.btn("#00e5a0", side !== "LONG"), flex: 1 }} onClick={() => setSide("LONG")}>📈 LONG</button>
                        <button style={{ ...S.btn("#ff4d6d", side !== "SHORT"), flex: 1 }} onClick={() => setSide("SHORT")}>📉 SHORT</button>
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Leverage: {leverage}x</div>
                      <input type="range" min={1} max={150} value={leverage} onChange={e => setLeverage(Number(e.target.value))} style={{ width: "100%", accentColor: "#0ea5e9" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569" }}>
                        <span>1x</span><span>50x</span><span>100x</span><span>150x</span>
                      </div>
                      {leverage >= 50 && <div style={{ fontSize: 11, color: "#ff4d6d", marginTop: 4 }}>⚠️ High leverage — extreme risk of liquidation!</div>}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Margin (USDT)</div>
                      <input type="number" value={margin} onChange={e => setMargin(Number(e.target.value))} style={S.input} />
                    </div>
                    <div style={S.grid(2)}>
                      <div>
                        <div style={S.label}>Maker Fee %</div>
                        <input type="number" step="0.01" value={makerFee} onChange={e => setMakerFee(Number(e.target.value))} style={S.input} />
                      </div>
                      <div>
                        <div style={S.label}>Taker Fee %</div>
                        <input type="number" step="0.01" value={takerFee} onChange={e => setTakerFee(Number(e.target.value))} style={S.input} />
                      </div>
                    </div>
                  </div>

                  <div style={S.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, color: "#f59e0b" }}>🎯 TP / SL Settings</div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Take Profit %</div>
                      <input type="number" step="0.1" value={tpPercent} onChange={e => setTpPercent(Number(e.target.value))} style={S.input} />
                      <div style={{ fontSize: 11, color: "#00e5a0", marginTop: 4 }}>TP Price: ${fmt(tpPrice, 4)}</div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={S.label}>Stop Loss %</div>
                      <input type="number" step="0.1" value={slPercent} onChange={e => setSlPercent(Number(e.target.value))} style={S.input} />
                      <div style={{ fontSize: 11, color: "#ff4d6d", marginTop: 4 }}>SL Price: ${fmt(slPrice, 4)}</div>
                    </div>
                    <div style={{ background: "#070d1a", borderRadius: 10, padding: 12, marginTop: 12 }}>
                      <div style={S.row}><span style={{ color: "#64748b" }}>Entry Price</span><span style={{ fontWeight: 700 }}>${fmt(currentPrice, 4)}</span></div>
                      <div style={S.row}><span style={{ color: "#64748b" }}>Position Size</span><span style={{ fontWeight: 700, color: "#0ea5e9" }}>${(margin * leverage).toFixed(2)}</span></div>
                      <div style={S.row}><span style={{ color: "#64748b" }}>Risk : Reward</span><span style={{ fontWeight: 700, color: "#f59e0b" }}>1 : {rr}</span></div>
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div style={S.grid(3)}>
                  <div style={S.metricCard("#ff4d6d")}>
                    <div style={S.label}>⚠️ Liquidation Price</div>
                    <div style={S.value("#ff4d6d", 20)}>${fmt(liqPrice, 4)}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{(Math.abs((liqPrice - currentPrice) / currentPrice) * 100).toFixed(2)}% from entry</div>
                  </div>
                  <div style={S.metricCard("#00e5a0")}>
                    <div style={S.label}>✅ Net PnL at TP</div>
                    <div style={S.value("#00e5a0", 20)}>+${pnlTP.netPnl?.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>ROI: +{pnlTP.roi?.toFixed(2)}%</div>
                  </div>
                  <div style={S.metricCard("#ff4d6d")}>
                    <div style={S.label}>❌ Net PnL at SL</div>
                    <div style={S.value("#ff4d6d", 20)}>${pnlSL.netPnl?.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>ROI: {pnlSL.roi?.toFixed(2)}%</div>
                  </div>
                </div>

                {/* Fee Breakdown */}
                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: "#94a3b8" }}>💸 Fee Breakdown</div>
                  <div style={S.grid(4)}>
                    {[
                      { label: "Entry Fee", val: `$${pnlTP.entryFee?.toFixed(4)}`, color: "#f59e0b" },
                      { label: "Exit Fee (TP)", val: `$${pnlTP.exitFee?.toFixed(4)}`, color: "#f59e0b" },
                      { label: "Total Fees (TP)", val: `$${pnlTP.totalFees?.toFixed(4)}`, color: "#ff4d6d" },
                      { label: "Net Profit (TP)", val: `$${pnlTP.netPnl?.toFixed(2)}`, color: "#00e5a0" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={S.metricCard(color)}>
                        <div style={S.label}>{label}</div>
                        <div style={S.value(color, 14)}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {marginType === "Isolated" && (
                    <div style={{ marginTop: 12, background: "#070d1a", borderRadius: 8, padding: 10, fontSize: 12, color: "#f59e0b", border: "1px solid #f59e0b33" }}>
                      ℹ️ Isolated Margin: Max loss capped at ${margin.toFixed(2)} USDT. Position auto-closes at liquidation.
                    </div>
                  )}
                  {marginType === "Cross" && (
                    <div style={{ marginTop: 12, background: "#070d1a", borderRadius: 8, padding: 10, fontSize: 12, color: "#ff4d6d", border: "1px solid #ff4d6d33" }}>
                      ⚠️ Cross Margin: Entire account balance used as collateral. Loss can exceed ${margin.toFixed(2)} USDT.
                    </div>
                  )}
                </div>

                {/* Strategy Summary */}
                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12, color: "#0ea5e9" }}>📋 Trade Summary — {activeCoin.replace("USDT","")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                    {[
                      ["Signal",coin?.signal?.label || "—", coin?.signal?.color || "#94a3b8"],
                      ["Entry Price",`$${fmt(currentPrice, 4)}`,"#e2e8f0"],
                      ["Leverage",`${leverage}x`,leverage >= 50 ? "#ff4d6d" : "#0ea5e9"],
                      ["Margin Type",marginType,marginType === "Cross" ? "#f59e0b" : "#0ea5e9"],
                      ["Position Size",`$${(margin * leverage).toFixed(2)}`,"#0ea5e9"],
                      ["Take Profit",`$${fmt(tpPrice, 4)} (+${tpPercent}%)`,"#00e5a0"],
                      ["Stop Loss",`$${fmt(slPrice, 4)} (-${slPercent}%)`,"#ff4d6d"],
                      ["Liquidation",`$${fmt(liqPrice, 4)}`,"#ff4d6d"],
                      ["Risk:Reward",`1:${rr}`,"#f59e0b"],
                      ["Net TP Profit",`$${pnlTP.netPnl?.toFixed(2)} (${pnlTP.roi?.toFixed(1)}%)`,"#00e5a0"],
                    ].map(([k,v,c]) => (
                      <div key={k} style={S.row}>
                        <span style={{ color: "#64748b" }}>{k}</span>
                        <span style={{ fontWeight: 700, color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── SIGNALS TAB ── */}
            {tab === "signals" && (
              <>
                <div style={{ ...S.grid(3), marginBottom: 12 }}>
                  {[
                    { label: "LONG Signals", count: signals.filter(s => s.type === "LONG").length, color: "#00e5a0" },
                    { label: "SHORT Signals", count: signals.filter(s => s.type === "SHORT").length, color: "#ff4d6d" },
                    { label: "Total Monitored", count: COINS.length, color: "#0ea5e9" },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={S.metricCard(color)}>
                      <div style={S.label}>{label}</div>
                      <div style={S.value(color, 28)}>{count}</div>
                    </div>
                  ))}
                </div>

                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12, color: "#0ea5e9" }}>⚡ Live Signals — All Pairs</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
                    {signals.map(s => {
                      const d = coinData[s.sym];
                      return (
                        <div key={s.sym} onClick={() => { setActiveCoin(s.sym); setTab("chart"); }}
                          style={{ background: "#070d1a", border: `1px solid ${s.color}33`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", transition: "all 0.15s" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <div>
                              <span style={{ fontWeight: 800, fontSize: 14 }}>{s.sym.replace("USDT","")}</span>
                              <span style={{ color: "#475569", fontSize: 11 }}>/USDT</span>
                            </div>
                            <span style={S.badge(s.color)}>{s.label}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>${fmt(s.price, 4)}</div>
                              <div style={{ fontSize: 11, color: (d?.change24h || 0) >= 0 ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(d?.change24h)}</div>
                            </div>
                            <MiniChart candles={d?.candles} color={s.color} width={80} height={32} />
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <div style={{ background: "#111827", borderRadius: 6, height: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${s.strength}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})`, borderRadius: 6 }} />
                            </div>
                            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Confidence: {s.strength?.toFixed(0)}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

          </div>
        </main>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #070d1a; }
        ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 3px; }
        input[type=range] { height: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
