import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const COINS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT",
  "DOTUSDT","LINKUSDT","MATICUSDT","UNIUSDT","LTCUSDT","ATOMUSDT","ETCUSDT","XLMUSDT",
  "ALGOUSDT","NEARUSDT","FILUSDT","VETUSDT","TRXUSDT","SANDUSDT","MANAUSDT","AXSUSDT",
  "GALAUSDT","AAVEUSDT","COMPUSDT","MKRUSDT","INJUSDT","APTUSDT","ARBUSDT","OPUSDT",
  "SUIUSDT","SEIUSDT","TIAUSDT","WLDUSDT","FETUSDT","RENDERUSDT","ICPUSDT","HBARUSDT",
  "EGLDUSDT","FLOWUSDT","THETAUSDT","KSMUSDT","ZILUSDT","BATUSDT","STORJUSDT","ANKRUSDT",
  "PENDLEUSDT","ARKMUSDT","ENAUSDT","NOTUSDT","PEPEUSDT","SHIBUSDT","FLOKIUSDT","BONKUSDT",
  "WIFUSDT","POPCATUSDT","TRUMPUSDT","JUPUSDT","PYTHUSDT","RAYUSDT","ONDOUSDT","LDOUSDT",
  "STRKUSDT","RONINUSDT","DYMUSDT","ORDIUSDT","BCHUSDT","QNTUSDT","RUNEUSDT","MINAUSDT",
  "CHZUSDT","ENJUSDT","GMTUSDT","APEUSDT","DYDXUSDT","GMXUSDT","YFIUSDT","CRVUSDT",
  "SNXUSDT","SUSHIUSDT","ZRXUSDT","CELRUSDT","RVNUSDT","SKLUSDT","HOOKUSDT","MAVUSDT",
  "BOMEUSDT","MEMEUSDT","NEIROUSDT","GOATUSDT","PNUTUSDT","VIRTUALUSDT","MOVEUSDT",
  "KAITOUSDT","ZROUSDT","JITOUSDT","BANANAUSDT","ALTUSDT","AXLUSDT","BLURUSDT",
  "AEVOUSDT","SAGAUSDT","XVSUSDT","ONEUSDT","KLAYUSDT","TUSDT","STEEMUSDT","PERPUSDT"
];

const TIMEFRAMES = [
  { label: "1m", interval: "1m", limit: 200 },
  { label: "5m", interval: "5m", limit: 200 },
  { label: "15m", interval: "15m", limit: 200 },
  { label: "1h", interval: "1h", limit: 200 },
  { label: "4h", interval: "4h", limit: 200 },
  { label: "1d", interval: "1d", limit: 200 },
];

const BINANCE_BASE = "https://fapi.binance.com";
const SPOT_BASE = "https://api.binance.com";

// ══════════════════════════════════════════════════════════════
// ADVANCED MATH ENGINE
// ══════════════════════════════════════════════════════════════
class MathEngine {

  // ── EMA ──────────────────────────────────────────────────────
  static ema(data, period) {
    if (data.length < period) return Array(data.length).fill(data[0]);
    const k = 2 / (period + 1);
    const result = [];
    let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = 0; i < period - 1; i++) result.push(null);
    result.push(val);
    for (let i = period; i < data.length; i++) {
      val = data[i] * k + val * (1 - k);
      result.push(val);
    }
    return result;
  }

  static lastEma(data, period) {
    const arr = this.ema(data, period);
    return arr[arr.length - 1] || data[data.length - 1];
  }

  // ── RSI ──────────────────────────────────────────────────────
  static rsi(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses += Math.abs(d);
    }
    let ag = gains / period, al = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + Math.max(0, d)) / period;
      al = (al * (period - 1) + Math.max(0, -d)) / period;
    }
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
  }

  // ── MACD ─────────────────────────────────────────────────────
  static macd(closes) {
    if (closes.length < 34) return { macd: 0, signal: 0, hist: 0 };
    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);
    const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null) ? v - ema26[i] : null).filter(Boolean);
    const sigLine = this.ema(macdLine, 9);
    const m = macdLine[macdLine.length - 1];
    const s = sigLine[sigLine.length - 1];
    return { macd: m, signal: s, hist: m - s };
  }

  // ── Bollinger Bands ──────────────────────────────────────────
  static bb(closes, period = 20, mult = 2) {
    if (closes.length < period) return { upper: 0, mid: 0, lower: 0, width: 0 };
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return { upper: mean + mult * std, mid: mean, lower: mean - mult * std, width: (mult * 2 * std) / mean * 100 };
  }

  // ── Stochastic RSI ───────────────────────────────────────────
  static stochRsi(closes, rsiPeriod = 14, stochPeriod = 14) {
    if (closes.length < rsiPeriod + stochPeriod + 5) return { k: 50, d: 50 };
    const rsiValues = [];
    for (let i = rsiPeriod; i < closes.length; i++) {
      rsiValues.push(this.rsi(closes.slice(0, i + 1), rsiPeriod));
    }
    const recent = rsiValues.slice(-stochPeriod);
    const min = Math.min(...recent), max = Math.max(...recent);
    const k = max === min ? 50 : ((rsiValues[rsiValues.length - 1] - min) / (max - min)) * 100;
    const kArr = rsiValues.slice(-3).map((rv, i, arr) => {
      const sl = rsiValues.slice(Math.max(0, rsiValues.length - stochPeriod - (arr.length - 1 - i)), rsiValues.length - (arr.length - 1 - i));
      const mn = Math.min(...sl), mx = Math.max(...sl);
      return mx === mn ? 50 : ((rv - mn) / (mx - mn)) * 100;
    });
    const d = kArr.reduce((a, b) => a + b, 0) / kArr.length;
    return { k, d };
  }

  // ── ATR ──────────────────────────────────────────────────────
  static atr(candles, period = 14) {
    if (candles.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      trs.push(Math.max(hl, hc, lc));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  // ── Volume Analysis ──────────────────────────────────────────
  static volumeAnalysis(candles) {
    if (candles.length < 20) return { trend: "neutral", ratio: 1 };
    const recent = candles.slice(-5).map(c => c.volume);
    const avg = candles.slice(-20).map(c => c.volume).reduce((a, b) => a + b, 0) / 20;
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const ratio = recentAvg / avg;
    const bullVol = candles.slice(-10).filter(c => c.close >= c.open).reduce((a, c) => a + c.volume, 0);
    const bearVol = candles.slice(-10).filter(c => c.close < c.open).reduce((a, c) => a + c.volume, 0);
    const trend = bullVol > bearVol * 1.2 ? "bullish" : bearVol > bullVol * 1.2 ? "bearish" : "neutral";
    return { trend, ratio: ratio.toFixed(2), bullVol, bearVol };
  }

  // ── ADVANCED S/R with Strength Scoring ─────────────────────
  static supportResistance(candles, lookback = 5) {
    if (candles.length < lookback * 2 + 5) return { supports: [], resistances: [] };
    const rawS = [], rawR = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
      const windowH = candles.slice(i - lookback, i + lookback + 1).map(c => c.high);
      const windowL = candles.slice(i - lookback, i + lookback + 1).map(c => c.low);
      if (candles[i].high >= Math.max(...windowH)) rawR.push({ price: candles[i].high, idx: i });
      if (candles[i].low <= Math.min(...windowL)) rawS.push({ price: candles[i].low, idx: i });
    }

    const cluster = (arr) => {
      if (!arr.length) return [];
      const sorted = [...arr].sort((a, b) => a.price - b.price);
      const clusters = [];
      let group = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i].price - group[group.length - 1].price) / group[0].price < 0.008) {
          group.push(sorted[i]);
        } else {
          clusters.push(group);
          group = [sorted[i]];
        }
      }
      clusters.push(group);
      return clusters.map(g => ({
        price: g.reduce((a, b) => a + b.price, 0) / g.length,
        strength: Math.min(100, g.length * 20 + (g[g.length-1].idx - g[0].idx > 10 ? 20 : 0)),
        touches: g.length,
      })).sort((a, b) => b.strength - a.strength).slice(0, 6);
    };

    return { supports: cluster(rawS), resistances: cluster(rawR) };
  }

  // ── Pivot Points (Standard) ──────────────────────────────────
  static pivotPoints(high, low, close) {
    const pp = (high + low + close) / 3;
    return {
      pp, r1: 2*pp - low, r2: pp + high - low, r3: high + 2*(pp - low),
      s1: 2*pp - high, s2: pp - (high - low), s3: low - 2*(high - pp),
    };
  }

  // ── Fibonacci Levels ─────────────────────────────────────────
  static fibonacci(high, low) {
    const diff = high - low;
    return {
      f0: low, f236: low + 0.236 * diff, f382: low + 0.382 * diff,
      f500: low + 0.5 * diff, f618: low + 0.618 * diff,
      f786: low + 0.786 * diff, f100: high,
    };
  }

  // ── Trend Strength (ADX-like) ────────────────────────────────
  static trendStrength(candles, period = 14) {
    if (candles.length < period + 1) return { adx: 0, trend: "sideways" };
    let dmPlus = 0, dmMinus = 0, atrVal = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const upMove = candles[i].high - candles[i-1].high;
      const downMove = candles[i-1].low - candles[i].low;
      if (upMove > downMove && upMove > 0) dmPlus += upMove;
      if (downMove > upMove && downMove > 0) dmMinus += downMove;
      const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close));
      atrVal += tr;
    }
    const diPlus = atrVal > 0 ? (dmPlus / atrVal) * 100 : 0;
    const diMinus = atrVal > 0 ? (dmMinus / atrVal) * 100 : 0;
    const dx = diPlus + diMinus > 0 ? Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100 : 0;
    const trend = dx > 25 ? (diPlus > diMinus ? "uptrend" : "downtrend") : "sideways";
    return { adx: dx.toFixed(1), diPlus: diPlus.toFixed(1), diMinus: diMinus.toFixed(1), trend };
  }

  // ── MASTER SIGNAL ENGINE ─────────────────────────────────────
  static generateSignal(candles, leverage = 10, marginType = "Cross") {
    if (!candles || candles.length < 50) return null;
    const closes = candles.map(c => c.close);
    const price = closes[closes.length - 1];

    const rsiVal = this.rsi(closes);
    const macdVal = this.macd(closes);
    const bbVal = this.bb(closes);
    const ema21 = this.lastEma(closes, 21);
    const ema55 = this.lastEma(closes, 55);
    const ema200 = this.lastEma(closes, 200);
    const sr = this.supportResistance(candles);
    const vol = this.volumeAnalysis(candles);
    const trend = this.trendStrength(candles);
    const stoch = this.stochRsi(closes);
    const atrVal = this.atr(candles);
    const pivots = this.pivotPoints(
      Math.max(...candles.slice(-24).map(c => c.high)),
      Math.min(...candles.slice(-24).map(c => c.low)),
      closes[closes.length - 1]
    );

    // ── Scoring System (0-100) ───────────────────────────────
    let bullScore = 0, bearScore = 0;
    const reasons = { bull: [], bear: [] };

    // RSI (weight: 15)
    if (rsiVal < 30) { bullScore += 15; reasons.bull.push(`RSI oversold (${rsiVal.toFixed(1)})`); }
    else if (rsiVal < 45) { bullScore += 8; reasons.bull.push(`RSI bullish zone (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 70) { bearScore += 15; reasons.bear.push(`RSI overbought (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 55) { bearScore += 8; reasons.bear.push(`RSI bearish zone (${rsiVal.toFixed(1)})`); }

    // MACD (weight: 15)
    if (macdVal.hist > 0 && macdVal.macd > macdVal.signal) { bullScore += 15; reasons.bull.push("MACD bullish crossover"); }
    else if (macdVal.hist > 0) { bullScore += 8; reasons.bull.push("MACD positive"); }
    else if (macdVal.hist < 0 && macdVal.macd < macdVal.signal) { bearScore += 15; reasons.bear.push("MACD bearish crossover"); }
    else if (macdVal.hist < 0) { bearScore += 8; reasons.bear.push("MACD negative"); }

    // EMA Structure (weight: 20)
    if (price > ema21 && ema21 > ema55 && ema55 > ema200) { bullScore += 20; reasons.bull.push("All EMAs aligned bullish"); }
    else if (price > ema55 && ema55 > ema200) { bullScore += 12; reasons.bull.push("Price above EMA55 & 200"); }
    else if (price > ema200) { bullScore += 6; reasons.bull.push("Price above EMA200"); }
    else if (price < ema21 && ema21 < ema55 && ema55 < ema200) { bearScore += 20; reasons.bear.push("All EMAs aligned bearish"); }
    else if (price < ema55 && ema55 < ema200) { bearScore += 12; reasons.bear.push("Price below EMA55 & 200"); }
    else if (price < ema200) { bearScore += 6; reasons.bear.push("Price below EMA200"); }

    // Bollinger Bands (weight: 10)
    if (price < bbVal.lower) { bullScore += 10; reasons.bull.push("Price below BB lower band"); }
    else if (price < bbVal.mid) { bullScore += 5; reasons.bull.push("Price below BB midline"); }
    else if (price > bbVal.upper) { bearScore += 10; reasons.bear.push("Price above BB upper band"); }
    else if (price > bbVal.mid) { bearScore += 5; reasons.bear.push("Price above BB midline"); }

    // S/R Proximity (weight: 15)
    const nearSup = sr.supports.find(s => Math.abs(price - s.price) / price < 0.015);
    const nearRes = sr.resistances.find(r => Math.abs(price - r.price) / price < 0.015);
    if (nearSup) { bullScore += Math.min(15, nearSup.strength / 7); reasons.bull.push(`Near support $${nearSup.price.toFixed(2)} (strength ${nearSup.strength})`); }
    if (nearRes) { bearScore += Math.min(15, nearRes.strength / 7); reasons.bear.push(`Near resistance $${nearRes.price.toFixed(2)} (strength ${nearRes.strength})`); }

    // Volume (weight: 10)
    if (vol.trend === "bullish" && vol.ratio > 1.2) { bullScore += 10; reasons.bull.push(`High bullish volume (${vol.ratio}x avg)`); }
    else if (vol.trend === "bearish" && vol.ratio > 1.2) { bearScore += 10; reasons.bear.push(`High bearish volume (${vol.ratio}x avg)`); }

    // Stochastic RSI (weight: 10)
    if (stoch.k < 20 && stoch.d < 20) { bullScore += 10; reasons.bull.push(`StochRSI oversold (K:${stoch.k.toFixed(0)})`); }
    else if (stoch.k > 80 && stoch.d > 80) { bearScore += 10; reasons.bear.push(`StochRSI overbought (K:${stoch.k.toFixed(0)})`); }

    // ADX Trend (weight: 5)
    if (trend.trend === "uptrend") { bullScore += 5; reasons.bull.push(`Strong uptrend (ADX ${trend.adx})`); }
    else if (trend.trend === "downtrend") { bearScore += 5; reasons.bear.push(`Strong downtrend (ADX ${trend.adx})`); }

    const total = bullScore + bearScore || 1;
    const confidence = Math.round((Math.max(bullScore, bearScore) / total) * 100);
    const isBull = bullScore > bearScore;
    const isBear = bearScore > bullScore;
    const diff = Math.abs(bullScore - bearScore);

    let type = "NEUTRAL", grade = "D";
    if (diff >= 30) { type = isBull ? "STRONG LONG" : "STRONG SHORT"; grade = "A"; }
    else if (diff >= 20) { type = isBull ? "LONG" : "SHORT"; grade = "B"; }
    else if (diff >= 10) { type = isBull ? "WEAK LONG" : "WEAK SHORT"; grade = "C"; }

    // Risk Assessment for leverage
    let riskLevel = "LOW", riskWarning = "";
    if (leverage >= 75) { riskLevel = "EXTREME"; riskWarning = "⚠️ EXTREME RISK: 75x+ leverage — liquidation distance <1.3%. Use only 1-2% of capital."; }
    else if (leverage >= 50) { riskLevel = "VERY HIGH"; riskWarning = "⚠️ VERY HIGH RISK: 50x leverage — small moves liquidate. Set tight SL immediately."; }
    else if (leverage >= 25) { riskLevel = "HIGH"; riskWarning = "⚠️ HIGH RISK: 25x leverage — monitor position closely."; }
    else if (leverage >= 10) { riskLevel = "MEDIUM"; riskWarning = "ℹ️ MEDIUM RISK: 10x leverage — recommended for experienced traders."; }
    else { riskLevel = "LOW"; riskWarning = "✅ LOW RISK: Safe leverage range for beginners."; }

    // Auto Entry/TP/SL suggestion
    let suggestedEntry = price, suggestedTP = price, suggestedSL = price;
    if (type.includes("LONG")) {
      const nearestSup = sr.supports.find(s => s.price < price);
      suggestedEntry = nearestSup ? (price + nearestSup.price) / 2 : price;
      suggestedSL = nearestSup ? nearestSup.price * 0.995 : price * (1 - 1 / leverage * 0.7);
      const nearestRes = sr.resistances.find(r => r.price > price);
      suggestedTP = nearestRes ? nearestRes.price * 0.995 : price * (1 + atrVal / price * 3);
    } else if (type.includes("SHORT")) {
      const nearestRes = sr.resistances.find(r => r.price > price);
      suggestedEntry = nearestRes ? (price + nearestRes.price) / 2 : price;
      suggestedSL = nearestRes ? nearestRes.price * 1.005 : price * (1 + 1 / leverage * 0.7);
      const nearestSup = sr.supports.find(s => s.price < price);
      suggestedTP = nearestSup ? nearestSup.price * 1.005 : price * (1 - atrVal / price * 3);
    }

    return {
      type, grade, confidence, bullScore, bearScore,
      isBull: type.includes("LONG"), isBear: type.includes("SHORT"),
      reasons: isBull ? reasons.bull : reasons.bear,
      color: type.includes("LONG") ? "#00e5a0" : type.includes("SHORT") ? "#ff4d6d" : "#94a3b8",
      rsi: rsiVal, macd: macdVal, bb: bbVal, ema21, ema55, ema200,
      sr, vol, trend, stoch, atr: atrVal, pivots,
      riskLevel, riskWarning, leverage, marginType,
      suggestedEntry, suggestedTP, suggestedSL,
      rrRatio: Math.abs((suggestedTP - suggestedEntry) / (suggestedEntry - suggestedSL)).toFixed(2),
    };
  }

  // ── Trade Calculator ─────────────────────────────────────────
  static calcTrade({ entry, tp, sl, margin, leverage, side, makerFee = 0.02, takerFee = 0.04, marginType = "Cross" }) {
    const posSize = margin * leverage;
    const qty = posSize / entry;
    const liqOffset = marginType === "Isolated" ? (margin / posSize) : (1 / leverage);
    const liqPrice = side === "LONG"
      ? entry * (1 - liqOffset + 0.005)
      : entry * (1 + liqOffset - 0.005);

    const calc = (exitPrice) => {
      const diff = side === "LONG" ? exitPrice - entry : entry - exitPrice;
      const raw = diff * qty;
      const entryFee = posSize * (takerFee / 100);
      const exitFee = qty * exitPrice * (takerFee / 100);
      const net = raw - entryFee - exitFee;
      return { raw, net, roi: (net / margin) * 100, entryFee, exitFee, fees: entryFee + exitFee };
    };

    const atTP = calc(tp);
    const atSL = calc(sl);
    const rr = Math.abs((tp - entry) / (entry - sl)).toFixed(2);
    const liqDist = Math.abs((liqPrice - entry) / entry * 100).toFixed(2);

    return { posSize, qty, liqPrice, liqDist, atTP, atSL, rr };
  }
}

// ══════════════════════════════════════════════════════════════
// BINANCE API
// ══════════════════════════════════════════════════════════════
async function fetchKlines(symbol, interval = "1h", limit = 200) {
  try {
    // Try futures first, fallback to spot
    let url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    let res = await fetch(url);
    if (!res.ok) {
      url = `${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      res = await fetch(url);
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(k => ({
      time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  } catch { return null; }
}

async function fetchTicker(symbol) {
  try {
    let res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`);
    if (!res.ok) res = await fetch(`${SPOT_BASE}/api/v3/ticker/24hr?symbol=${symbol}`);
    if (!res.ok) return null;
    const d = await res.json();
    return { price: +d.lastPrice, change24h: +d.priceChangePercent, volume: +d.quoteVolume, high24h: +d.highPrice, low24h: +d.lowPrice };
  } catch { return null; }
}

async function fetchAllTickers() {
  try {
    let res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/24hr`);
    if (!res.ok) res = await fetch(`${SPOT_BASE}/api/v3/ticker/24hr`);
    const data = await res.json();
    const map = {};
    data.forEach(d => { map[d.symbol] = { price: +d.lastPrice, change24h: +d.priceChangePercent, volume: +d.quoteVolume, high24h: +d.highPrice, low24h: +d.lowPrice }; });
    return map;
  } catch { return {}; }
}

// ══════════════════════════════════════════════════════════════
// MINI CHART SVG
// ══════════════════════════════════════════════════════════════
function SparkLine({ candles, color, w = 100, h = 36 }) {
  if (!candles || candles.length < 3) return <svg width={w} height={h} />;
  const closes = candles.slice(-30).map(c => c.close);
  const mn = Math.min(...closes), mx = Math.max(...closes);
  const range = mx - mn || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * w},${h - ((c - mn) / range) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════
// ADVANCED CANDLESTICK CHART
// ══════════════════════════════════════════════════════════════
function CandleChart({ candles, signal, width = "100%", height = 380 }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const W = 900, H = height;
  const PAD = { l: 75, r: 10, t: 28, b: 32 };
  const CW = W - PAD.l - PAD.r, CH = H - PAD.t - PAD.b;

  if (!candles || candles.length < 10) {
    return (
      <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 13 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
          <div>Fetching live market data...</div>
        </div>
      </div>
    );
  }

  const display = candles.slice(-80);
  const sr = signal?.sr;
  const pivots = signal?.pivots;

  const allP = [...display.map(c => c.high), ...display.map(c => c.low)];
  if (sr?.supports) sr.supports.forEach(s => allP.push(s.price));
  if (sr?.resistances) sr.resistances.forEach(r => allP.push(r.price));
  const rawMax = Math.max(...allP), rawMin = Math.min(...allP);
  const pad = (rawMax - rawMin) * 0.07;
  const yMax = rawMax + pad, yMin = rawMin - pad;
  const yRange = yMax - yMin || 1;

  const toX = (i) => PAD.l + (i / (display.length - 1)) * CW;
  const toY = (p) => PAD.t + CH - ((p - yMin) / yRange) * CH;
  const bw = Math.max(2, (CW / display.length) * 0.6);

  // EMA lines
  const closes = display.map(c => c.close);
  const ema21arr = MathEngine.ema(closes, 21);
  const ema55arr = MathEngine.ema(closes, 55);
  const ema200arr = MathEngine.ema(closes, 200);

  const linePoints = (arr) => arr.map((v, i) => v !== null ? `${toX(i)},${toY(v)}` : null).filter(Boolean).join(" ");

  const fmtPrice = (p) => p >= 1000 ? p.toFixed(1) : p >= 1 ? p.toFixed(3) : p >= 0.001 ? p.toFixed(5) : p.toFixed(8);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width, height: H, display: "block", cursor: "crosshair" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* BG */}
        <rect x={0} y={0} width={W} height={H} fill="#060d1a" rx={10} />

        {/* Grid */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => {
          const y = PAD.t + t * CH;
          const price = yMax - t * yRange;
          return (
            <g key={t}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#0f1f35" strokeWidth="1" />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fill="#2d4a6a" fontSize="10">{fmtPrice(price)}</text>
            </g>
          );
        })}

        {/* Time labels */}
        {display.filter((_, i) => i % Math.floor(display.length / 6) === 0).map((c, i, arr) => {
          const origIdx = display.indexOf(c);
          const d = new Date(c.time);
          const label = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
          return <text key={i} x={toX(origIdx)} y={H - 8} textAnchor="middle" fill="#2d4a6a" fontSize="9">{label}</text>;
        })}

        {/* EMA Lines */}
        {ema21arr.filter(Boolean).length > 5 && <polyline points={linePoints(ema21arr)} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.7" />}
        {ema55arr.filter(Boolean).length > 5 && <polyline points={linePoints(ema55arr)} fill="none" stroke="#8b5cf6" strokeWidth="1" opacity="0.7" />}
        {ema200arr.filter(Boolean).length > 5 && <polyline points={linePoints(ema200arr)} fill="none" stroke="#0ea5e9" strokeWidth="1.5" opacity="0.8" />}

        {/* EMA Legend */}
        {[["EMA21","#f59e0b"],["EMA55","#8b5cf6"],["EMA200","#0ea5e9"]].map(([l,c], i) => (
          <g key={l}>
            <rect x={PAD.l + i * 72} y={PAD.t - 18} width={24} height={2} fill={c} rx={1} />
            <text x={PAD.l + i * 72 + 28} y={PAD.t - 12} fill={c} fontSize="9">{l}</text>
          </g>
        ))}

        {/* S/R Lines */}
        {sr?.supports?.map((s, i) => (
          <g key={`s${i}`}>
            <line x1={PAD.l} y1={toY(s.price)} x2={W - PAD.r} y2={toY(s.price)} stroke="#00e5a0" strokeWidth={s.touches > 2 ? 1.5 : 1} strokeDasharray="5,4" opacity="0.6" />
            <rect x={W - PAD.r - 28} y={toY(s.price) - 9} width={28} height={12} fill="#00e5a022" rx={2} />
            <text x={W - PAD.r - 14} y={toY(s.price) + 1} textAnchor="middle" fill="#00e5a0" fontSize="8">S{i+1}</text>
          </g>
        ))}
        {sr?.resistances?.map((r, i) => (
          <g key={`r${i}`}>
            <line x1={PAD.l} y1={toY(r.price)} x2={W - PAD.r} y2={toY(r.price)} stroke="#ff4d6d" strokeWidth={r.touches > 2 ? 1.5 : 1} strokeDasharray="5,4" opacity="0.6" />
            <rect x={W - PAD.r - 28} y={toY(r.price) - 9} width={28} height={12} fill="#ff4d6d22" rx={2} />
            <text x={W - PAD.r - 14} y={toY(r.price) + 1} textAnchor="middle" fill="#ff4d6d" fontSize="8">R{i+1}</text>
          </g>
        ))}

        {/* Pivot PP line */}
        {pivots?.pp && toY(pivots.pp) > PAD.t && toY(pivots.pp) < H - PAD.b && (
          <line x1={PAD.l} y1={toY(pivots.pp)} x2={W - PAD.r} y2={toY(pivots.pp)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="8,4" opacity="0.5" />
        )}

        {/* Candles */}
        {display.map((c, i) => {
          const x = toX(i);
          const isGreen = c.close >= c.open;
          const col = isGreen ? "#00e5a0" : "#ff4d6d";
          const bodyT = toY(Math.max(c.open, c.close));
          const bodyB = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyB - bodyT);
          return (
            <g key={i} onMouseEnter={() => setTooltip({ c, x: toX(i), i })}>
              <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={col} strokeWidth="1" />
              <rect x={x - bw/2} y={bodyT} width={bw} height={bodyH} fill={col} opacity={isGreen ? 0.9 : 0.85} rx={0.5} />
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.t} x2={tooltip.x} y2={H - PAD.b} stroke="#ffffff22" strokeWidth="1" strokeDasharray="3,3" />
            <rect x={Math.min(tooltip.x + 8, W - 150)} y={PAD.t + 4} width={140} height={88} fill="#0b1929" stroke="#1e3a5f" rx={6} />
            {["O","H","L","C","Vol"].map((label, li) => {
              const vals = [tooltip.c.open, tooltip.c.high, tooltip.c.low, tooltip.c.close, tooltip.c.volume];
              const fmt = li === 4 ? (v => (v/1e6).toFixed(2)+"M") : fmtPrice;
              const col = li === 3 ? (tooltip.c.close >= tooltip.c.open ? "#00e5a0" : "#ff4d6d") : "#94a3b8";
              return (
                <g key={label}>
                  <text x={Math.min(tooltip.x + 16, W - 142)} y={PAD.t + 20 + li * 15} fill="#475569" fontSize="9">{label}</text>
                  <text x={Math.min(tooltip.x + 140, W - 10)} y={PAD.t + 20 + li * 15} textAnchor="end" fill={col} fontSize="9">{fmt(vals[li])}</text>
                </g>
              );
            })}
          </g>
        )}

        {/* Signal badge */}
        {signal && signal.type !== "NEUTRAL" && (
          <g>
            <rect x={PAD.l + 8} y={PAD.t + 4} width={130} height={20} fill={signal.color + "22"} stroke={signal.color + "44"} rx={4} />
            <text x={PAD.l + 14} y={PAD.t + 17} fill={signal.color} fontSize="11" fontWeight="bold">{signal.type} — {signal.confidence}%</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
export default function Traxivo() {
  const [activeCoin, setActiveCoin] = useState("BTCUSDT");
  const [activeTF, setActiveTF] = useState("1h");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("chart");
  const [candles, setCandles] = useState(null);
  const [signal, setSignal] = useState(null);
  const [tickers, setTickers] = useState({});
  const [loadingChart, setLoadingChart] = useState(true);
  const [coinSignals, setCoinSignals] = useState({});
  const [scanProgress, setScanProgress] = useState(0);

  // Calculator state
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState(100);
  const [marginType, setMarginType] = useState("Cross");
  const [side, setSide] = useState("LONG");
  const [makerFee, setMakerFee] = useState(0.02);
  const [takerFee, setTakerFee] = useState(0.04);
  const [customEntry, setCustomEntry] = useState("");
  const [customTP, setCustomTP] = useState("");
  const [customSL, setCustomSL] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const currentTicker = tickers[activeCoin] || {};
  const currentPrice = currentTicker.price || candles?.[candles.length - 1]?.close || 0;

  // ── Load tickers ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const t = await fetchAllTickers();
      if (Object.keys(t).length > 0) setTickers(t);
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  // ── Load candles ──────────────────────────────────────────
  useEffect(() => {
    setLoadingChart(true);
    setCandles(null);
    setSignal(null);
    const tf = TIMEFRAMES.find(t => t.label === activeTF) || TIMEFRAMES[3];
    fetchKlines(activeCoin, tf.interval, tf.limit).then(data => {
      if (data && data.length > 30) {
        setCandles(data);
        const sig = MathEngine.generateSignal(data, leverage, marginType);
        setSignal(sig);
        if (sig && currentPrice > 0) {
          setCustomEntry(sig.suggestedEntry.toFixed(4));
          setCustomTP(sig.suggestedTP.toFixed(4));
          setCustomSL(sig.suggestedSL.toFixed(4));
        }
      }
      setLoadingChart(false);
    });
  }, [activeCoin, activeTF]);

  // Recalc signal when leverage/margin changes
  useEffect(() => {
    if (candles && candles.length > 30) {
      const sig = MathEngine.generateSignal(candles, leverage, marginType);
      setSignal(sig);
    }
  }, [leverage, marginType]);

  // ── Scan top coins for signals ────────────────────────────
  useEffect(() => {
    const scanCoins = async () => {
      const topCoins = COINS.slice(0, 30);
      const results = {};
      for (let i = 0; i < topCoins.length; i++) {
        const sym = topCoins[i];
        setScanProgress(Math.round((i / topCoins.length) * 100));
        const data = await fetchKlines(sym, "1h", 100);
        if (data && data.length > 30) {
          const sig = MathEngine.generateSignal(data, leverage, marginType);
          if (sig) results[sym] = { ...sig, price: data[data.length - 1].close };
        }
        await new Promise(r => setTimeout(r, 120));
      }
      setCoinSignals(results);
      setScanProgress(100);
    };
    scanCoins();
  }, []);

  // ── Trade calculation ─────────────────────────────────────
  const entry = useCustom && customEntry ? +customEntry : signal?.suggestedEntry || currentPrice;
  const tp = useCustom && customTP ? +customTP : signal?.suggestedTP || currentPrice * 1.05;
  const sl = useCustom && customSL ? +customSL : signal?.suggestedSL || currentPrice * 0.97;

  const trade = useMemo(() => {
    if (!entry) return null;
    return MathEngine.calcTrade({ entry, tp, sl, margin, leverage, side, makerFee, takerFee, marginType });
  }, [entry, tp, sl, margin, leverage, side, makerFee, takerFee, marginType]);

  const fmt = (n, d = 2) => {
    if (!n && n !== 0) return "—";
    if (Math.abs(n) < 0.000001) return n.toExponential(4);
    if (Math.abs(n) < 0.0001) return n.toFixed(8);
    if (Math.abs(n) < 0.01) return n.toFixed(6);
    if (Math.abs(n) < 1) return n.toFixed(4);
    if (Math.abs(n) < 10000) return n.toFixed(d);
    return n.toLocaleString(undefined, { maximumFractionDigits: d });
  };

  const fmtPct = (n) => `${n >= 0 ? "+" : ""}${(n || 0).toFixed(2)}%`;

  const filteredCoins = useMemo(() =>
    COINS.filter(c => c.toLowerCase().includes(search.toLowerCase())), [search]);

  const strongSignals = useMemo(() =>
    Object.entries(coinSignals)
      .filter(([, s]) => s.type !== "NEUTRAL" && s.grade !== "D")
      .sort((a, b) => b[1].confidence - a[1].confidence),
    [coinSignals]);

  // ── STYLES ──────────────────────────────────────────────────
  const css = {
    app: { display: "flex", flexDirection: "column", height: "100vh", background: "#040a12", color: "#cbd5e1", fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, overflow: "hidden" },
    header: { display: "flex", alignItems: "center", gap: 16, padding: "0 16px", height: 48, background: "#060d1a", borderBottom: "1px solid #0f2035", flexShrink: 0, zIndex: 50 },
    logo: { fontSize: 20, fontWeight: 900, background: "linear-gradient(135deg, #00e5a0 0%, #0ea5e9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -1 },
    body: { display: "flex", flex: 1, overflow: "hidden" },
    sidebar: { width: 210, background: "#060d1a", borderRight: "1px solid #0f2035", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    coinBar: { padding: "8px 10px", borderBottom: "1px solid #0f2035" },
    searchInput: { width: "100%", background: "#0b1929", border: "1px solid #0f2035", borderRadius: 6, color: "#cbd5e1", padding: "6px 8px", fontSize: 11, outline: "none", boxSizing: "border-box" },
    coinList: { flex: 1, overflowY: "auto" },
    coinRow: (active) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", cursor: "pointer", background: active ? "#0a1e35" : "transparent", borderLeft: `2px solid ${active ? "#00e5a0" : "transparent"}`, transition: "all 0.1s" }),
    topBar: { display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", background: "#060d1a", borderBottom: "1px solid #0f2035", flexShrink: 0, flexWrap: "wrap" },
    tabRow: { display: "flex", gap: 3, padding: "7px 14px", background: "#040a12", borderBottom: "1px solid #0f2035", flexShrink: 0 },
    tab: (a) => ({ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, background: a ? "#0ea5e9" : "#0b1929", color: a ? "#fff" : "#475569", transition: "all 0.15s" }),
    content: { flex: 1, overflowY: "auto", padding: 12 },
    card: { background: "#060d1a", border: "1px solid #0f2035", borderRadius: 10, padding: 12, marginBottom: 10 },
    grid: (n) => ({ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 8 }),
    mCard: (c) => ({ background: "#040a12", border: `1px solid ${c}22`, borderRadius: 8, padding: "10px 12px" }),
    label: { fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
    val: (c, s = 16) => ({ fontSize: s, fontWeight: 800, color: c }),
    badge: (c) => ({ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: `${c}18`, color: c, border: `1px solid ${c}33` }),
    btn: (c, outline) => ({ padding: "7px 14px", borderRadius: 7, border: outline ? `1px solid ${c}` : "none", background: outline ? "transparent" : c, color: outline ? c : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    inp: { background: "#0b1929", border: "1px solid #0f2035", borderRadius: 7, color: "#cbd5e1", padding: "7px 10px", fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" },
    tf: (a) => ({ padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 10, background: a ? "#00e5a0" : "#0b1929", color: a ? "#040a12" : "#475569" }),
  };

  const signalColor = signal?.color || "#475569";
  const isUp = (currentTicker.change24h || 0) >= 0;

  return (
    <div style={css.app}>
      {/* ── HEADER ── */}
      <header style={css.header}>
        <span style={css.logo}>TRAXIVO</span>
        <span style={{ fontSize: 10, color: "#1e3a5f" }}>Real-Time Futures Intelligence</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ ...css.badge("#00e5a0"), fontSize: 9 }}>⬤ LIVE BINANCE</span>
          <span style={{ ...css.badge("#0ea5e9"), fontSize: 9 }}>FUTURES</span>
          <span style={{ ...css.badge("#f59e0b"), fontSize: 9 }}>SPOT</span>
        </div>
      </header>

      <div style={css.body}>
        {/* ── SIDEBAR ── */}
        <aside style={css.sidebar}>
          <div style={css.coinBar}>
            <input placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} style={css.searchInput} />
          </div>
          <div style={css.coinList}>
            {filteredCoins.map(sym => {
              const t = tickers[sym] || {};
              const up = (t.change24h || 0) >= 0;
              const cs = coinSignals[sym];
              return (
                <div key={sym} style={css.coinRow(activeCoin === sym)} onClick={() => setActiveCoin(sym)}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 11, color: activeCoin === sym ? "#00e5a0" : "#e2e8f0" }}>{sym.replace("USDT", "")}</div>
                    <div style={{ fontSize: 9.5, color: up ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(t.change24h)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {cs && cs.type !== "NEUTRAL" && <div style={{ ...css.badge(cs.color), fontSize: 8, padding: "1px 5px", marginBottom: 2 }}>{cs.type}</div>}
                    <div style={{ fontSize: 9.5, color: "#475569" }}>{t.price ? `$${fmt(t.price)}` : "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={css.main}>
          {/* Top bar */}
          <div style={css.topBar}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {activeCoin.replace("USDT", "")}<span style={{ color: "#1e3a5f", fontSize: 11 }}>/USDT</span>
              </div>
              <div style={{ fontSize: 9, color: "#334155" }}>Binance Futures • {activeTF}</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: isUp ? "#00e5a0" : "#ff4d6d" }}>
              ${fmt(currentPrice, currentPrice < 1 ? 6 : 2)}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(currentTicker.change24h)}</span>
            {signal && signal.type !== "NEUTRAL" && <span style={css.badge(signalColor)}>{signal.type} • {signal.confidence}% conf.</span>}
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {TIMEFRAMES.map(tf => <button key={tf.label} style={css.tf(activeTF === tf.label)} onClick={() => setActiveTF(tf.label)}>{tf.label}</button>)}
            </div>
          </div>

          {/* Tabs */}
          <div style={css.tabRow}>
            {[["chart","📈 Analysis"],["calculator","🧮 Calculator"],["signals","⚡ Signals"]].map(([k, l]) => (
              <button key={k} style={css.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          <div style={css.content}>

            {/* ══ CHART TAB ══ */}
            {tab === "chart" && (
              <>
                {/* Indicator Strip */}
                <div style={{ ...css.grid(6), marginBottom: 8 }}>
                  {signal ? [
                    { l: "RSI 14", v: signal.rsi?.toFixed(1), c: signal.rsi < 35 ? "#00e5a0" : signal.rsi > 65 ? "#ff4d6d" : "#f59e0b" },
                    { l: "MACD Hist", v: signal.macd?.hist?.toFixed(4), c: (signal.macd?.hist || 0) > 0 ? "#00e5a0" : "#ff4d6d" },
                    { l: "StochRSI K", v: signal.stoch?.k?.toFixed(1), c: signal.stoch?.k < 20 ? "#00e5a0" : signal.stoch?.k > 80 ? "#ff4d6d" : "#f59e0b" },
                    { l: "BB Width", v: signal.bb?.width?.toFixed(2) + "%", c: "#8b5cf6" },
                    { l: "ADX Trend", v: signal.trend?.trend?.toUpperCase(), c: signal.trend?.trend === "uptrend" ? "#00e5a0" : signal.trend?.trend === "downtrend" ? "#ff4d6d" : "#94a3b8" },
                    { l: "Volume", v: signal.vol?.trend?.toUpperCase(), c: signal.vol?.trend === "bullish" ? "#00e5a0" : signal.vol?.trend === "bearish" ? "#ff4d6d" : "#94a3b8" },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={css.mCard(c)}>
                      <div style={css.label}>{l}</div>
                      <div style={css.val(c, 13)}>{v}</div>
                    </div>
                  )) : <div style={{ gridColumn: "span 6", color: "#334155", fontSize: 11, padding: 4 }}>Loading indicators...</div>}
                </div>

                {/* Chart */}
                <div style={css.card}>
                  {loadingChart ? (
                    <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "#1e3a5f" }}>
                      <div style={{ width: 32, height: 32, border: "2px solid #0ea5e9", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      <div>Fetching live Binance data...</div>
                    </div>
                  ) : (
                    <CandleChart candles={candles} signal={signal} height={380} />
                  )}
                </div>

                {/* Signal Box */}
                {signal && signal.type !== "NEUTRAL" && (
                  <div style={{ ...css.card, border: `1px solid ${signalColor}44`, background: `${signalColor}08` }}>
                    <div style={{ ...css.row, marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{signal.isBull ? "🟢" : "🔴"}</span>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 16, color: signalColor }}>{signal.type}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>Grade {signal.grade} • {signal.confidence}% confidence • {signal.reasons?.length} factors</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, color: signalColor, fontSize: 18 }}>{signal.confidence}%</div>
                        <div style={{ fontSize: 9, color: "#475569" }}>CONFIDENCE</div>
                      </div>
                    </div>
                    {/* Confidence bar */}
                    <div style={{ background: "#0b1929", borderRadius: 4, height: 6, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${signal.confidence}%`, background: `linear-gradient(90deg, ${signalColor}66, ${signalColor})`, borderRadius: 4, transition: "width 0.5s" }} />
                    </div>
                    {/* Reasons */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                      {signal.reasons?.map((r, i) => (
                        <span key={i} style={{ background: `${signalColor}15`, color: signalColor, border: `1px solid ${signalColor}30`, borderRadius: 5, padding: "2px 7px", fontSize: 10 }}>✓ {r}</span>
                      ))}
                    </div>
                    {/* Suggested levels */}
                    <div style={css.grid(3)}>
                      {[["🎯 Suggested Entry", signal.suggestedEntry, "#0ea5e9"],
                        ["✅ Target (TP)", signal.suggestedTP, "#00e5a0"],
                        ["🛑 Stop Loss", signal.suggestedSL, "#ff4d6d"]].map(([l, v, c]) => (
                        <div key={l} style={css.mCard(c)}>
                          <div style={css.label}>{l}</div>
                          <div style={css.val(c, 14)}>${fmt(v, 4)}</div>
                          <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{(((v - currentPrice) / currentPrice) * 100).toFixed(2)}%</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, padding: "7px 10px", background: "#040a12", borderRadius: 7, border: `1px solid ${signal.riskLevel === "EXTREME" ? "#ff4d6d" : signal.riskLevel === "VERY HIGH" ? "#f97316" : "#0f2035"}` }}>
                      <div style={{ fontSize: 11, color: signal.riskLevel === "EXTREME" ? "#ff4d6d" : signal.riskLevel === "VERY HIGH" ? "#f97316" : "#94a3b8" }}>
                        {signal.riskWarning}
                      </div>
                    </div>
                  </div>
                )}

                {/* S/R Table */}
                <div style={css.grid(2)}>
                  <div style={css.card}>
                    <div style={{ fontWeight: 800, color: "#00e5a0", marginBottom: 8, fontSize: 12 }}>🟢 Support Zones</div>
                    {signal?.sr?.supports?.map((s, i) => (
                      <div key={i} style={{ ...css.row, padding: "5px 0", borderBottom: "1px solid #0f2035" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#334155", fontSize: 10 }}>S{i+1}</span>
                          <div style={{ background: "#0b1929", borderRadius: 4, height: 3, width: s.strength * 0.6 + "px", maxWidth: 60 }}>
                            <div style={{ height: "100%", width: `${s.strength}%`, background: "#00e5a0", borderRadius: 4 }} />
                          </div>
                        </div>
                        <span style={{ fontWeight: 800, color: "#00e5a0", fontSize: 12 }}>${fmt(s.price)}</span>
                        <span style={{ fontSize: 9, color: "#334155" }}>{(((s.price - currentPrice) / currentPrice) * 100).toFixed(2)}%</span>
                      </div>
                    ))}
                    {!signal?.sr?.supports?.length && <div style={{ color: "#334155", fontSize: 10 }}>Calculating...</div>}
                  </div>
                  <div style={css.card}>
                    <div style={{ fontWeight: 800, color: "#ff4d6d", marginBottom: 8, fontSize: 12 }}>🔴 Resistance Zones</div>
                    {signal?.sr?.resistances?.map((r, i) => (
                      <div key={i} style={{ ...css.row, padding: "5px 0", borderBottom: "1px solid #0f2035" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#334155", fontSize: 10 }}>R{i+1}</span>
                          <div style={{ background: "#0b1929", borderRadius: 4, height: 3, width: r.strength * 0.6 + "px", maxWidth: 60 }}>
                            <div style={{ height: "100%", width: `${r.strength}%`, background: "#ff4d6d", borderRadius: 4 }} />
                          </div>
                        </div>
                        <span style={{ fontWeight: 800, color: "#ff4d6d", fontSize: 12 }}>${fmt(r.price)}</span>
                        <span style={{ fontSize: 9, color: "#334155" }}>{(((r.price - currentPrice) / currentPrice) * 100).toFixed(2)}%</span>
                      </div>
                    ))}
                    {!signal?.sr?.resistances?.length && <div style={{ color: "#334155", fontSize: 10 }}>Calculating...</div>}
                  </div>
                </div>

                {/* Pivot Points */}
                {signal?.pivots && (
                  <div style={css.card}>
                    <div style={{ fontWeight: 800, color: "#f59e0b", marginBottom: 8, fontSize: 11 }}>📐 Pivot Points (Standard)</div>
                    <div style={css.grid(7)}>
                      {[["S3","#ef4444",signal.pivots.s3],["S2","#f97316",signal.pivots.s2],["S1","#fbbf24",signal.pivots.s1],
                        ["PP","#f59e0b",signal.pivots.pp],
                        ["R1","#86efac",signal.pivots.r1],["R2","#34d399",signal.pivots.r2],["R3","#00e5a0",signal.pivots.r3]].map(([l,c,v]) => (
                        <div key={l} style={css.mCard(c)}>
                          <div style={css.label}>{l}</div>
                          <div style={css.val(c, 11)}>${fmt(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EMA Summary */}
                {signal && (
                  <div style={css.card}>
                    <div style={{ fontWeight: 800, color: "#8b5cf6", marginBottom: 8, fontSize: 11 }}>📊 EMA Structure</div>
                    <div style={css.grid(3)}>
                      {[["EMA 21","#f59e0b",signal.ema21],["EMA 55","#8b5cf6",signal.ema55],["EMA 200","#0ea5e9",signal.ema200]].map(([l,c,v]) => (
                        <div key={l} style={css.mCard(c)}>
                          <div style={css.label}>{l}</div>
                          <div style={css.val(c, 13)}>${fmt(v)}</div>
                          <div style={{ fontSize: 9, marginTop: 2, color: currentPrice > v ? "#00e5a0" : "#ff4d6d" }}>
                            {currentPrice > v ? "▲ Price above" : "▼ Price below"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══ CALCULATOR TAB ══ */}
            {tab === "calculator" && (
              <>
                <div style={{ ...css.card, border: "1px solid #0ea5e944", background: "#0ea5e908", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 700, marginBottom: 6 }}>
                    ℹ️ Auto-filled from AI signal analysis for {activeCoin.replace("USDT","")}: {signal?.type || "Loading..."}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={css.btn(useCustom ? "#334155" : "#0ea5e9")} onClick={() => setUseCustom(false)}>Use AI Levels</button>
                    <button style={css.btn("#f59e0b", !useCustom)} onClick={() => setUseCustom(true)}>Custom Levels</button>
                  </div>
                </div>

                <div style={css.grid(2)}>
                  <div style={css.card}>
                    <div style={{ fontWeight: 800, marginBottom: 10, color: "#0ea5e9", fontSize: 12 }}>⚙️ Trade Setup</div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={css.label}>Margin Type</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["Cross","Isolated"].map(m => (
                          <button key={m} style={{ ...css.btn(m==="Cross" ? "#0ea5e9" : "#f59e0b", marginType !== m), flex:1 }} onClick={() => setMarginType(m)}>{m}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={css.label}>Direction</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...css.btn("#00e5a0", side !== "LONG"), flex:1 }} onClick={() => setSide("LONG")}>▲ LONG</button>
                        <button style={{ ...css.btn("#ff4d6d", side !== "SHORT"), flex:1 }} onClick={() => setSide("SHORT")}>▼ SHORT</button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...css.row, marginBottom: 3 }}>
                        <span style={css.label}>Leverage</span>
                        <span style={{ fontWeight: 900, fontSize: 14, color: leverage >= 50 ? "#ff4d6d" : "#0ea5e9" }}>{leverage}x</span>
                      </div>
                      <input type="range" min={1} max={150} value={leverage} onChange={e => setLeverage(+e.target.value)} style={{ width: "100%", accentColor: leverage >= 50 ? "#ff4d6d" : "#0ea5e9" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#334155", marginTop: 2 }}>
                        {["1x","25x","50x","100x","150x"].map(l => <span key={l}>{l}</span>)}
                      </div>
                      {leverage >= 75 && <div style={{ marginTop: 5, padding: "5px 8px", background: "#ff4d6d11", border: "1px solid #ff4d6d33", borderRadius: 5, fontSize: 10, color: "#ff4d6d" }}>⚠️ EXTREME RISK — {leverage}x leverage. Liquidation within {(100/leverage).toFixed(1)}% move!</div>}
                      {leverage >= 25 && leverage < 75 && <div style={{ marginTop: 5, padding: "5px 8px", background: "#f97316" + "11", border: "1px solid #f9731633", borderRadius: 5, fontSize: 10, color: "#f97316" }}>⚠️ HIGH RISK — {leverage}x leverage. Use small margin!</div>}
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={css.label}>Margin (USDT)</div>
                      <input type="number" value={margin} onChange={e => setMargin(+e.target.value)} style={css.inp} />
                    </div>

                    <div style={css.grid(2)}>
                      <div>
                        <div style={css.label}>Maker Fee %</div>
                        <input type="number" step="0.001" value={makerFee} onChange={e => setMakerFee(+e.target.value)} style={css.inp} />
                      </div>
                      <div>
                        <div style={css.label}>Taker Fee %</div>
                        <input type="number" step="0.001" value={takerFee} onChange={e => setTakerFee(+e.target.value)} style={css.inp} />
                      </div>
                    </div>
                  </div>

                  <div style={css.card}>
                    <div style={{ fontWeight: 800, marginBottom: 10, color: "#f59e0b", fontSize: 12 }}>🎯 Price Levels</div>
                    {[
                      ["Entry Price ($)", customEntry, setCustomEntry],
                      ["Take Profit ($)", customTP, setCustomTP],
                      ["Stop Loss ($)", customSL, setCustomSL],
                    ].map(([l, v, set]) => (
                      <div key={l} style={{ marginBottom: 8 }}>
                        <div style={css.label}>{l}</div>
                        <input
                          type="number" step="any"
                          value={useCustom ? v : (l.includes("Entry") ? signal?.suggestedEntry?.toFixed(4) : l.includes("Take") ? signal?.suggestedTP?.toFixed(4) : signal?.suggestedSL?.toFixed(4)) || ""}
                          onChange={e => { setUseCustom(true); set(e.target.value); }}
                          style={{ ...css.inp, borderColor: l.includes("Take") ? "#00e5a044" : l.includes("Stop") ? "#ff4d6d44" : "#0ea5e944" }}
                        />
                      </div>
                    ))}

                    {trade && (
                      <div style={{ background: "#040a12", borderRadius: 7, padding: 10 }}>
                        {[
                          ["Position Size", `$${trade.posSize.toFixed(2)}`, "#0ea5e9"],
                          ["Quantity", `${trade.qty.toFixed(6)} coins`, "#94a3b8"],
                          ["Risk:Reward", `1 : ${trade.rr}`, +trade.rr >= 2 ? "#00e5a0" : +trade.rr >= 1 ? "#f59e0b" : "#ff4d6d"],
                        ].map(([k,v,c]) => (
                          <div key={k} style={{ ...css.row, marginBottom: 5 }}>
                            <span style={{ color: "#334155" }}>{k}</span>
                            <span style={{ fontWeight: 800, color: c }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Results */}
                {trade && (
                  <>
                    <div style={css.grid(3)}>
                      <div style={{ ...css.mCard("#ff4d6d"), padding: 12 }}>
                        <div style={css.label}>⚠️ Liquidation Price</div>
                        <div style={css.val("#ff4d6d", 18)}>${fmt(trade.liqPrice, 4)}</div>
                        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>{trade.liqDist}% from entry</div>
                        {trade.liqDist < 2 && <div style={{ fontSize: 9, color: "#ff4d6d", marginTop: 3 }}>🚨 Very close! Reduce leverage.</div>}
                      </div>
                      <div style={{ ...css.mCard("#00e5a0"), padding: 12 }}>
                        <div style={css.label}>✅ PnL at Take Profit</div>
                        <div style={css.val("#00e5a0", 18)}>+${trade.atTP.net.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>ROI: +{trade.atTP.roi.toFixed(2)}%</div>
                      </div>
                      <div style={{ ...css.mCard("#ff4d6d"), padding: 12 }}>
                        <div style={css.label}>❌ PnL at Stop Loss</div>
                        <div style={css.val("#ff4d6d", 18)}>${trade.atSL.net.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>ROI: {trade.atSL.roi.toFixed(2)}%</div>
                      </div>
                    </div>

                    <div style={css.card}>
                      <div style={{ fontWeight: 800, marginBottom: 8, color: "#94a3b8", fontSize: 11 }}>💸 Fee Breakdown</div>
                      <div style={css.grid(4)}>
                        {[
                          ["Entry Fee", `$${trade.atTP.entryFee.toFixed(4)}`, "#f59e0b"],
                          ["Exit Fee (TP)", `$${trade.atTP.exitFee.toFixed(4)}`, "#f59e0b"],
                          ["Total Fees", `$${trade.atTP.fees.toFixed(4)}`, "#ff4d6d"],
                          ["Net Profit", `$${trade.atTP.net.toFixed(2)}`, "#00e5a0"],
                        ].map(([l,v,c]) => (
                          <div key={l} style={css.mCard(c)}>
                            <div style={css.label}>{l}</div>
                            <div style={css.val(c, 12)}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk warning box */}
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: marginType === "Cross" ? "#ff4d6d0a" : "#f59e0b0a", border: `1px solid ${marginType === "Cross" ? "#ff4d6d33" : "#f59e0b33"}` }}>
                      {marginType === "Cross"
                        ? <span style={{ fontSize: 11, color: "#ff4d6d" }}>⚠️ CROSS MARGIN: Your entire wallet balance is used as collateral. A losing trade can wipe your full account beyond ${margin} USDT.</span>
                        : <span style={{ fontSize: 11, color: "#f59e0b" }}>ℹ️ ISOLATED MARGIN: Max loss is exactly ${margin.toFixed(2)} USDT. Position liquidates without affecting rest of account.</span>}
                    </div>

                    {/* Full summary */}
                    <div style={{ ...css.card, marginTop: 10 }}>
                      <div style={{ fontWeight: 800, marginBottom: 10, color: "#0ea5e9", fontSize: 12 }}>📋 Full Trade Summary — {activeCoin.replace("USDT","")}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                        {[
                          ["Market Signal", signal?.type || "—", signal?.color || "#94a3b8"],
                          ["Signal Grade", `Grade ${signal?.grade} (${signal?.confidence}% confidence)`, signal?.color || "#94a3b8"],
                          ["Side", side, side === "LONG" ? "#00e5a0" : "#ff4d6d"],
                          ["Entry", `$${fmt(entry, 4)}`, "#0ea5e9"],
                          ["Leverage", `${leverage}x`, leverage >= 50 ? "#ff4d6d" : "#0ea5e9"],
                          ["Margin Type", marginType, marginType === "Cross" ? "#f97316" : "#0ea5e9"],
                          ["Position Size", `$${trade.posSize.toFixed(2)}`, "#0ea5e9"],
                          ["Take Profit", `$${fmt(tp, 4)}`, "#00e5a0"],
                          ["Stop Loss", `$${fmt(sl, 4)}`, "#ff4d6d"],
                          ["Liquidation", `$${fmt(trade.liqPrice, 4)} (${trade.liqDist}% away)`, trade.liqDist < 2 ? "#ff4d6d" : "#f59e0b"],
                          ["Risk:Reward", `1:${trade.rr}`, +trade.rr >= 2 ? "#00e5a0" : "#f59e0b"],
                          ["Net TP Profit", `$${trade.atTP.net.toFixed(2)} (+${trade.atTP.roi.toFixed(1)}%)`, "#00e5a0"],
                          ["Net SL Loss", `$${trade.atSL.net.toFixed(2)} (${trade.atSL.roi.toFixed(1)}%)`, "#ff4d6d"],
                          ["Total Fees", `$${trade.atTP.fees.toFixed(4)}`, "#f59e0b"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ ...css.row, padding: "4px 0", borderBottom: "1px solid #0a1929" }}>
                            <span style={{ color: "#334155" }}>{k}</span>
                            <span style={{ fontWeight: 800, color: c, fontSize: 11 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ══ SIGNALS TAB ══ */}
            {tab === "signals" && (
              <>
                <div style={css.grid(4)}>
                  {[
                    { l: "STRONG LONG 🟢", n: strongSignals.filter(([,s]) => s.type === "STRONG LONG").length, c: "#00e5a0" },
                    { l: "LONG 📈", n: strongSignals.filter(([,s]) => s.type === "LONG").length, c: "#34d399" },
                    { l: "SHORT 📉", n: strongSignals.filter(([,s]) => s.type === "SHORT").length, c: "#f97316" },
                    { l: "STRONG SHORT 🔴", n: strongSignals.filter(([,s]) => s.type === "STRONG SHORT").length, c: "#ff4d6d" },
                  ].map(({ l, n, c }) => (
                    <div key={l} style={css.mCard(c)}>
                      <div style={css.label}>{l}</div>
                      <div style={css.val(c, 26)}>{n}</div>
                    </div>
                  ))}
                </div>

                {scanProgress < 100 && (
                  <div style={{ ...css.card, marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#0ea5e9", marginBottom: 6 }}>📡 Scanning {COINS.slice(0,30).length} coins from Binance... {scanProgress}%</div>
                    <div style={{ background: "#0b1929", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${scanProgress}%`, background: "linear-gradient(90deg, #0ea5e9, #00e5a0)", borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}

                <div style={{ ...css.card, marginTop: 8 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10, color: "#0ea5e9", fontSize: 12 }}>⚡ Live Trade Opportunities</div>
                  {strongSignals.length === 0 ? (
                    <div style={{ color: "#334155", fontSize: 11, padding: 20, textAlign: "center" }}>
                      {scanProgress < 100 ? "Scanning market..." : "No strong signals found. Market may be ranging."}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                      {strongSignals.map(([sym, s]) => {
                        const t = tickers[sym] || {};
                        const up = (t.change24h || 0) >= 0;
                        return (
                          <div key={sym} onClick={() => { setActiveCoin(sym); setTab("chart"); }}
                            style={{ background: "#040a12", border: `1px solid ${s.color}33`, borderRadius: 9, padding: "10px 12px", cursor: "pointer" }}>
                            <div style={{ ...css.row, marginBottom: 5 }}>
                              <div>
                                <span style={{ fontWeight: 900, fontSize: 13 }}>{sym.replace("USDT","")}</span>
                                <span style={{ color: "#1e3a5f", fontSize: 10 }}>/USDT</span>
                              </div>
                              <span style={{ ...css.badge(s.color), fontSize: 9 }}>{s.type}</span>
                            </div>
                            <div style={{ ...css.row, marginBottom: 5 }}>
                              <div style={{ fontWeight: 800, fontSize: 13 }}>${fmt(t.price || s.price, 4)}</div>
                              <div style={{ fontSize: 10, color: up ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(t.change24h)}</div>
                            </div>
                            {/* Confidence bar */}
                            <div style={{ background: "#0b1929", borderRadius: 3, height: 3, overflow: "hidden", marginBottom: 5 }}>
                              <div style={{ height: "100%", width: `${s.confidence}%`, background: s.color, borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 9, color: "#334155" }}>
                              Grade {s.grade} • {s.confidence}% • R:R {s.rrRatio}
                            </div>
                            <div style={{ fontSize: 9, color: "#334155", marginTop: 3 }}>
                              {s.reasons?.slice(0,2).join(" • ")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </main>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #040a12; }
        ::-webkit-scrollbar-thumb { background: #0f2035; border-radius: 4px; }
        input:focus { border-color: #0ea5e9 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
